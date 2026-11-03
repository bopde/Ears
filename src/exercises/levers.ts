import type { Chord } from '../music/chords';
import type { Voicing } from '../music/voicing';
import { REGISTER, type Midi } from '../music/pitch';
import { BASS_INSTRUMENT } from '../audio/instruments';
import { polyphonyGain, type Performer } from '../audio/performer';
import { clamp, mod } from '../lib/util';
import type { Rng } from '../lib/rng';

/**
 * One thing made harder at the top of the curve, chosen per question.
 *
 * The old way of making a chord question hard was to take context away: no
 * bass, no root, nothing to measure against. That does make it harder, and it
 * also makes it a different question — a rootless Dm7 over silence is an F
 * major triad, and a learner who answers that has heard correctly. These
 * three make the listening harder while leaving the root audible, which is
 * the difference between a hard question and an unfair one.
 *
 * One per question, never two: each is a distinct thing to get used to, and
 * stacking them tests stamina rather than hearing.
 */
export type Lever =
  /** The 3rd and 7th played softer, so the quality has to be dug out. */
  | 'guide-tones'
  /** The bass walks in and lands on the root as the chord strikes. */
  | 'walk-in'
  /** The bass further under the chord, present but not leaning on it. */
  | 'soft-bass';

export const LEVERS: Lever[] = ['guide-tones', 'walk-in', 'soft-bass'];

/** The level at which the levers start. Below it, a question is plain. */
export const LEVER_FROM = 4;

export function chooseLever(rng: Rng, difficulty: number): Lever | undefined {
  return clamp(Math.round(difficulty), 1, 5) >= LEVER_FROM ? rng.pick(LEVERS) : undefined;
}

/** How much of the usual velocity a softened guide tone keeps. */
const GUIDE_TONE_LEVEL = 0.7;
/** Velocity of a softened bass, against the usual 0.72. */
const SOFT_BASS_LEVEL = 0.55;
/** Seconds per approach note walking into the chord. */
const WALK_STEP = 0.34;

/** The 3rd and the 7th: the two notes that say what a chord is. */
export function guideTones(chord: Chord): { third: number; seventh: number } | null {
  const iv = chord.quality.intervals;
  const third = iv.find((i) => i < 13 && (mod(i, 12) === 3 || mod(i, 12) === 4));
  const seventh = iv.find((i) => i >= 9 && i <= 11);
  if (third === undefined || seventh === undefined) return null;
  return {
    third: mod(chord.rootPc + third, 12),
    seventh: mod(chord.rootPc + seventh, 12),
  };
}

/**
 * One or two notes that walk into `root` and stop there.
 *
 * A step above or below, approached from a step further out where there is
 * room — the shape a bass player uses to arrive somewhere, and the reason it
 * makes a question harder is that the ear has been following a line and has
 * to switch to hearing a chord at exactly the moment it lands.
 *
 * Returns an empty list where the register cannot hold the approach, rather
 * than folding it into an octave it would no longer be an approach from.
 */
export function approachInto(rng: Rng, root: Midi): Midi[] {
  const from = rng.chance(0.5) ? -1 : 1;
  const inside = (m: Midi) => m >= REGISTER.bass.lo && m <= REGISTER.bass.hi;
  const near = root + from;
  if (!inside(near)) return [];
  const far = root + from * 3;
  return rng.chance(0.5) && inside(far) ? [far, near] : [near];
}

export interface VoicingPlayback {
  lever?: Lever;
  /** The approach notes, drawn once so a replay sounds like the first play. */
  walk?: readonly Midi[];
  /** Gap between successive notes of the stack, in seconds. */
  roll: number;
  /** How long the chord is held. */
  seconds: number;
  velocity: number;
}

/**
 * Schedules one chord, with whichever lever this question drew.
 *
 * Shared by the chord questions and the voicing quiz so the two cannot drift
 * apart about what "level 5" sounds like.
 */
export function playVoicing(
  perf: Performer,
  chord: Chord,
  voicing: Voicing,
  opts: VoicingPlayback,
): number {
  const origin = perf.origin();
  const walk = opts.lever === 'walk-in' && voicing.bass !== undefined ? (opts.walk ?? []) : [];
  // The chord waits for the line to arrive, so the root still lands with it.
  const strike = origin + walk.length * WALK_STEP;
  const gain = polyphonyGain(voicing.all.length);
  walk.forEach((midi, i) => {
    perf.note(midi, origin + i * WALK_STEP, WALK_STEP * 0.92, 0.62, {
      instrument: BASS_INSTRUMENT,
      gain,
    });
  });

  const guide = opts.lever === 'guide-tones' ? guideTones(chord) : null;
  perf.chord(voicing, strike, 0, {
    beats: opts.seconds / perf.beatSeconds,
    velocity: opts.velocity,
    roll: opts.roll,
    soften: guide ? { pcs: [guide.third, guide.seventh], to: GUIDE_TONE_LEVEL } : undefined,
    bassVelocity: opts.lever === 'soft-bass' ? SOFT_BASS_LEVEL : undefined,
  });
  return walk.length * WALK_STEP + opts.seconds + opts.roll * voicing.notes.length + 0.2;
}
