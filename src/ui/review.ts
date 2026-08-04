/**
 * The review screen.
 *
 * Shows the composed description, a completeness meter mapped to the six
 * deficiency categories, and every sanitization or PII notice. Copying is never
 * blocked - a user who wants to submit something thin must be able to, but they
 * see exactly what is thin before they do.
 */

import type { OutputMode, SessionState } from '../types';
import { GAP_CATEGORIES } from '../types';
import { outstandingFormActions, compose, scanForPii } from '../composer';
import { scoreSession } from '../validation';
import { questionsConfig } from '../config';
import { el } from './dom';
import type { CopyResult } from './clipboard';

const GAP_LABELS: Record<string, string> = {
  rootCause: 'Why it happened',
  equipment: 'Equipment, tool or material',
  immediateActions: 'Immediate actions and treatment',
  procedure: 'Procedure or process followed',
  sequence: 'Sequence of events',
  activity: 'Specific activity performed',
};

const STATUS_WORDS: Record<string, string> = {
  satisfied: 'covered',
  thin: 'thin',
  missing: 'missing',
};

export interface ReviewOptions {
  session: SessionState;
  onModeChange: (mode: OutputMode) => void;
  onEdit: (questionId: string) => void;
  onPersistChange: (persist: boolean) => void;
  onCopy: (text: string, textarea: HTMLTextAreaElement) => Promise<CopyResult>;
  onDownload: (text: string) => void;
  onReset: () => void;
  onBack: () => void;
}

export function renderReview(options: ReviewOptions): HTMLElement {
  const { session } = options;
  const composed = compose(session);
  const report = scoreSession(session);

  const screen = el('section', { class: 'screen review' });
  screen.appendChild(
    el('h2', { class: 'question__prompt', 'data-focus': 'true', text: 'Review and copy' }),
  );
  screen.appendChild(
    el('p', {
      class: 'question__help',
      text: 'This is the text to paste into the Injury/Illness Description field. You can edit it here before copying.',
    }),
  );

  // --- output panel --------------------------------------------------------

  const outputPanel = el('div', { class: 'panel' });
  outputPanel.appendChild(el('h3', { class: 'panel__title', text: 'Description' }));

  const modeToggle = el('div', {
    class: 'mode-toggle',
    role: 'group',
    'aria-label': 'Output format',
  });
  for (const [mode, label] of [
    ['labeled', 'Labelled sections'],
    ['narrative', 'Narrative paragraph'],
  ] as const) {
    const button = el(
      'button',
      {
        class: `btn btn--small${session.outputMode === mode ? ' btn--primary' : ''}`,
        type: 'button',
        'aria-pressed': session.outputMode === mode ? 'true' : 'false',
      },
      [label],
    );
    button.addEventListener('click', () => options.onModeChange(mode));
    modeToggle.appendChild(button);
  }
  outputPanel.appendChild(modeToggle);

  const outputLabel = el('label', {
    class: 'visually-hidden',
    for: 'composed-output',
    text: 'Composed description, editable',
  });
  const output = el('textarea', {
    class: 'output',
    id: 'composed-output',
    spellcheck: 'true',
  }) as HTMLTextAreaElement;
  output.value = composed.text;

  const meta = el('p', { class: `output__meta output__meta--${composed.lengthStatus}` });
  const metaText = el('span', { text: composed.lengthMessage });
  meta.appendChild(metaText);

  const noticeHost = el('ul', { class: 'notices' });
  const renderNotices = (text: string) => {
    while (noticeHost.firstChild) noticeHost.removeChild(noticeHost.firstChild);
    // Hand-edited text is rescanned so a pronoun or name typed back in is caught.
    const findings = text === composed.text ? composed.pii.findings : scanForPii(text).findings;

    const seen = new Set<string>();
    for (const finding of findings) {
      const key = `${finding.kind}:${finding.match}`;
      if (seen.has(key)) continue;
      seen.add(key);
      noticeHost.appendChild(
        el('li', { class: `notice notice--${finding.severity}`, text: finding.message }),
      );
    }

    for (const change of dedupeChanges(composed.changes)) {
      noticeHost.appendChild(
        el('li', {
          class: 'notice notice--info',
          text: `Adjusted for the form: ${change.from} became ${change.to}. ${change.reason}`,
        }),
      );
    }

    if (noticeHost.childElementCount === 0) {
      noticeHost.appendChild(
        el('li', {
          class: 'notice notice--info',
          text: 'No banned characters, personal identifiers or pronouns detected.',
        }),
      );
    }
  };

  output.addEventListener('input', () => {
    metaText.textContent = lengthMessageFor(output.value.length, composed.lengthMessage);
    renderNotices(output.value);
  });

  outputPanel.appendChild(outputLabel);
  outputPanel.appendChild(output);
  outputPanel.appendChild(meta);
  outputPanel.appendChild(noticeHost);
  renderNotices(composed.text);

  // --- copy actions --------------------------------------------------------

  const copyStatus = el('p', { class: 'copy-status', role: 'status', 'aria-live': 'polite' });

  const copyButton = el('button', { class: 'btn btn--primary', type: 'button' }, [
    'Copy description',
  ]);
  copyButton.addEventListener('click', () => {
    void options.onCopy(output.value, output).then((result) => {
      copyStatus.className = `copy-status copy-status--${result.ok ? 'ok' : 'fail'}`;
      copyStatus.textContent = result.message;
    });
  });

  const copyActions = el('div', { class: 'copy-actions' }, [copyButton]);

  const outstanding = outstandingFormActions(session);
  if (outstanding.length > 0) {
    const copyOutstanding = el('button', { class: 'btn', type: 'button' }, [
      `Copy ${outstanding.length} outstanding form actions`,
    ]);
    copyOutstanding.addEventListener('click', () => {
      void options
        .onCopy(
          `Outstanding actions on the I&I form:\n${outstanding.map((a) => `- ${a}`).join('\n')}`,
          output,
        )
        .then((result) => {
          copyStatus.className = `copy-status copy-status--${result.ok ? 'ok' : 'fail'}`;
          copyStatus.textContent = result.ok ? 'Outstanding form actions copied.' : result.message;
        });
    });
    copyActions.appendChild(copyOutstanding);
  }

  const download = el('button', { class: 'btn', type: 'button' }, ['Download as .txt']);
  download.addEventListener('click', () => options.onDownload(output.value));
  copyActions.appendChild(download);

  outputPanel.appendChild(copyActions);
  outputPanel.appendChild(copyStatus);

  // --- completeness panel --------------------------------------------------

  const scorePanel = el('div', { class: 'panel' });
  scorePanel.appendChild(el('h3', { class: 'panel__title', text: 'Completeness' }));

  scorePanel.appendChild(
    el('div', { class: 'meter' }, [
      el('div', { class: 'meter__head' }, [
        el('span', { class: 'meter__label', text: report.label }),
        el('span', { class: 'gap__detail', text: `${report.score} of 100` }),
      ]),
      el(
        'div',
        {
          class: 'meter__track',
          role: 'meter',
          'aria-valuenow': report.score,
          'aria-valuemin': 0,
          'aria-valuemax': 100,
          'aria-label': `Completeness: ${report.label}, ${report.score} of 100`,
        },
        [
          el('div', {
            class: `meter__fill meter__fill--${report.tone}`,
            style: `width:${report.score}%`,
          }),
        ],
      ),
    ]),
  );

  const gapList = el('ul', { class: 'gaps' });
  for (const category of GAP_CATEGORIES) {
    const entry = report.categories.find((c) => c.category === category);
    if (!entry) continue;

    const item = el('li', { class: 'gap' }, [
      el('span', {
        class: `gap__status gap__status--${entry.status}`,
        text: STATUS_WORDS[entry.status] ?? entry.status,
      }),
    ]);

    const body = el('span', { class: 'gap__body' }, [
      el('span', { class: 'gap__name', text: GAP_LABELS[category] ?? category }),
    ]);

    const weakest = entry.weakest[0];
    if (weakest) {
      const question = questionsConfig.questions.find((q) => q.id === weakest.questionId);
      if (question) {
        const jump = el(
          'button',
          { class: 'btn btn--small', type: 'button', style: 'margin-top:0.4rem;display:block' },
          [`Improve: ${shorten(question.prompt)}`],
        );
        jump.addEventListener('click', () => options.onEdit(weakest.questionId));
        body.appendChild(jump);
      }
    }

    item.appendChild(body);
    gapList.appendChild(item);
  }
  scorePanel.appendChild(gapList);

  if (composed.unaddressedCategories.length > 0) {
    scorePanel.appendChild(
      el('p', {
        class: 'gap__detail',
        style: 'margin-top:0.85rem',
        text: 'Categories with nothing behind them are stated explicitly in the description rather than left silently blank.',
      }),
    );
  }

  // --- persistence ---------------------------------------------------------

  const persistInput = el('input', { type: 'checkbox', id: 'persist-draft' }) as HTMLInputElement;
  persistInput.checked = session.persist;
  persistInput.addEventListener('change', () => options.onPersistChange(persistInput.checked));

  const persist = el('label', { class: 'persist', for: 'persist-draft' }, [
    persistInput,
    el('span', { class: 'persist__text' }, [
      'Keep this draft on this device if the page is closed. ',
      'Leave this off on a shared computer. Saved drafts are cleared after 24 hours and by Clear all data.',
    ]),
  ]);

  // --- assembly ------------------------------------------------------------

  screen.appendChild(el('div', { class: 'review__grid' }, [outputPanel, scorePanel]));
  screen.appendChild(persist);

  const back = el('button', { class: 'btn', type: 'button' }, ['Back']);
  back.addEventListener('click', options.onBack);

  const startNew = el('button', { class: 'btn btn--danger', type: 'button' }, [
    'Start a new case and clear this one',
  ]);
  startNew.addEventListener('click', () => {
    if (window.confirm('Clear every answer and start a new case?')) options.onReset();
  });

  screen.appendChild(el('div', { class: 'nav' }, [back, startNew]));
  return screen;
}

// ---------------------------------------------------------------------------

function dedupeChanges<T extends { from: string; to: string; reason: string }>(changes: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const change of changes) {
    const key = `${change.from}->${change.to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(change);
  }
  return out;
}

function lengthMessageFor(length: number, original: string): string {
  return `${length} characters. ${original.replace(/^\d+ characters,? ?/, '')}`;
}

function shorten(prompt: string): string {
  return prompt.length > 46 ? `${prompt.slice(0, 44).trimEnd()}...` : prompt;
}
