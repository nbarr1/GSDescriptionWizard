/**
 * The wizard UI.
 *
 * One question per screen, rendered from config. All state lives in a single
 * SessionState object; every interaction produces a new one and re-renders.
 * No user string ever reaches an HTML sink - see ui/dom.ts.
 */

import type { Finding, Question, SessionState } from '../types';
import {
  APP_VERSION,
  optionsFor,
  questionsConfig,
  requireQuestion,
  validationConfig,
} from '../config';
import {
  CROSSCHECK_STEP,
  REVIEW_STEP,
  canAdvance,
  createSession,
  dismissChallenge,
  firstStep,
  nextStep,
  previousStep,
  progressFor,
  questionForStep,
  recordChallenge,
  setAnswer,
  setChecklistItem,
  stageForStep,
  type StepId,
} from '../engine/flow';
import { validateAnswer, type ValidationResult } from '../validation';
import { announce, clear, el, focusScreen, mount } from './dom';
import { copyText, downloadText } from './clipboard';
import { clearDraft, loadDraft, saveDraft } from './storage';
import { renderReview } from './review';

const GAP_LABELS: Record<string, string> = {
  rootCause: 'Why it happened',
  equipment: 'Equipment, tool or material',
  immediateActions: 'Immediate actions and treatment',
  procedure: 'Procedure or process followed',
  sequence: 'Sequence of events',
  activity: 'Specific activity performed',
};

export interface AppHandles {
  getSession: () => SessionState;
  goTo: (step: StepId) => void;
}

export function mountApp(root: HTMLElement): AppHandles {
  const restored = loadDraft();
  let session: SessionState = restored?.session ?? createSession();
  // Restoring answers but dropping the user back at question one is disorienting,
  // so the draft carries the step as well.
  let step: StepId = restored?.step ?? firstStep(session);
  /** Findings are only shown once the user has tried to move on. */
  let showFeedback = false;

  const live = el('div', {
    class: 'visually-hidden',
    role: 'status',
    'aria-live': 'polite',
    'aria-atomic': 'true',
  });

  const main = el('main', { class: 'app__main', id: 'main' });
  const progressHost = el('div', { class: 'progress' });
  const headerActions = el('div', { class: 'header__actions' });

  const header = el('header', { class: 'app__header' }, [
    el('div', { class: 'header__top' }, [
      el('h1', { class: 'header__title', text: 'Injury and Illness Description Wizard' }),
      headerActions,
    ]),
    progressHost,
  ]);

  const footer = el('footer', { class: 'app__footer' }, [
    el('span', {
      text: `Version ${APP_VERSION}. Runs entirely on this device. Nothing is sent anywhere.`,
    }),
  ]);

  mount(
    root,
    el('a', { class: 'skip-link', href: '#main', text: 'Skip to the question' }),
    el('div', { class: 'app' }, [header, main, footer]),
    live,
  );

  // ---- state transitions --------------------------------------------------

  function update(next: SessionState, options: { resetFeedback?: boolean } = {}): void {
    session = next;
    if (options.resetFeedback !== false) showFeedback = false;
    saveDraft(session, step);
    render();
  }

  function goTo(target: StepId): void {
    step = target;
    showFeedback = false;
    saveDraft(session, step);
    render();
  }

  function advance(): void {
    const question = questionForStep(step);

    if (question) {
      const result = validateAnswer(question, session);

      if (!result.canAdvance) {
        showFeedback = true;
        render();
        announce(live, `Cannot continue yet. ${result.findings[0]?.message ?? ''}`);
        return;
      }

      // A challenge shows once before it will let the user through. The second
      // press advances - the escalation cap is what stops this becoming a loop.
      if (result.tier === 'challenge' && !showFeedback) {
        showFeedback = true;
        session = recordChallenge(session, question.id);
        saveDraft(session, step);
        render();
        announce(live, result.findings[0]?.message ?? 'Please review your answer.');
        return;
      }
    }

    const target = nextStep(step, session);
    if (target) goTo(target);
  }

  function goBack(): void {
    const target = previousStep(step, session);
    if (target) goTo(target);
  }

  function resetAll(): void {
    clearDraft();
    session = createSession();
    step = firstStep(session);
    showFeedback = false;
    render();
    announce(live, 'All data cleared. Starting a new case.');
  }

  // ---- rendering ----------------------------------------------------------

  function render(): void {
    renderHeaderActions();
    renderProgress();

    if (step === REVIEW_STEP) {
      const screen = renderReview({
        session,
        onModeChange: (mode) => update({ ...session, outputMode: mode }, { resetFeedback: false }),
        onEdit: (questionId) => goTo(questionId),
        onPersistChange: (persist) => {
          const next = { ...session, persist };
          if (!persist) clearDraft();
          update(next, { resetFeedback: false });
        },
        onCopy: async (text, textarea) => {
          const result = await copyText(text, textarea);
          announce(live, result.message);
          return result;
        },
        onDownload: (text) => downloadText(text, `injury-illness-description-${stamp()}.txt`),
        onReset: resetAll,
        onBack: goBack,
      });
      mount(main, screen);
      focusScreen(screen);
      return;
    }

    const screen = step === CROSSCHECK_STEP ? renderChecklist() : renderQuestion();
    mount(main, screen);
    focusScreen(screen);
  }

  function renderHeaderActions(): void {
    mount(
      headerActions,
      el(
        'button',
        {
          class: 'btn btn--small',
          type: 'button',
          'aria-expanded': 'false',
        },
        ['Why these questions'],
      ),
      el('button', { class: 'btn btn--small btn--danger', type: 'button' }, ['Clear all data']),
    );

    const [why, clearButton] = [...headerActions.children] as HTMLButtonElement[];
    why?.addEventListener('click', () => showExplainer(main, live));
    clearButton?.addEventListener('click', () => {
      const answered = Object.keys(session.answers).length;
      if (answered === 0 || window.confirm('Clear every answer and start a new case?')) resetAll();
    });
  }

  function renderProgress(): void {
    const progress = progressFor(step, session);
    mount(
      progressHost,
      el(
        'div',
        {
          class: 'progress__bar',
          role: 'progressbar',
          'aria-valuenow': progress.percent,
          'aria-valuemin': 0,
          'aria-valuemax': 100,
          'aria-label': `Progress through the wizard, ${progress.percent} percent`,
        },
        [el('div', { class: 'progress__fill', style: `width:${progress.percent}%` })],
      ),
      el('p', { class: 'progress__label' }, [
        el('span', { class: 'progress__stage' }, [
          `Stage ${progress.stageIndex + 1} of ${progress.stageCount}: ${progress.stageTitle}`,
        ]),
        el('span', {
          text: `Question ${progress.positionInStage} of ${progress.questionsInStage}`,
        }),
      ]),
    );
  }

  // ---- question screen ----------------------------------------------------

  function renderQuestion(): HTMLElement {
    const question = requireQuestion(step);
    const stage = stageForStep(step);
    const result = validateAnswer(question, session);
    const answer = session.answers[question.id];

    const screen = el('section', {
      class: 'screen',
      'aria-labelledby': `prompt-${question.id}`,
    });

    if (stage?.intro) {
      screen.appendChild(el('p', { class: 'screen__stage-intro', text: stage.intro }));
    }

    screen.appendChild(
      el('h2', {
        class: 'question__prompt',
        id: `prompt-${question.id}`,
        'data-focus': 'true',
        text: question.prompt,
      }),
    );

    if (question.help) {
      screen.appendChild(
        el('p', { class: 'question__help', id: `help-${question.id}`, text: question.help }),
      );
    }

    if (question.why) {
      screen.appendChild(
        el('details', { class: 'question__why' }, [
          el('summary', { text: 'Why am I being asked this?' }),
          el('div', { class: 'question__why-body', text: question.why }),
        ]),
      );
    }

    screen.appendChild(renderInput(question));

    if (question.examples?.length) {
      screen.appendChild(
        el('details', { class: 'examples' }, [
          el('summary', {
            text: `Show ${question.examples.length === 1 ? 'an example' : 'examples'} of a good answer`,
          }),
          el(
            'ul',
            { class: 'examples__list' },
            question.examples.map((example) =>
              el('li', { class: 'examples__item', text: example }),
            ),
          ),
        ]),
      );
    }

    const feedbackHost = el('div', { 'aria-live': 'polite' });
    if (showFeedback && result.findings.length > 0) {
      feedbackHost.appendChild(renderFeedback(question, result));
    }
    screen.appendChild(feedbackHost);

    if (question.escapeHatches && answer?.value.kind !== 'escape') {
      screen.appendChild(renderEscapeHatches(question));
    }

    const backButton = el('button', { class: 'btn', type: 'button' }, ['Back']);
    backButton.disabled = previousStep(step, session) === null;
    backButton.addEventListener('click', goBack);

    const nextButton = el('button', { class: 'btn btn--primary', type: 'button' }, [
      canAdvance(step, session) ? 'Continue' : 'Answer to continue',
    ]);
    nextButton.addEventListener('click', advance);

    screen.appendChild(el('div', { class: 'nav' }, [backButton, nextButton]));
    return screen;
  }

  function renderInput(question: Question): HTMLElement {
    const answer = session.answers[question.id];
    const describedBy = question.help ? `help-${question.id}` : undefined;

    if (question.kind === 'text' || question.kind === 'textarea') {
      const isEscaped = answer?.value.kind === 'escape';
      const value = answer?.value.kind === 'text' ? answer.value.text : '';
      const max = question.validation?.maxLength ?? validationConfig.defaultMaxLength;

      const field = el('div', { class: 'field' });
      const label = el('label', {
        class: 'visually-hidden',
        for: `input-${question.id}`,
        text: question.prompt,
      });

      const input =
        question.kind === 'textarea'
          ? el('textarea', {
              class: 'field__textarea',
              id: `input-${question.id}`,
              rows: 5,
              placeholder: question.placeholder ?? '',
              'aria-describedby': describedBy,
              maxlength: max,
            })
          : el('input', {
              class: 'field__input',
              id: `input-${question.id}`,
              type: 'text',
              placeholder: question.placeholder ?? '',
              'aria-describedby': describedBy,
              maxlength: max,
            });

      (input as HTMLInputElement | HTMLTextAreaElement).value = isEscaped ? '' : value;

      const counter = el('p', { class: 'field__counter' });
      const updateCounter = (length: number) => {
        const min = question.validation?.minLength;
        counter.textContent =
          min && length < min
            ? `${length} characters. At least ${min} needed for a useful answer.`
            : `${length} characters.`;
      };
      updateCounter(isEscaped ? 0 : value.length);

      input.addEventListener('input', () => {
        const text = (input as HTMLInputElement | HTMLTextAreaElement).value;
        updateCounter(text.length);
        session = setAnswer(session, question.id, { kind: 'text', text });
        // Editing the answer re-arms the challenge for it. Without this, feedback
        // shown for a previous attempt would let the next one straight through,
        // and a user could clear a challenge by typing anything at all.
        showFeedback = false;
        saveDraft(session, step);
      });

      // Deliberately no re-render on blur. Blur fires before the click that
      // caused it, so re-rendering here tears out the Continue button the user
      // is in the middle of pressing and the press lands on a detached node.
      // Feedback refreshes when they press Continue, which is the right moment.

      field.appendChild(label);
      field.appendChild(input);
      field.appendChild(counter);

      if (isEscaped && answer?.value.kind === 'escape') {
        field.appendChild(renderActiveHatch(question, answer.value.justification));
      }
      return field;
    }

    if (question.kind === 'boolean') {
      const current = answer?.value.kind === 'boolean' ? answer.value.value : undefined;
      return renderChoices(
        question,
        [
          { value: 'yes', label: 'Yes' },
          { value: 'no', label: 'No' },
        ],
        current === undefined ? [] : [current ? 'yes' : 'no'],
        false,
        (values) =>
          update(setAnswer(session, question.id, { kind: 'boolean', value: values[0] === 'yes' }), {
            resetFeedback: false,
          }),
      );
    }

    const options = optionsFor(question);
    const multiple = question.kind === 'multiselect';
    const selected =
      answer?.value.kind === 'multi'
        ? answer.value.values
        : answer?.value.kind === 'choice'
          ? [answer.value.value]
          : [];

    return renderChoices(question, options, selected, multiple, (values) => {
      const value = multiple
        ? ({ kind: 'multi', values } as const)
        : ({ kind: 'choice', value: values[0] ?? '' } as const);
      update(setAnswer(session, question.id, value), { resetFeedback: false });
    });
  }

  function renderChoices(
    question: Question,
    options: { value: string; label: string; note?: string }[],
    selected: string[],
    multiple: boolean,
    onChange: (values: string[]) => void,
  ): HTMLElement {
    const fieldset = el('fieldset', { class: 'options' }, [
      el('legend', { class: 'options__legend visually-hidden', text: question.prompt }),
    ]);

    for (const option of options) {
      const input = el('input', {
        type: multiple ? 'checkbox' : 'radio',
        name: `q-${question.id}`,
        id: `opt-${question.id}-${option.value}`,
        value: option.value,
      });
      input.checked = selected.includes(option.value);

      input.addEventListener('change', () => {
        if (multiple) {
          const values = [...fieldset.querySelectorAll<HTMLInputElement>('input:checked')].map(
            (i) => i.value,
          );
          onChange(values);
        } else {
          onChange([option.value]);
        }
      });

      fieldset.appendChild(
        el('label', { class: 'option', for: `opt-${question.id}-${option.value}` }, [
          input,
          el('span', {}, [
            el('span', { class: 'option__label', text: option.label }),
            option.note ? el('span', { class: 'option__note', text: option.note }) : null,
          ]),
        ]),
      );
    }

    return fieldset;
  }

  function renderFeedback(question: Question, result: ValidationResult): HTMLElement {
    const finding = result.findings[0] as Finding;
    const tier = finding.tier;
    const title =
      tier === 'block'
        ? 'This one is needed'
        : tier === 'challenge'
          ? 'Can you add a little more?'
          : 'Worth a second look';

    const box = el('div', {
      class: `feedback feedback--${tier}`,
      role: tier === 'block' ? 'alert' : 'status',
    });
    box.appendChild(el('p', { class: 'feedback__title', text: title }));

    for (const item of result.findings) {
      box.appendChild(el('p', { class: 'feedback__message', text: item.message }));
      if (item.example) {
        box.appendChild(el('p', { class: 'feedback__example', text: `Example: ${item.example}` }));
      }
    }

    if (tier === 'challenge') {
      const actions = el('div', { class: 'feedback__actions' });
      const dismiss = el('button', { class: 'btn btn--small', type: 'button' }, [
        'Move on and say why',
      ]);
      dismiss.addEventListener('click', () => {
        const reason = window.prompt(
          'Move on without adding more. What is the reason? This is recorded for the reviewer.',
          '',
        );
        if (reason && reason.trim().length >= 4) {
          update(dismissChallenge(session, question.id, reason.trim()), { resetFeedback: false });
          advance();
        }
      });
      actions.appendChild(dismiss);
      box.appendChild(actions);
    }

    return box;
  }

  function renderEscapeHatches(question: Question): HTMLElement {
    const host = el('div', { class: 'hatches' }, [
      el('p', {
        class: 'hatches__intro',
        text: 'If you genuinely cannot answer this, say so and give a short reason. An honest gap is far more useful to an investigator than a guess, and it is recorded in the description.',
      }),
    ]);

    const buttons = el('div', { class: 'hatches__buttons' });
    for (const [hatch, label] of [
      ['unknown', 'I do not know'],
      ['not_applicable', 'Not applicable'],
    ] as const) {
      const button = el('button', { class: 'btn btn--small', type: 'button' }, [label]);
      button.addEventListener('click', () => {
        const reason = window.prompt(
          `${label}. Give a short reason so the reviewer knows why this is not recorded.`,
          '',
        );
        if (reason && reason.trim().length >= 8) {
          update(
            setAnswer(session, question.id, {
              kind: 'escape',
              hatch,
              justification: reason.trim(),
            }),
          );
        } else if (reason !== null) {
          window.alert('A short reason is needed - a few words is enough.');
        }
      });
      buttons.appendChild(button);
    }

    host.appendChild(buttons);
    return host;
  }

  function renderActiveHatch(question: Question, justification: string): HTMLElement {
    const host = el('div', { class: 'notice notice--advisory' }, [
      el('p', { style: 'margin:0 0 0.5rem', text: `Recorded as a stated gap: ${justification}` }),
    ]);
    const undo = el('button', { class: 'btn btn--small', type: 'button' }, ['Answer it instead']);
    undo.addEventListener('click', () =>
      update(setAnswer(session, question.id, { kind: 'text', text: '' })),
    );
    host.appendChild(undo);
    return host;
  }

  // ---- form cross-check screen -------------------------------------------

  function renderChecklist(): HTMLElement {
    const stage = stageForStep(CROSSCHECK_STEP);
    const screen = el('section', { class: 'screen' });

    screen.appendChild(
      el('h2', {
        class: 'question__prompt',
        'data-focus': 'true',
        text: stage?.title ?? 'Form cross-check',
      }),
    );
    if (stage?.intro) screen.appendChild(el('p', { class: 'question__help', text: stage.intro }));

    const list = el('ul', { class: 'checklist' });
    for (const item of questionsConfig.formChecklist) {
      const input = el('input', { type: 'checkbox', id: `fc-${item.id}` });
      input.checked = Boolean(session.formChecklist[item.id]);
      input.addEventListener('change', () =>
        update(setChecklistItem(session, item.id, input.checked), { resetFeedback: false }),
      );

      list.appendChild(
        el('li', {}, [
          el('label', { class: 'checklist__item', for: `fc-${item.id}` }, [
            input,
            el('span', {}, [
              el('span', { class: 'checklist__section', text: item.formSection }),
              el('span', { text: item.label }),
              item.note ? el('span', { class: 'checklist__note', text: item.note }) : null,
            ]),
          ]),
        ]),
      );
    }
    screen.appendChild(list);

    const back = el('button', { class: 'btn', type: 'button' }, ['Back']);
    back.addEventListener('click', goBack);
    const next = el('button', { class: 'btn btn--primary', type: 'button' }, [
      'Continue to the description',
    ]);
    next.addEventListener('click', advance);
    screen.appendChild(el('div', { class: 'nav' }, [back, next]));

    return screen;
  }

  render();

  return {
    getSession: () => session,
    goTo,
  };
}

// ---- in-app explainer -----------------------------------------------------

function showExplainer(host: HTMLElement, live: HTMLElement): void {
  const report = { categories: Object.keys(GAP_LABELS) };
  const screen = el('section', { class: 'screen' }, [
    el('h2', {
      class: 'question__prompt',
      'data-focus': 'true',
      text: 'Why am I being asked all this?',
    }),
    el('p', {
      class: 'question__help',
      text: 'A review of 656 injury and illness records found the description field was systematically under-filled. These are the six things reviewers most often could not find, with how often each was missing:',
    }),
  ]);

  const rates: Record<string, string> = {
    rootCause: 'missing from 90.7 percent of records',
    equipment: 'missing from 87.3 percent of records',
    immediateActions: 'missing from 82.0 percent of records',
    procedure: 'missing from 77.6 percent of records',
    activity: 'missing from 73.5 percent of records',
    sequence: 'missing from 68.6 percent of records',
  };

  const list = el('ul', { class: 'gaps' });
  for (const key of report.categories) {
    list.appendChild(
      el('li', { class: 'gap' }, [
        el('span', { class: 'gap__status gap__status--missing', text: 'gap' }),
        el('span', { class: 'gap__body' }, [
          el('span', { class: 'gap__name', text: GAP_LABELS[key] ?? key }),
          el('span', { class: 'gap__detail', text: ` - ${rates[key] ?? ''}` }),
        ]),
      ]),
    );
  }
  screen.appendChild(list);

  screen.appendChild(
    el('p', {
      class: 'question__help',
      text: 'The wizard only asks about things the form has no field for. Anything the form already captures - names, dates, body parts, severity - is confirmed on a checklist near the end and never enters the description text. No name or personal detail should ever go in the description, because it is surfaced in emails and generic reports.',
    }),
  );

  const back = el('button', { class: 'btn btn--primary', type: 'button' }, [
    'Back to the question',
  ]);
  const previous = [...host.childNodes];
  back.addEventListener('click', () => {
    clear(host);
    for (const node of previous) host.appendChild(node);
    focusScreen(host);
  });
  screen.appendChild(el('div', { class: 'nav' }, [back]));

  mount(host, screen);
  focusScreen(screen);
  announce(live, 'Showing the explainer.');
}

function stamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}
