/**
 * The flow state machine.
 *
 * The wizard is a linear walk over the questions that are currently visible,
 * plus two terminal screens (form cross-check and review). Visibility is
 * recomputed on every step rather than cached, so changing an earlier answer
 * through Back navigation immediately reshapes what comes next without ever
 * discarding what the user already typed.
 */

import type { Answer, AnswerValue, Question, SessionState, Stage } from '../types';
import { questionsConfig, APP_VERSION, outputTemplates } from '../config';
import { isVisible } from './branching';
import { validateAnswer } from '../validation/validate';

/** Screens that are not backed by a question. */
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

/**
 * The ordered list of steps for the session as it currently stands.
 * Questions keep their order of declaration in questions.json, grouped by stage.
 */
export function visibleSteps(session: SessionState): StepId[] {
  const stageOrder = new Map(questionsConfig.stages.map((s) => [s.id, s.order]));
  const ordered = questionsConfig.questions
    .map((q, index) => ({ q, index }))
    .filter(({ q }) => isVisible(q, session))
    .sort((a, b) => {
      const sa = stageOrder.get(a.q.stage) ?? 0;
      const sb = stageOrder.get(b.q.stage) ?? 0;
      return sa - sb || a.index - b.index;
    })
    .map(({ q }) => q.id);

  return [...ordered, CROSSCHECK_STEP, REVIEW_STEP];
}

export function questionForStep(stepId: StepId): Question | undefined {
  if (stepId === CROSSCHECK_STEP || stepId === REVIEW_STEP) return undefined;
  return questionsConfig.questions.find((q) => q.id === stepId);
}

export function stageForStep(stepId: StepId): Stage | undefined {
  if (stepId === CROSSCHECK_STEP) return questionsConfig.stages.find((s) => s.id === 'crosscheck');
  if (stepId === REVIEW_STEP) return questionsConfig.stages.find((s) => s.id === 'review');
  const question = questionForStep(stepId);
  return question ? questionsConfig.stages.find((s) => s.id === question.stage) : undefined;
}

/**
 * Where the user is, expressed as stages rather than raw question counts.
 * A count that jumps around as branches open and close reads as broken.
 */
export interface Progress {
  stageIndex: number;
  stageCount: number;
  stageTitle: string;
  /** 0-100 across the whole flow, for the bar. */
  percent: number;
  /** Position within the current stage, for "question 2 of 6". */
  positionInStage: number;
  questionsInStage: number;
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
    questionsInStage: Math.max(1, inStage.length),
  };
}

export function firstStep(session: SessionState): StepId {
  return visibleSteps(session)[0] ?? REVIEW_STEP;
}

/**
 * Next step, or null at the end. Returns the next step that is currently visible,
 * which may not be the one that was next before the last answer changed.
 */
export function nextStep(current: StepId, session: SessionState): StepId | null {
  const steps = visibleSteps(session);
  const index = steps.indexOf(current);
  if (index === -1) {
    // The current step just became invisible - land on the first step after it
    // in declaration order rather than throwing the user back to the start.
    return steps[0] ?? null;
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

/**
 * Whether the wizard will let the user move forward from this step.
 * Only a `block` finding stops them; challenges and warnings do not.
 */
export function canAdvance(stepId: StepId, session: SessionState): boolean {
  const question = questionForStep(stepId);
  if (!question) return true;
  return validateAnswer(question, session).canAdvance;
}

// ---------------------------------------------------------------------------
// Mutations. All return a new session object so the UI can diff cheaply and
// so nothing mutates state that a validation pass is midway through reading.
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
 * fall answers sitting in the session, where the composer would happily emit
 * them. The user only ever loses answers to questions the flow no longer asks.
 */
function pruneOrphans(session: SessionState): SessionState {
  // Iterate to a fixpoint: dropping a parent answer can hide its children, whose
  // own children then need dropping too. The chains here are short, so a handful
  // of passes always settles.
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
