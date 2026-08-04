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

  it('gives every blocking question either an escape hatch or an unavoidable answer', () => {
    // A question that blocks on empty with no escape hatch must be one where a
    // blank genuinely makes the description useless. Keep that list short and explicit.
    const blockingWithoutHatch = questionsConfig.questions
      .filter((q) => q.validation?.emptyTier === 'block' && q.escapeHatches !== true)
      .filter((q) => q.kind === 'text' || q.kind === 'textarea')
      .map((q) => q.id);

    expect(blockingWithoutHatch.sort()).toEqual(
      [
        'task_performed',
        'sequence_before',
        'sequence_moment',
        'sequence_after',
        'gradual_cycle_description',
        'gradual_symptom_onset',
        'prior_condition_change',
        'discovered_noticed',
        'mech_struck_moving',
        'mech_caught_surfaces',
        'mech_caught_entry',
        'mech_exert_posture',
        'mech_fall_surface',
        'mech_fall_foot_contact',
        'mech_fall_working_surface',
        'mech_fall_protection',
        'mech_fall_initiator',
        'mech_rep_motion',
        'mech_energy_source',
        'mech_isolation_state',
        'mech_agent',
        'mech_ventilation',
        'mech_vehicle_detail',
        'mech_other_description',
        'point_of_contact',
        'resp_first_aid',
        'resp_notification',
      ].sort(),
    );
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
