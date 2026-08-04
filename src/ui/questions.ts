/**
 * Rendering for a single question.
 *
 * Split out from app.ts because a screen now holds several of these, and the
 * per-question rendering is where nearly all the input handling lives.
 *
 * All text goes in through `textContent` via the helpers in ./dom, so no user
 * string ever reaches an HTML parser.
 */

import type { Finding, Question, QuestionOption, SessionState } from '../types';
import { optionsFor, validationConfig } from '../config';
import type { ValidationResult } from '../validation';
import { el } from './dom';
import { buildPostureFigure } from './postures';

export interface QuestionCallbacks {
  /** Fired on every change that should re-render the screen. */
  onCommit: (questionId: string, value: import('../types').AnswerValue) => void;
  /** Fired on keystrokes - stores the value without re-rendering under the cursor. */
  onType: (questionId: string, text: string) => void;
  onEscapeHatch: (question: Question, hatch: 'unknown' | 'not_applicable') => void;
  onClearEscapeHatch: (questionId: string) => void;
  onDismissChallenge: (question: Question) => void;
}

export function renderQuestionBlock(
  question: Question,
  session: SessionState,
  result: ValidationResult,
  showFeedback: boolean,
  callbacks: QuestionCallbacks,
): HTMLElement {
  const answer = session.answers[question.id];
  const block = el('section', {
    class: 'q',
    'data-question': question.id,
    'aria-labelledby': `prompt-${question.id}`,
  });

  block.appendChild(
    el('h3', { class: 'q__prompt', id: `prompt-${question.id}`, text: question.prompt }),
  );

  if (question.help) {
    block.appendChild(
      el('p', { class: 'q__help', id: `help-${question.id}`, text: question.help }),
    );
  }

  if (question.why) {
    block.appendChild(
      el('details', { class: 'q__why' }, [
        el('summary', { text: 'Why this is asked' }),
        el('div', { class: 'q__why-body', text: question.why }),
      ]),
    );
  }

  if (answer?.value.kind === 'escape') {
    block.appendChild(renderActiveHatch(question, answer.value.justification, callbacks));
  } else {
    block.appendChild(renderInput(question, session, callbacks));
    if (question.examples?.length && (question.kind === 'text' || question.kind === 'textarea')) {
      block.appendChild(renderExamples(question));
    }
  }

  if (showFeedback && result.findings.length > 0) {
    block.appendChild(renderFeedback(question, result, callbacks));
  }

  if (question.escapeHatches && answer?.value.kind !== 'escape') {
    block.appendChild(renderEscapeHatches(question, callbacks));
  }

  return block;
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

function renderInput(
  question: Question,
  session: SessionState,
  callbacks: QuestionCallbacks,
): HTMLElement {
  switch (question.kind) {
    case 'text':
    case 'textarea':
      return renderFreeText(question, session, callbacks);
    case 'boolean':
      return renderBoolean(question, session, callbacks);
    case 'posture':
      return renderPosture(question, session, callbacks);
    case 'multiselect':
      return renderChips(question, session, callbacks, true);
    default:
      return renderChips(question, session, callbacks, false);
  }
}

function renderFreeText(
  question: Question,
  session: SessionState,
  callbacks: QuestionCallbacks,
): HTMLElement {
  const answer = session.answers[question.id];
  const value = answer?.value.kind === 'text' ? answer.value.text : '';
  const max = question.validation?.maxLength ?? validationConfig.defaultMaxLength;
  const field = el('div', { class: 'field' });

  const input =
    question.kind === 'textarea'
      ? el('textarea', {
          class: 'field__textarea',
          id: `input-${question.id}`,
          rows: 4,
          placeholder: question.placeholder ?? '',
          'aria-describedby': question.help ? `help-${question.id}` : undefined,
          'aria-labelledby': `prompt-${question.id}`,
          maxlength: max,
        })
      : el('input', {
          class: 'field__input',
          id: `input-${question.id}`,
          type: 'text',
          placeholder: question.placeholder ?? '',
          'aria-describedby': question.help ? `help-${question.id}` : undefined,
          'aria-labelledby': `prompt-${question.id}`,
          maxlength: max,
        });

  (input as HTMLInputElement | HTMLTextAreaElement).value = value;

  const counter = el('p', { class: 'field__counter' });
  const updateCounter = (length: number) => {
    const min = question.validation?.minLength;
    counter.textContent =
      min && length < min ? `${length} of about ${min} characters` : `${length} characters`;
  };
  updateCounter(value.length);

  input.addEventListener('input', () => {
    const text = (input as HTMLInputElement | HTMLTextAreaElement).value;
    updateCounter(text.length);
    callbacks.onType(question.id, text);
  });

  field.appendChild(input);
  field.appendChild(counter);
  return field;
}

function renderBoolean(
  question: Question,
  session: SessionState,
  callbacks: QuestionCallbacks,
): HTMLElement {
  const answer = session.answers[question.id];
  const current = answer?.value.kind === 'boolean' ? answer.value.value : undefined;
  return buildChipGroup(
    question,
    [
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No' },
    ],
    current === undefined ? [] : [current ? 'yes' : 'no'],
    false,
    (values) => callbacks.onCommit(question.id, { kind: 'boolean', value: values[0] === 'yes' }),
  );
}

function renderChips(
  question: Question,
  session: SessionState,
  callbacks: QuestionCallbacks,
  multiple: boolean,
): HTMLElement {
  const answer = session.answers[question.id];
  const selected =
    answer?.value.kind === 'multi'
      ? answer.value.values
      : answer?.value.kind === 'choice'
        ? [answer.value.value]
        : [];

  return buildChipGroup(question, optionsFor(question), selected, multiple, (values) => {
    callbacks.onCommit(
      question.id,
      multiple ? { kind: 'multi', values } : { kind: 'choice', value: values[0] ?? '' },
    );
  });
}

/**
 * Options render as tap targets rather than a native dropdown. A dropdown hides
 * the choices behind a tap and is fiddly with gloves; chips show everything at
 * once and are each at least 44px tall.
 */
function buildChipGroup(
  question: Question,
  options: QuestionOption[],
  selected: string[],
  multiple: boolean,
  onChange: (values: string[]) => void,
): HTMLElement {
  const hasNotes = options.some((o) => o.note);
  const fieldset = el('fieldset', { class: `options${hasNotes ? '' : ' options--compact'}` }, [
    el('legend', { class: 'visually-hidden', text: question.prompt }),
  ]);

  for (const option of options) {
    const inputId = `opt-${question.id}-${option.value.replace(/\W+/g, '_')}`;
    const input = el('input', {
      type: multiple ? 'checkbox' : 'radio',
      name: `q-${question.id}`,
      id: inputId,
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
      el('label', { class: 'option', for: inputId }, [
        input,
        el('span', { class: 'option__text' }, [
          el('span', { class: 'option__label', text: option.label }),
          option.note ? el('span', { class: 'option__note', text: option.note }) : null,
        ]),
      ]),
    );
  }

  return fieldset;
}

/** Figures instead of words. See ui/postures.ts for why. */
function renderPosture(
  question: Question,
  session: SessionState,
  callbacks: QuestionCallbacks,
): HTMLElement {
  const answer = session.answers[question.id];
  const selected = answer?.value.kind === 'choice' ? answer.value.value : '';

  const fieldset = el('fieldset', { class: 'postures' }, [
    el('legend', { class: 'visually-hidden', text: question.prompt }),
  ]);

  for (const option of optionsFor(question)) {
    const inputId = `posture-${question.id}-${option.value}`;
    const input = el('input', {
      type: 'radio',
      name: `q-${question.id}`,
      id: inputId,
      value: option.value,
      class: 'posture__input',
    });
    input.checked = option.value === selected;
    input.addEventListener('change', () =>
      callbacks.onCommit(question.id, { kind: 'choice', value: option.value }),
    );

    const label = el('label', { class: 'posture', for: inputId }, [input]);

    const figure = buildPostureFigure(option.value);
    // A missing figure degrades to a plain labelled option rather than a blank box.
    if (figure) label.appendChild(figure);
    label.appendChild(el('span', { class: 'posture__label', text: option.label }));

    fieldset.appendChild(label);
  }

  return fieldset;
}

// ---------------------------------------------------------------------------
// Supporting blocks
// ---------------------------------------------------------------------------

function renderExamples(question: Question): HTMLElement {
  return el('details', { class: 'examples' }, [
    el('summary', { text: 'Show an example' }),
    el(
      'ul',
      { class: 'examples__list' },
      (question.examples ?? []).map((example) =>
        el('li', { class: 'examples__item', text: example }),
      ),
    ),
  ]);
}

function renderFeedback(
  question: Question,
  result: ValidationResult,
  callbacks: QuestionCallbacks,
): HTMLElement {
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
    const dismiss = el('button', { class: 'btn btn--small', type: 'button' }, [
      'Move on and say why',
    ]);
    dismiss.addEventListener('click', () => callbacks.onDismissChallenge(question));
    box.appendChild(el('div', { class: 'feedback__actions' }, [dismiss]));
  }

  return box;
}

function renderEscapeHatches(question: Question, callbacks: QuestionCallbacks): HTMLElement {
  const buttons = el('div', { class: 'hatches' });
  for (const [hatch, label] of [
    ['unknown', 'I do not know'],
    ['not_applicable', 'Not applicable'],
  ] as const) {
    const button = el('button', { class: 'btn btn--small btn--quiet', type: 'button' }, [label]);
    button.addEventListener('click', () => callbacks.onEscapeHatch(question, hatch));
    buttons.appendChild(button);
  }
  return buttons;
}

function renderActiveHatch(
  question: Question,
  justification: string,
  callbacks: QuestionCallbacks,
): HTMLElement {
  const host = el('div', { class: 'notice notice--advisory' }, [
    el('p', { class: 'notice__text', text: `Recorded as a stated gap: ${justification}` }),
  ]);
  const undo = el('button', { class: 'btn btn--small', type: 'button' }, ['Answer it instead']);
  undo.addEventListener('click', () => callbacks.onClearEscapeHatch(question.id));
  host.appendChild(undo);
  return host;
}
