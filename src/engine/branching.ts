/**
 * Condition evaluation for `showIf`.
 *
 * The language is deliberately tiny - all / any / not plus five leaf tests - so
 * that an EHS author can read a branch in the JSON and know exactly when it fires.
 */

import type { Condition, Question, SessionState } from '../types';

export function evaluate(condition: Condition | undefined, session: SessionState): boolean {
  if (!condition) return true;

  if ('all' in condition) return condition.all.every((c) => evaluate(c, session));
  if ('any' in condition) return condition.any.some((c) => evaluate(c, session));
  if ('not' in condition) return !evaluate(condition.not, session);

  const answer = session.answers[condition.field];
  const value = answer?.value;

  if ('answered' in condition) {
    if (!value) return false;
    if (value.kind === 'text') return value.text.trim().length > 0;
    if (value.kind === 'multi') return value.values.length > 0;
    if (value.kind === 'escape') return false;
    return true;
  }

  if ('isTrue' in condition) return value?.kind === 'boolean' && value.value === true;
  if ('isFalse' in condition) return value?.kind === 'boolean' && value.value === false;

  if ('equals' in condition) {
    if (!value) return false;
    if (typeof condition.equals === 'boolean') {
      return value.kind === 'boolean' && value.value === condition.equals;
    }
    if (value.kind === 'choice') return value.value === condition.equals;
    if (value.kind === 'multi') return value.values.includes(condition.equals);
    if (value.kind === 'text') return value.text === condition.equals;
    return false;
  }

  if ('in' in condition) {
    if (!value) return false;
    if (value.kind === 'choice') return condition.in.includes(value.value);
    if (value.kind === 'multi') return value.values.some((v) => condition.in.includes(v));
    if (value.kind === 'text') return condition.in.includes(value.text);
    return false;
  }

  return true;
}

export function isVisible(question: Question, session: SessionState): boolean {
  return evaluate(question.showIf, session);
}
