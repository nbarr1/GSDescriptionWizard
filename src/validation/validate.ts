/**
 * The pushback engine.
 *
 * Given one question and the session so far, decide whether to block, challenge,
 * or warn. Three rules govern the design:
 *
 *  1. Blocking is rare and reserved for answers whose absence makes the whole
 *     description useless.
 *  2. A challenge escalates at most twice, then downgrades to advisory. An
 *     unfalsifiable loop drives people back to typing "Hand contusion".
 *  3. Every blocking question has an escape hatch that costs a sentence of
 *     honesty. A visible gap beats a fabricated answer.
 */

import type {
  Answer,
  AnswerState,
  Finding,
  Question,
  ResponseTier,
  SessionState,
  ValidationConfig,
} from '../types';
import { getQuestion, optionLabel, validationConfig as defaultValidationConfig } from '../config';
import {
  checkCircularity,
  checkRepetition,
  checkSignals,
  checkVague,
  isLowInformation,
} from './rules';

export interface ValidationResult {
  /** Highest tier across all findings. `null` when the answer is clean. */
  tier: ResponseTier | null;
  findings: Finding[];
  /** Whether the wizard may advance past this question. */
  canAdvance: boolean;
  /** How this answer counts toward completeness. */
  state: AnswerState;
}

const CLEAN: Omit<ValidationResult, 'state'> = { tier: null, findings: [], canAdvance: true };

/** The free text of an answer, or an empty string for non-text kinds. */
export function answerText(answer: Answer | undefined): string {
  if (!answer) return '';
  const v = answer.value;
  if (v.kind === 'text') return v.text;
  if (v.kind === 'escape') return v.justification;
  return '';
}

/** True when the user has put something in the field, of any kind. */
export function isAnswered(answer: Answer | undefined): boolean {
  if (!answer) return false;
  const v = answer.value;
  switch (v.kind) {
    case 'text':
      return v.text.trim().length > 0;
    case 'choice':
      return v.value.length > 0;
    case 'multi':
      return v.values.length > 0;
    case 'boolean':
      return true;
    case 'escape':
      return v.justification.trim().length > 0;
  }
}

export function validateAnswer(
  question: Question,
  session: SessionState,
  config: ValidationConfig = defaultValidationConfig,
): ValidationResult {
  const answer = session.answers[question.id];
  const rules = question.validation ?? {};
  const findings: Finding[] = [];

  // --- Escape hatches ------------------------------------------------------
  // An escape hatch is accepted, but only with a justification, and it never
  // scores as a real answer.
  if (answer?.value.kind === 'escape') {
    const justification = answer.value.justification.trim();
    if (justification.length < 8) {
      return {
        tier: 'block',
        canAdvance: false,
        state: 'missing',
        findings: [
          {
            questionId: question.id,
            tier: 'block',
            rule: 'empty',
            message:
              'Give a short reason. A stated gap is genuinely useful to an investigator; a blank one is not.',
            example: 'Not known at time of report. The area supervisor is following this up.',
          },
        ],
      };
    }
    return { tier: 'warn', canAdvance: true, state: 'unresolved', findings: [] };
  }

  // --- Empty ---------------------------------------------------------------
  if (!isAnswered(answer)) {
    const tier = rules.emptyTier ?? 'warn';
    if (tier === 'warn') return { ...CLEAN, tier: 'warn', state: 'missing' };
    return {
      tier,
      canAdvance: tier !== 'block',
      state: 'missing',
      findings: [
        {
          questionId: question.id,
          tier,
          rule: 'empty',
          message: blockingMessage(question),
          example: question.examples?.[0],
        },
      ],
    };
  }

  // Choice-shaped answers have nothing further to check.
  if (
    answer &&
    (answer.value.kind === 'choice' ||
      answer.value.kind === 'multi' ||
      answer.value.kind === 'boolean')
  ) {
    return { ...CLEAN, state: 'satisfied' };
  }

  const text = answerText(answer).trim();
  const thinTier = rules.thinTier ?? 'warn';
  const maxChallenges = rules.maxChallenges ?? config.maxChallenges;
  const challengeCount = answer?.challengeCount ?? 0;

  // A challenge that has already fired its budget, or that the user dismissed with
  // a stated reason, becomes advisory. This is the anti-trap rule: no question can
  // hold a user on a screen indefinitely.
  const spent = challengeCount >= maxChallenges || Boolean(answer?.challengeDismissal);
  const escalated = (tier: ResponseTier): ResponseTier =>
    tier === 'challenge' && spent ? 'warn' : tier;

  // --- Paste guard ---------------------------------------------------------
  const maxLength = rules.maxLength ?? config.defaultMaxLength;
  if (text.length > maxLength) {
    findings.push({
      questionId: question.id,
      tier: 'warn',
      rule: 'tooLong',
      message: `This answer is ${text.length} characters. Only the first ${maxLength} will be used. Trim it to the part that describes this question.`,
    });
  }

  // --- Keyboard mashing and punctuation-only input -------------------------
  if (isLowInformation(text)) {
    const tier = rules.emptyTier === 'block' ? 'block' : escalated('challenge');
    findings.push({
      questionId: question.id,
      tier,
      rule: 'vague',
      message: 'That does not read as an answer. Describe what happened in your own words.',
      example: question.examples?.[0],
    });
    return summarize(findings, 'missing');
  }

  // --- Vague tokens --------------------------------------------------------
  const vague = checkVague(text, config);
  if (vague.isVague) {
    const tier = rules.emptyTier === 'block' ? 'block' : escalated('challenge');
    findings.push({
      questionId: question.id,
      tier,
      rule: 'vague',
      message:
        tier === 'block'
          ? `"${text}" is not something a reviewer can act on. Describe what you do know. If you genuinely do not know, use I do not know and give a short reason.`
          : `"${text}" is not something a reviewer can act on. Anything specific you can add here is worth more than the rest of the form.`,
      example: question.examples?.[0],
    });
    return summarize(findings, 'missing');
  }

  // --- Length floor --------------------------------------------------------
  const minLength = rules.minLength ?? config.defaultMinLength;
  if (text.length < minLength) {
    findings.push({
      questionId: question.id,
      tier: escalated(thinTier),
      rule: 'tooShort',
      message: `That is ${text.length} characters. This question needs at least ${minLength} to be useful - roughly one full sentence.`,
      example: question.examples?.[0],
    });
  }

  // --- Responsiveness ------------------------------------------------------
  const signals = checkSignals(text, rules.signals, config);
  if (!signals.passed && signals.failed) {
    findings.push({
      questionId: question.id,
      tier: escalated(thinTier),
      rule: 'signal',
      message: signals.failed.message,
      example: signals.failed.example ?? question.examples?.[0],
    });
  }

  // --- Circularity ---------------------------------------------------------
  const comparisons: string[] = [question.prompt];
  for (const ref of rules.circularityAgainst ?? []) {
    const other = session.answers[ref];
    if (!other) continue;
    if (other.value.kind === 'text') comparisons.push(other.value.text);
    if (other.value.kind === 'choice') {
      const refQuestion = getQuestion(ref);
      comparisons.push(
        refQuestion ? optionLabel(refQuestion, other.value.value) : other.value.value,
      );
    }
  }
  const circular = checkCircularity(text, comparisons, config, rules.circularityThreshold);
  if (circular.isCircular) {
    findings.push({
      questionId: question.id,
      tier: escalated('challenge'),
      rule: 'circular',
      message:
        'That mostly restates what we already have. Add what is new: the motion, the force, the position, or the reason.',
      example: question.examples?.[0],
    });
  }

  // --- Copy-paste across questions -----------------------------------------
  const others = Object.values(session.answers)
    .filter((a) => a.questionId !== question.id && a.value.kind === 'text')
    .map((a) => ({ questionId: a.questionId, text: answerText(a) }));
  const repeat = checkRepetition(text, others, config);
  if (repeat.isRepeat) {
    findings.push({
      questionId: question.id,
      tier: escalated('challenge'),
      rule: 'repetition',
      message:
        'This is nearly identical to another answer. Each question asks about a different moment - what is different about this one?',
      example: question.examples?.[0],
    });
  }

  return summarize(findings, 'thin');
}

function summarize(findings: Finding[], stateWhenFlagged: AnswerState): ValidationResult {
  if (findings.length === 0) return { ...CLEAN, state: 'satisfied' };
  const tier = highestTier(findings);
  // A `tooLong` advisory alone does not make an answer thin - the text is still there.
  const onlyLengthAdvisory = findings.every((f) => f.rule === 'tooLong');
  const state: AnswerState =
    tier === 'block' ? 'missing' : onlyLengthAdvisory ? 'satisfied' : stateWhenFlagged;
  return { tier, findings, canAdvance: tier !== 'block', state };
}

function highestTier(findings: Finding[]): ResponseTier {
  if (findings.some((f) => f.tier === 'block')) return 'block';
  if (findings.some((f) => f.tier === 'challenge')) return 'challenge';
  return 'warn';
}

function blockingMessage(question: Question): string {
  const base = 'This question needs an answer before you can continue.';
  return question.escapeHatches
    ? `${base} If you genuinely do not know, choose I do not know and give a short reason - that is recorded in the description as a stated gap.`
    : base;
}
