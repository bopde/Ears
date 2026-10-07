import type { Rng } from '../lib/rng';
import type { ScaleDef } from './scales';
import { clamp, mod } from '../lib/util';

export interface PhraseNote {
  midi: number;
  /** Onset in beats from the start of the phrase. */
  beat: number;
  /** Length in beats. */
  beats: number;
  velocity: number;
}

export interface PhraseOptions {
  tonicMidi: number;
  scale: ScaleDef;
  rng: Rng;
  /** Number of notes. */
  length?: number;
  /** 0–1: how insistently the phrase lands on the mode's characteristic degrees. */
  colour?: number;
  /** End on the tonic. Turning this off makes the tonal centre much harder to hear. */
  resolve?: boolean;
  /** Start the phrase on the tonic. */
  startOnTonic?: boolean;
  /** Lowest and highest pitch the line may reach. */
  lo?: number;
  hi?: number;
}

const RHYTHMS: number[][] = [
  [0.5, 0.5, 0.5, 0.5],
  [1, 0.5, 0.5, 1],
  [0.5, 0.5, 1, 0.5, 0.5],
  [0.75, 0.25, 0.5, 0.5],
  [0.5, 1, 0.5, 0.5, 0.5],
  [1, 1, 0.5, 0.5],
];

/**
 * Generates a short melodic line from a scale.
 *
 * Phrases are not random note soup: they move mostly by step, arc up and back
 * down, and are guaranteed to sound the degrees that distinguish the mode —
 * otherwise a Dorian phrase that never touches the natural 6th is simply an
 * Aeolian phrase, and the question has no right answer.
 */
export function generatePhrase(opts: PhraseOptions): PhraseNote[] {
  const { tonicMidi, scale, rng } = opts;
  const length = opts.length ?? rng.range(6, 9);
  const colour = opts.colour ?? 0.7;
  const resolve = opts.resolve ?? true;
  const lo = opts.lo ?? tonicMidi - 5;
  const hi = opts.hi ?? tonicMidi + 14;

  const degrees = scale.degrees;
  const n = degrees.length;
  /** Scale index → concrete pitch, where index may run past an octave. */
  const pitchAt = (i: number) => tonicMidi + degrees[mod(i, n)] + Math.floor(i / n) * 12;
  const isCharacteristic = (i: number) => scale.characteristic.includes(degrees[mod(i, n)]);

  const indices: number[] = [];
  let index = opts.startOnTonic ?? true ? 0 : rng.pick([0, 2, 4, n]);
  // A simple arc: climb through the first half, fall through the second.
  const apex = Math.floor(length * rng.range(45, 65) / 100);

  for (let step = 0; step < length; step++) {
    indices.push(index);
    const climbing = step < apex;
    const wantsColour = rng.next() < colour;
    const options: number[] = [];
    for (const delta of [-3, -2, -1, 1, 2, 3, 4]) {
      const next = index + delta;
      const pitch = pitchAt(next);
      if (pitch < lo || pitch > hi) continue;
      let weight = Math.abs(delta) === 1 ? 6 : Math.abs(delta) === 2 ? 3 : 1;
      if (climbing === delta > 0) weight *= 2.2;
      if (wantsColour && isCharacteristic(next)) weight *= 3.5;
      for (let w = 0; w < Math.round(weight); w++) options.push(next);
    }
    index = options.length ? rng.pick(options) : clamp(index - 1, -n, n * 2);
  }

  if (resolve) indices[indices.length - 1] = indices[indices.length - 1] >= n ? n : 0;

  // Guarantee the mode's colour is actually heard. This has to run after the
  // resolution above, which can otherwise overwrite the only note that
  // distinguished the mode from its neighbour.
  if (scale.characteristic.length && indices.length >= 3 && !indices.some(isCharacteristic)) {
    const wanted = degrees.findIndex((d) => scale.characteristic.includes(d));
    let bestPos = -1;
    let bestIndex = 0;
    let bestCost = Infinity;
    if (wanted >= 0) {
      // Substitute wherever it disturbs the contour least.
      for (let i = 1; i < indices.length - 1; i++) {
        const octave = Math.floor(indices[i] / n);
        for (const o of [octave - 1, octave, octave + 1]) {
          const candidate = wanted + o * n;
          const pitch = pitchAt(candidate);
          if (pitch < lo || pitch > hi) continue;
          const cost = Math.abs(pitch - pitchAt(indices[i]));
          if (cost < bestCost) {
            bestCost = cost;
            bestPos = i;
            bestIndex = candidate;
          }
        }
      }
    }
    if (bestPos >= 0) indices[bestPos] = bestIndex;
  }

  const rhythm = rng.pick(RHYTHMS);
  const notes: PhraseNote[] = [];
  let beat = 0;
  for (let i = 0; i < indices.length; i++) {
    const beats = i === indices.length - 1 ? 1.5 : rhythm[i % rhythm.length];
    notes.push({
      midi: pitchAt(indices[i]),
      beat,
      beats,
      velocity: clamp(0.62 + (i === 0 ? 0.1 : 0) + rng.next() * 0.16, 0, 1),
    });
    beat += beats;
  }
  return notes;
}

/** The scale run itself, ascending then descending — the plainest way to show a mode. */
export function scaleRun(
  tonicMidi: number,
  scale: ScaleDef,
  opts: { descend?: boolean; beats?: number } = {},
): PhraseNote[] {
  const step = opts.beats ?? 0.5;
  const up = [...scale.degrees.map((d) => tonicMidi + d), tonicMidi + 12];
  const seq = opts.descend === false ? up : [...up, ...up.slice(0, -1).reverse()];
  return seq.map((midi, i) => ({
    midi,
    beat: i * step,
    beats: step,
    velocity: 0.66,
  }));
}

export const phraseDurationBeats = (notes: readonly PhraseNote[]): number =>
  notes.reduce((end, n) => Math.max(end, n.beat + n.beats), 0);
