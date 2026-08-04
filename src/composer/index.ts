/**
 * The output composer.
 *
 * Strictly deterministic. Every sentence comes from a fragment template in
 * output-templates.json filled with one answer. Nothing is generated, inferred,
 * or reworded beyond the mechanical case and connective handling below - so the
 * same session always produces byte-identical output, which is what makes the
 * golden-file tests meaningful.
 */

import type {
  Answer,
  Fragment,
  GapCategory,
  OutputMode,
  OutputTemplatesConfig,
  Question,
  SessionState,
} from '../types';
import { GAP_CATEGORIES } from '../types';
import {
  APP_VERSION,
  optionsFor,
  outputTemplates as defaultTemplates,
  questionsConfig,
} from '../config';
import { isVisible } from '../engine/branching';
import { scoreSession } from '../validation/scoring';
import { sanitize, type SanitizeChange } from './sanitize';
import { scanForPii, type PiiReport } from './pii-guard';

export * from './sanitize';
export * from './pii-guard';

export interface ComposedOutput {
  text: string;
  mode: OutputMode;
  characterCount: number;
  /** How the length reads against the configured budget. */
  lengthStatus: 'short' | 'ok' | 'long' | 'overLimit';
  lengthMessage: string;
  changes: SanitizeChange[];
  pii: PiiReport;
  /** Deficiency categories with nothing behind them, stated explicitly in the text. */
  unaddressedCategories: GapCategory[];
  /** Form checklist items the user did not confirm. Never part of `text`. */
  outstandingFormActions: string[];
}

export function compose(
  session: SessionState,
  templates: OutputTemplatesConfig = defaultTemplates,
): ComposedOutput {
  const role = roleNoun(session);
  const mode = session.outputMode;
  const visible = questionsConfig.questions.filter((q) => isVisible(q, session));

  const sections = templates.sections
    .map((section) => ({
      heading: section.heading,
      id: section.id,
      sentences: section.questions
        .map((id) => {
          const question = visible.find((q) => q.id === id);
          if (!question) return null;
          return sentenceFor(question, session, templates, role);
        })
        .filter((s): s is string => Boolean(s && s.trim())),
    }))
    .filter((section) => section.sentences.length > 0);

  // Any of the six categories with no content at all is stated rather than omitted.
  const report = scoreSession(session);
  const unaddressedCategories = GAP_CATEGORIES.filter((category) => {
    const relevant = visible.filter((q) => q.gapCategories?.includes(category));
    if (relevant.length === 0) return false;
    return relevant.every((q) => (report.states[q.id] ?? 'missing') === 'missing');
  });

  const gapSentences = unaddressedCategories.map((c) => templates.categoryGapStatements[c]);

  const body =
    mode === 'labeled'
      ? renderLabeled(sections, gapSentences)
      : renderNarrative(sections, gapSentences, session, templates, role);

  const withTag = templates.versionTag.enabled
    ? body + templates.versionTag.template.replace('{version}', APP_VERSION)
    : body;

  // Sanitize the whole assembled block. Pronoun rewriting already happened per
  // fragment, but running it again here is cheap and catches connective text.
  const { text, changes } = sanitize(withTag, { role });

  return {
    text,
    mode,
    characterCount: text.length,
    ...lengthVerdict(text.length, templates),
    changes,
    pii: scanForPii(text),
    unaddressedCategories,
    outstandingFormActions: outstandingFormActions(session),
  };
}

// ---------------------------------------------------------------------------
// Sentence assembly
// ---------------------------------------------------------------------------

function sentenceFor(
  question: Question,
  session: SessionState,
  templates: OutputTemplatesConfig,
  role: string,
): string | null {
  const answer = session.answers[question.id];
  if (!answer) return null;

  const fragment = templates.fragments[question.id];
  if (!fragment) return null;

  // An escape hatch becomes an explicit, visible statement of the gap. This is
  // the point of the escape hatch: an honest gap beats a fabricated answer.
  if (answer.value.kind === 'escape') {
    const justification = stripTrailingPeriod(answer.value.justification.trim());
    if (!justification) return null;
    return templates.gapStatement
      .replace('{topic}', fragment.topic)
      .replace('{justification}', lowerFirst(justification));
  }

  const raw = renderedAnswer(question, answer, fragment, role);
  if (!raw || !raw.trim()) return null;

  // Select questions with a per-value sentence bypass the {answer} substitution.
  if (fragment.valueTemplates && answer.value.kind === 'choice') {
    const sentence = fragment.valueTemplates[answer.value.value];
    return sentence ? sentence.replace(/\{role\}/g, role) : null;
  }

  const cleaned = stripTrailingPeriod(raw.trim());

  // A frame that supplies its own subject and verb needs an answer that continues
  // the sentence. When the answer starts a sentence of its own, use the fallback
  // rather than emitting "The operator was the operator was clearing a jam".
  const useFallback =
    fragment.requiresGerund && fragment.fallbackTemplate && !startsWithGerund(cleaned);
  const template = useFallback ? (fragment.fallbackTemplate as string) : fragment.template;
  const effectiveCase = useFallback ? 'sentence' : fragment.case;

  const cased =
    effectiveCase === 'lower'
      ? lowerFirst(cleaned)
      : effectiveCase === 'sentence'
        ? upperFirst(cleaned)
        : cleaned;

  return template.replace('{answer}', cased).replace(/\{role\}/g, role);
}

/** True when the first word is an -ing form, which is what the examples teach. */
function startsWithGerund(text: string): boolean {
  const first = text.trim().split(/\s+/)[0] ?? '';
  return /^[a-z]+ing$/i.test(first);
}

function renderedAnswer(
  question: Question,
  answer: Answer,
  fragment: Fragment,
  role: string,
): string | null {
  switch (answer.value.kind) {
    case 'text': {
      // Per-answer sanitization keeps user text person-neutral before it is framed.
      const trimmed = answer.value.text.trim();
      if (!trimmed) return null;
      return sanitize(trimmed, { role }).text;
    }
    case 'choice':
      return fragment.valueTemplates
        ? answer.value.value
        : outputTextFor(question, answer.value.value);
    case 'multi': {
      if (answer.value.values.length === 0) return null;
      return joinList(answer.value.values.map((v) => outputTextFor(question, v)));
    }
    case 'boolean':
      return answer.value.value ? 'yes' : 'no';
    case 'escape':
      return answer.value.justification;
  }
}

// ---------------------------------------------------------------------------
// Rendering modes
// ---------------------------------------------------------------------------

interface RenderedSection {
  id: string;
  heading: string;
  sentences: string[];
}

function renderLabeled(sections: RenderedSection[], gapSentences: string[]): string {
  const blocks = sections.map((s) => `${s.heading}: ${s.sentences.join(' ')}`);
  if (gapSentences.length > 0) blocks.push(`GAPS: ${gapSentences.join(' ')}`);
  return blocks.join('\n\n');
}

function renderNarrative(
  sections: RenderedSection[],
  gapSentences: string[],
  session: SessionState,
  templates: OutputTemplatesConfig,
  role: string,
): string {
  const accidentType = choiceValue(session, 'accident_type');
  const mechanismLead = accidentType
    ? templates.narrative.mechanismLead[accidentType]?.replace(/\{role\}/g, role)
    : undefined;

  const paragraphs = sections.map((section) => {
    const lead = templates.narrative.lead[section.id] ?? templates.narrative.fallbackLead;
    const sentences = [...section.sentences];
    if (section.id === 'mechanism' && mechanismLead) sentences.unshift(mechanismLead);
    return [lead, ...sentences].filter(Boolean).join(' ').trim();
  });

  if (gapSentences.length > 0) paragraphs.push(gapSentences.join(' '));
  return paragraphs.filter(Boolean).join(' ');
}

// ---------------------------------------------------------------------------
// Supporting output
// ---------------------------------------------------------------------------

/** The unticked form cross-check items, for the secondary copy action. */
export function outstandingFormActions(session: SessionState): string[] {
  return questionsConfig.formChecklist
    .filter((item) => !session.formChecklist[item.id])
    .map((item) => `${item.formSection}: ${item.label}`);
}

function lengthVerdict(
  length: number,
  templates: OutputTemplatesConfig,
): Pick<ComposedOutput, 'lengthStatus' | 'lengthMessage'> {
  const budget = templates.characterBudget;

  if (budget.hardLimit !== null && length > budget.hardLimit) {
    return {
      lengthStatus: 'overLimit',
      lengthMessage: `${length} characters exceeds the field limit of ${budget.hardLimit}. Shorten it before copying or it will be truncated.`,
    };
  }
  if (length < budget.warnBelow) {
    return {
      lengthStatus: 'short',
      lengthMessage: `${length} characters. Descriptions under ${budget.warnBelow} are usually missing something a reviewer needs. The target range is ${budget.targetMin} to ${budget.targetMax}.`,
    };
  }
  if (length > budget.warnAbove) {
    return {
      lengthStatus: 'long',
      lengthMessage: `${length} characters. Above ${budget.warnAbove} the description is likely to be truncated or skimmed. Consider trimming to the target range of ${budget.targetMin} to ${budget.targetMax}.`,
    };
  }
  return {
    lengthStatus: 'ok',
    lengthMessage: `${length} characters, within the target range of ${budget.targetMin} to ${budget.targetMax}.`,
  };
}

// ---------------------------------------------------------------------------
// Small deterministic text helpers
// ---------------------------------------------------------------------------

export function roleNoun(session: SessionState): string {
  const value = choiceValue(session, 'employee_role');
  if (!value) return 'employee';
  const question = questionsConfig.questions.find((q) => q.id === 'employee_role');
  if (!question) return value;
  const known = optionsFor(question).find((o) => o.value === value);
  // Option values are already the noun form ("maintenance technician").
  return known ? known.value : 'employee';
}

function choiceValue(session: SessionState, questionId: string): string | undefined {
  const answer = session.answers[questionId];
  return answer?.value.kind === 'choice' ? answer.value.value : undefined;
}

/**
 * How an option reads in the description. UI labels are kept short so they scan
 * on a tablet; `outputText` carries the clause the sentence actually needs.
 */
function outputTextFor(question: Question, value: string): string {
  const option = optionsFor(question).find((o) => o.value === value);
  if (!option) return value;
  return option.outputText ?? lowerPreservingAcronyms(option.label);
}

/**
 * Lowercases a label for mid-sentence use without destroying acronyms - "EHS"
 * must not become "ehs" just because the sentence around it is lower case.
 */
function lowerPreservingAcronyms(label: string): string {
  return label
    .split(/(\s+)/)
    .map((word) => (/^[A-Z0-9]{2,}$/.test(word) ? word : word.toLowerCase()))
    .join('');
}

function joinList(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function upperFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Lowercases the first letter unless the word is an acronym or an identifier,
 * so "SW-114 rev C" survives being dropped into mid-sentence position.
 */
function lowerFirst(text: string): string {
  const firstWord = text.split(/\s/)[0] ?? '';
  const looksLikeIdentifier = /[A-Z]{2,}|\d/.test(firstWord);
  if (looksLikeIdentifier) return text;
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function stripTrailingPeriod(text: string): string {
  return text.replace(/\s*[.;,]+\s*$/, '');
}
