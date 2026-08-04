import { describe, expect, it } from 'vitest';
import { questionsConfig, requireQuestion } from '../../src/config';
import { isVisible } from '../../src/engine/branching';
import {
  CROSSCHECK_STEP,
  REVIEW_STEP,
  canAdvance,
  createSession,
  nextStep,
  previousStep,
  setAnswer,
  visibleSteps,
} from '../../src/engine/flow';
import { scoreSession, validateAnswer } from '../../src/validation';
import { compose } from '../../src/composer';
import { buildSession, scenarios } from '../fixtures/scenarios';
import { choice, sessionWith } from '../helpers/session';

/**
 * The adversarial suite from the brief. Every one of these has to leave the tool
 * in a usable state - no crash, no bad description, no way through with nothing.
 */

const ADVERSARIAL_INPUTS: [string, string][] = [
  ['single character', 'a'],
  ['single punctuation', '.'],
  ['real data: hand contusion', 'Hand contusion'],
  ['real data: ergonomic back injury', 'Ergonomic Back injury'],
  ['real data: not specified', 'not specified'],
  ['real data: unknown', 'unknown'],
  ['real data: pending', 'pending'],
  ['real data: n/a', 'n/a'],
  ['real data: TBD', 'TBD'],
  ['punctuation only', '!!!???...'],
  ['emoji only', 'X'],
  ['non-Latin script only', 'Y'],
  ['keyboard mashing', 'asdfasdf jkljkl qwerty'],
  ['whitespace only', '     '],
  ['smart quotes and dashes', 'the guard was broken and the operator did not stop'],
  ['html injection', '<script>alert(1)</script>'],
  ['sql-ish injection', "'; DROP TABLE cases; --"],
  ['very long paste', 'x'.repeat(50_000)],
  ['repeated word', 'the the the the the the the the'],
];

// Emoji and non-Latin are built from escapes so this file stays plain ASCII.
ADVERSARIAL_INPUTS[10] = ['emoji only', '\u{1F642}\u{1F642}\u{1F642}'];
ADVERSARIAL_INPUTS[11] = ['non-Latin script only', '日本語のテキスト'];
ADVERSARIAL_INPUTS[14] = [
  'smart quotes and dashes',
  '“the guard” was — broken — and the operator didn’t stop',
];

/** Every free-text question that can be reached without branching setup. */
const FREE_TEXT_QUESTIONS = questionsConfig.questions
  .filter((q) => q.kind === 'text' || q.kind === 'textarea')
  .map((q) => q.id);

describe('adversarial input against every free-text question', () => {
  it.each(ADVERSARIAL_INPUTS)('handles %s without throwing anywhere', (_label, input) => {
    for (const questionId of FREE_TEXT_QUESTIONS) {
      const session = setAnswer(createSession(), questionId, { kind: 'text', text: input });
      const question = requireQuestion(questionId);

      expect(() => validateAnswer(question, session), `validate ${questionId}`).not.toThrow();
      expect(() => scoreSession(session), `score ${questionId}`).not.toThrow();
      expect(() => compose(session), `compose ${questionId}`).not.toThrow();

      const { text } = compose(session);
      expect(text, `${questionId} leaked a quote`).not.toMatch(/['"]/);
      expect(text, `${questionId} leaked non-ASCII`).not.toMatch(/[^\x20-\x7E\n]/);
    }
  });

  it('never accepts filler on a question where a blank would block', () => {
    const blocking = questionsConfig.questions.filter(
      (q) => (q.kind === 'text' || q.kind === 'textarea') && q.validation?.emptyTier === 'block',
    );

    for (const question of blocking) {
      for (const filler of ['not specified', 'unknown', 'pending', 'n/a', 'TBD', 'none', '.']) {
        const session = setAnswer(createSession(), question.id, { kind: 'text', text: filler });
        const result = validateAnswer(question, session);
        expect(
          result.canAdvance,
          `${question.id} accepted "${filler}" and let the user through`,
        ).toBe(false);
      }
    }
  });
});

describe('the same answer pasted into every field', () => {
  it('is flagged as repetition rather than silently accepted', () => {
    const pasted =
      'The operator was clearing a jammed carton from the infeed conveyor guard at station 4';
    let session = sessionWith({
      onset_pattern: choice('acute'),
      employee_role: choice('operator'),
    });

    for (const id of ['task_performed', 'sequence_before', 'sequence_moment', 'sequence_after']) {
      session = setAnswer(session, id, { kind: 'text', text: pasted });
    }

    const flagged = ['sequence_before', 'sequence_moment', 'sequence_after'].filter((id) =>
      validateAnswer(requireQuestion(id), session).findings.some((f) => f.rule === 'repetition'),
    );
    expect(flagged.length).toBeGreaterThan(0);
  });
});

describe('every escape hatch selected on every question', () => {
  const escapable = questionsConfig.questions.filter((q) => q.escapeHatches);

  it('composes a valid description made entirely of stated gaps', () => {
    let session = sessionWith({
      onset_pattern: choice('acute'),
      injury_or_illness: choice('injury'),
      accident_type: choice('overexertion'),
      principal_body_part: choice('back_lower'),
      employee_role: choice('operator'),
      discovery_mode: choice('witnessed'),
    });

    for (const question of escapable) {
      session = setAnswer(session, question.id, {
        kind: 'escape',
        hatch: 'unknown',
        justification: 'Not established at the time of this report',
      });
    }

    expect(() => compose(session)).not.toThrow();
    const composed = compose(session);
    expect(composed.text).toContain('not determined at time of report');
    expect(composed.text).not.toMatch(/['"]/);
  });

  it('scores escape hatches as unresolved so the meter cannot be gamed green', () => {
    let session = sessionWith({
      onset_pattern: choice('acute'),
      accident_type: choice('overexertion'),
      employee_role: choice('operator'),
    });
    for (const question of escapable) {
      session = setAnswer(session, question.id, {
        kind: 'escape',
        hatch: 'unknown',
        justification: 'Not established at the time of this report',
      });
    }

    const report = scoreSession(session);
    expect(report.score).toBeLessThan(45);
    expect(report.label).toBe('Insufficient');
  });

  it('requires a real justification on every escapable question', () => {
    // Build a session that opens as many branches as possible, so questions
    // behind a gate are actually reachable rather than being pruned as orphans.
    const base = sessionWith({
      onset_pattern: choice('acute'),
      injury_or_illness: choice('injury'),
      accident_type: choice('overexertion'),
      principal_body_part: choice('back_lower'),
      employee_role: choice('material handler'),
      discovery_mode: choice('self_reported_delayed'),
      equipment_involved: true,
      object_handled: true,
      procedure_followed: choice('differed'),
      cond_known_hazard: choice('yes'),
      cond_barriers_bypassed: choice('yes'),
      mech_exert_team: choice('two_person'),
    });

    let checked = 0;
    for (const question of escapable) {
      if (!isVisible(question, base)) continue;
      const session = setAnswer(base, question.id, {
        kind: 'escape',
        hatch: 'unknown',
        justification: '',
      });
      expect(validateAnswer(question, session).canAdvance, `${question.id}`).toBe(false);
      checked += 1;
    }
    expect(checked, 'no escapable questions were reachable in the test session').toBeGreaterThan(
      10,
    );
  });
});

describe('navigation under changing answers', () => {
  it('drops orphaned answers when a branch closes, and only those', () => {
    let session = sessionWith({
      onset_pattern: choice('acute'),
      accident_type: choice('fall_elevation'),
      employee_role: choice('operator'),
    });
    session = setAnswer(session, 'mech_fall_height', { kind: 'text', text: 'About 6 feet' });
    session = setAnswer(session, 'task_performed', {
      kind: 'text',
      text: 'Closing an isolation valve above the assembly cell',
    });
    expect(session.answers.mech_fall_height).toBeDefined();

    // Switching accident type closes the fall branch.
    session = setAnswer(session, 'accident_type', { kind: 'choice', value: 'overexertion' });
    expect(session.answers.mech_fall_height).toBeUndefined();
    // Answers still in scope survive.
    expect(session.answers.task_performed).toBeDefined();
  });

  it('drops grandchild answers too when a parent branch closes', () => {
    let session = sessionWith({
      onset_pattern: choice('acute'),
      accident_type: choice('overexertion'),
      employee_role: choice('operator'),
    });
    session = setAnswer(session, 'mech_exert_team', { kind: 'choice', value: 'two_person' });
    session = setAnswer(session, 'mech_exert_team_detail', {
      kind: 'text',
      text: 'The far handler raised their end about a second early',
    });
    expect(session.answers.mech_exert_team_detail).toBeDefined();

    session = setAnswer(session, 'accident_type', { kind: 'choice', value: 'fall_same_level' });
    expect(session.answers.mech_exert_team).toBeUndefined();
    expect(session.answers.mech_exert_team_detail).toBeUndefined();
  });

  it('survives rapid back and forth across the whole flow', () => {
    const session = buildSession(scenarios[3]!);
    const steps = visibleSteps(session);

    // Walk forward and back repeatedly; nothing should throw or lose its place.
    let current = steps[0]!;
    for (let i = 0; i < 200; i += 1) {
      const forward = i % 3 !== 2;
      const target = forward ? nextStep(current, session) : previousStep(current, session);
      if (target) current = target;
      expect(() => canAdvance(current, session)).not.toThrow();
      expect(visibleSteps(session)).toContain(current);
    }
    expect(Object.keys(session.answers).length).toBeGreaterThan(20);
  });

  it('drops a screen entirely once all of its questions are hidden', () => {
    let session = sessionWith({
      onset_pattern: choice('acute'),
      accident_type: choice('fall_same_level'),
      employee_role: choice('operator'),
      equipment_involved: true,
      object_handled: true,
    });
    expect(visibleSteps(session)).toContain('task_equipment');

    // With neither equipment nor a handled object, that screen has nothing to ask.
    session = setAnswer(session, 'equipment_involved', { kind: 'boolean', value: false });
    session = setAnswer(session, 'object_handled', { kind: 'boolean', value: false });
    expect(visibleSteps(session)).not.toContain('task_equipment');
  });

  it('lands on a real screen when the current one stops being visible', () => {
    let session = sessionWith({
      onset_pattern: choice('acute'),
      accident_type: choice('fall_same_level'),
      employee_role: choice('operator'),
      equipment_involved: true,
      object_handled: false,
    });
    const current = 'task_equipment';
    expect(visibleSteps(session)).toContain(current);

    session = setAnswer(session, 'equipment_involved', { kind: 'boolean', value: false });
    expect(visibleSteps(session)).not.toContain(current);

    const target = nextStep(current, session);
    expect(target).not.toBeNull();
    expect(visibleSteps(session)).toContain(target as string);
  });

  it('always terminates at the review step', () => {
    for (const scenario of scenarios) {
      const session = buildSession(scenario);
      const steps = visibleSteps(session);
      expect(steps[steps.length - 1]).toBe(REVIEW_STEP);
      expect(steps[steps.length - 2]).toBe(CROSSCHECK_STEP);
      expect(nextStep(REVIEW_STEP, session)).toBeNull();
    }
  });
});

describe('seeded identifiers in free text', () => {
  const seeded: [string, string][] = [
    ['name', 'The lift was called by Michael at the far end of the casing'],
    ['badge', 'The jam was cleared by badge 448192 on the previous shift'],
    ['phone', 'The supervisor was reached on 555-123-4567 after the event'],
    ['email', 'Details were sent to j.smith@example.com the same evening'],
    ['dob', 'The record shows a date of birth of 04/11/1985 on file'],
  ];

  it.each(seeded)('flags a %s that reaches the composed output', (_kind, answer) => {
    const session = sessionWith({
      onset_pattern: choice('acute'),
      employee_role: choice('operator'),
      accident_type: choice('overexertion'),
      cond_difference_from_normal: { kind: 'text', text: answer },
    });
    const composed = compose(session);
    expect(composed.pii.findings.length).toBeGreaterThan(0);
  });

  it('blocks on structured identifiers but only advises on probable names', () => {
    const withBadge = sessionWith({
      onset_pattern: choice('acute'),
      employee_role: choice('operator'),
      cond_difference_from_normal: { kind: 'text', text: 'Cleared by badge 448192 last shift' },
    });
    expect(compose(withBadge).pii.hasBlocking).toBe(true);

    const withName = sessionWith({
      onset_pattern: choice('acute'),
      employee_role: choice('operator'),
      cond_difference_from_normal: {
        kind: 'text',
        text: 'The lift was called by Michael at the far end',
      },
    });
    const report = compose(withName).pii;
    expect(report.hasBlocking).toBe(false);
    expect(report.findings.some((f) => f.kind === 'probable_name')).toBe(true);
  });
});

describe('empty and partial sessions', () => {
  it('produces a coherent, safe description from an empty session', () => {
    const composed = compose(createSession());
    expect(composed.text).not.toMatch(/['"]/);
    expect(composed.unaddressedCategories.length).toBeGreaterThan(0);
    expect(scoreSession(createSession()).label).toBe('Insufficient');
  });

  it('puts every visible question on a reachable screen', () => {
    for (const scenario of scenarios) {
      const session = buildSession(scenario);
      const steps = new Set(visibleSteps(session));
      for (const question of questionsConfig.questions) {
        if (!isVisible(question, session)) continue;
        expect(
          steps.has(question.screen),
          `${scenario.id}: ${question.id} is visible but its screen ${question.screen} is unreachable`,
        ).toBe(true);
      }
    }
  });
});
