import { describe, expect, it } from 'vitest';
import {
  optionsFor,
  outputTemplates,
  questionsConfig,
  scoringConfig,
  validateConfig,
  validationConfig,
} from '../../src/config';
import { GAP_CATEGORIES } from '../../src/types';

describe('config integrity', () => {
  it('has no structural problems', () => {
    expect(validateConfig()).toEqual([]);
  });

  it('gives every free-text question a worked example', () => {
    const missing = questionsConfig.questions
      .filter((q) => q.kind === 'text' || q.kind === 'textarea')
      .filter((q) => !q.examples || q.examples.length === 0)
      .map((q) => q.id);
    expect(missing).toEqual([]);
  });

  it('keeps the set of blocking free-text questions small and deliberate', () => {
    // A question that blocks on empty with no escape hatch must be one where a
    // blank genuinely makes the description useless. Keep that list short.
    const blockingWithoutHatch = questionsConfig.questions
      .filter((q) => q.validation?.emptyTier === 'block' && q.escapeHatches !== true)
      .filter((q) => q.kind === 'text' || q.kind === 'textarea')
      .map((q) => q.id);

    expect(blockingWithoutHatch.length).toBeLessThanOrEqual(20);
    for (const id of ['task_performed', 'sequence_moment', 'point_of_contact']) {
      expect(blockingWithoutHatch, `${id} should block on empty`).toContain(id);
    }
  });

  it('asks most questions as a pick rather than as free text', () => {
    // The whole point of the consolidation: typing is the expensive part.
    const picks = questionsConfig.questions.filter((q) =>
      ['select', 'multiselect', 'boolean', 'posture'].includes(q.kind),
    );
    expect(picks.length / questionsConfig.questions.length).toBeGreaterThan(0.55);
  });

  it('groups questions onto screens rather than one per screen', () => {
    const perScreen = new Map<string, number>();
    for (const q of questionsConfig.questions) {
      perScreen.set(q.screen, (perScreen.get(q.screen) ?? 0) + 1);
    }
    const average = questionsConfig.questions.length / perScreen.size;
    expect(average).toBeGreaterThan(2.5);
  });

  it('covers all six deficiency categories with weighted questions', () => {
    for (const category of GAP_CATEGORIES) {
      const questions = questionsConfig.questions.filter((q) =>
        q.gapCategories?.includes(category),
      );
      expect(questions.length, `no questions feed ${category}`).toBeGreaterThan(0);
      expect(scoringConfig.categoryWeights[category]).toBeGreaterThan(0);
      expect(outputTemplates.categoryGapStatements[category]).toBeTruthy();
    }
  });

  it('resolves every option list referenced by a question', () => {
    for (const question of questionsConfig.questions) {
      if (question.kind !== 'select' && question.kind !== 'multiselect') continue;
      const options = optionsFor(question);
      expect(options.length, `${question.id} has no options`).toBeGreaterThan(0);
      const values = options.map((o) => o.value);
      expect(new Set(values).size, `${question.id} has duplicate option values`).toBe(
        values.length,
      );
    }
  });

  it('gives every accident type a mechanism lead phrase', () => {
    const accidentTypes = optionsFor(
      questionsConfig.questions.find((q) => q.id === 'accident_type')!,
    ).map((o) => o.value);
    for (const type of accidentTypes) {
      expect(outputTemplates.narrative.mechanismLead[type], `no lead for ${type}`).toBeTruthy();
    }
  });

  it('gives every accident type at least one mechanism question', () => {
    const accidentTypes = optionsFor(
      questionsConfig.questions.find((q) => q.id === 'accident_type')!,
    ).map((o) => o.value);

    for (const type of accidentTypes) {
      const branchQuestions = questionsConfig.questions.filter((q) => {
        if (q.stage !== 'mechanism') return false;
        const cond = q.showIf;
        if (!cond) return false;
        if ('equals' in cond && cond.field === 'accident_type') return cond.equals === type;
        if ('in' in cond && cond.field === 'accident_type') return cond.in.includes(type);
        return false;
      });
      expect(
        branchQuestions.length,
        `accident type ${type} has no mechanism questions`,
      ).toBeGreaterThan(0);
    }
  });

  it('keeps the vague token list free of words that appear in real answers', () => {
    // "not" and "no" must never be listed on their own - they carry meaning in
    // answers like "no written procedure exists".
    expect(validationConfig.vagueTokens).not.toContain('no');
    expect(validationConfig.vagueTokens).not.toContain('not');
  });

  it('never asks as free text for something the form already captures', () => {
    const mirrored = questionsConfig.questions.filter((q) => q.mirrorsFormField);
    for (const question of mirrored) {
      expect(
        ['select', 'boolean', 'multiselect'],
        `${question.id} mirrors a form field so it must be a selection, not free text`,
      ).toContain(question.kind);
    }
  });
});
