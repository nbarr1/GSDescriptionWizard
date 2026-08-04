/**
 * Completeness scoring against the six deficiency categories from the analysis
 * of 656 records. The number is never a gate - a user can always copy an
 * incomplete description - but they see exactly what is thin before they do.
 */

import type { AnswerState, GapCategory, Question, ScoringConfig, SessionState } from '../types';
import { GAP_CATEGORIES } from '../types';
import { questionsConfig, scoringConfig as defaultScoring } from '../config';
import { isVisible } from '../engine/branching';
import { validateAnswer } from './validate';

export interface CategoryScore {
  category: GapCategory;
  /** 0-100 within this category alone. */
  score: number;
  status: 'satisfied' | 'thin' | 'missing';
  /** Questions that would most improve this category, worst first. */
  weakest: { questionId: string; state: AnswerState }[];
}

export interface CompletenessReport {
  /** 0-100 across all categories, weighted. */
  score: number;
  label: string;
  tone: 'low' | 'mid' | 'high';
  categories: CategoryScore[];
  /** Every visible question and how it currently counts. */
  states: Record<string, AnswerState>;
}

export function scoreSession(
  session: SessionState,
  scoring: ScoringConfig = defaultScoring,
): CompletenessReport {
  const visible = questionsConfig.questions.filter((q) => isVisible(q, session));
  const states: Record<string, AnswerState> = {};

  for (const q of visible) {
    states[q.id] = validateAnswer(q, session).state;
  }

  const categories: CategoryScore[] = GAP_CATEGORIES.map((category) => {
    const relevant = visible.filter((q) => q.gapCategories?.includes(category));
    if (relevant.length === 0) {
      return { category, score: 100, status: 'satisfied' as const, weakest: [] };
    }

    let earned = 0;
    let possible = 0;
    for (const q of relevant) {
      const weight = q.weight ?? 1;
      possible += weight;
      earned += weight * creditFor(states[q.id] ?? 'missing', scoring);
    }

    const score = possible === 0 ? 100 : Math.round((earned / possible) * 100);
    const weakest = relevant
      .map((q) => ({ questionId: q.id, state: states[q.id] ?? ('missing' as AnswerState) }))
      .filter((entry) => entry.state !== 'satisfied')
      .sort(
        (a, b) => rank(a.state) - rank(b.state) || weightOf(b.questionId) - weightOf(a.questionId),
      );

    return { category, score, status: statusFor(score), weakest };
  });

  let weightedEarned = 0;
  let weightTotal = 0;
  for (const c of categories) {
    const w = scoring.categoryWeights[c.category] ?? 1;
    weightedEarned += c.score * w;
    weightTotal += w;
  }
  const score = weightTotal === 0 ? 0 : Math.round(weightedEarned / weightTotal);
  const band = bandFor(score, scoring);

  return { score, label: band.label, tone: band.tone, categories, states };
}

function creditFor(state: AnswerState, scoring: ScoringConfig): number {
  return scoring.stateCredit[state] ?? 0;
}

function statusFor(score: number): 'satisfied' | 'thin' | 'missing' {
  if (score >= 75) return 'satisfied';
  if (score >= 30) return 'thin';
  return 'missing';
}

function bandFor(score: number, scoring: ScoringConfig) {
  const sorted = [...scoring.bands].sort((a, b) => a.min - b.min);
  let current = sorted[0] ?? { min: 0, label: 'Insufficient', tone: 'low' as const };
  for (const band of sorted) if (score >= band.min) current = band;
  return current;
}

function rank(state: AnswerState): number {
  return { missing: 0, unresolved: 1, thin: 2, satisfied: 3 }[state];
}

const weights = new Map<string, number>(
  questionsConfig.questions.map((q: Question) => [q.id, q.weight ?? 1]),
);
function weightOf(id: string): number {
  return weights.get(id) ?? 1;
}
