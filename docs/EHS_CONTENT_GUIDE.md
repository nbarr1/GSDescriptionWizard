# Editing the wizard content

This guide is for EHS staff. You do not need to write code to change what the
wizard asks, how hard it pushes back, or what the output says.

Everything is in `src/config/`. Edit the JSON, open a pull request, and the test
suite will tell you if something does not line up before it reaches anyone.

---

## Before you start

**JSON is fussy about three things.** Almost every failed edit is one of these:

1. Every value except numbers and `true`/`false` needs double quotes: `"like this"`.
2. Commas go **between** items, never after the last one in a list or block.
3. You cannot use `'` or `"` inside a piece of text without escaping it. Just
   rewrite the sentence to avoid them - the tool has to avoid them anyway.

**Check your work before opening the PR:**

```bash
npm test
```

If you broke something structural, `tests/unit/config.test.ts` says exactly what.
For example: `task_purpose: unknown lexicon "motionVerb"` means you wrote a
lexicon name that does not exist - it is `motionVerbs`, with an s.

---

## The files

| File                    | What is in it                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------- |
| `questions.json`        | The questions themselves, their order, their help text, their examples, and when each one appears |
| `vocabulary.json`       | Dropdown option lists shared between questions                                                    |
| `validation.json`       | Filler words to reject, word lists to look for, and how strict to be                              |
| `scoring.json`          | How much each of the six deficiency categories counts toward the completeness meter               |
| `output-templates.json` | How each answer becomes a sentence, and the character budget                                      |
| `allowlist.json`        | Words the PII guard should not flag, and the text clean-up rules                                  |

---

## Worked example 1: rewording a question

Say `What specific task was being performed?` is not landing, and you want
`What was the person actually doing at the time?`

Open `questions.json`, find the block with `"id": "task_performed"`, and change
`prompt`. Leave `id` alone - it is the internal name and other things point at it.

```json
{
  "id": "task_performed",
  "prompt": "What was the person actually doing at the time?",
  "help": "Operational terms, not a job title.",
```

That is the whole change.

---

## Worked example 2: adding a better example answer

Examples do more work than help text. They teach the shape of a good answer, and
they are shown again inside the pushback message when someone writes something thin.

Add to the `examples` list on any question:

```json
  "examples": [
    "Removing a jammed carton from the infeed conveyor at station 4",
    "Torquing the head bolts on line 2 during a scheduled changeover"
  ],
```

**Write examples in the shape you want answers in.** For `task_performed` that
means starting with an -ing word: `Removing...`, `Torquing...`, `Walking...`. The
composer builds the sentence `The operator was <your answer>`, and it checks for
that shape - if an answer does not fit, it quietly falls back to
`Task being performed: <answer>` rather than producing `The operator was the
operator was...`. Good examples keep it on the better path.

---

## Worked example 3: making a question stricter or gentler

Each question can have a `validation` block:

```json
  "validation": {
    "minLength": 40,
    "emptyTier": "block",
    "thinTier": "challenge"
  }
```

- `minLength` - characters needed before the answer counts as substantive.
  Roughly: 25 is a short phrase, 40 is a sentence, 80 is two sentences.
- `emptyTier` - what happens when the box is empty.
- `thinTier` - what happens when the answer is too short or misses the point.

The three tiers:

| Tier        | Effect                                         | Use it when                                        |
| ----------- | ---------------------------------------------- | -------------------------------------------------- |
| `block`     | Cannot continue                                | A blank answer makes the whole description useless |
| `challenge` | Shows a follow-up once, then lets them through | You want a better answer but can live without one  |
| `warn`      | Notes it on the review screen only             | Nice to have                                       |

**Use `block` sparingly.** Roughly a quarter of questions block today. Push that
much higher and people will abandon the tool and type `Hand contusion` into the
form instead, which is exactly the problem this exists to fix.

If you set `emptyTier: "block"`, also consider `"escapeHatches": true`, which
offers `I do not know` and `Not applicable`. Both demand a short reason, and the
reason appears in the output as a stated gap - which is genuinely more useful to
an investigator than a guess.

---

## Worked example 4: rejecting a filler word people keep using

Suppose reporters at your site keep writing `standard practice`.

Open `validation.json`. One word goes in `vagueTokens`; anything with a space goes
in `vaguePhrases`:

```json
  "vaguePhrases": [
    "not specified",
    "see above",
    "standard practice"
  ],
```

Matching is on whole words, so adding `not` would **not** flag `notably`. You still
should not add `not` or `no` on their own - `no written procedure exists for this
task` is a genuinely useful answer and must stay allowed.

`vagueDensityThreshold` (default `0.6`) is how much of an answer has to be filler
before it is rejected. At 0.6, `unknown` alone is rejected but `the torque setting
is unknown but the wrench slipped off the fastener` is accepted. Lower it to be
stricter; raise it to be gentler.

---

## Worked example 5: asking a new question

Copy an existing question of the same kind and change the parts you need. Say you
want to ask about training, only when a written procedure exists.

In `questions.json`, add to the `questions` list:

```json
    {
      "id": "task_training",
      "stage": "task",
      "kind": "textarea",
      "prompt": "When was the person last trained on this task?",
      "help": "Roughly when, and whether it covered the current method.",
      "placeholder": "Example: trained about eight months ago, before the fixture change",
      "examples": [
        "Trained about eight months ago, before the fixture was changed",
        "Trained during onboarding two years ago with no refresher since"
      ],
      "showIf": { "field": "procedure_followed", "in": ["as_written", "differed"] },
      "gapCategories": ["procedure", "rootCause"],
      "weight": 2,
      "validation": { "minLength": 20, "emptyTier": "challenge", "thinTier": "warn" },
      "escapeHatches": true
    },
```

Then tell the composer how to turn it into a sentence. In
`output-templates.json`, add the question id to the `questions` list of the `task`
section, and add a fragment:

```json
    "task_training": {
      "template": "Training: {answer}.",
      "case": "sentence",
      "topic": "Training on the task"
    },
```

`topic` is the phrase used if someone takes an escape hatch, producing
`Training on the task not determined at time of report: <their reason>.`

The tests enforce both halves: a question in an output section with no fragment
fails, and a fragment not placed in any section fails. That is deliberate - it
stops a new question silently never appearing in the output.

### When to show a question

`showIf` is the branching. It reads plainly:

```json
"showIf": { "field": "equipment_involved", "isTrue": true }
"showIf": { "field": "accident_type", "equals": "overexertion" }
"showIf": { "field": "onset_pattern", "in": ["acute", "aggravation"] }
"showIf": { "all": [ {...}, {...} ] }
"showIf": { "any": [ {...}, {...} ] }
"showIf": { "not": { "field": "cond_environment_factors", "equals": "none_notable" } }
```

Leave `showIf` out to always show the question.

If someone answers a question and then changes an earlier answer so it no longer
applies, their answer to it is dropped. That is why `Back` never loses anything
that is still being asked.

### The six categories

`gapCategories` says which deficiencies a good answer helps close. It drives the
completeness meter, so a new question that does not list any will not move it.

`rootCause`, `equipment`, `immediateActions`, `procedure`, `sequence`, `activity`.

`weight` (default 1) is importance within those categories. Use 3 or 4 only for
questions that genuinely carry a category on their own.

---

## Worked example 6: looking for specific content in an answer

This is what catches an answer that is long enough but does not respond to the
question - `Employee sustained a back injury` where the motion was asked for.

```json
  "validation": {
    "minLength": 50,
    "signals": [
      {
        "type": "lexicon",
        "set": "motionVerbs",
        "minMatches": 1,
        "message": "That tells us the outcome. What was the motion?",
        "example": "The load shifted left as it cleared the pallet and the torso twisted to keep hold of it."
      }
    ]
  }
```

The `message` is what the reporter sees. **Write it as a specific question, not as
an error.** `That tells us the outcome. What was the motion?` gets a better second
attempt than `Invalid answer` ever will.

Available `type` values:

| Type       | Checks for                                                         |
| ---------- | ------------------------------------------------------------------ |
| `lexicon`  | At least `minMatches` words from a named list in `validation.json` |
| `numeral`  | Any number, including spelled-out ones like `two`                  |
| `unit`     | A unit from a named list, e.g. `weightUnits`                       |
| `pattern`  | A text pattern - ask a developer for this one                      |
| `minWords` | At least `count` words                                             |
| `anyOf`    | Any one of several requirements passes                             |

### Word lists and their exceptions

Lists live under `lexicons` in `validation.json`. Add words freely - matching
handles endings, so adding `lift` also matches `lifted` and `lifting`.

Watch for words that are verbs in one place and nouns in another. `lower` is a
real motion (`the load was lowered`) but also part of `lower back`. That is what
`lexiconExclusions` is for:

```json
  "lexiconExclusions": {
    "motionVerbs": ["lower back", "upper back"]
  },
```

Without that entry, `lower back injury` would satisfy the motion check on its own -
and back injuries are the most common case in the data, so this matters.

---

## Worked example 7: tuning the completeness meter

`scoring.json`:

```json
  "categoryWeights": {
    "rootCause": 3.0,
    "equipment": 2.5,
    ...
  },
  "bands": [
    { "min": 0,  "label": "Insufficient", "tone": "low" },
    { "min": 45, "label": "Adequate", "tone": "mid" },
    { "min": 75, "label": "Investigation-ready", "tone": "high" }
  ]
```

Weights are relative, so they do not need to add up to anything. They are currently
set from how often each thing was missing in the 656 records.

`stateCredit` is how much an answer is worth depending on how it was given.
`unresolved` (an escape hatch with a stated reason) is deliberately low at `0.15`:
it is worth something, but the meter must never read green because someone
justified their way through every question.

---

## Worked example 8: stopping the PII guard flagging your site names

The guard flags capitalized words that look like people. In a plant full of proper
nouns there will be false positives, which is why they are advisory rather than
blocking.

Add your own to `allowedCapitalized` in `allowlist.json`:

```json
  "allowedCapitalized": [
    "OSHA", "EHS", "PPE",
    "Fairview", "Northgate", "Kanban", "Poka"
  ],
```

**Never add anything to this list that could be a person's name**, even if it is
also a site or a supplier. A false alarm costs a reporter two seconds. A missed
name goes out in every email that quotes the description.

The blocking patterns - emails, phone numbers, badge and SSO numbers, dates of
birth - are in `identifierPatterns` and use regular expressions. Ask a developer
to change those.

---

## What you should not change without a developer

- `id` values on existing questions. Other things point at them.
- `kind` on an existing question. Changing `select` to `textarea` changes how the
  answer is stored.
- Anything under `identifierPatterns` or `unicodeMap` in `allowlist.json`.
- The `sections` structure in `output-templates.json`, beyond adding a question id
  to a list.

## When something breaks

Run `npm test` and read the first failure. The config tests are written to name the
question and the problem:

```
task_training: unknown lexicon "motionVerb"
task_training: free-text questions must carry at least one worked example
no output fragment defined for "task_training"
```

If a **golden output** test fails, that means your change altered the composed text
for one of the twelve benchmark cases. That is often exactly what you intended.
Check the diff reads correctly, then run:

```bash
UPDATE_GOLDEN=1 npm test
```

and commit the updated files in `tests/fixtures/golden/` with your change. Never
update them without reading the diff first - that is the only thing standing
between a small wording tweak and an unnoticed change to every description the
tool produces.
