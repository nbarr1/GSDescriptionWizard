# Injury and Illness Description Wizard

A deterministic, offline wizard that walks a reporter through writing a complete
`Injury/Illness Description (F)` for the EHS I&I form, then hands them a
copy-paste-ready block of text.

No LLM. No API keys. No network. Every question, threshold and word list lives in
JSON that an EHS author can edit without touching code.

---

## Why this exists

Analysis of 656 real I&I records found the description field is systematically
under-filled:

| Gap                                       | % of records missing |
| ----------------------------------------- | -------------------- |
| Root cause / why it happened              | 90.7%                |
| Equipment, tool, or material involved     | 87.3%                |
| Immediate actions taken / treatment given | 82.0%                |
| Procedure or process being followed       | 77.6%                |
| Specific activity being performed         | 73.5%                |
| Basic "what happened" sequence context    | 68.6%                |

Alongside that:

- 11 records were under 50 characters, e.g. `Hand contusion`, `Ergonomic Back injury`.
- 210 records contained filler tokens: `not specified`, `unknown`, `pending`, `n/a`, `TBD`.
- Strain and sprain cases averaged 45 to 132 characters. OSHA-recordable cases
  averaged 404. **Quality tracked perceived severity, not investigative need.**

The last point drove the design. The single most important branch in the wizard is
the onset pattern, because the acute-event narrative simply does not fit a
gradual-onset strain - so people faced with it write nothing. Gradual, discovered
and aggravation cases each get their own question set.

## How long it takes

A typical case is **14 screens** and about **11 to 13 things to type**. Everything
else is a tap. The first version asked one question per screen, which came to
roughly 35 screens and 25 typed answers for the same case - and answer quality
falls off long before a reporter reaches the end of that.

|                               | First version | Now   |
| ----------------------------- | ------------- | ----- |
| Screens for one acute case    | ~35           | 14    |
| Questions answered by typing  | ~25           | 11-13 |
| Questions answered by tapping | ~10           | ~35   |

Free text is reserved for the things a picker genuinely cannot hold: the task,
the three-part sequence, the deviation from the method, and why it happened.
Weights, heights, durations, PPE, first aid, scene actions and timing are all
bands or checklists now.

**Body position is a picture.** Describing your own posture in words is slow and
most people do it badly - "bent over" covers a squat, a stoop and a twist, which
are three different mechanisms. The wizard shows thirteen labelled figures and
composes the pick into precise prose.

## What it does

- **Asks only what the form cannot capture.** Names, dates, body parts, severity,
  and everything else with a structured field is confirmed on a checklist near the
  end and never enters the description text.
- **Pushes back on thin answers.** Three tiers - block, challenge, warn - driven by
  length floors, vague-token density, content-signal checks, circularity and
  copy-paste detection.
- **Cannot trap you.** Challenges escalate at most twice, then downgrade to
  advisory. Every blocking question offers `I do not know` / `Not applicable`,
  each requiring a short reason that is preserved in the output as an explicit,
  visible gap.
- **Produces safe text.** No apostrophes or quotation marks (the form strips them),
  ASCII only, person-neutral voice, and a PII guard that blocks structured
  identifiers and flags probable names.
- **Runs from a single file.** `dist/ii-description-wizard.html` works when
  double-clicked from a desktop, a network share, or SharePoint, with no server
  and no internet.

## Quick start

```bash
npm install
npm run dev          # local dev server
npm test             # unit tests
npm run build        # both distributions
npm run test:e2e     # end-to-end against the single-file build
npm run verify       # everything, in the order CI runs it
```

The distributable most people will actually use is
`dist/ii-description-wizard.html`. Email it, drop it on a share, open it. See
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Editing the content

Question wording, help text, examples, thresholds and vocabulary are all data:

```
src/config/questions.json         stages, questions, branching, examples
src/config/vocabulary.json        shared option lists mirroring the form
src/config/validation.json        vague tokens, signal lexicons, thresholds
src/config/scoring.json           completeness weights per deficiency category
src/config/output-templates.json  sentence frames and the character budget
src/config/allowlist.json         PII guard data and sanitizer maps
```

`tests/unit/config.test.ts` fails CI on a broken edit - an unknown branch target,
a free-text question with no worked example, an option list that does not resolve.
Worked examples for every kind of change are in
[docs/EHS_CONTENT_GUIDE.md](docs/EHS_CONTENT_GUIDE.md).

## Regression benchmark

Twelve synthetic cases spanning the branch matrix, each composed end to end. A
category counts as addressed when the composed output carries real content for it,
`partial` when what is there is thin, and `gap stated` when the output explicitly
records why it is absent. Regenerate with `npm run benchmark`.

<!-- BENCHMARK:START -->

| Scenario                                  | Score | Band                | Chars | Root cause | Equipment | Immediate actions | Procedure | Activity | Sequence |
| ----------------------------------------- | ----- | ------------------- | ----- | ---------- | --------- | ----------------- | --------- | -------- | -------- |
| Acute laceration with a hand tool         | 100   | Investigation-ready | 3253  | covered    | covered   | covered           | covered   | covered  | covered  |
| Overexertion during a two-person lift     | 100   | Investigation-ready | 3475  | covered    | covered   | covered           | covered   | covered  | covered  |
| Slip on a wet floor                       | 96    | Investigation-ready | 3094  | covered    | covered   | covered           | covered   | covered  | covered  |
| Caught in during guard removal            | 99    | Investigation-ready | 3769  | covered    | covered   | covered           | covered   | covered  | covered  |
| Gradual onset shoulder strain             | 95    | Investigation-ready | 3052  | covered    | covered   | covered           | covered   | covered  | covered  |
| Chemical splash to the forearm            | 96    | Investigation-ready | 3375  | covered    | covered   | covered           | covered   | covered  | covered  |
| Fall from a ladder                        | 99    | Investigation-ready | 3461  | covered    | covered   | covered           | covered   | covered  | covered  |
| Thermal burn from a heated platen         | 97    | Investigation-ready | 3538  | covered    | covered   | covered           | covered   | covered  | covered  |
| Struck by dropped material                | 95    | Investigation-ready | 3172  | covered    | covered   | covered           | covered   | covered  | covered  |
| Repetitive motion wrist symptoms          | 90    | Investigation-ready | 3133  | covered    | covered   | covered           | partial   | covered  | covered  |
| Delayed report of a back injury           | 94    | Investigation-ready | 3354  | covered    | covered   | covered           | covered   | covered  | covered  |
| Aggravation of a prior shoulder condition | 94    | Investigation-ready | 3408  | covered    | covered   | covered           | covered   | covered  | covered  |

| Deficiency category           | Missing in the 656 baseline records | Addressed across the 12 fixtures |
| ----------------------------- | ----------------------------------- | -------------------------------- |
| Root cause / why it happened  | 90.7%                               | 100.0%                           |
| Equipment, tool or material   | 87.3%                               | 100.0%                           |
| Immediate actions / treatment | 82%                                 | 100.0%                           |
| Procedure or process followed | 77.6%                               | 100.0%                           |
| Specific activity performed   | 73.5%                               | 100.0%                           |
| Sequence context              | 68.6%                               | 100.0%                           |

<!-- BENCHMARK:END -->

`Repetitive motion wrist symptoms` reads `partial` on Procedure by design: that
fixture uses an escape hatch on the procedure reference, so the output states
`Procedure reference not determined at time of report` rather than inventing one.
That is the escape hatch working, not a defect.

## Enforced constraints

These are automated tests, not conventions. They fail the build.

| Constraint                                         | Where it is enforced                                                                   |
| -------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Zero network requests during a full session        | `tests/e2e/wizard.spec.ts`                                                             |
| No external references in the built file           | `scripts/inline.mjs`, at build time                                                    |
| No `'` or `"` in any composed output               | `tests/unit/composer.test.ts`, all fixtures                                            |
| No non-ASCII in any composed output                | `tests/unit/composer.test.ts`, all fixtures                                            |
| Every fixture clears the 300 character floor       | `tests/unit/composer.test.ts`                                                          |
| PII guard fires on every seeded identifier         | `tests/unit/composer.test.ts`                                                          |
| No gendered pronoun reaches the output             | `tests/unit/composer.test.ts`                                                          |
| Filler text never satisfies a blocking question    | `tests/unit/adversarial.test.ts`, every blocking question against seven filler strings |
| Escape hatches score as unresolved, never green    | `tests/unit/adversarial.test.ts`                                                       |
| Closing a branch drops its answers, and only those | `tests/unit/adversarial.test.ts`                                                       |
| User input never reaches an HTML sink              | `eslint.config.js` bans `innerHTML`; `tests/e2e/wizard.spec.ts` asserts inertness      |
| 44px minimum tap targets                           | `tests/e2e/accessibility.spec.ts`                                                      |
| Full keyboard operation                            | `tests/e2e/accessibility.spec.ts`                                                      |
| No horizontal scroll at 360px                      | `tests/e2e/accessibility.spec.ts`                                                      |

## Open questions for the form owner

Three items in the brief could not be confirmed without the form owner. Defaults
are in place and are one-line config changes once answers arrive.

### 1. The real character limit of the description field — UNCONFIRMED

`output-templates.json` sets `characterBudget.hardLimit: null`, meaning no hard
ceiling is enforced. **Set it as soon as the limit is known.** If the field turns
out to be smaller than about 2000 characters, the labelled output will need
trimming and that is a content change, not a code change.

**A finding worth surfacing:** the brief proposed a 400 to 1200 character target
with a warning above 2000. Measurement contradicts that. All twelve benchmark
fixtures compose to between 3052 and 3769 characters, because a description that
genuinely covers task, procedure, equipment, a three-part sequence, mechanism,
contributing conditions and immediate response does not fit in 1200. Warning
above 2000 would have fired on every correct output and trained users to ignore
the warning, so the shipped defaults are `targetMax: 3500` and `warnAbove: 4200`.
The `warnBelow: 300` floor is unchanged from the brief. If the original numbers
are wanted, they are two values in `src/config/output-templates.json`.

### 2. The exact Accident Type vocabulary at this site — ASSUMED

`vocabulary.json` uses the mechanism list from the brief plus `motor_vehicle`,
mapping one-to-one onto the mechanism branches. If the site uses OIICS codes or a
local list, replace `lists.accidentType` and add matching `showIf` conditions for
the mechanism questions. `tests/unit/config.test.ts` asserts every accident type
has at least one mechanism question and a narrative lead phrase, so a partial
replacement fails CI rather than silently producing an empty mechanism section.

### 3. The target browser floor — ASSUMED

Built for **Chrome, Edge and Firefox, current and current minus two**, at an
ES2020 target with no polyfills. Clipboard falls back through
`document.execCommand` to a manual select-all path, so locked-down corporate
browsers still work. If the corporate standard is older than roughly Chrome 88 or
Firefox 85, change `build.target` in `vite.config.ts` and re-verify.

Also outstanding, from §7 of the brief: the optional `[Wizard vX.Y]` output tag is
**off by default** (`output-templates.json`, `versionTag.enabled`). Turning it on
would let adoption be measured downstream from the description text itself.
Confirm with the form owner before enabling.

## Privacy

- No data leaves the device. There is no network code in the application.
- Draft persistence to `localStorage` is **opt-in per session**, with a 24 hour TTL,
  cleared by `Clear all data`. It is off by default because these tools get used on
  shared shop-floor kiosks.
- The composer refuses to emit content it detects as a structured personal
  identifier, and flags probable names for the user to resolve. Nothing is ever
  deleted silently - every change is shown with its reason.

## Project layout

```
src/config/       content as JSON (see "Editing the content")
src/engine/       flow state machine and branching resolver
src/validation/   pushback rules, tiers and completeness scoring
src/composer/     sentence assembly, sanitizer, PII guard
src/ui/           screens, review panel, clipboard, storage
tests/unit/       rules, composer, config integrity
tests/fixtures/   12 synthetic sessions and their golden outputs
tests/e2e/        Playwright, against the single-file build over file://
docs/             content guide, deployment, usability test script
```

## Still to do

- **Usability testing with real users.** This needs a human, not a simulation.
  The script is written and ready at
  [docs/USABILITY_TEST_SCRIPT.md](docs/USABILITY_TEST_SCRIPT.md): one EHS manager
  and two shop-floor users, measuring time to complete, points of abandonment, and
  whether anyone tries to defeat the pushback engine.
- Confirm the three open questions above and record the answers here.

## Licence

Internal tool. Not for external distribution.
