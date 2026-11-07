import { describe, expect, it } from 'vitest';
import { getExerciseType } from './registry';
import type { GenContext } from './types';
import { defaultSettings, normaliseSettings } from '../session/settings';
import { makeRng } from '../lib/rng';
import { PROGRESSIONS, progressionConceptId } from '../music/progressions';
import { voicingChoices } from './voicing-plan';
import type { VoicingStyle } from '../music/voicing';

const settings = defaultSettings();
const context = (difficulty: number, seed: number, over: Partial<GenContext> = {}): GenContext => ({
  rng: makeRng(seed),
  difficulty,
  settings,
  targetConcepts: [],
  ...over,
});

/** How often each voicing style comes up for one progression at one level. */
function styles(
  progressionId: string,
  difficulty: number,
  mode: 'curve' | 'plain' | 'realistic' = 'curve',
  runs = 240,
): Map<VoicingStyle, number> {
  const type = getExerciseType('progression')!;
  const tuned = normaliseSettings({ ...settings, voicingMode: mode });
  const counts = new Map<VoicingStyle, number>();
  for (let seed = 0; seed < runs; seed++) {
    const q = type.generate(context(difficulty, seed * 13 + 7, {
      settings: tuned,
      targetConcepts: [progressionConceptId(progressionId)],
    }));
    if (!q || q.correct.progression !== progressionId) continue;
    const style = q.voicing as VoicingStyle;
    counts.set(style, (counts.get(style) ?? 0) + 1);
  }
  return counts;
}

const commonest = (counts: Map<VoicingStyle, number>) =>
  [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];

describe('a progression is comped the way it is comped', () => {
  // The cheat sheet has named these all along; the exercises ignored them, so
  // a learner could read that a ii–V–I is comped rootless and never hear one.
  const cases: Array<[string, VoicingStyle]> = [
    ['ii-V-I', 'rootless'],
    ['blues-opening', 'shell'],
    ['so-what', 'quartal'],
    ['minor-ii-V-i-alt', 'upperStructure'],
  ];

  for (const [id, wanted] of cases) {
    it(`reaches for ${wanted} on ${id} at the top of the curve`, () => {
      const def = PROGRESSIONS.find((p) => p.id === id)!;
      expect(def.voicing, `${id} recommends one`).toBe(wanted);
      const counts = styles(id, 5);
      const total = [...counts.values()].reduce((a, b) => a + b, 0);
      expect(total, `${id} questions really come up`).toBeGreaterThan(30);
      expect(commonest(counts), `${id}: ${JSON.stringify([...counts])}`).toBe(wanted);
      // Not to the exclusion of everything else: a learner still meets the
      // other shapes on these changes.
      expect(counts.size, `${id} only ever plays one shape`).toBeGreaterThan(1);
    });
  }

  it('leaves the lower levels alone, where hearing the changes is the job', () => {
    for (const [id, wanted] of cases) {
      for (const level of [1, 2, 3]) {
        const counts = styles(id, level);
        for (const style of counts.keys()) {
          expect(voicingChoices('curve', level), `${id}@${level} used ${style}`).toContain(style);
        }
        // And at level 1 the curve offers one shape, so it cannot be steered.
        if (level === 1) expect([...counts.keys()]).toEqual(['close']);
        void wanted;
      }
    }
  });

  it('leaves root position only alone, which is the whole point of it', () => {
    for (const [id] of cases) {
      const counts = styles(id, 5, 'plain');
      expect([...counts.keys()], id).toEqual(['close']);
    }
  });

  it('still steers in realistic mode, where every level is the top of the curve', () => {
    const counts = styles('so-what', 2, 'realistic');
    expect(commonest(counts), JSON.stringify([...counts])).toBe('quartal');
  });
});
