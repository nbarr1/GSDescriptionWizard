/**
 * The flow state machine.
 *
 * The wizard walks *screens*, not questions. A screen holds a tight cluster of
 * related questions - "what was the load, how heavy, how was it held" - because
 * one question per screen produced roughly 35 screens for a single case, and
 * answer quality falls off long before a reporter reaches the end of that.
 *
 * Visibility is recomputed on every step rather than cached, so changing an
 * earlier answer immediately reshapes what comes next without discarding
 * anything the user typed that is still being asked.
 */

import type { Answer, AnswerValue, Question, Screen, SessionState, Stage } from '../types';
import { questionsConfig, APP_VERSION, outputTemplates } from '../config';
import { isVisible } from './branching';
import { validateAnswer } from '../validation/validate';

/** Screens that are not backed by questions. */
export const CROSSCHECK_STEP = '__crosscheck__';
export const REVIEW_STEP = '__review__';

export type StepId = string;

export function createSession(): SessionState {
  return {
    answers: {},
    formChecklist: {},
    outputMode: outputTemplates.defaultMode,
    persist: false,
    startedAt: Date.now(),
    version: APP_VERSION,
  };
}

/** Declaration order in questions.json, grouped by stage then by screen. */
const screenOrder = (() => {
  const stageOrder = new Map(questionsConfig.stages.map((s) => [s.id, s.order]));
  const seen = new Map<string, { stage: number; index: number }>();
  questionsConfig.questions.forEach((question, index) => {
    if (seen.has(question.screen)) return;
    seen.set(question.screen, { stage: stageOrder.get(question.stage) ?? 0, index });
  });
  return [...seen.entries()]
    .sort((a, b) => a[1].stage - b[1].stage || a[1].index - b[1].index)
    .map(([id]) => id);
})();

/** Every question on a screen, in declaration order, regardless of visibility. */
const questionsByScreen = new Map<string, Question[]>();
for (const question of questionsConfig.questions) {
  const list = questionsByScreen.get(question.screen) ?? [];
  list.push(question);
  questionsByScreen.set(question.screen, list);
}

const screenById = new Map(questionsConfig.screens.map((s) => [s.id, s]));

/** The questions on a screen that currently apply. */
export function questionsForStep(stepId: StepId, session: SessionState): Question[] {
  return (questionsByScreen.get(stepId) ?? []).filter((q) => isVisible(q, session));
}

/** The screen a question lives on, for jumping back from the review panel. */
export function screenForQuestion(questionId: string): StepId | undefined {
  return questionsConfig.questions.find((q) => q.id === questionId)?.screen;
}

/**
 * The ordered steps for the session as it stands. A screen whose questions are
 * all hidden drops out entirely rather than showing an empty page.
 */
export function visibleSteps(session: SessionState): StepId[] {
  const withContent = screenOrder.filter((id) => questionsForStep(id, session).length > 0);
  return [...withContent, CROSSCHECK_STEP, REVIEW_STEP];
}

export function screenForStep(stepId: StepId): Screen | undefined {
  return screenById.get(stepId);
}

export function stageForStep(stepId: StepId): Stage | undefined {
  if (stepId === CROSSCHECK_STEP) return questionsConfig.stages.find((s) => s.id === 'crosscheck');
  if (stepId === REVIEW_STEP) return questionsConfig.stages.find((s) => s.id === 'review');
  const first = questionsByScreen.get(stepId)?.[0];
  return first ? questionsConfig.stages.find((s) => s.id === first.stage) : undefined;
}

/**
 * Where the user is, expressed as stages rather than raw screen counts.
 * A count that jumps around as branches open and close reads as broken.
 */
export interface Progress {
  stageIndex: number;
  stageCount: number;
  stageTitle: string;
  /** 0-100 across the whole flow, for the bar. */
  percent: number;
  /** Position within the current stage, for "screen 2 of 3". */
  positionInStage: number;
  screensInStage: number;
  /** Total steps remaining, so the end is always in sight. */
  stepsRemaining: number;
}

export function progressFor(stepId: StepId, session: SessionState): Progress {
  const stages = [...questionsConfig.stages].sort((a, b) => a.order - b.order);
  const steps = visibleSteps(session);
  const stage = stageForStep(stepId);
  const stageIndex = stages.findIndex((s) => s.id === stage?.id);

  const inStage = steps.filter((id) => stageForStep(id)?.id === stage?.id);
  const positionInStage = inStage.indexOf(stepId) + 1;
  const overallIndex = steps.indexOf(stepId);

  return {
    stageIndex: Math.max(0, stageIndex),
    stageCount: stages.length,
    stageTitle: stage?.title ?? '',
    percent: steps.length <= 1 ? 0 : Math.round((overallIndex / (steps.length - 1)) * 100),
    positionInStage: Math.max(1, positionInStage),
    screensInStage: Math.max(1, inStage.length),
    stepsRemaining: Math.max(0, steps.length - 1 - overallIndex),
  };
}

export function firstStep(session: SessionState): StepId {
  return visibleSteps(session)[0] ?? REVIEW_STEP;
}

export function nextStep(current: StepId, session: SessionState): StepId | null {
  const steps = visibleSteps(session);
  const index = steps.indexOf(current);
  if (index === -1) {
    // The current screen just became invisible. Land on the first screen that
    // comes after it in declaration order rather than throwing the user back.
    const position = screenOrder.indexOf(current);
    const following = screenOrder.slice(position + 1).find((id) => steps.includes(id));
    return following ?? steps[0] ?? null;
  }
  return steps[index + 1] ?? null;
}

export function previousStep(current: StepId, session: SessionState): StepId | null {
  const steps = visibleSteps(session);
  const index = steps.indexOf(current);
  if (index <= 0) return null;
  return steps[index - 1] ?? null;
}

/** Back navigation is always allowed and never discards an answer. */
export function canGoBack(current: StepId, session: SessionState): boolean {
  return previousStep(current, session) !== null;
}

/** A screen advances only when none of its questions is blocking. */
export function canAdvance(stepId: StepId, session: SessionState): boolean {
  return questionsForStep(stepId, session).every((q) => validateAnswer(q, session).canAdvance);
}

/** The first question on the screen that is blocking, for focus management. */
export function firstBlockingQuestion(stepId: StepId, session: SessionState): Question | undefined {
  return questionsForStep(stepId, session).find((q) => !validateAnswer(q, session).canAdvance);
}

// ---------------------------------------------------------------------------
// Mutations. All return a new session object so the UI can diff cheaply and so
// nothing mutates state that a validation pass is midway through reading.
// ---------------------------------------------------------------------------

export function setAnswer(
  session: SessionState,
  questionId: string,
  value: AnswerValue,
): SessionState {
  const existing = session.answers[questionId];
  const answer: Answer = {
    questionId,
    value,
    challengeCount: existing?.challengeCount ?? 0,
  };
  if (existing?.challengeDismissal) answer.challengeDismissal = existing.challengeDismissal;

  const answers = { ...session.answers, [questionId]: answer };
  return pruneOrphans({ ...session, answers });
}

/** Records that a challenge fired, so it can escalate at most twice. */
export function recordChallenge(session: SessionState, questionId: string): SessionState {
  const existing = session.answers[questionId];
  if (!existing) return session;
  return {
    ...session,
    answers: {
      ...session.answers,
      [questionId]: { ...existing, challengeCount: existing.challengeCount + 1 },
    },
  };
}

/** The user chose to move on and said why. Challenges downgrade to advisory. */
export function dismissChallenge(
  session: SessionState,
  questionId: string,
  reason: string,
): SessionState {
  const existing = session.answers[questionId];
  if (!existing) return session;
  return {
    ...session,
    answers: { ...session.answers, [questionId]: { ...existing, challengeDismissal: reason } },
  };
}

export function setChecklistItem(
  session: SessionState,
  itemId: string,
  checked: boolean,
): SessionState {
  return { ...session, formChecklist: { ...session.formChecklist, [itemId]: checked } };
}

/**
 * Drops answers to questions that are no longer visible.
 *
 * Without this, changing the accident type from a fall to a lift would leave the
 * fall answers in the session, where the composer would happily emit them. The
 * user only ever loses answers to questions the flow no longer asks.
 */
function pruneOrphans(session: SessionState): SessionState {
  // Iterate to a fixpoint: dropping a parent answer can hide its children, whose
  // own children then need dropping too. The chains are short, so this settles
  // in a couple of passes.
  let current = session;
  for (let pass = 0; pass < 8; pass += 1) {
    const answers: Record<string, Answer> = {};
    for (const [id, answer] of Object.entries(current.answers)) {
      const question = questionsConfig.questions.find((q) => q.id === id);
      if (!question || isVisible(question, current)) answers[id] = answer;
    }
    if (Object.keys(answers).length === Object.keys(current.answers).length) return current;
    current = { ...current, answers };
  }
  return current;
}
