# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-08-04

First release.

### Added

- **Wizard flow** across eight stages, branching on onset pattern and accident
  type. Gradual onset, discovered condition and aggravation cases each get their
  own question set rather than being forced through the acute-event narrative.
- **Pushback engine** with three tiers - block, challenge, warn - covering length
  floors, vague-token density, content-signal checks, circularity and copy-paste
  detection. Challenges escalate at most twice before downgrading to advisory.
- **Escape hatches** on every blocking question. `I do not know` and
  `Not applicable` each require a short reason, which is preserved in the output
  as an explicit stated gap.
- **Completeness scoring** across the six deficiency categories from the
  656-record analysis, shown as a labelled meter with per-category status and
  jump-to-improve links.
- **Output composer** with labelled and narrative modes, deterministic sentence
  assembly, an eight-step sanitizer, and a PII guard that blocks structured
  identifiers and advises on probable names.
- **Single-file build** at `dist/ii-description-wizard.html`, self-contained and
  usable offline from `file://`.
- **Content as data.** Questions, help text, examples, thresholds, vocabulary,
  scoring weights and output templates all live in `src/config/*.json`.
- **Test suite**: 244 unit tests, 42 end-to-end tests across desktop and tablet
  viewports, 12 scenario fixtures with golden outputs, and a regression benchmark
  published in the README.
- Accessibility: WCAG 2.1 AA, full keyboard operation, 44px minimum tap targets,
  focus management and live-region announcements on every screen transition.
- Opt-in draft persistence with a 24 hour TTL, off by default for shared kiosks.
- Documentation: content guide for EHS authors, deployment guide, and a usability
  test script ready to run with real users.

### Deviations from the original brief

Both are documented in place, with the reasoning, and both are reversible.

- **Sanitizer step order.** The brief specified removing apostrophes before
  rewriting contractions and possessives. In that order `the operator's hand`
  becomes `the operators hand`, which reads as a plural and has already lost its
  meaning before the rewriter sees it. Rewriting now happens first; the strip step
  still runs unconditionally afterwards, so the guarantee is unchanged.
- **Character budget.** The brief proposed a 400 to 1200 target with a warning
  above 2000. All twelve benchmark fixtures compose to between 3531 and 4091
  characters, so warning above 2000 would have fired on every correct output.
  Defaults are `targetMax: 3000` and `warnAbove: 4500`; `warnBelow: 300` is
  unchanged. See the README for the full reasoning.

### Known open items

- The real character limit of the description field is unconfirmed.
  `characterBudget.hardLimit` is `null` until the form owner confirms it.
- The Accident Type vocabulary is assumed from the brief rather than taken from
  the site's own list.
- The browser floor is assumed to be current and current minus two for Chrome,
  Edge and Firefox.
- Usability testing with real users has not been run. The script is written and
  ready in `docs/USABILITY_TEST_SCRIPT.md`.
- The optional `[Wizard vX.Y]` output tag is off by default, pending a decision
  from the form owner.

[1.0.0]: https://github.com/nbarr1/GSDescriptionWizard/releases/tag/v1.0.0
