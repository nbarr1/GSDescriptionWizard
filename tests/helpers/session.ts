import type { AnswerValue, SessionState } from '../../src/types';
import { createSession, setAnswer } from '../../src/engine/flow';

/** Shorthand for building a session from a plain object of answers. */
export function sessionWith(answers: Record<string, AnswerValue | string | boolean>): SessionState {
  let session = createSession();
  for (const [id, value] of Object.entries(answers)) {
    session = setAnswer(session, id, toAnswerValue(value));
  }
  return session;
}

export function toAnswerValue(value: AnswerValue | string | boolean): AnswerValue {
  if (typeof value === 'boolean') return { kind: 'boolean', value };
  if (typeof value === 'string') return { kind: 'text', text: value };
  return value;
}

export const choice = (value: string): AnswerValue => ({ kind: 'choice', value });
export const multi = (...values: string[]): AnswerValue => ({ kind: 'multi', values });
export const text = (value: string): AnswerValue => ({ kind: 'text', text: value });
export const escape = (
  hatch: 'unknown' | 'not_applicable',
  justification: string,
): AnswerValue => ({ kind: 'escape', hatch, justification });
