/**
 * The individual pushback rules. Each is a plain function with no DOM and no
 * state, so it can be reasoned about and unit tested in isolation.
 */

import type { SignalRequirement, ValidationConfig } from '../types';
import {
  contentTokens,
  coverageRatio,
  hasNumeral,
  normalizeText,
  overlapRatio,
  stemAll,
  tokenize,
} from './normalize';

// ---------------------------------------------------------------------------
// Vague tokens
// ---------------------------------------------------------------------------

export interface VagueResult {
  /** The answer is entirely or substantially filler. */
  isVague: boolean;
  /** Which configured tokens or phrases were found. */
  matched: string[];
  /** Fraction of the answer's tokens that were filler, 0 to 1. */
  density: number;
}

export function checkVague(text: string, config: ValidationConfig): VagueResult {
  const normalized = normalizeText(text);
  const tokens = tokenize(text);
  const matched: string[] = [];

  // Phrases first, so "not specified" is not double counted as two tokens.
  let remaining = ` ${normalized} `;
  let phraseTokenCount = 0;
  for (const phrase of config.vaguePhrases) {
    const needle = ` ${normalizeText(phrase)} `;
    while (remaining.includes(needle)) {
      matched.push(phrase);
      phraseTokenCount += tokenize(phrase).length;
      remaining = remaining.replace(needle, ' ');
    }
  }

  const vagueSet = new Set(config.vagueTokens.map((t) => normalizeText(t)));
  const leftoverTokens = tokenize(remaining);
  let tokenMatches = 0;
  for (const t of leftoverTokens) {
    // "n/a" survives tokenization as "n/a"; also accept the bare "n" + "a" split.
    const candidate = t.replace(/[/.]/g, '');
    if (vagueSet.has(t) || vagueSet.has(candidate)) {
      matched.push(t);
      tokenMatches += 1;
    }
  }

  const total = tokens.length;
  const density = total === 0 ? 0 : (phraseTokenCount + tokenMatches) / total;

  return {
    isVague: total > 0 && density >= config.vagueDensityThreshold,
    matched,
    density,
  };
}

// ---------------------------------------------------------------------------
// Responsiveness - does the answer contain the kind of content the question needs
// ---------------------------------------------------------------------------

export interface SignalResult {
  passed: boolean;
  /** The first requirement that failed, for a targeted follow-up. */
  failed?: SignalRequirement;
}

export function checkSignals(
  text: string,
  signals: SignalRequirement[] | undefined,
  config: ValidationConfig,
): SignalResult {
  if (!signals || signals.length === 0) return { passed: true };
  for (const requirement of signals) {
    if (!satisfies(text, requirement, config)) return { passed: false, failed: requirement };
  }
  return { passed: true };
}

function satisfies(text: string, req: SignalRequirement, config: ValidationConfig): boolean {
  switch (req.type) {
    case 'lexicon': {
      const words = config.lexicons[req.set];
      if (!words) throw new Error(`Unknown lexicon "${req.set}"`);
      const exclusions = config.lexiconExclusions?.[req.set] ?? [];
      return countLexiconMatches(text, words, exclusions) >= (req.minMatches ?? 1);
    }
    case 'numeral':
      return hasNumeral(text);
    case 'unit': {
      const units = config.unitSets[req.set];
      if (!units) throw new Error(`Unknown unit set "${req.set}"`);
      const tokens = new Set(tokenize(text));
      return units.some((u) => tokens.has(normalizeText(u)));
    }
    case 'pattern':
      return new RegExp(req.pattern, req.flags ?? '').test(text);
    case 'minWords':
      return tokenize(text).length >= req.count;
    case 'anyOf':
      return req.requirements.some((r) => satisfies(text, r, config));
  }
}

/**
 * Counts lexicon hits. Multi-word entries are matched as phrases; single words
 * are matched against stemmed tokens so "lifted" satisfies "lift".
 *
 * `exclusions` are phrases removed before matching. This exists because the
 * stemmer cannot tell "the load was lowered" from "the lower back": both reduce
 * to "lower". Listing "lower back" as an exclusion is far easier for a content
 * author to reason about than a smarter stemmer would be.
 */
export function countLexiconMatches(
  text: string,
  words: string[],
  exclusions: string[] = [],
): number {
  let scrubbed = ` ${normalizeText(text)} `;
  for (const phrase of exclusions) {
    const needle = ` ${normalizeText(phrase)} `;
    while (scrubbed.includes(needle)) scrubbed = scrubbed.replace(needle, ' ');
  }

  const normalized = scrubbed;
  const stemmedTokens = new Set(stemAll(tokenize(scrubbed)));
  let count = 0;
  for (const word of words) {
    if (word.startsWith('_')) continue; // allow "_comment" keys inside lists
    const normalizedWord = normalizeText(word);
    if (normalizedWord.includes(' ')) {
      if (normalized.includes(` ${normalizedWord} `)) count += 1;
    } else {
      const stems = stemAll([normalizedWord]);
      if (stems[0] && stemmedTokens.has(stems[0])) count += 1;
    }
  }
  return count;
}

// ---------------------------------------------------------------------------
// Circularity - the answer restates the question or a field we already have
// ---------------------------------------------------------------------------

export function checkCircularity(
  answer: string,
  comparisons: string[],
  config: ValidationConfig,
  threshold?: number,
): { isCircular: boolean; ratio: number } {
  const limit = threshold ?? config.circularityThreshold;
  const references = comparisons.filter((c) => c.trim().length > 0);

  // Below a handful of content words the measure is noise: "40 pounds" would
  // read as fully covered by any reference that happens to mention a weight.
  const answerTokens = contentTokens(answer, config.stopWords);
  if (answerTokens.length < 3) return { isCircular: false, ratio: 0 };

  const ratio = coverageRatio(answer, references, config.stopWords);
  return { isCircular: ratio >= limit, ratio };
}

// ---------------------------------------------------------------------------
// Copy-paste repetition across different questions
// ---------------------------------------------------------------------------

export function checkRepetition(
  answer: string,
  otherAnswers: { questionId: string; text: string }[],
  config: ValidationConfig,
): { isRepeat: boolean; matchedQuestionId?: string; ratio: number } {
  let best = { ratio: 0, id: undefined as string | undefined };
  for (const other of otherAnswers) {
    if (!other.text.trim()) continue;
    const ratio = overlapRatio(answer, other.text, config.stopWords);
    if (ratio > best.ratio) best = { ratio, id: other.questionId };
  }
  const isRepeat = best.ratio >= config.repetitionThreshold;
  return isRepeat && best.id
    ? { isRepeat, matchedQuestionId: best.id, ratio: best.ratio }
    : { isRepeat: false, ratio: best.ratio };
}

// ---------------------------------------------------------------------------
// Low-information input that is not caught by the vague list: punctuation only,
// a single repeated character, keyboard mashing.
// ---------------------------------------------------------------------------

export function isLowInformation(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return true;
  const letters = trimmed.replace(/[^a-z0-9]/gi, '');
  // Nothing alphanumeric at all - punctuation, emoji, or non-Latin script only.
  if (letters.length === 0) return true;
  // One or two characters cannot answer any question in this wizard.
  if (letters.length < 3) return true;
  // One character repeated, e.g. "aaaaaa" or "......".
  if (new Set(letters.toLowerCase()).size <= 2 && letters.length > 3) return true;
  // No vowels across a long run of letters is almost always mashing.
  const words = tokenize(trimmed);
  const realWords = words.filter((w) => /[aeiouy]/.test(w));
  if (words.length >= 3 && realWords.length / words.length < 0.34) return true;
  return false;
}
