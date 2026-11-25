import { describe, expect, it } from 'vitest';
import { getExerciseType } from './registry';
import { defaultSettings, normaliseSettings } from '../session/settings';
import { makeRng } from '../lib/rng';
import { nameableVoicings } from './voicing-plan';
import { inversionsOf } from '../music/inversions';
import { CHORD_QUALITIES, requireChordQuality } from '../music/chords';

/**
 * How often each answer is the answer, level by level.
 *
 * If something can be the answer at a level it has to be the answer often
 * enough that its absence says nothing. The voicing exercise used to make
 * drop 2 the answer in 5% of level-1 questions and close voicings in 53%
 * — a learner who guessed "close" at level 1 and "rootless" at level 5
 * was right more often than one who listened.
 *
 * Measured before the adaptive model touches it, which is what the rule
 * is about: the wish list may well raise something a learner is weak at,
 * and that is the model doing its job rather than a base rate to read.
 */
const RUNS = 2000;
const settings = normaliseSettings(defaultSettings());

function shares(exercise: string, difficulty: number, answerOf: (q: never) => string[]) {
  const type = getExerciseType(exercise)!;
  const counts = new Map<string, number>();
  let asked = 0;
  for (let seed = 0; seed < RUNS; seed += 1) {
    const q = type.generate({
      rng: makeRng(seed * 7919 + difficulty * 101),
      difficulty,
      settings,
      targetConcepts: [],
    });
    if (!q) continue;
    asked += 1;
    for (const answer of answerOf(q as never)) {
      counts.set(answer, (counts.get(answer) ?? 0) + 1);
    }
  }
  return { counts, asked };
}

/**
 * The rule: the commonest answer at most twice the rarest.
 *
 * Tighter where the choice itself is meant to be even and nothing about
 * the material stands in the way. Four inversions are four inversions;
 * the colours are drawn evenly too, but which chords can take which is
 * not even and should not be.
 */
function evenEnough(
  counts: Map<string, number>,
  expected: readonly string[],
  where: string,
  bound = 2,
) {
  const missing = expected.filter((id) => !counts.has(id));
  expect(missing, `${where} never asked for ${missing.join(', ')}`).toEqual([]);
  const seen = [...counts].filter(([id]) => expected.includes(id));
  const extra = [...counts.keys()].filter((id) => !expected.includes(id));
  expect(extra, `${where} asked for ${extra.join(', ')}, which is not on offer`).toEqual([]);
  const sorted = seen.sort((a, b) => b[1] - a[1]);
  const ratio = sorted[0][1] / sorted[sorted.length - 1][1];
  const tally = sorted.map(([id, n]) => `${id} ${n}`).join(', ');
  expect(ratio, `${where}: ${tally} — ${ratio.toFixed(2)} to 1`).toBeLessThanOrEqual(bound);
}

describe('no answer is rare enough to rule out', () => {
  for (const difficulty of [1, 2, 3, 4, 5]) {
    it(`spreads the voicings evenly at level ${difficulty}`, () => {
      const { counts } = shares('voicing', difficulty, (q: { correct: { voicing: string } }) =>
        [q.correct.voicing]);
      evenEnough(counts, nameableVoicings(difficulty), `voicing at level ${difficulty}`);
    });

    it(`spreads the inversions evenly at level ${difficulty}`, () => {
      const { counts } = shares('chord-inversion', difficulty,
        (q: { correct: { inversion: string } }) => [q.correct.inversion]);
      // Every inversion some chord in the catalogue has. A sixth chord
      // takes only its triad inversions, so the 3rd comes up less often
      // by having fewer chords to come up on — but not rarely.
      const possible = [...new Set(CHORD_QUALITIES.flatMap((q) => inversionsOf(q).map((i) => i.id)))];
      evenEnough(counts, possible, `inversions at level ${difficulty}`, 1.3);
    });

    it(`spreads the colours evenly at level ${difficulty}`, () => {
      // Counted per colour rather than per answer: a pair is two colours
      // heard at once, and what a learner can read off a base rate is
      // how often each colour comes up at all.
      const { counts } = shares('colour', difficulty,
        (q: { conceptIds: string[] }) => q.conceptIds.map((id) => id.split(':')[1]));
      const curve = {
        1: ['9', '13'],
        2: ['9', '13', 'b9', 'b13'],
        3: ['9', '13', 'b9', 'b13', '#9', '11', '#11', '#5', 'b5'],
        4: ['9', 'b9', '#9', '11', '#11', '13', 'b13', '#5', 'b5', 'alt'],
        5: ['9', 'b9', '#9', '11', '#11', '13', 'b13', '#5', 'b5', 'alt'],
      }[difficulty]!;
      evenEnough(counts, curve, `colours at level ${difficulty}`);
    });
  }

  it('keeps the chord qualities on offer within the same bound', () => {
    for (const difficulty of [1, 3, 5]) {
      const { counts } = shares('chord-quality', difficulty,
        (q: { correct: { quality: string } }) => [q.correct.quality]);
      const enabled = settings.chordQualities
        .filter((id) => requireChordQuality(id).intervals.length <= 4);
      evenEnough(counts, enabled.filter((id) => counts.has(id)),
        `chord quality at level ${difficulty}`);
      expect(counts.size, `level ${difficulty} asks a spread of qualities`)
        .toBeGreaterThanOrEqual(18);
    }
  });

  it('keeps the intervals, modes and keys within it too', () => {
    // The tier weighting still points at the level — these are the
    // exercises that keep it — but what it may not do is make something
    // on offer rare enough to count out.
    const cases: Array<[string, (q: never) => string[], number]> = [
      ['interval', (q: { correct: { interval: string } }) => [q.correct.interval], 13],
      ['mode', (q: { correct: { mode: string } }) => [q.correct.mode], 7],
      ['key', (q: { correct: { key: string } }) => [q.correct.key], 12],
    ] as never;
    for (const [exercise, answerOf, least] of cases) {
      for (const difficulty of [1, 3, 5]) {
        const { counts } = shares(exercise, difficulty, answerOf);
        evenEnough(counts, [...counts.keys()], `${exercise} at level ${difficulty}`);
        expect(counts.size, `${exercise} at level ${difficulty} asks a spread`)
          .toBeGreaterThanOrEqual(least);
      }
    }
  });
});
