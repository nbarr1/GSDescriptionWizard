import { describe, expect, it } from 'vitest';
import { requireQuestion, validationConfig } from '../../src/config';
import {
  checkCircularity,
  checkRepetition,
  checkVague,
  countLexiconMatches,
  isLowInformation,
  overlapRatio,
  stem,
  tokenize,
  validateAnswer,
} from '../../src/validation';
import { setAnswer, recordChallenge, dismissChallenge, createSession } from '../../src/engine/flow';
import { choice, escape, sessionWith, text } from '../helpers/session';

describe('normalization', () => {
  it('tokenizes on words, not characters', () => {
    expect(tokenize('The right hand, at 40 lbs.')).toEqual([
      'the',
      'right',
      'hand',
      'at',
      '40',
      'lbs',
    ]);
  });

  it('stems common verb forms to a shared root', () => {
    expect(stem('lifted')).toBe('lift');
    expect(stem('lifting')).toBe('lift');
    expect(stem('lifts')).toBe('lift');
    expect(stem('shifted')).toBe('shift');
  });

  it('scores overlap on content words only', () => {
    const ratio = overlapRatio(
      'the operator was lifting the bag',
      'lifting a bag',
      validationConfig.stopWords,
    );
    expect(ratio).toBeGreaterThan(0.9);
  });
});

describe('vague token detection', () => {
  it('rejects the literal filler strings found in the real data', () => {
    for (const filler of ['not specified', 'unknown', 'pending', 'n/a', 'N/A', 'TBD', 'none']) {
      expect(checkVague(filler, validationConfig).isVague, `"${filler}" should be vague`).toBe(
        true,
      );
    }
  });

  it('does not flag words that merely contain a vague token', () => {
    // The classic false positive: "notably" contains "not".
    for (const good of [
      'notably the guard was missing',
      'nothing was different because the standard work was followed',
      'the none-too-obvious trip hazard',
    ]) {
      expect(checkVague(good, validationConfig).isVague, `"${good}" should not be vague`).toBe(
        false,
      );
    }
  });

  it('allows a vague word inside an otherwise substantive answer', () => {
    const answer =
      'The exact torque setting is unknown but the wrench slipped off the fastener while pulling toward the body';
    expect(checkVague(answer, validationConfig).isVague).toBe(false);
  });
});

describe('low-information input', () => {
  it('catches punctuation, single characters and mashing', () => {
    for (const bad of ['.', '...', 'a', 'aaaaaaa', '!!!!', '?!?!', '     ']) {
      expect(isLowInformation(bad), `"${bad}" should be low information`).toBe(true);
    }
  });

  it('catches emoji-only and non-Latin-script-only answers', () => {
    expect(isLowInformation('🙂🙂🙂')).toBe(true);
    expect(isLowInformation('日本語のテキスト')).toBe(true);
  });

  it('accepts a real short answer', () => {
    expect(isLowInformation('Approximately 40 pounds')).toBe(false);
  });
});

describe('responsiveness signals', () => {
  it('matches lexicon entries across inflections', () => {
    const motion = validationConfig.lexicons.motionVerbs!;
    expect(countLexiconMatches('the load shifted to the left', motion)).toBeGreaterThan(0);
    expect(countLexiconMatches('the torso twisted', motion)).toBeGreaterThan(0);
    expect(countLexiconMatches('back injury', motion)).toBe(0);
  });

  it('challenges a mechanism answer that states an outcome rather than a motion', () => {
    const session = sessionWith({
      onset_pattern: choice('acute'),
      sequence_moment: text('Employee sustained a lower back injury of a moderate nature today'),
    });
    const result = validateAnswer(requireQuestion('sequence_moment'), session);
    expect(result.tier).toBe('challenge');
    expect(result.findings.map((f) => f.rule)).toContain('signal');
    expect(result.findings.find((f) => f.rule === 'signal')?.message).toMatch(/motion/i);
  });

  it('accepts a mechanism answer that describes the motion', () => {
    const session = sessionWith({
      onset_pattern: choice('acute'),
      sequence_moment: text(
        'The load shifted toward the left as it cleared the pallet and the torso twisted to keep hold of it',
      ),
    });
    expect(validateAnswer(requireQuestion('sequence_moment'), session).tier).toBeNull();
  });

  it('requires a number and a unit for a weight question', () => {
    const withoutNumber = sessionWith({ object_handled: true, object_weight: text('quite heavy') });
    const result = validateAnswer(requireQuestion('object_weight'), withoutNumber);
    expect(result.findings.some((f) => f.rule === 'signal')).toBe(true);

    const withBoth = sessionWith({
      object_handled: true,
      object_weight: text('approximately 40 pounds'),
    });
    expect(validateAnswer(requireQuestion('object_weight'), withBoth).tier).toBeNull();
  });

  it('accepts either an identifier or an explicit no-procedure declaration', () => {
    const identifier = sessionWith({ procedure_reference: text('SW-114 Conveyor Jam Clearing') });
    expect(validateAnswer(requireQuestion('procedure_reference'), identifier).tier).toBeNull();

    const declaration = sessionWith({
      procedure_reference: text('No written procedure exists for this task'),
    });
    expect(validateAnswer(requireQuestion('procedure_reference'), declaration).tier).toBeNull();

    const neither = sessionWith({ procedure_reference: text('the usual way we do it') });
    expect(validateAnswer(requireQuestion('procedure_reference'), neither).tier).not.toBeNull();
  });
});

describe('circularity', () => {
  it('detects an answer that restates the injury instead of describing it', () => {
    // Every content word of the answer is already known from the structured fields.
    const result = checkCircularity(
      'Back injury from lifting',
      [
        'The moment: what happened, in order?',
        'Injury',
        'Lower back',
        'Overexertion - lifting, lowering, pushing, pulling, carrying',
      ],
      validationConfig,
    );
    expect(result.isCircular).toBe(true);
  });

  it('leaves a genuinely descriptive answer alone', () => {
    const result = checkCircularity(
      'The bag was raised from floor level to waist height with the back bent forward and the torso twisted left',
      ['The moment: what happened, in order?', 'Injury', 'Lower back', 'Overexertion - lifting'],
      validationConfig,
    );
    expect(result.isCircular).toBe(false);
  });

  it('ignores very short answers, where coverage is meaningless', () => {
    const result = checkCircularity('40 pounds', ['weight', 'pounds'], validationConfig);
    expect(result.isCircular).toBe(false);
  });

  it('fires end to end when a sequence answer only restates the structured fields', () => {
    const session = sessionWith({
      onset_pattern: choice('acute'),
      injury_or_illness: choice('injury'),
      accident_type: choice('overexertion'),
      principal_body_part: choice('back_lower'),
      task_performed: text('Lifting resin bags from a pallet onto the mixer platform'),
      sequence_moment: text(
        'Lower back injury sustained while lifting a resin bag from the pallet',
      ),
    });
    const result = validateAnswer(requireQuestion('sequence_moment'), session);
    expect(result.findings.map((f) => f.rule)).toContain('circular');
  });
});

describe('lexicon exclusions', () => {
  it('does not accept "lower back" as evidence of a described motion', () => {
    const motion = validationConfig.lexicons.motionVerbs!;
    const exclusions = validationConfig.lexiconExclusions?.motionVerbs ?? [];
    expect(countLexiconMatches('lower back injury', motion, exclusions)).toBe(0);
    // The verb form still counts.
    expect(
      countLexiconMatches('the load was lowered to the floor', motion, exclusions),
    ).toBeGreaterThan(0);
  });
});

describe('copy-paste repetition', () => {
  it('flags the same answer pasted into a second question', () => {
    const pasted = 'The operator was clearing a jammed carton from the infeed conveyor guard';
    const result = checkRepetition(
      pasted,
      [{ questionId: 'task_performed', text: pasted }],
      validationConfig,
    );
    expect(result.isRepeat).toBe(true);
    expect(result.matchedQuestionId).toBe('task_performed');
  });
});

describe('response tiers', () => {
  it('blocks an empty answer only where a blank makes the description useless', () => {
    const empty = createSession();
    expect(validateAnswer(requireQuestion('sequence_moment'), empty).canAdvance).toBe(false);
    // Advisory questions never stop the user.
    expect(validateAnswer(requireQuestion('object_dimensions'), empty).canAdvance).toBe(true);
  });

  it('downgrades a challenge to advisory after the configured escalation limit', () => {
    let session = sessionWith({ cond_difference_from_normal: text('nothing much') });
    expect(validateAnswer(requireQuestion('cond_difference_from_normal'), session).tier).toBe(
      'challenge',
    );

    for (let i = 0; i < validationConfig.maxChallenges; i += 1) {
      session = recordChallenge(session, 'cond_difference_from_normal');
    }
    expect(validateAnswer(requireQuestion('cond_difference_from_normal'), session).tier).toBe(
      'warn',
    );
  });

  it('downgrades a challenge when the user dismisses it with a reason', () => {
    let session = sessionWith({ cond_difference_from_normal: text('nothing much') });
    session = dismissChallenge(session, 'cond_difference_from_normal', 'Still gathering detail');
    const result = validateAnswer(requireQuestion('cond_difference_from_normal'), session);
    expect(result.tier).toBe('warn');
    expect(result.canAdvance).toBe(true);
  });

  it('never lets a challenge block advancement', () => {
    const session = sessionWith({ cond_stop_work: text('nothing much to say') });
    expect(validateAnswer(requireQuestion('cond_stop_work'), session).canAdvance).toBe(true);
  });
});

describe('escape hatches', () => {
  it('accepts a justified escape hatch but scores it as unresolved', () => {
    const session = sessionWith({
      procedure_reference: escape(
        'unknown',
        'The area supervisor is confirming the document number',
      ),
    });
    const result = validateAnswer(requireQuestion('procedure_reference'), session);
    expect(result.canAdvance).toBe(true);
    expect(result.state).toBe('unresolved');
  });

  it('rejects an escape hatch with no justification', () => {
    const session = sessionWith({ procedure_reference: escape('unknown', '') });
    const result = validateAnswer(requireQuestion('procedure_reference'), session);
    expect(result.canAdvance).toBe(false);
    expect(result.state).toBe('missing');
  });

  it('rejects a token justification', () => {
    const session = sessionWith({ procedure_reference: escape('unknown', 'x') });
    expect(validateAnswer(requireQuestion('procedure_reference'), session).canAdvance).toBe(false);
  });
});

describe('paste guard', () => {
  it('warns rather than crashes on a 50000 character paste', () => {
    const session = setAnswer(createSession(), 'task_performed', {
      kind: 'text',
      text: 'a'.repeat(50_000),
    });
    const result = validateAnswer(requireQuestion('task_performed'), session);
    expect(result.findings.some((f) => f.rule === 'tooLong' || f.rule === 'vague')).toBe(true);
    expect(() => validateAnswer(requireQuestion('task_performed'), session)).not.toThrow();
  });

  it('handles a long but genuine paste without blocking', () => {
    const long = 'The operator was clearing a jammed carton from the conveyor. '.repeat(40);
    const session = setAnswer(createSession(), 'task_performed', { kind: 'text', text: long });
    const result = validateAnswer(requireQuestion('task_performed'), session);
    expect(result.canAdvance).toBe(true);
  });
});
