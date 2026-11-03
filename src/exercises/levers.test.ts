import { describe, expect, it } from 'vitest';
import { getExerciseType } from './registry';
import type { GenContext } from './types';
import { LEVERS, LEVER_FROM, approachInto, guideTones, type Lever } from './levers';
import { defaultSettings } from '../session/settings';
import { makeRng } from '../lib/rng';
import { FakePerformer, type RecordedNote } from '../test-support';
import { makeChord } from '../music/chords';
import { REGISTER } from '../music/pitch';
import { BASS_INSTRUMENT } from '../audio/instruments';
import { mod } from '../lib/util';

const settings = defaultSettings();
const context = (difficulty: number, seed: number): GenContext => ({
  rng: makeRng(seed),
  difficulty,
  settings,
  targetConcepts: [],
});

const TYPES = ['chord-quality', 'chord-full', 'voicing'];

/** What lever a rendering shows, read off the audio rather than asked for. */
function leverOf(perf: FakePerformer, rootPc: number, chordId: string): Lever | null {
  const stack = perf.notes.filter((n) => n.instrument !== BASS_INSTRUMENT);
  const bass = perf.notes.filter((n) => n.instrument === BASS_INSTRUMENT);
  const entry = Math.min(...stack.map((n) => n.time));
  if (bass.some((n) => n.time < entry - 1e-6)) return 'walk-in';
  const struck = bass.find((n) => n.time >= entry - 1e-6);
  if (struck && struck.velocity < 0.6) return 'soft-bass';
  const guide = guideTones(makeChord(rootPc, chordId));
  if (!guide) return null;
  const soft = new Set([guide.third, guide.seventh]);
  const inGuide = stack.filter((n) => soft.has(mod(n.midi, 12)));
  const outside = stack.filter((n) => !soft.has(mod(n.midi, 12)));
  if (!inGuide.length || !outside.length) return null;
  const quietest = Math.max(...inGuide.map((n) => n.velocity));
  const loudest = Math.min(...outside.map((n) => n.velocity));
  return quietest < loudest * 0.95 ? 'guide-tones' : null;
}

function qualityOf(q: { correct: Record<string, string>; prompt: { sub?: string } }): string | null {
  return q.correct.quality ?? null;
}

describe('the hard levels make the listening harder, not the question unfair', () => {
  it('uses no lever at levels 1 to 3', () => {
    // Written out rather than read off LEVER_FROM: a test that takes its
    // bounds from the constant it is pinning moves when the constant does,
    // and then proves nothing about where the levers start.
    expect(LEVER_FROM).toBe(4);
    for (const id of TYPES) {
      const type = getExerciseType(id)!;
      for (let d = 1; d <= 3; d++) {
        for (let seed = 0; seed < 30; seed++) {
          const q = type.generate(context(d, seed * 19 + d));
          if (!q) continue;
          const perf = new FakePerformer();
          q.play(perf.asPerformer());
          const quality = qualityOf(q);
          const lever = quality ? leverOf(perf, q.keyPc!, quality) : null;
          expect(lever, `${id}@${d}#${seed} used ${lever}`).toBeNull();
          // And nothing sounds before the chord does.
          const stack = perf.notes.filter((n) => n.instrument !== BASS_INSTRUMENT);
          const entry = Math.min(...stack.map((n) => n.time));
          for (const n of perf.notes) {
            expect(n.time, `${id}@${d}#${seed} note before the chord`)
              .toBeGreaterThanOrEqual(entry - 1e-6);
          }
        }
      }
    }
  });

  it('uses each of them at the top of the curve', () => {
    const seen = new Set<Lever>();
    for (const id of ['chord-quality', 'chord-full']) {
      const type = getExerciseType(id)!;
      for (let d = 4; d <= 5; d++) {
        for (let seed = 0; seed < 60; seed++) {
          const q = type.generate(context(d, seed * 31 + d));
          if (!q) continue;
          const perf = new FakePerformer();
          q.play(perf.asPerformer());
          const lever = leverOf(perf, q.keyPc!, q.correct.quality);
          if (lever) seen.add(lever);
        }
      }
    }
    expect([...seen].sort()).toEqual([...LEVERS].sort());
  });

  it('never takes the root away to make a question hard', () => {
    // This is the whole point of the three. The old way of making a chord
    // question hard was to remove the bass, which makes a rootless Dm7 into
    // an F major triad — a different question, not a harder one.
    for (const id of TYPES) {
      const type = getExerciseType(id)!;
      for (let d = 4; d <= 5; d++) {
        for (let seed = 0; seed < 40; seed++) {
          const q = type.generate(context(d, seed * 23 + d));
          if (!q) continue;
          const perf = new FakePerformer();
          q.play(perf.asPerformer());
          const stack = perf.struck.filter((n) => n.instrument !== BASS_INSTRUMENT);
          const lowest = Math.min(...stack.map((n) => n.midi));
          if (mod(lowest, 12) === q.keyPc!) continue;
          const bass = perf.struck.filter((n) => n.instrument === BASS_INSTRUMENT);
          expect(bass.length, `${id}@${d}#${seed}: root-free with no bass`).toBeGreaterThan(0);
          expect(mod(bass[0].midi, 12), `${id}@${d}#${seed}`).toBe(q.keyPc!);
        }
      }
    }
  });

  it('lands the walking bass on the root as the chord strikes', () => {
    let walked = 0;
    for (const id of TYPES) {
      const type = getExerciseType(id)!;
      for (let d = 4; d <= 5; d++) {
        for (let seed = 0; seed < 60; seed++) {
          const q = type.generate(context(d, seed * 7 + d));
          if (!q) continue;
          const perf = new FakePerformer();
          q.play(perf.asPerformer());
          const stack = perf.notes.filter((n) => n.instrument !== BASS_INSTRUMENT);
          const entry = Math.min(...stack.map((n) => n.time));
          const before = perf.notes.filter((n) => n.time < entry - 1e-6);
          if (!before.length) continue;
          walked += 1;
          // Everything before the chord is bass, and there are one or two.
          expect(before.every((n: RecordedNote) => n.instrument === BASS_INSTRUMENT)).toBe(true);
          expect(before.length, `${id}@${d}#${seed}`).toBeLessThanOrEqual(2);
          // Each approach note is inside the bass register and steps toward
          // the root rather than leaping at it.
          const landing = perf.notes.find(
            (n) => n.instrument === BASS_INSTRUMENT && n.time >= entry - 1e-6,
          );
          expect(landing, `${id}@${d}#${seed}: nothing landed`).toBeDefined();
          expect(mod(landing!.midi, 12), `${id}@${d}#${seed}: landed off the root`)
            .toBe(q.keyPc!);
          for (const n of before) {
            expect(n.midi).toBeGreaterThanOrEqual(REGISTER.bass.lo);
            expect(n.midi).toBeLessThanOrEqual(REGISTER.bass.hi);
          }
          const last = before[before.length - 1];
          expect(Math.abs(last.midi - landing!.midi), `${id}@${d}#${seed}: last step`).toBe(1);
        }
      }
    }
    expect(walked, 'the bass really does walk in').toBeGreaterThan(10);
  });

  it('draws an approach that steps in and stays in the register', () => {
    const rng = makeRng(42);
    for (let i = 0; i < 200; i++) {
      const root = REGISTER.bass.lo + (i % (REGISTER.bass.hi - REGISTER.bass.lo + 1));
      const walk = approachInto(rng, root);
      expect(walk.length).toBeLessThanOrEqual(2);
      for (const m of walk) {
        expect(m).toBeGreaterThanOrEqual(REGISTER.bass.lo);
        expect(m).toBeLessThanOrEqual(REGISTER.bass.hi);
      }
      if (walk.length) expect(Math.abs(walk[walk.length - 1] - root)).toBe(1);
      // Two notes approach from further out, in one direction.
      if (walk.length === 2) {
        expect(Math.sign(walk[0] - root)).toBe(Math.sign(walk[1] - root));
        expect(Math.abs(walk[0] - root)).toBe(3);
      }
    }
  });
});
