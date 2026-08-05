import questionsRaw from './questions.json';
import validationRaw from './validation.json';
import vocabularyRaw from './vocabulary.json';
import outputTemplatesRaw from './output-templates.json';
import allowlistRaw from './allowlist.json';
import scoringRaw from './scoring.json';

import type {
  AllowlistConfig,
  OutputTemplatesConfig,
  Question,
  QuestionsConfig,
  ScoringConfig,
  SignalRequirement,
  ValidationConfig,
  VocabularyConfig,
} from '../types';

export const questionsConfig = questionsRaw as unknown as QuestionsConfig;
export const validationConfig = validationRaw as unknown as ValidationConfig;
export const vocabularyConfig = vocabularyRaw as unknown as VocabularyConfig;
export const outputTemplates = outputTemplatesRaw as unknown as OutputTemplatesConfig;
export const allowlistConfig = allowlistRaw as unknown as AllowlistConfig;
export const scoringConfig = scoringRaw as unknown as ScoringConfig;

/** Bumped by hand on release. Rendered in the footer and available to the version tag. */
export const APP_VERSION = '1.2.1';

const questionById = new Map<string, Question>(questionsConfig.questions.map((q) => [q.id, q]));

export function getQuestion(id: string): Question | undefined {
  return questionById.get(id);
}

export function requireQuestion(id: string): Question {
  const q = questionById.get(id);
  if (!q) throw new Error(`Unknown question id: ${id}`);
  return q;
}

/** Resolve a question's options, whether inline or pulled from the shared vocabulary. */
export function optionsFor(question: Question) {
  if (question.options) return question.options;
  if (question.optionsRef) {
    const list = vocabularyConfig.lists[question.optionsRef];
    if (!list) throw new Error(`Unknown optionsRef "${question.optionsRef}" on ${question.id}`);
    return list;
  }
  return [];
}

export function optionLabel(question: Question, value: string): string {
  const found = optionsFor(question).find((o) => o.value === value);
  return found ? found.label : value;
}

/**
 * Structural checks that a content author would otherwise only discover at runtime.
 * Run as a unit test so a bad edit to the JSON fails CI rather than the shop floor.
 */
export function validateConfig(): string[] {
  const problems: string[] = [];
  const stageIds = new Set(questionsConfig.stages.map((s) => s.id));
  const screenIds = new Set(questionsConfig.screens.map((s) => s.id));
  const ids = new Set<string>();

  for (const q of questionsConfig.questions) {
    if (ids.has(q.id)) problems.push(`Duplicate question id: ${q.id}`);
    ids.add(q.id);

    if (!stageIds.has(q.stage)) problems.push(`${q.id}: unknown stage "${q.stage}"`);
    if (!screenIds.has(q.screen)) problems.push(`${q.id}: unknown screen "${q.screen}"`);

    if (q.optionsRef && !vocabularyConfig.lists[q.optionsRef]) {
      problems.push(`${q.id}: unknown optionsRef "${q.optionsRef}"`);
    }
    if (
      (q.kind === 'select' || q.kind === 'multiselect' || q.kind === 'posture') &&
      optionsFor(q).length === 0
    ) {
      problems.push(`${q.id}: a ${q.kind} question needs options`);
    }
    if ((q.kind === 'text' || q.kind === 'textarea') && !q.examples?.length) {
      problems.push(`${q.id}: free-text questions must carry at least one worked example`);
    }

    for (const set of q.validation?.signals?.flatMap(collectLexiconNames) ?? []) {
      if (!validationConfig.lexicons[set]) problems.push(`${q.id}: unknown lexicon "${set}"`);
    }
    for (const set of q.validation?.signals?.flatMap(collectUnitNames) ?? []) {
      if (!validationConfig.unitSets[set]) problems.push(`${q.id}: unknown unit set "${set}"`);
    }
    for (const ref of q.validation?.circularityAgainst ?? []) {
      if (!questionById.has(ref)) problems.push(`${q.id}: circularityAgainst unknown id "${ref}"`);
    }
  }

  for (const q of questionsConfig.questions) {
    for (const field of conditionFields(q.showIf)) {
      if (!questionById.has(field))
        problems.push(`${q.id}: showIf references unknown id "${field}"`);
    }
  }

  // Every question that can reach the output needs a fragment, and vice versa.
  const sectioned = new Set(outputTemplates.sections.flatMap((s) => s.questions));
  for (const id of sectioned) {
    if (!questionById.has(id)) problems.push(`output section references unknown question "${id}"`);
    if (!outputTemplates.fragments[id]) problems.push(`no output fragment defined for "${id}"`);
  }
  for (const id of Object.keys(outputTemplates.fragments)) {
    if (!sectioned.has(id)) problems.push(`fragment "${id}" is not placed in any output section`);
  }

  // Every screen must hold at least one question, or it would render blank.
  const usedScreens = new Set(questionsConfig.questions.map((q) => q.screen));
  for (const screen of questionsConfig.screens) {
    if (!usedScreens.has(screen.id)) problems.push(`screen "${screen.id}" has no questions`);
  }

  const checklistIds = new Set<string>();
  for (const item of questionsConfig.formChecklist) {
    if (checklistIds.has(item.id)) problems.push(`Duplicate checklist id: ${item.id}`);
    checklistIds.add(item.id);
  }

  return problems;
}

function collectLexiconNames(sig: SignalRequirement): string[] {
  if (sig.type === 'lexicon') return [sig.set];
  if (sig.type === 'anyOf') return sig.requirements.flatMap(collectLexiconNames);
  return [];
}

function collectUnitNames(sig: SignalRequirement): string[] {
  if (sig.type === 'unit') return [sig.set];
  if (sig.type === 'anyOf') return sig.requirements.flatMap(collectUnitNames);
  return [];
}

function conditionFields(cond: Question['showIf']): string[] {
  if (!cond) return [];
  if ('all' in cond) return cond.all.flatMap(conditionFields);
  if ('any' in cond) return cond.any.flatMap(conditionFields);
  if ('not' in cond) return conditionFields(cond.not);
  return [cond.field];
}
