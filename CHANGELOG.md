# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-08-04

Consolidation release. The tool asked the right questions but took too long to
answer, and answer quality falls off well before the end of a long flow.

### Changed

- **Questions are grouped onto screens.** A typical acute case is now 14 screens
  rather than roughly 35. Questions carry a `screen` id; those sharing one are
  asked together. A screen whose questions are all hidden by branching drops out
  of the flow entirely.
- **Most questions are now a pick rather than a typed answer.** Weights, heights,
  distances, durations, frequencies, forces, surfaces, footwear, PPE, first aid,
  scene actions, notification and timing became bands, dropdowns or checklists.
  Typed answers per case fell from about 25 to 11-13. Free text is reserved for
  the task, the three-part sequence, the deviation, and why it happened.
- **Body position is picked from figures.** A new `posture` question kind renders
  thirteen labelled stick figures. Describing your own posture in words is slow
  and most people do it badly - "bent over" covers a squat, a stoop and a twist.
  Figures are coordinate data drawn with createElementNS, so they never touch an
  HTML parser.
- Options gained `outputText`, so a short tap label ("Coworker hit e-stop") can
  compose into a proper clause ("a coworker hit the emergency stop"). Where it is
  absent the label is lowercased with acronyms preserved, so `EHS` stays `EHS`.
- Option groups render as tap targets rather than native dropdowns - a dropdown
  hides the choices behind a tap and is fiddly with gloves.
- The progress indicator now says how many screens are left.
- The form cross-check gained a Confirm all button.
- Character budget re-measured: `targetMax` 3500, `warnAbove` 4200. Output is
  slightly shorter than v1.0 despite covering the same ground, because picked
  answers are more compact than typed ones.

### Fixed

- Posture tiles were only hit-testable at the hidden radio rather than across the
  whole figure, so the tap target was a few pixels instead of the tile.

### Notes

All twelve benchmark fixtures remain Investigation-ready with every deficiency
category covered, at 3052 to 3769 characters.

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
- **Test suite**: 281 unit tests, 48 end-to-end tests across desktop and tablet
  viewports, 12 scenario fixtures with golden outputs, an adversarial input suite,
  and a regression benchmark published in the README.
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

[1.1.0]: https://github.com/nbarr1/GSDescriptionWizard/releases/tag/v1.1.0
[1.0.0]: https://github.com/nbarr1/GSDescriptionWizard/releases/tag/v1.0.0
