import { describe, expect, it } from 'vitest';
import { buildSession, scenarios } from '../fixtures/scenarios';
import { questionsConfig } from '../../src/config';
import { isVisible } from '../../src/engine/branching';
import { validateAnswer, scoreSession } from '../../src/validation';
import { compose } from '../../src/composer';
import { canAdvance, visibleSteps, CROSSCHECK_STEP, REVIEW_STEP } from '../../src/engine/flow';

describe('scenario coverage', () => {
  it('has at least twelve scenarios spanning the branch matrix', () => {
    expect(scenarios.length).toBeGreaterThanOrEqual(12);
    expect(new Set(scenarios.map((s) => s.id)).size).toBe(scenarios.length);
  });

  it('covers every onset pattern', () => {
    const patterns = new Set(
      scenarios.map((s) => {
        const value = s.answers.onset_pattern;
        return typeof value === 'object' && 'value' in value ? value.value : value;
      }),
    );
    for (const pattern of ['acute', 'gradual', 'aggravation']) {
      expect(patterns, `no scenario uses onset pattern ${pattern}`).toContain(pattern);
    }
  });

  it('covers the major accident type branches', () => {
    const types = new Set(
      scenarios.map((s) => {
        const value = s.answers.accident_type;
        return typeof value === 'object' && 'value' in value ? value.value : value;
      }),
    );
    for (const type of [
      'struck_by',
      'struck_against',
      'caught_in_between',
      'overexertion',
      'fall_same_level',
      'fall_elevation',
      'repetitive_motion',
      'contact_temperature',
      'contact_chemical',
    ]) {
      expect(types, `no scenario uses accident type ${type}`).toContain(type);
    }
  });
});

describe.each(scenarios)('scenario: $id', (scenario) => {
  const session = buildSession(scenario);

  it('answers every question the flow makes visible', () => {
    const unanswered = questionsConfig.questions
      .filter((q) => isVisible(q, session))
      // Questions that only warn when blank are genuinely optional.
      .filter((q) => (q.validation?.emptyTier ?? 'warn') !== 'warn')
      .filter((q) => !session.answers[q.id])
      .map((q) => q.id);
    expect(unanswered, `${scenario.id} leaves questions unanswered`).toEqual([]);
  });

  it('can advance through every step without being blocked', () => {
    const blocked = visibleSteps(session)
      .filter((step) => step !== CROSSCHECK_STEP && step !== REVIEW_STEP)
      .filter((step) => !canAdvance(step, session));
    expect(blocked, `${scenario.id} is blocked at these steps`).toEqual([]);
  });

  it('produces no blocking validation findings', () => {
    const blocking = questionsConfig.questions
      .filter((q) => isVisible(q, session))
      .map((q) => ({ id: q.id, result: validateAnswer(q, session) }))
      .filter(({ result }) => result.tier === 'block')
      .map(({ id }) => id);
    expect(blocking).toEqual([]);
  });

  it('reaches at least an adequate completeness score', () => {
    const report = scoreSession(session);
    expect(report.score, `${scenario.id} scored ${report.score}`).toBeGreaterThanOrEqual(45);
    expect(report.label).not.toBe('Insufficient');
  });

  it('addresses all six deficiency categories or records the gap explicitly', () => {
    const report = scoreSession(session);
    const composed = compose(session);
    for (const category of report.categories) {
      const addressed = category.status !== 'missing';
      const explicitlyRecorded = composed.unaddressedCategories.includes(category.category);
      expect(
        addressed || explicitlyRecorded,
        `${scenario.id}: ${category.category} is neither addressed nor recorded as a gap`,
      ).toBe(true);
    }
  });
});
