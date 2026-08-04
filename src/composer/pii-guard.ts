/**
 * PII guard.
 *
 * The source form says plainly: do not enter the employee name or other personal
 * details, because this description is surfaced in emails and generic reports.
 *
 * Two confidence levels, on purpose:
 *
 *  - Structured identifiers (email, phone, SSN, badge number, date of birth) are
 *    unambiguous. These BLOCK.
 *  - Capitalized tokens that look like names are a heuristic, and false positives
 *    are certain in a plant full of proper nouns. These ADVISE, with emphasis.
 *
 * Nothing is ever deleted silently. The guard reports what it found and where;
 * the user decides.
 */

import type { AllowlistConfig } from '../types';
import { allowlistConfig as defaultAllowlist } from '../config';

export type PiiSeverity = 'blocking' | 'advisory';

export interface PiiFinding {
  severity: PiiSeverity;
  /** Stable id for tests and for the UI to group by. */
  kind: string;
  /** The exact text that triggered the finding. */
  match: string;
  /** Character offset in the scanned text. */
  index: number;
  message: string;
}

export interface PiiReport {
  findings: PiiFinding[];
  /** True when at least one structured identifier was found. */
  hasBlocking: boolean;
}

export function scanForPii(text: string, allowlist: AllowlistConfig = defaultAllowlist): PiiReport {
  const findings: PiiFinding[] = [
    ...scanIdentifiers(text, allowlist),
    ...scanProbableNames(text, allowlist),
    ...scanResidualPronouns(text, allowlist),
  ].sort((a, b) => a.index - b.index);

  return { findings, hasBlocking: findings.some((f) => f.severity === 'blocking') };
}

// --- Structured identifiers: blocking --------------------------------------

function scanIdentifiers(text: string, allowlist: AllowlistConfig): PiiFinding[] {
  const findings: PiiFinding[] = [];
  for (const spec of allowlist.identifierPatterns) {
    const flags = spec.flags?.includes('g') ? spec.flags : `${spec.flags ?? ''}g`;
    const regex = new RegExp(spec.pattern, flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      findings.push({
        severity: 'blocking',
        kind: spec.id,
        match: match[0],
        index: match.index,
        message: `This looks like ${spec.label}. Personal identifiers must not appear in the description - they belong in the structured fields on the form.`,
      });
      if (match[0].length === 0) regex.lastIndex += 1;
    }
  }
  return findings;
}

// --- Probable names: advisory ----------------------------------------------

function scanProbableNames(text: string, allowlist: AllowlistConfig): PiiFinding[] {
  const allowed = new Set(allowlist.allowedCapitalized.map((w) => w.toLowerCase()));
  const names = new Set(allowlist.nameLexicon.map((w) => w.toLowerCase()));
  const findings: PiiFinding[] = [];

  // Sentence-initial words are capitalized for grammar, not because they are names.
  const sentenceStarts = new Set<number>();
  const starterPattern = /(?:^|[.!?:\n]\s*)([A-Z][a-z]+)/g;
  let starter: RegExpExecArray | null;
  while ((starter = starterPattern.exec(text)) !== null) {
    sentenceStarts.add(starter.index + starter[0].length - (starter[1]?.length ?? 0));
  }

  const wordPattern = /\b([A-Z][a-z]{1,})\b/g;
  let match: RegExpExecArray | null;
  while ((match = wordPattern.exec(text)) !== null) {
    const word = match[1];
    if (!word) continue;
    const lower = word.toLowerCase();
    if (allowed.has(lower)) continue;

    const isKnownName = names.has(lower);
    // A capitalized word mid-sentence is suspicious; one in the name list is more so.
    if (!isKnownName && sentenceStarts.has(match.index)) continue;

    // A word immediately followed by another capitalized word reads as a full name.
    const after = text.slice(match.index + word.length, match.index + word.length + 30);
    const looksLikeFullName = /^\s+[A-Z][a-z]+/.test(after);

    if (!isKnownName && !looksLikeFullName) continue;

    findings.push({
      severity: 'advisory',
      kind: isKnownName ? 'probable_name' : 'capitalized_pair',
      match: word,
      index: match.index,
      message: isKnownName
        ? `"${word}" is a common personal name. If this refers to a person, replace it with their role, for example the operator or the team lead.`
        : `"${word}" starts what looks like a full name. If this refers to a person, replace it with their role.`,
    });
  }

  return findings;
}

// --- Residual pronouns: advisory -------------------------------------------

/**
 * The sanitizer rewrites pronouns, but a user editing the composed text in the
 * review panel can put them back. This catches that.
 */
function scanResidualPronouns(text: string, allowlist: AllowlistConfig): PiiFinding[] {
  const gendered = new Set(
    [
      ...Object.keys(allowlist.pronounRewrites),
      ...Object.keys(allowlist.possessivePronounRewrites),
      ...allowlist.ambiguousPronouns,
    ]
      .map((p) => p.toLowerCase())
      // "we", "us" and "the team" are not identifying.
      .filter((p) => !['we', 'us', 'our', 'ours'].includes(p)),
  );

  const findings: PiiFinding[] = [];
  const pattern = /\b([A-Za-z]+)\b/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const word = match[1];
    if (!word || !gendered.has(word.toLowerCase())) continue;
    findings.push({
      severity: 'advisory',
      kind: 'pronoun',
      match: word,
      index: match.index,
      message: `"${word}" refers to the individual. Use the role instead, for example the operator.`,
    });
  }
  return findings;
}
