/**
 * The sanitization pipeline.
 *
 * The source form strips apostrophes and quotation marks, so text that relies on
 * them arrives mangled. Rather than let that happen, the composer emits text that
 * reads correctly without them.
 *
 * ORDER NOTE - a deliberate deviation from the brief. The brief specifies
 * "remove ' and " ... then rewrite contractions and possessives". In that order,
 * "the operator's hand" becomes "the operators hand", which reads as a plural and
 * has already lost its meaning before the rewriter sees it. We therefore rewrite
 * first and strip second, and additionally handle the apostrophe-free forms
 * ("dont", "wasnt") that users type anyway. The strip step still runs
 * unconditionally afterwards, so the guarantee the brief asked for - that no
 * apostrophe or quotation mark ever reaches the output - is unchanged.
 *
 * Control-character and non-ASCII patterns are built from escaped strings rather
 * than regex literals so that no raw control byte ever appears in this source file.
 */

import type { AllowlistConfig } from '../types';
import { allowlistConfig as defaultAllowlist } from '../config';

const CONTROL_CHARS = new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]', 'g');
const NON_ASCII = new RegExp('[^\\u0020-\\u007E\\n]', 'g');
const NON_PRINTABLE = new RegExp('[^\\u0020-\\u007E\\n]');

export interface SanitizeChange {
  /** Which pipeline step made the change, for the "what changed and why" panel. */
  step:
    | 'unicode'
    | 'contraction'
    | 'possessive'
    | 'pronoun'
    | 'quotes'
    | 'control'
    | 'nonAscii'
    | 'whitespace';
  from: string;
  to: string;
  reason: string;
}

export interface SanitizeResult {
  text: string;
  changes: SanitizeChange[];
}

export interface SanitizeOptions {
  /** Role noun used when rewriting personal pronouns, e.g. "operator". */
  role?: string;
  /** Skip pronoun rewriting - used for text that is not about the injured person. */
  rewritePronouns?: boolean;
  allowlist?: AllowlistConfig;
}

export function sanitize(input: string, options: SanitizeOptions = {}): SanitizeResult {
  const allowlist = options.allowlist ?? defaultAllowlist;
  const role = options.role ?? 'employee';
  const changes: SanitizeChange[] = [];
  let text = input;

  text = normalizeUnicode(text, allowlist, changes);
  text = rewriteContractions(text, allowlist, changes);
  text = rewritePossessives(text, changes);
  if (options.rewritePronouns !== false) {
    text = rewritePronouns(text, role, allowlist, changes);
  }
  text = stripQuotes(text, changes);
  text = stripControlCharacters(text, changes);
  text = enforceAscii(text, changes);
  text = collapseWhitespace(text);

  assertClean(text);
  return { text, changes };
}

// --- Step 1: Unicode -------------------------------------------------------

export function normalizeUnicode(
  input: string,
  allowlist: AllowlistConfig = defaultAllowlist,
  changes: SanitizeChange[] = [],
): string {
  // The map runs before NFKC as well as after. NFKC would otherwise decompose
  // "3 1/2" from the single vulgar-fraction character straight into "31/2",
  // which reads as thirty-one halves. Mapping first inserts the needed space.
  let text = applyMap(input, allowlist, changes);
  text = text.normalize('NFKC');
  return applyMap(text, allowlist, changes);
}

function applyMap(
  input: string,
  allowlist: AllowlistConfig,
  changes: SanitizeChange[],
): string {
  let text = input;
  for (const [from, to] of Object.entries(allowlist.unicodeMap)) {
    if (!text.includes(from)) continue;
    text = text.split(from).join(to);
    changes.push({
      step: 'unicode',
      from,
      to,
      reason: 'The description field accepts plain ASCII only.',
    });
  }
  return text;
}

// --- Step 2: contractions --------------------------------------------------

export function rewriteContractions(
  input: string,
  allowlist: AllowlistConfig = defaultAllowlist,
  changes: SanitizeChange[] = [],
): string {
  return input.replace(/[A-Za-z]+(?:['’][A-Za-z]+)?/g, (word) => {
    const key = word.toLowerCase().replace(/’/g, "'");
    const replacement = allowlist.contractionRewrites[key];
    if (!replacement) return word;
    const cased = matchCase(word, replacement);
    changes.push({
      step: 'contraction',
      from: word,
      to: cased,
      reason: 'Contractions lose their apostrophe in the form and become hard to read.',
    });
    return cased;
  });
}

// --- Step 3: possessives ---------------------------------------------------

const POSSESSIVE_REASON =
  'The form strips apostrophes, which would turn a possessive into a plural and change the meaning.';

/** "the operator's hand" becomes "the hand of the operator". */
export function rewritePossessives(input: string, changes: SanitizeChange[] = []): string {
  let text = input;

  // Plural possessive: "the employees' hands" -> "the hands of the employees".
  text = text.replace(
    /(?:\bthe\s+|\ba\s+|\ban\s+)?\b([A-Za-z]+s)['’]\s+([A-Za-z]+)/gi,
    (match, owner: string, owned: string) => {
      const to = `the ${owned} of the ${owner}`;
      changes.push({ step: 'possessive', from: match, to, reason: POSSESSIVE_REASON });
      return to;
    },
  );

  // Singular possessive: "the operator's hand" -> "the hand of the operator".
  text = text.replace(
    /(?:\bthe\s+|\ba\s+|\ban\s+)?\b([A-Za-z]+)['’]s\s+([A-Za-z]+)/gi,
    (match, owner: string, owned: string) => {
      const to = `the ${owned} of the ${owner}`;
      changes.push({ step: 'possessive', from: match, to, reason: POSSESSIVE_REASON });
      return to;
    },
  );

  return text;
}

// --- Step 4: pronouns ------------------------------------------------------

/**
 * Person-neutral voice. Personal pronouns become the role noun; possessive
 * pronouns become "the", because "the operator hand" is not English but
 * "the hand was withdrawn" is.
 */
export function rewritePronouns(
  input: string,
  role: string,
  allowlist: AllowlistConfig = defaultAllowlist,
  changes: SanitizeChange[] = [],
): string {
  const ambiguous = new Set(allowlist.ambiguousPronouns.map((p) => p.toLowerCase()));

  return input.replace(/\b([A-Za-z]+)\b([ \t]*)/g, (match, word: string, trailing: string) => {
    const lower = word.toLowerCase();
    const personal = allowlist.pronounRewrites[lower];
    const possessive = allowlist.possessivePronounRewrites[lower];

    let replacement: string | undefined;
    if (ambiguous.has(lower)) {
      // "her hand" is possessive; "struck her." is not. A following space decides.
      replacement = trailing.length > 0 ? 'the' : `the ${role}`;
    } else if (personal) {
      replacement = personal.replace('{role}', role);
    } else if (possessive) {
      replacement = possessive;
    }

    if (!replacement) return match;
    const cased = matchCase(word, replacement);
    changes.push({
      step: 'pronoun',
      from: word,
      to: cased,
      reason: 'The description must not identify or gender the individual.',
    });
    return cased + trailing;
  });
}

// --- Step 5: quotes --------------------------------------------------------

export function stripQuotes(input: string, changes: SanitizeChange[] = []): string {
  if (!/['"]/.test(input)) return input;
  changes.push({
    step: 'quotes',
    from: 'apostrophes and quotation marks',
    to: 'removed',
    reason: 'The source form strips these characters.',
  });
  return input.replace(/['"]/g, '');
}

// --- Step 6: control characters -------------------------------------------

export function stripControlCharacters(input: string, changes: SanitizeChange[] = []): string {
  // CRLF is folded to LF first so pasted Windows text leaves no stray returns.
  const normalized = input.replace(/\r\n?/g, '\n');
  const stripped = normalized.replace(CONTROL_CHARS, '');
  if (stripped !== input) {
    changes.push({
      step: 'control',
      from: 'control characters',
      to: 'removed',
      reason: 'Invisible characters corrupt downstream reports.',
    });
  }
  return stripped;
}

// --- Step 7: ASCII ---------------------------------------------------------

export function enforceAscii(input: string, changes: SanitizeChange[] = []): string {
  const found = input.match(NON_ASCII);
  if (!found) return input;
  changes.push({
    step: 'nonAscii',
    from: [...new Set(found)].join(' '),
    to: 'removed',
    reason: 'Characters outside plain ASCII do not survive the form and its reports.',
  });
  return input.replace(NON_ASCII, ' ');
}

// --- Step 8: whitespace ----------------------------------------------------

export function collapseWhitespace(input: string): string {
  return input
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/ +([.,;:])/g, '$1')
    .replace(/([.,;:])\1+/g, '$1')
    .trim();
}

// --- Final assertion -------------------------------------------------------

/** Throws rather than emitting text that violates a hard constraint. */
export function assertClean(text: string): void {
  if (/['"]/.test(text)) {
    throw new Error(
      `Sanitizer failed: output still contains a quote character near: ${text.slice(0, 80)}`,
    );
  }
  const offender = text.match(NON_PRINTABLE);
  if (offender && offender[0]) {
    throw new Error(
      `Sanitizer failed: output contains a non-ASCII or control character (code ${offender[0].charCodeAt(0)}).`,
    );
  }
}

// --- helpers ---------------------------------------------------------------

/** Preserve the original capitalization pattern when substituting a word. */
function matchCase(original: string, replacement: string): string {
  const first = original[0];
  if (first && first === first.toUpperCase() && /[a-z]/i.test(first)) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement;
}
