/**
 * The wizard UI.
 *
 * A screen holds a cluster of related questions. All state lives in one
 * SessionState object; every committed change produces a new one and re-renders.
 * No user string reaches an HTML sink - see ui/dom.ts and ui/questions.ts.
 */

import type { AnswerValue, Question, SessionState } from '../types';
import { APP_VERSION, questionsConfig } from '../config';
import {
  CROSSCHECK_STEP,
  REVIEW_STEP,
  canAdvance,
  createSession,
  dismissChallenge,
  firstBlockingQuestion,
  firstStep,
  nextStep,
  previousStep,
  progressFor,
  questionsForStep,
  recordChallenge,
  screenForQuestion,
  screenForStep,
  setAnswer,
  setChecklistItem,
  stageForStep,
  type StepId,
} from '../engine/flow';
import { validateAnswer } from '../validation';
import { announce, clear, el, focusScreen, mount } from './dom';
import { copyText, downloadText } from './clipboard';
import { clearDraft, loadDraft, saveDraft } from './storage';
import { renderReview } from './review';
import { renderQuestionBlock, type QuestionCallbacks } from './questions';

const GAP_RATES: Record<string, [string, string]> = {
  rootCause: ['Why it happened', 'missing from 90.7 percent of records'],
  equipment: ['Equipment, tool or material', 'missing from 87.3 percent of records'],
  immediateActions: ['Immediate actions and treatment', 'missing from 82.0 percent of records'],
  procedure: ['Procedure or process followed', 'missing from 77.6 percent of records'],
  activity: ['Specific activity performed', 'missing from 73.5 percent of records'],
  sequence: ['Sequence of events', 'missing from 68.6 percent of records'],
};

export interface AppHandles {
  getSession: () => SessionState;
  goTo: (step: StepId) => void;
}

export function mountApp(root: HTMLElement): AppHandles {
  const restored = loadDraft();
  let session: SessionState = restored?.session ?? createSession();
  // Restoring answers but dropping the user back at screen one is disorienting,
  // so the draft carries the step as well.
  let step: StepId = restored?.step ?? firstStep(session);
  /** Findings only appear once the user has tried to move on. */
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
    el('p', {
      text: `Version ${APP_VERSION}. Runs entirely on this device. Nothing is sent anywhere.`,
    }),
    el('p', {
      text: 'GE is a trademark of General Electric Company used under trademark license.',
    }),
    el('p', { text: '© 2025 GE Vernova and/or its affiliates. All rights reserved.' }),
  ]);

  mount(
    root,
    el('a', { class: 'skip-link', href: '#main', text: 'Skip to the questions' }),
    el('div', { class: 'app' }, [header, main, footer]),
    live,
  );

  // ---- state transitions --------------------------------------------------

  function commit(
    next: SessionState,
    options: { resetFeedback?: boolean; moveFocus?: boolean } = {},
  ): void {
    session = next;
    if (options.resetFeedback !== false) showFeedback = false;
    saveDraft(session, step);
    render(options.moveFocus ?? false);
  }

  function goTo(target: StepId): void {
    step = target;
    showFeedback = false;
    saveDraft(session, step);
    render(true);
  }

  function advance(): void {
    const questions = questionsForStep(step, session);

    const blocking = firstBlockingQuestion(step, session);
    if (blocking) {
      showFeedback = true;
      render(false);
      focusQuestion(blocking.id);
      announce(
        live,
        `Cannot continue yet. ${validateAnswer(blocking, session).findings[0]?.message ?? ''}`,
      );
      return;
    }

    // Challenges show once before letting the user through. The second press
    // advances; the escalation cap is what stops this becoming a loop.
    const challenged = questions.find((q) => validateAnswer(q, session).tier === 'challenge');
    if (challenged && !showFeedback) {
      showFeedback = true;
      for (const q of questions) {
        if (validateAnswer(q, session).tier === 'challenge') {
          session = recordChallenge(session, q.id);
        }
      }
      saveDraft(session, step);
      render(false);
      focusQuestion(challenged.id);
      announce(live, validateAnswer(challenged, session).findings[0]?.message ?? 'Please review.');
      return;
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

  function focusQuestion(questionId: string): void {
    const node = main.querySelector<HTMLElement>(`[data-question="${questionId}"] .q__prompt`);
    if (!node) return;
    node.setAttribute('tabindex', '-1');
    node.focus();
  }

  // ---- question callbacks -------------------------------------------------

  const callbacks: QuestionCallbacks = {
    onCommit: (questionId, value) =>
      commit(setAnswer(session, questionId, value), {
        resetFeedback: false,
      }),

    onType: (questionId, text) => {
      session = setAnswer(session, questionId, { kind: 'text', text });
      // Editing re-arms the challenge for this screen. Without it, feedback shown
      // for one attempt would let the next through unchallenged.
      showFeedback = false;
      saveDraft(session, step);
    },

    onEscapeHatch: (question, hatch) => {
      const label = hatch === 'unknown' ? 'I do not know' : 'Not applicable';
      const reason = window.prompt(
        `${label}. Give a short reason so the reviewer knows why this is not recorded.`,
        '',
      );
      if (reason && reason.trim().length >= 8) {
        commit(
          setAnswer(session, question.id, {
            kind: 'escape',
            hatch,
            justification: reason.trim(),
          }),
        );
      } else if (reason !== null) {
        window.alert('A short reason is needed - a few words is enough.');
      }
    },

    onClearEscapeHatch: (questionId) =>
      commit(setAnswer(session, questionId, { kind: 'text', text: '' })),

    onDismissChallenge: (question) => {
      const reason = window.prompt(
        'Move on without adding more. What is the reason? This is recorded for the reviewer.',
        '',
      );
      if (reason && reason.trim().length >= 4) {
        session = dismissChallenge(session, question.id, reason.trim());
        saveDraft(session, step);
        advance();
      }
    },
  };

  // ---- rendering ----------------------------------------------------------

  // `moveFocus` jumps to the screen heading, which is what a real screen
  // transition needs so a screen reader user isn't left where the old screen
  // used to be - but an in-place answer commit rebuilds the same screen, and
  // doing that on every tap is what was dragging the page back to the top on
  // every selection. Those callers pass false and let `mount` restore focus
  // to the answered control instead.
  function render(moveFocus = true): void {
    renderHeaderActions();
    renderProgress();

    if (step === REVIEW_STEP) {
      const screen = renderReview({
        session,
        onModeChange: (mode) =>
          commit({ ...session, outputMode: mode }, { resetFeedback: false, moveFocus: false }),
        onEdit: (questionId) => goTo(screenForQuestion(questionId) ?? step),
        onPersistChange: (persist) => {
          const next = { ...session, persist };
          if (!persist) clearDraft();
          commit(next, { resetFeedback: false, moveFocus: false });
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
      if (moveFocus) focusScreen(screen);
      return;
    }

    const screen = step === CROSSCHECK_STEP ? renderChecklist() : renderQuestionScreen();
    mount(main, screen);
    if (moveFocus) focusScreen(screen);
  }

  function renderHeaderActions(): void {
    mount(
      headerActions,
      el('button', { class: 'btn btn--small', type: 'button' }, ['Why these questions']),
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
          'aria-label': `Progress, ${progress.percent} percent`,
        },
        [el('div', { class: 'progress__fill', style: `width:${progress.percent}%` })],
      ),
      el('p', { class: 'progress__label' }, [
        el('span', { class: 'progress__stage' }, [
          `Stage ${progress.stageIndex + 1} of ${progress.stageCount}: ${progress.stageTitle}`,
        ]),
        el('span', {
          text:
            progress.stepsRemaining === 0
              ? 'Last screen'
              : `${progress.stepsRemaining} screen${progress.stepsRemaining === 1 ? '' : 's'} to go`,
        }),
      ]),
    );
  }

  // ---- question screen ----------------------------------------------------

  function renderQuestionScreen(): HTMLElement {
    const meta = screenForStep(step);
    const stage = stageForStep(step);
    const questions = questionsForStep(step, session);

    const screen = el('section', { class: 'screen' });

    screen.appendChild(
      el('h2', {
        class: 'screen__title',
        'data-focus': 'true',
        text: meta?.title ?? stage?.title ?? '',
      }),
    );
    if (meta?.intro) {
      screen.appendChild(el('p', { class: 'screen__intro', text: meta.intro }));
    }

    for (const question of questions) {
      screen.appendChild(
        renderQuestionBlock(
          question,
          session,
          validateAnswer(question, session),
          showFeedback,
          callbacks,
        ),
      );
    }

    const back = el('button', { class: 'btn', type: 'button' }, ['Back']);
    back.disabled = previousStep(step, session) === null;
    back.addEventListener('click', goBack);

    const next = el('button', { class: 'btn btn--primary', type: 'button' }, [
      canAdvance(step, session) ? 'Continue' : 'Answer to continue',
    ]);
    next.addEventListener('click', advance);

    screen.appendChild(el('div', { class: 'nav' }, [back, next]));
    return screen;
  }

  // ---- form cross-check screen -------------------------------------------

  function renderChecklist(): HTMLElement {
    const stage = stageForStep(CROSSCHECK_STEP);
    const screen = el('section', { class: 'screen' });

    screen.appendChild(
      el('h2', {
        class: 'screen__title',
        'data-focus': 'true',
        text: stage?.title ?? 'Form cross-check',
      }),
    );
    if (stage?.intro) screen.appendChild(el('p', { class: 'screen__intro', text: stage.intro }));

    const allOn = questionsConfig.formChecklist.every((i) => session.formChecklist[i.id]);
    const toggleAll = el('button', { class: 'btn btn--small', type: 'button' }, [
      allOn ? 'Clear all' : 'Confirm all',
    ]);
    toggleAll.addEventListener('click', () => {
      let next = session;
      for (const item of questionsConfig.formChecklist) {
        next = setChecklistItem(next, item.id, !allOn);
      }
      commit(next, { resetFeedback: false });
    });
    screen.appendChild(el('div', { class: 'checklist__actions' }, [toggleAll]));

    const list = el('ul', { class: 'checklist' });
    for (const item of questionsConfig.formChecklist) {
      const input = el('input', { type: 'checkbox', id: `fc-${item.id}` });
      input.checked = Boolean(session.formChecklist[item.id]);
      input.addEventListener('change', () =>
        commit(setChecklistItem(session, item.id, input.checked), { resetFeedback: false }),
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

  return { getSession: () => session, goTo };
}

// ---- in-app explainer -----------------------------------------------------

function showExplainer(host: HTMLElement, live: HTMLElement): void {
  const screen = el('section', { class: 'screen' }, [
    el('h2', {
      class: 'screen__title',
      'data-focus': 'true',
      text: 'Why am I being asked all this?',
    }),
    el('p', {
      class: 'screen__intro',
      text: 'A review of 656 injury and illness records found the description field was systematically under-filled. These are the six things reviewers most often could not find:',
    }),
  ]);

  const list = el('ul', { class: 'gaps' });
  for (const [key, [label, rate]] of Object.entries(GAP_RATES)) {
    list.appendChild(
      el('li', { class: 'gap', 'data-gap': key }, [
        el('span', { class: 'gap__status gap__status--missing', text: 'gap' }),
        el('span', { class: 'gap__body' }, [
          el('span', { class: 'gap__name', text: label }),
          el('span', { class: 'gap__detail', text: ` - ${rate}` }),
        ]),
      ]),
    );
  }
  screen.appendChild(list);

  screen.appendChild(
    el('p', {
      class: 'screen__intro',
      text: 'The wizard only asks about things the form has no field for. Anything the form already captures - names, dates, body parts, severity - is confirmed on a checklist near the end and never enters the description text. No name or personal detail should ever go in the description, because it is surfaced in emails and generic reports.',
    }),
  );

  const back = el('button', { class: 'btn btn--primary', type: 'button' }, [
    'Back to the questions',
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

export type { AnswerValue, Question };
