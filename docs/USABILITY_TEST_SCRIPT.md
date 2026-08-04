# Usability test script

**This requires real people. It cannot be simulated, and the results should not be
guessed at.** Nothing in the automated suite tells you whether a reporter on a
noisy floor at the end of a twelve hour shift will finish this or abandon it.

Three sessions, about 20 minutes each including setup: **one EHS manager and two
shop-floor users**. The shop-floor users matter more. The EHS manager will tell you
whether the output is useful; the shop-floor users will tell you whether the tool
gets used at all.

---

## Before the session

- Load `dist/ii-description-wizard.html` on the device the person would really use.
  If that is a shared tablet in the bay, use that tablet, in the bay, with the
  lighting and noise that are actually there. A quiet office desk will give you a
  falsely good result.
- Have a stopwatch. Note the start time when they open the tool.
- Have the scenario card printed. Do not read it to them.
- Confirm they are happy to be observed and that you will take notes.

**Say this, once:**

> I want to see how this tool works for you. It is the tool being tested, not you.
> There are no wrong answers. Please think out loud - if something is confusing or
> annoying, say so as it happens. I will not help unless you are properly stuck,
> because I need to see where it goes wrong.

Then stop talking. The single most common way to ruin this is to explain something
the moment the person hesitates. **The hesitation is the finding.** Wait a full
30 seconds before offering anything.

---

## The scenarios

Give each person one card. Use different scenarios for the two shop-floor users.

### Card A - caught in

> You were clearing a jammed carton from the infeed conveyor at station 4. The line
> had been down twice already that shift and you were behind. Rather than stop the
> belt, you reached through the gap in the guard. The carton came free, the belt
> restarted, and the back of your right hand was pulled against the metal edge of
> the guard opening. A workmate hit the e-stop. You went to first aid, then to the
> clinic. You are about seven hours into a twelve hour shift.

### Card B - lifting

> You and a workmate were lifting a pump casing, around 95 pounds, off a pallet
> onto the maintenance bench. The hoist you would normally use was tagged out for
> inspection. On the lift your workmate raised their end first, the casing tipped
> toward you, and you twisted to keep hold of it. You felt a sharp pain across your
> lower back. You put it down and stopped.

### Card C - gradual onset

> Your right shoulder has been aching for about six weeks. It started at the end of
> shifts and now it is there most of the day. You load trays onto an overhead rack,
> about 180 a shift. The rack was raised a few inches during a layout change a
> couple of months ago and the tray count went up around the same time. You have
> not reported it until now.

Give Card C to at least one person. Gradual-onset cases produce the worst
descriptions in the real data and they are the hardest thing this tool tries to do.

---

## What to measure

Record these for every session. Numbers, not impressions.

| Measure                   | How                                                                                             |
| ------------------------- | ----------------------------------------------------------------------------------------------- |
| **Time to complete**      | Stopwatch, tool open to text copied. Target is under 8 minutes.                                 |
| **Point of abandonment**  | If they give up or ask to stop, note the exact question.                                        |
| **Stuck points**          | Any hesitation over 30 seconds. Note the question and what they said.                           |
| **Defeat attempts**       | Any time they type filler to get past a screen. **Note what they typed and what the tool did.** |
| **Escape hatch use**      | Which questions, and whether the reason they gave was real.                                     |
| **Help usage**            | Did they open "Why am I being asked this?" or the examples? Did it help?                        |
| **Completeness score**    | The final number and band.                                                                      |
| **Final character count** | From the review screen.                                                                         |

---

## Questions to ask afterwards

Ask these after they finish, not during.

1. What was the most annoying part?
2. Was there a question you did not understand? Which one?
3. Did it ever feel like the tool was arguing with you? What happened?
4. Was there anything you wanted to say that it did not ask about?
5. Would you use this for a real incident, or would you skip it and type into the
   form directly? **Be honest, I would rather know now.**
6. If you were in a hurry, what would you do?

Question 5 is the one that matters. A polite yes is not an answer - probe it. Ask
what would have to be true for them to skip it.

For the EHS manager, also ask:

7. Reading only this description, could you start an investigation without going
   back to the person?
8. Is anything in here that should not be? Anything that identifies someone?
9. Is it too long to be read by the people who receive it?

Question 9 matters. The benchmark fixtures compose to around 3500 to 4000
characters, well above the 400 to 1200 the original brief assumed. If reviewers
find that unreadable, the fix is to trim what goes into the output - a content
change in `output-templates.json`, not a code change.

---

## Watch for these specifically

- **Does anyone try to defeat the pushback?** They will type `n/a`, `unknown`, or
  a single character. Note what happens next: do they write something real, use an
  escape hatch, or start pressing Continue repeatedly? Repeated pressing is the
  worst outcome and means the challenge is not landing.
- **Does the onset pattern question land?** It is the most important branch in the
  tool. If someone with Card C picks `Acute single event`, they get the wrong
  question set entirely, and that is a serious content problem.
- **Do they read the examples?** They are the strongest teaching tool in the
  interface. If nobody opens them, they may need to be visible by default.
- **Does the escape hatch get used honestly or as an exit?** A real reason
  (`the supervisor is confirming the number`) is the feature working. A reason like
  `dont know` means it has become a skip button and needs a higher bar.
- **What do they do at the review screen?** Do they read the completeness meter?
  Do they act on the "Improve" buttons, or copy and leave?

---

## Recording the findings

Write results to `docs/usability-findings-YYYY-MM-DD.md` with:

- The three measurement tables, one per participant.
- Every stuck point, quoted in the participant's own words where you have them.
- A prioritized list of changes, split into **content changes** (JSON, cheap) and
  **code changes** (not cheap).
- An explicit yes or no on the acceptance criterion: _can an untrained user complete
  a description for any of the twelve fixture scenarios in under 8 minutes?_

If two of three participants abandon, or anyone successfully defeats the pushback
engine with filler text, treat that as a release blocker rather than a backlog
item. Both are failures of the thing this tool exists to do.
