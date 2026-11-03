import { describe, expect, it } from 'vitest';
import { EXERCISE_TYPES, getExerciseType } from './registry';
import type { GenContext } from './types';
import { defaultSettings } from '../session/settings';
import { makeRng } from '../lib/rng';
import { FakePerformer } from '../test-support';
import {
  CHORD_QUALITIES, chordDegrees, chordSymbol, makeChord, requireChordQuality,
} from '../music/chords';
import { couldSound, voiceChord } from '../music/voicing';
import { PROGRESSIONS, progressionConceptId, realiseProgression } from '../music/progressions';
import { BASS_INSTRUMENT } from '../audio/instruments';
import { mod } from '../lib/util';

const settings = defaultSettings();
const context = (difficulty: number, seed: number): GenContext => ({
  rng: makeRng(seed),
  difficulty,
  settings,
  targetConcepts: [],
});

/** The pitch classes a chord's own symbol names. */
const own = (rootPc: number, qualityId: string) =>
  new Set(requireChordQuality(qualityId).intervals.map((i) => mod(rootPc + i, 12)));

/** Whether anything sounded that the chord symbol does not name. */
function soundedATension(notes: readonly number[], rootPc: number, qualityId: string): boolean {
  const tones = own(rootPc, qualityId);
  return notes.some((m) => !tones.has(mod(m, 12)));
}

describe('the exercises sound the chord a pianist would play', () => {
  it('voices a rootless seventh chord with its 9th, in both forms', () => {
    for (const [rootPc, id] of [[2, 'm7'], [0, 'maj7'], [7, '7']] as const) {
      const chord = makeChord(rootPc, id);
      for (const form of ['A', 'B'] as const) {
        const v = voiceChord(chord, { style: 'rootless', tensions: true, rootlessForm: form });
        const pcs = new Set(v.notes.map((m) => mod(m, 12)));
        expect(pcs.size, `${id} form ${form}`).toBe(4);
        expect(chordDegrees(chord, v.notes), `${id} form ${form}`).toContain('9');
        expect(v.form).toBe(form);
      }
      // A and B are the same four notes, rotated.
      const a = voiceChord(chord, { style: 'rootless', tensions: true, rootlessForm: 'A' });
      const b = voiceChord(chord, { style: 'rootless', tensions: true, rootlessForm: 'B' });
      expect(new Set(a.notes.map((m) => mod(m, 12))))
        .toEqual(new Set(b.notes.map((m) => mod(m, 12))));
      expect(chordDegrees(chord, a.notes)).not.toEqual(chordDegrees(chord, b.notes));
    }
  });

  it('uses both rootless forms across single-chord questions', () => {
    // Every one of these used to be form A, because a single chord has no
    // chord before it to alternate from and the engine's default was A.
    const seen = new Set<string>();
    for (const id of ['chord-quality', 'voicing']) {
      const type = getExerciseType(id)!;
      for (let d = 3; d <= 5; d++) {
        for (let seed = 0; seed < 60; seed++) {
          const perf = new FakePerformer();
          const q = type.generate(context(d, seed * 97 + d));
          if (!q) continue;
          q.play(perf.asPerformer());
          const voicing = perf.chords[0];
          if (voicing?.form) seen.add(voicing.form);
        }
      }
    }
    expect([...seen].sort()).toEqual(['A', 'B']);
  });

  it('sounds the ii–V–I’s G7 with its 9th once the voicing is not close', () => {
    // The V is written as a plain dominant 7th, and the 9th comes from the
    // voicing — which is the arrangement the cheat sheet has always taught
    // and which the questions did not follow until now.
    const type = getExerciseType('progression')!;
    let checked = 0;
    for (let d = 1; d <= 5; d++) {
      for (let seed = 0; seed < 50; seed++) {
        const q = type.generate({
          ...context(d, seed * 53 + d),
          targetConcepts: [progressionConceptId('ii-V-I')],
        });
        if (!q || q.correct.progression !== 'ii-V-I' || q.voicing === 'close') continue;
        const perf = new FakePerformer();
        q.play(perf.asPerformer());
        const dominant = realiseProgression(
          PROGRESSIONS.find((p) => p.id === 'ii-V-I')!, q.keyPc!,
        )[1].chord;
        const degrees = chordDegrees(dominant, perf.chords[1].notes);
        expect(degrees, `${q.voicing} at level ${d}, seed ${seed}`).toContain('9');
        checked += 1;
      }
    }
    expect(checked, 'non-close ii–V–I questions really come up').toBeGreaterThan(10);
  });

  it('leaves close position plain, so the plainest setting is unchanged', () => {
    for (const id of ['chord-quality', 'chord-full', 'progression']) {
      const type = getExerciseType(id)!;
      for (let d = 1; d <= 5; d++) {
        for (let seed = 0; seed < 40; seed++) {
          const q = type.generate(context(d, seed * 31 + d));
          if (!q || q.voicing !== 'close') continue;
          const perf = new FakePerformer();
          q.play(perf.asPerformer());
          if (id === 'progression') {
            const realised = realiseProgression(
              PROGRESSIONS.find((p) => p.id === q.correct.progression)!, q.keyPc!,
            );
            realised.forEach((r, i) => {
              const tones = new Set(r.chord.quality.intervals.map((iv) => mod(r.chord.rootPc + iv, 12)));
              for (const m of perf.chords[i].notes) {
                expect(tones.has(mod(m, 12)), `${id}@${d}#${seed} chord ${i}`).toBe(true);
              }
            });
          } else {
            const qualityId = q.correct.quality ?? CHORD_QUALITIES[0].id;
            expect(
              soundedATension(perf.chords[0].notes, q.keyPc!, qualityId),
              `${id}@${d}#${seed}`,
            ).toBe(false);
          }
        }
      }
    }
  });

  it('never lets a tension give the voicing away', () => {
    // The colour is chosen once per question and applied to every candidate
    // shape, so a 9th cannot mean "not close position". Both halves have to
    // happen or the claim is empty.
    const type = getExerciseType('voicing')!;
    const withTension = new Set<string>();
    const without = new Set<string>();
    for (let d = 3; d <= 5; d++) {
      for (let seed = 0; seed < 80; seed++) {
        const q = type.generate(context(d, seed * 17 + d));
        if (!q) continue;
        const perf = new FakePerformer();
        q.play(perf.asPerformer());
        const stack = perf.notes.filter((n) => n.instrument !== BASS_INSTRUMENT).map((n) => n.midi);
        const tones = own(q.keyPc!, qualityIdOf(q.prompt.sub!, q.keyPc!));
        // Which way round it went does not matter; that both happen for both
        // answers does.
        const tense = stack.some((m) => !tones.has(mod(m, 12)));
        (tense ? withTension : without).add(q.correct.voicing);
      }
    }
    for (const style of ['close', 'rootless']) {
      expect(withTension, `${style} sometimes sounds a tension`).toContain(style);
      expect(without, `${style} sometimes does not`).toContain(style);
    }
  });

  it('offers no wrong answer that fits the notes that sounded', () => {
    for (const id of ['chord-quality', 'chord-full']) {
      const type = getExerciseType(id)!;
      for (let d = 1; d <= 5; d++) {
        for (let seed = 0; seed < 40; seed++) {
          const q = type.generate(context(d, seed * 71 + d));
          if (!q) continue;
          const perf = new FakePerformer();
          q.play(perf.asPerformer());
          const sounded = new Set(perf.notes.map((n) => mod(n.midi, 12)));
          const field = q.fields.find((f) => f.key === 'quality')!;
          if (field.options.length < 2) continue;
          for (const option of field.options) {
            if (option.id === q.correct.quality) continue;
            for (let root = 0; root < 12; root++) {
              expect(
                couldSound(makeChord(root, option.id), sounded, true),
                `${id}@${d}#${seed}: ${option.id} on ${root} also fits`,
              ).toBe(false);
            }
          }
        }
      }
    }
  });

  it('keeps the inversion, mode and key exercises plain', () => {
    // They teach something other than colour, and a tension in them is one
    // more thing to listen past for no gain.
    for (const id of ['chord-inversion', 'mode', 'key']) {
      const type = EXERCISE_TYPES.find((t) => t.id === id);
      if (!type) continue;
      for (let d = 1; d <= 5; d++) {
        for (let seed = 0; seed < 25; seed++) {
          const q = type.generate(context(d, seed * 13 + d));
          if (!q) continue;
          const perf = new FakePerformer();
          q.play(perf.asPerformer());
          for (const voicing of perf.chords) {
            expect(voicing.notes.length, `${id}@${d}#${seed}`).toBeGreaterThan(0);
          }
        }
      }
    }
  });
});

/**
 * Reads the quality back out of the voicing question's prompt.
 *
 * The question prints the chord rather than recording it as a concept, since
 * the chord is not what it is asking about.
 */
function qualityIdOf(sub: string, rootPc: number): string {
  const symbol = sub.split(' — ')[0];
  const match = CHORD_QUALITIES.find(
    (q) => chordSymbol(makeChord(rootPc, q.id), settings.accidental) === symbol,
  );
  if (!match) throw new Error(`Cannot read a quality out of "${sub}"`);
  return match.id;
}
