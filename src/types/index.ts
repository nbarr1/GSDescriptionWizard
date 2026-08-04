/**
 * The shared contract between the JSON content files and the application logic.
 *
 * Read this file first if you are changing content. Everything an EHS author can
 * write in `src/config/*.json` is described here, and nothing else is legal.
 */

// ---------------------------------------------------------------------------
// The six deficiency categories from the 656-record analysis. Every question
// declares which of these it feeds; the completeness meter is computed from them.
// ---------------------------------------------------------------------------
export type GapCategory =
  | 'rootCause' // 90.7% missing
  | 'equipment' // 87.3% missing
  | 'immediateActions' // 82.0% missing
  | 'procedure' // 77.6% missing
  | 'sequence' // 68.6% missing
  | 'activity'; // 73.5% missing

export const GAP_CATEGORIES: readonly GapCategory[] = [
  'rootCause',
  'equipment',
  'immediateActions',
  'procedure',
  'sequence',
  'activity',
] as const;

export type OnsetPattern = 'acute' | 'gradual' | 'discovered' | 'aggravation';

// ---------------------------------------------------------------------------
// Conditions - the branching language available to content authors.
// Deliberately small and readable; no expressions, no code.
// ---------------------------------------------------------------------------
export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | { field: string; equals: string | boolean }
  | { field: string; in: string[] }
  | { field: string; answered: true }
  | { field: string; isTrue: true }
  | { field: string; isFalse: true };

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** How hard the engine pushes back when a rule fails. */
export type ResponseTier = 'block' | 'challenge' | 'warn';

/**
 * A signal a good answer to this question should contain.
 * `message` is what the user sees; `example` is a concrete worked answer.
 */
export type SignalRequirement = {
  message: string;
  example?: string;
} & (
  | { type: 'lexicon'; set: string; minMatches?: number }
  | { type: 'numeral' }
  | { type: 'unit'; set: string }
  | { type: 'pattern'; pattern: string; flags?: string }
  | { type: 'minWords'; count: number }
  | { type: 'anyOf'; requirements: SignalRequirement[] }
);

export interface QuestionValidation {
  /** Minimum characters for a substantive answer. Tuned per question, not global. */
  minLength?: number;
  /** Maximum characters accepted into the field at all (paste guard). */
  maxLength?: number;
  /** Tier applied when the answer is empty. Defaults to 'warn'. */
  emptyTier?: ResponseTier;
  /** Tier applied when the answer is too short or fails a signal check. */
  thinTier?: ResponseTier;
  /** Content signals a good answer should exhibit. */
  signals?: SignalRequirement[];
  /** Question ids whose answers this one must not simply restate. */
  circularityAgainst?: string[];
  /** Override the global circularity overlap threshold (0-1). */
  circularityThreshold?: number;
  /** Max times a challenge may re-fire before downgrading to advisory. Default from config. */
  maxChallenges?: number;
}

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------
export type QuestionKind =
  | 'text'
  | 'textarea'
  | 'select'
  | 'multiselect'
  | 'boolean'
  | 'checklist';

export interface QuestionOption {
  value: string;
  label: string;
  /** Optional hint shown under the option. */
  note?: string;
}

export interface Question {
  id: string;
  stage: string;
  kind: QuestionKind;
  /** The question itself, as the user reads it. */
  prompt: string;
  /** Short supporting text under the prompt. */
  help?: string;
  /** Answer to "why am I being asked this?" */
  why?: string;
  placeholder?: string;
  /** Worked example answers. At least one is required for every free-text question. */
  examples?: string[];
  /** Inline options, or use optionsRef to pull a shared list from vocabulary.json. */
  options?: QuestionOption[];
  optionsRef?: string;
  showIf?: Condition;
  validation?: QuestionValidation;
  /** Offer "I do not know" / "Not applicable", each requiring a justification. */
  escapeHatches?: boolean;
  /** Which deficiency categories a good answer here helps close. */
  gapCategories?: GapCategory[];
  /** Relative weight within its gap categories. Default 1. */
  weight?: number;
  /**
   * True for questions that only mirror a value already structured on the form.
   * These steer branching and are never restated verbatim in the output.
   */
  mirrorsFormField?: boolean;
}

export interface Stage {
  id: string;
  title: string;
  /** Shown at the top of every screen in the stage. */
  intro?: string;
  /** Sorting order in the progress indicator. */
  order: number;
}

export interface FormChecklistItem {
  id: string;
  label: string;
  /** The section of the I&I form where this lives. */
  formSection: string;
  note?: string;
}

export interface QuestionsConfig {
  stages: Stage[];
  questions: Question[];
  formChecklist: FormChecklistItem[];
}

// ---------------------------------------------------------------------------
// Validation config (thresholds and word lists, all author-editable)
// ---------------------------------------------------------------------------
export interface ValidationConfig {
  /** Tokens that make an answer non-responsive, e.g. "unknown", "n/a". */
  vagueTokens: string[];
  /** Multi-word phrases treated the same way, e.g. "see above". */
  vaguePhrases: string[];
  /** Fraction of an answer that may be vague tokens before it is rejected (0-1). */
  vagueDensityThreshold: number;
  /** Named word lists referenced by SignalRequirement. */
  lexicons: Record<string, string[]>;
  /** Named unit lists referenced by SignalRequirement of type 'unit'. */
  unitSets: Record<string, string[]>;
  /** Token-overlap fraction above which an answer counts as restating (0-1). */
  circularityThreshold: number;
  /** Similarity above which two different answers count as copy-paste (0-1). */
  repetitionThreshold: number;
  /** Default challenge escalation ceiling before downgrade to advisory. */
  maxChallenges: number;
  /** Default minimum length when a question does not set one. */
  defaultMinLength: number;
  /** Hard ceiling on any single field, to contain giant pastes. */
  defaultMaxLength: number;
  /** Words ignored when comparing answers for overlap. */
  stopWords: string[];
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------
export interface ScoringConfig {
  /** Relative importance of each deficiency category. Need not sum to 1. */
  categoryWeights: Record<GapCategory, number>;
  /** Credit given for an answer in each state (0-1). */
  stateCredit: {
    satisfied: number;
    thin: number;
    unresolved: number;
    missing: number;
  };
  bands: { min: number; label: string; tone: 'low' | 'mid' | 'high' }[];
}

// ---------------------------------------------------------------------------
// Output composition
// ---------------------------------------------------------------------------
export type OutputMode = 'labeled' | 'narrative';

/** Turns one answer into one sentence. See output-templates.json for the contract. */
export interface Fragment {
  /** Sentence frame. `{answer}` and `{role}` are substituted. */
  template: string;
  /** First letter handling for `{answer}`. */
  case: 'lower' | 'sentence' | 'asis';
  /** Human-readable name of what this question captures, used in gap statements. */
  topic: string;
  /** For select questions: a complete sentence per option value, instead of `template`. */
  valueTemplates?: Record<string, string>;
}

export interface OutputTemplatesConfig {
  defaultMode: OutputMode;
  characterBudget: {
    targetMin: number;
    targetMax: number;
    warnBelow: number;
    warnAbove: number;
    /** Hard field limit if the form owner has confirmed one; null means unconfirmed. */
    hardLimit: number | null;
  };
  /** Append "[Wizard vX.Y]" to the output. Default off, per the brief. */
  versionTag: { enabled: boolean; template: string };
  /** Section headings for labeled mode, in emission order. */
  sections: { id: string; heading: string; questions: string[] }[];
  /** One entry per question that can appear in the output. */
  fragments: Record<string, Fragment>;
  /** Connective phrasing for narrative mode. */
  narrative: {
    lead: Record<string, string>;
    fallbackLead: string;
    /** Per-accident-type opening clause for the mechanism paragraph. */
    mechanismLead: Record<string, string>;
  };
  /** Rendered when a question was answered with an escape hatch. */
  gapStatement: string;
  /** Rendered when a whole deficiency category has nothing behind it. */
  categoryGapStatements: Record<GapCategory, string>;
}

// ---------------------------------------------------------------------------
// PII / sanitization allowlists
// ---------------------------------------------------------------------------
export interface AllowlistConfig {
  /** Capitalized tokens that are legitimate and must not be flagged as names. */
  allowedCapitalized: string[];
  /** Common given names, raising confidence that a capitalized token is a person. */
  nameLexicon: string[];
  /** Personal pronouns rewritten to the role noun. */
  pronounRewrites: Record<string, string>;
  /** Possessive pronouns rewritten to "the", so "her hand" becomes "the hand". */
  possessivePronounRewrites: Record<string, string>;
  /** Pronouns that are possessive when a word follows and personal otherwise. */
  ambiguousPronouns: string[];
  /** Contractions and possessives rewritten before apostrophes are stripped. */
  contractionRewrites: Record<string, string>;
  /** Non-ASCII characters mapped to safe ASCII. */
  unicodeMap: Record<string, string>;
  /** Structured identifier patterns. These block rather than advise. */
  identifierPatterns: { id: string; label: string; pattern: string; flags?: string }[];
}

export interface VocabularyConfig {
  /** Shared option lists referenced by Question.optionsRef. */
  lists: Record<string, QuestionOption[]>;
}

// ---------------------------------------------------------------------------
// Runtime session state
// ---------------------------------------------------------------------------

/** What the user actually put in a field. */
export type AnswerValue =
  | { kind: 'text'; text: string }
  | { kind: 'choice'; value: string }
  | { kind: 'multi'; values: string[] }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'escape'; hatch: 'unknown' | 'not_applicable'; justification: string };

export interface Answer {
  questionId: string;
  value: AnswerValue;
  /** How many times a challenge has fired for this question. */
  challengeCount: number;
  /** Set when the user dismissed a challenge, with their stated reason. */
  challengeDismissal?: string;
}

export type AnswerState = 'satisfied' | 'thin' | 'unresolved' | 'missing';

export interface Finding {
  questionId: string;
  tier: ResponseTier;
  /** Stable id so the UI and tests can assert on a specific rule firing. */
  rule:
    | 'empty'
    | 'tooShort'
    | 'vague'
    | 'signal'
    | 'circular'
    | 'repetition'
    | 'tooLong'
    | 'bannedCharacters'
    | 'pii';
  message: string;
  example?: string;
}

export interface SessionState {
  answers: Record<string, Answer>;
  /** Stage 6 checklist ticks. */
  formChecklist: Record<string, boolean>;
  outputMode: OutputMode;
  /** Opt-in localStorage persistence. Off unless the user ticks the box. */
  persist: boolean;
  startedAt: number;
  version: string;
}
