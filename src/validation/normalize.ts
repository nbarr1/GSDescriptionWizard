/**
 * Text normalization shared by every validation rule.
 *
 * Everything here works on whole tokens. That is deliberate: naive substring
 * matching flags "notably" for containing "not", and an EHS author editing the
 * vague-token list should never have to think about that.
 */

/** Lowercase, strip punctuation, collapse whitespace. */
export function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(/[‘’‚‛′´`]/g, "'")
    .replace(/[^a-z0-9'\s./-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Split into word tokens. Keeps embedded digits and hyphens, drops bare punctuation. */
export function tokenize(input: string): string[] {
  return normalizeText(input)
    .split(/[\s]+/)
    .map((t) => t.replace(/^['./-]+|['./-]+$/g, ''))
    .filter((t) => t.length > 0);
}

/**
 * Very small suffix stemmer. Enough to make "lifted", "lifting" and "lifts" all
 * match a lexicon entry of "lift" without pulling in a stemming dependency.
 */
export function stem(token: string): string {
  let t = token;
  if (t.length > 4 && t.endsWith('ing')) {
    t = t.slice(0, -3);
    // "shifting" -> "shift", but "sliding" -> "slid" needs the doubled-letter undo below.
    if (/([bdfgklmnprt])\1$/.test(t)) t = t.slice(0, -1);
  } else if (t.length > 3 && t.endsWith('ed')) {
    t = t.slice(0, -2);
    if (/([bdfgklmnprt])\1$/.test(t)) t = t.slice(0, -1);
  } else if (t.length > 3 && t.endsWith('es')) {
    t = t.slice(0, -2);
  } else if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss')) {
    t = t.slice(0, -1);
  }
  return t;
}

export function stemAll(tokens: string[]): string[] {
  return tokens.map(stem);
}

/** Content words only, for overlap comparisons. */
export function contentTokens(input: string, stopWords: string[]): string[] {
  const stops = new Set(stopWords);
  return tokenize(input).filter((t) => !stops.has(t) && t.length > 1);
}

/**
 * What fraction of the answer's content words already appear in the reference
 * text, 0 to 1. This is the right measure for circularity, because the question
 * being asked is "does this answer add anything new?" - not "are these two
 * strings similar?". An answer that merely restates the injury and the accident
 * type scores near 1 even though it is much shorter than the references.
 */
export function coverageRatio(answer: string, references: string[], stopWords: string[]): number {
  const answerTokens = stemAll(contentTokens(answer, stopWords));
  if (answerTokens.length === 0) return 0;

  const known = new Set<string>();
  for (const reference of references) {
    for (const token of stemAll(contentTokens(reference, stopWords))) known.add(token);
  }
  if (known.size === 0) return 0;

  const covered = answerTokens.filter((t) => known.has(t)).length;
  return covered / answerTokens.length;
}

/**
 * Symmetric overlap of the content words in two strings, 0 to 1.
 * Used for copy-paste repetition, where either direction counts.
 */
export function overlapRatio(a: string, b: string, stopWords: string[]): number {
  const setA = new Set(stemAll(contentTokens(a, stopWords)));
  const setB = new Set(stemAll(contentTokens(b, stopWords)));
  if (setA.size === 0 || setB.size === 0) return 0;
  let shared = 0;
  for (const t of setA) if (setB.has(t)) shared += 1;
  return shared / Math.min(setA.size, setB.size);
}

/** True when the text contains a digit anywhere, including "1/2" and "3.5". */
export function hasNumeral(input: string): boolean {
  if (/\d/.test(input)) return true;
  // Spelled-out small numbers count too - "two person lift" is a real answer.
  const words = new Set(tokenize(input));
  for (const w of SPELLED_NUMBERS) if (words.has(w)) return true;
  return false;
}

const SPELLED_NUMBERS = new Set([
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'fifteen',
  'twenty',
  'thirty',
  'forty',
  'fifty',
  'sixty',
  'hundred',
  'thousand',
  'half',
  'quarter',
  'dozen',
]);
