import { mod } from '../lib/util';

/** MIDI note number. Middle C (C4) is 60. */
export type Midi = number;
/** Pitch class, 0 = C … 11 = B. */
export type PitchClass = number;

export type Accidental = 'sharp' | 'flat' | 'both';

export const SHARP_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
export const FLAT_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];

/**
 * Spelling used when no key context is available. Jazz lead sheets lean on
 * flats for the "black key" roots that most often appear as chord roots
 * (E♭, A♭, B♭, D♭) and on sharps for F♯.
 */
const NEUTRAL_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

export const PITCH_CLASSES: PitchClass[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

export function pcName(pc: PitchClass, pref: Accidental = 'both'): string {
  const i = mod(Math.round(pc), 12);
  if (pref === 'sharp') return SHARP_NAMES[i];
  if (pref === 'flat') return FLAT_NAMES[i];
  return NEUTRAL_NAMES[i];
}

/** Both spellings, for answer buttons where the user may think either way. */
export function pcNameDual(pc: PitchClass): string {
  const i = mod(Math.round(pc), 12);
  return SHARP_NAMES[i] === FLAT_NAMES[i] ? SHARP_NAMES[i] : `${SHARP_NAMES[i]}/${FLAT_NAMES[i]}`;
}

export const pcOf = (midi: Midi): PitchClass => mod(Math.round(midi), 12);

export const octaveOf = (midi: Midi): number => Math.floor(Math.round(midi) / 12) - 1;

export function midiName(midi: Midi, pref: Accidental = 'both'): string {
  return `${pcName(pcOf(midi), pref)}${octaveOf(midi)}`;
}

/** Equal temperament, A4 = 440 Hz. Accepts fractional MIDI for detuning. */
export function midiToFreq(midi: number, a4 = 440): number {
  return a4 * Math.pow(2, (midi - 69) / 12);
}

/** Smallest absolute distance between two pitch classes, 0–6 semitones. */
export function pcDistance(a: PitchClass, b: PitchClass): number {
  const d = mod(a - b, 12);
  return Math.min(d, 12 - d);
}

/** Moves `midi` by octaves until it lands in [lo, hi]; clamps if the window is too narrow. */
export function foldInto(midi: Midi, lo: Midi, hi: Midi): Midi {
  let n = midi;
  while (n < lo) n += 12;
  while (n > hi) n -= 12;
  if (n < lo) n += 12;
  return n;
}

/** Lowest pitch at or above `floorMidi` with the given pitch class. */
export function pcAtOrAbove(pc: PitchClass, floorMidi: Midi): Midi {
  return floorMidi + mod(pc - floorMidi, 12);
}

/** Jaccard similarity of two pitch-class sets — used to find confusable chords. */
export function pcSetSimilarity(a: readonly number[], b: readonly number[]): number {
  const sa = new Set(a.map((n) => mod(n, 12)));
  const sb = new Set(b.map((n) => mod(n, 12)));
  let shared = 0;
  for (const n of sa) if (sb.has(n)) shared++;
  const union = sa.size + sb.size - shared;
  return union === 0 ? 0 : shared / union;
}

/** Comfortable registers, as MIDI ranges, for the different roles in a texture. */
export const REGISTER = {
  bass: { lo: 33, hi: 50 },
  /** Where jazz piano left/right hand voicings sit. */
  voicing: { lo: 52, hi: 79 },
  melody: { lo: 60, hi: 84 },
  drone: { lo: 36, hi: 48 },
} as const;
