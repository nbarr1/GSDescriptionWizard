import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildSession, scenarios } from '../fixtures/scenarios';
import { compose } from '../../src/composer';
import { outputTemplates } from '../../src/config';
import { setAnswer, setChecklistItem, createSession } from '../../src/engine/flow';
import { choice, sessionWith, text, escape } from '../helpers/session';

const GOLDEN_DIR = join(__dirname, '..', 'fixtures', 'golden');

/**
 * Golden files are the guard against accidental composer drift. Regenerate them
 * deliberately with UPDATE_GOLDEN=1 npm test, then read the diff before committing.
 */
function checkGolden(name: string, actual: string) {
  if (!existsSync(GOLDEN_DIR)) mkdirSync(GOLDEN_DIR, { recursive: true });
  const file = join(GOLDEN_DIR, `${name}.txt`);

  if (process.env.UPDATE_GOLDEN === '1' || !existsSync(file)) {
    writeFileSync(file, actual, 'utf8');
    return;
  }
  expect(actual, `${name} output changed - rerun with UPDATE_GOLDEN=1 if intended`).toBe(
    readFileSync(file, 'utf8'),
  );
}

describe.each(scenarios)('composed output: $id', (scenario) => {
  const session = buildSession(scenario);
  const labeled = compose(session);
  const narrative = compose({ ...session, outputMode: 'narrative' });

  it('matches the golden labeled output', () => {
    checkGolden(`${scenario.id}.labeled`, labeled.text);
  });

  it('matches the golden narrative output', () => {
    checkGolden(`${scenario.id}.narrative`, narrative.text);
  });

  // --- The non-negotiable assertions from the brief ------------------------

  it('contains no apostrophe or quotation mark', () => {
    expect(labeled.text).not.toMatch(/['"]/);
    expect(narrative.text).not.toMatch(/['"]/);
  });

  it('contains only ASCII', () => {
    expect(labeled.text).not.toMatch(/[^\x20-\x7E\n]/);
    expect(narrative.text).not.toMatch(/[^\x20-\x7E\n]/);
  });

  it('exceeds the 300 character warning floor', () => {
    expect(labeled.characterCount).toBeGreaterThan(300);
    expect(narrative.characterCount).toBeGreaterThan(300);
  });

  it('never names a person in the composed text', () => {
    // The role noun must be present; a gendered pronoun must not.
    expect(labeled.text).toMatch(/\bthe [a-z ]+\b/);
    expect(labeled.text).not.toMatch(/\b(he|she|him|his|her|hers)\b/i);
  });

  it('triggers the PII guard on every seeded identifier', () => {
    if (!scenario.seededPii?.length) return;
    // Seeded PII is caught either by the guard on the composed text, or by the
    // sanitizer having already rewritten it - both are acceptable outcomes, but
    // silently passing it through is not.
    for (const seeded of scenario.seededPii) {
      // Whole-word match: "he" must not be considered present because of "the".
      const asWords = seeded.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const stillPresent = new RegExp(`\\b${asWords}\\b`, 'i').test(labeled.text);
      const flagged = labeled.pii.findings.some((f) =>
        seeded.toLowerCase().includes(f.match.toLowerCase()),
      );
      expect(
        !stillPresent || flagged,
        `seeded identifier "${seeded}" reached the output unflagged`,
      ).toBe(true);
    }
  });
});

describe('output modes', () => {
  const session = buildSession(scenarios[0]!);

  it('labeled mode emits capitalized section headings', () => {
    const { text } = compose(session);
    expect(text).toMatch(/^TASK:/m);
    expect(text).toMatch(/^SEQUENCE:/m);
    expect(text).toMatch(/^MECHANISM:/m);
    expect(text).toMatch(/^CONDITIONS:/m);
    expect(text).toMatch(/^IMMEDIATE ACTIONS:/m);
  });

  it('narrative mode emits a single flowing block with no headings', () => {
    const { text } = compose({ ...session, outputMode: 'narrative' });
    expect(text).not.toMatch(/^TASK:/m);
    expect(text).not.toContain('\n\n');
  });

  it('narrative mode leads the mechanism with an accident-type phrase', () => {
    const { text } = compose({ ...session, outputMode: 'narrative' });
    expect(text).toContain('struck against a stationary object');
  });

  it('is deterministic - the same session always composes identically', () => {
    expect(compose(session).text).toBe(compose(session).text);
  });
});

describe('escape hatches in the output', () => {
  it('renders a justified gap as an explicit statement', () => {
    const session = sessionWith({
      onset_pattern: choice('acute'),
      employee_role: choice('operator'),
      procedure_reference: escape(
        'unknown',
        'The area supervisor is confirming the document number',
      ),
    });
    const { text } = compose(session);
    expect(text).toContain('Procedure reference not determined at time of report');
    expect(text).toContain('the area supervisor is confirming the document number');
  });

  it('never invents content for an unanswered question', () => {
    const session = sessionWith({
      onset_pattern: choice('acute'),
      employee_role: choice('operator'),
      task_performed: text('Clearing a jam from the conveyor infeed at station 4'),
    });
    const composed = compose(session);
    expect(composed.text).toContain('clearing a jam');
    expect(composed.text).not.toContain('undefined');
    expect(composed.text).not.toContain('{answer}');
    expect(composed.text).not.toContain('{role}');
  });
});

describe('category gap statements', () => {
  it('states an untouched deficiency category rather than silently omitting it', () => {
    const session = sessionWith({
      onset_pattern: choice('acute'),
      employee_role: choice('operator'),
      accident_type: choice('struck_by'),
      task_performed: text('Picking bar stock from the third level of the material rack'),
    });
    const composed = compose(session);
    expect(composed.unaddressedCategories).toContain('immediateActions');
    expect(composed.text).toContain(outputTemplates.categoryGapStatements.immediateActions);
  });
});

describe('character budget', () => {
  it('warns below the configured floor', () => {
    const session = sessionWith({
      onset_pattern: choice('acute'),
      employee_role: choice('operator'),
      task_performed: text('Clearing a jam from the conveyor infeed at station 4'),
    });
    // The floor is raised here rather than shrinking the session, because even a
    // near-empty session emits the explicit category gap statements and so clears
    // 300 characters on its own - which is the composer behaving correctly.
    const templates = {
      ...outputTemplates,
      characterBudget: { ...outputTemplates.characterBudget, warnBelow: 5000 },
    };
    const composed = compose(session, templates);
    expect(composed.lengthStatus).toBe('short');
    expect(composed.lengthMessage).toContain('5000');
  });

  it('reports ok inside the target band', () => {
    const composed = compose(buildSession(scenarios[0]!));
    expect(['ok', 'long']).toContain(composed.lengthStatus);
  });

  it('honours a configured hard limit when one is set', () => {
    const session = buildSession(scenarios[0]!);
    const templates = {
      ...outputTemplates,
      characterBudget: { ...outputTemplates.characterBudget, hardLimit: 100 },
    };
    const composed = compose(session, templates);
    expect(composed.lengthStatus).toBe('overLimit');
    expect(composed.lengthMessage).toContain('100');
  });
});

describe('version tag', () => {
  it('is off by default', () => {
    expect(outputTemplates.versionTag.enabled).toBe(false);
    expect(compose(buildSession(scenarios[0]!)).text).not.toContain('[Wizard v');
  });

  it('appends the tag when enabled', () => {
    const templates = {
      ...outputTemplates,
      versionTag: { ...outputTemplates.versionTag, enabled: true },
    };
    expect(compose(buildSession(scenarios[0]!), templates).text).toContain('[Wizard v');
  });
});

describe('outstanding form actions', () => {
  it('lists unticked checklist items and keeps them out of the description', () => {
    let session = buildSession({ ...scenarios[0]!, confirmAllFormItems: false });
    session = setChecklistItem(session, 'fc_dates', true);
    const composed = compose(session);

    expect(composed.outstandingFormActions.length).toBeGreaterThan(0);
    expect(composed.outstandingFormActions.some((a) => a.includes('Case date'))).toBe(false);
    for (const action of composed.outstandingFormActions) {
      expect(composed.text).not.toContain(action);
    }
  });
});

describe('adversarial composition', () => {
  it('composes without throwing when every field holds the same pasted string', () => {
    const pasted = 'Hand contusion';
    let session = createSession();
    session = setAnswer(session, 'onset_pattern', { kind: 'choice', value: 'acute' });
    session = setAnswer(session, 'employee_role', { kind: 'choice', value: 'operator' });
    for (const id of ['task_performed', 'sequence_before', 'sequence_moment', 'sequence_after']) {
      session = setAnswer(session, id, { kind: 'text', text: pasted });
    }
    expect(() => compose(session)).not.toThrow();
    const { text } = compose(session);
    expect(text).not.toMatch(/['"]/);
  });

  it('composes without throwing from a completely empty session', () => {
    expect(() => compose(createSession())).not.toThrow();
  });

  it('composes without throwing from a 50000 character paste', () => {
    let session = createSession();
    session = setAnswer(session, 'onset_pattern', { kind: 'choice', value: 'acute' });
    session = setAnswer(session, 'task_performed', { kind: 'text', text: 'x'.repeat(50_000) });
    expect(() => compose(session)).not.toThrow();
  });

  it('composes without throwing from punctuation and emoji answers', () => {
    let session = createSession();
    session = setAnswer(session, 'onset_pattern', { kind: 'choice', value: 'acute' });
    session = setAnswer(session, 'task_performed', { kind: 'text', text: '🙂 ... !!! 日本語' });
    const { text } = compose(session);
    expect(text).not.toMatch(/[^\x20-\x7E\n]/);
  });
});

describe('sentence frames that supply their own subject', () => {
  it('uses the frame when the answer continues the sentence', () => {
    const session = sessionWith({
      onset_pattern: choice('acute'),
      employee_role: choice('operator'),
      task_performed: text('Clearing a jammed carton from the infeed conveyor at station 4'),
    });
    expect(compose(session).text).toContain(
      'The operator was clearing a jammed carton from the infeed conveyor at station 4.',
    );
  });

  it('falls back rather than doubling the subject when the answer starts its own sentence', () => {
    const session = sessionWith({
      onset_pattern: choice('acute'),
      employee_role: choice('operator'),
      task_performed: text('The operator was clearing a jammed carton from the conveyor'),
    });
    const { text: out } = compose(session);
    expect(out).not.toContain('The operator was the operator was');
    expect(out).toContain(
      'Task being performed: The operator was clearing a jammed carton from the conveyor.',
    );
  });
});
