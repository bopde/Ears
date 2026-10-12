import { describe, expect, it } from 'vitest';
import { EXERCISE_TYPES } from './registry';
import type { GenContext, Question } from './types';
import { defaultSettings } from '../session/settings';
import { makeRng } from '../lib/rng';
import { FakePerformer } from '../test-support';
import { CONCEPTS } from '../music/catalog';
import { CHORD_QUALITIES, qualitySimilarity } from '../music/chords';
import { SCALES, requireScale } from '../music/scales';
import { mean } from '../lib/util';

const settings = defaultSettings();

function context(difficulty: number, seed: number, targets: string[] = []): GenContext {
  return { rng: makeRng(seed), difficulty, settings, targetConcepts: targets };
}

function validate(question: Question, type: string, difficulty: number) {
  const where = `${type}@${difficulty}`;
  expect(question.type, where).toBe(type);
  expect(question.prompt.title.length, where).toBeGreaterThan(0);
  expect(question.conceptIds.length, `${where} declares concepts`).toBeGreaterThan(0);
  for (const id of question.conceptIds) {
    expect(CONCEPTS.get(id), `${where} concept ${id} is registered`).toBeDefined();
  }
  expect(question.fields.length, where).toBeGreaterThan(0);

  for (const field of question.fields) {
    expect(field.options.length, `${where} field ${field.key} has choices`).toBeGreaterThanOrEqual(2);
    const ids = field.options.map((o) => o.id);
    expect(new Set(ids).size, `${where} field ${field.key} has unique options`).toBe(ids.length);
    for (const o of field.options) expect(o.label.length, `${where} option label`).toBeGreaterThan(0);
    const answer = question.correct[field.key];
    expect(answer, `${where} field ${field.key} has a correct answer`).toBeDefined();
    expect(ids, `${where} the correct answer is offered`).toContain(answer);
  }
  expect(Object.keys(question.correct).sort()).toEqual(question.fields.map((f) => f.key).sort());
  expect(question.reveal.heading.length, `${where} reveal`).toBeGreaterThan(0);
  expect(question.estimatedSeconds, where).toBeGreaterThan(3);
  expect(question.estimatedSeconds, where).toBeLessThan(120);
}

describe('question generation', () => {
  for (const type of EXERCISE_TYPES) {
    describe(type.id, () => {
      it('produces valid questions at every difficulty', () => {
        for (let difficulty = 1; difficulty <= 5; difficulty++) {
          for (let seed = 0; seed < 40; seed++) {
            const question = type.generate(context(difficulty, seed * 977 + difficulty));
            expect(question, `${type.id}@${difficulty} seed ${seed}`).not.toBeNull();
            validate(question!, type.id, difficulty);
          }
        }
      });

      it('schedules audio that is actually playable', () => {
        for (let difficulty = 1; difficulty <= 5; difficulty++) {
          for (let seed = 0; seed < 12; seed++) {
            const question = type.generate(context(difficulty, seed * 31 + difficulty * 7))!;
            const perf = new FakePerformer();
            const seconds = question.play(perf.asPerformer());
            expect(perf.notes.length, `${type.id}@${difficulty} sounds something`).toBeGreaterThan(0);
            expect(seconds, `${type.id}@${difficulty} reports a duration`).toBeGreaterThan(0);
            expect(seconds).toBeLessThan(90);

            const revealPerf = new FakePerformer();
            expect(() => question.playReveal?.(revealPerf.asPerformer())).not.toThrow();

            if (question.hint) {
              const hintPerf = new FakePerformer();
              const hintSeconds = question.hint.play(hintPerf.asPerformer());
              expect(hintPerf.notes.length, `${type.id} hint sounds`).toBeGreaterThan(0);
              expect(hintSeconds).toBeGreaterThan(0);
              expect(question.hint.description.length).toBeGreaterThan(0);
            }
          }
        }
      });

      it('offers a hint on everything where one makes sense', () => {
        const question = type.generate(context(3, 5))!;
        expect(question.hint, `${type.id} has a hint`).toBeDefined();
      });

      it('does not park the right answer in the same slot', () => {
        const positions = new Set<number>();
        for (let seed = 0; seed < 30; seed++) {
          const question = type.generate(context(3, seed * 7919))!;
          const field = question.fields[question.fields.length - 1];
          positions.add(field.options.findIndex((o) => o.id === question.correct[field.key]));
        }
        expect(positions.size, `${type.id} shuffles answers`).toBeGreaterThan(2);
      });

      it('honours the concepts the selector asks for', () => {
        const pool = type.pool(settings);
        const wanted = pool[Math.floor(pool.length / 2)];
        let hits = 0;
        for (let seed = 0; seed < 25; seed++) {
          const question = type.generate(context(3, seed * 101, [wanted]))!;
          if (question.conceptIds.includes(wanted)) hits += 1;
        }
        expect(hits, `${type.id} targets ${wanted}`).toBeGreaterThan(18);
      });
    });
  }
});

describe('difficulty', () => {
  it('offers more choices as it gets harder', () => {
    const type = EXERCISE_TYPES.find((t) => t.id === 'chord-quality')!;
    const counts = [1, 2, 3, 4, 5].map((d) => {
      const q = type.generate(context(d, 4242))!;
      return q.fields[0].options.length;
    });
    expect(counts[4], 'level 5 offers more than level 1').toBeGreaterThan(counts[0]);
    for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1]);
  });

  it('moves the wrong answers closer to the right one as it gets harder', () => {
    const type = EXERCISE_TYPES.find((t) => t.id === 'chord-quality')!;
    const similarityAt = (difficulty: number) => {
      const scores: number[] = [];
      for (let seed = 0; seed < 60; seed++) {
        const q = type.generate(context(difficulty, seed * 613 + 1))!;
        const target = CHORD_QUALITIES.find((x) => x.id === q.correct.quality)!;
        for (const option of q.fields[0].options) {
          if (option.id === target.id) continue;
          const other = CHORD_QUALITIES.find((x) => x.id === option.id)!;
          scores.push(qualitySimilarity(target, other));
        }
      }
      return mean(scores);
    };
    const easy = similarityAt(1);
    const hard = similarityAt(5);
    expect(hard, `level 5 (${hard.toFixed(3)}) > level 1 (${easy.toFixed(3)})`).toBeGreaterThan(easy);
  });

  it('strips the bass and the root out of chord voicings at the top level', () => {
    const type = EXERCISE_TYPES.find((t) => t.id === 'chord-quality')!;
    let easyWithBass = 0;
    let hardWithBass = 0;
    for (let seed = 0; seed < 40; seed++) {
      const easyPerf = new FakePerformer();
      type.generate(context(1, seed * 13 + 1))!.play(easyPerf.asPerformer());
      if (easyPerf.chords[0]?.bass !== undefined) easyWithBass += 1;

      const hardPerf = new FakePerformer();
      type.generate(context(5, seed * 13 + 1))!.play(hardPerf.asPerformer());
      if (hardPerf.chords[0]?.bass !== undefined) hardWithBass += 1;
    }
    expect(easyWithBass).toBe(40);
    expect(hardWithBass).toBe(0);
  });
});

describe('exercise pools', () => {
  it('only name concepts that exist', () => {
    for (const type of EXERCISE_TYPES) {
      const pool = type.pool(settings);
      expect(pool.length, type.id).toBeGreaterThan(0);
      for (const id of pool) expect(CONCEPTS.get(id), `${type.id}: ${id}`).toBeDefined();
    }
  });

  it('returns nothing rather than crashing when the vocabulary is emptied', () => {
    const bare = { ...settings, chordQualities: [], intervals: [], modes: [], progressions: [] };
    for (const type of EXERCISE_TYPES) {
      expect(
        () => type.generate({ rng: makeRng(1), difficulty: 3, settings: bare, targetConcepts: [] }),
        type.id,
      ).not.toThrow();
    }
  });
});

describe('mode questions explain themselves', () => {
  const modeType = EXERCISE_TYPES.find((t) => t.id === 'mode')!;

  it('describes what will be heard without reaching for jargon', () => {
    for (let difficulty = 1; difficulty <= 5; difficulty++) {
      for (let seed = 0; seed < 20; seed++) {
        const q = modeType.generate(context(difficulty, seed * 131 + difficulty))!;
        const sub = q.prompt.sub ?? '';
        expect(sub, `d${difficulty} avoids jargon`).not.toMatch(/vamp/i);
        expect(sub, `d${difficulty} says what sounds`).toMatch(/sets? the tonic, then/);
        // The count in the sentence has to match what actually plays.
        const scale = requireScale(q.correct.mode);
        const chords = difficulty >= 5 ? scale.vamp.slice(0, 1) : scale.vamp;
        expect(sub.startsWith(chords.length > 1 ? 'Two chords' : 'A chord'), sub).toBe(true);
        if (sub.includes('a line over')) {
          expect(sub.endsWith(chords.length > 1 ? 'them' : 'it'), sub).toBe(true);
        }
      }
    }
  });

  it('names the mode against the scale you already know', () => {
    const withBlurbs = SCALES.filter((s) => s.blurb);
    expect(withBlurbs.length, 'most modes carry an explanation').toBeGreaterThan(10);
    const seen = new Set<string>();
    for (let seed = 0; seed < 120 && seen.size < 5; seed++) {
      const q = modeType.generate(context(3, seed * 977))!;
      const scale = requireScale(q.correct.mode);
      if (!scale.blurb || seen.has(scale.id)) continue;
      seen.add(scale.id);
      expect(q.reveal.detail, `${scale.id} explains itself`).toBe(scale.blurb);
      expect(q.reveal.notes, `${scale.id} still spells it out`).toContain(scale.spelling);
    }
    expect(seen.size, 'checked a spread of modes').toBeGreaterThanOrEqual(3);
  });
});
