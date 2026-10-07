import type { Chord } from './chords';
import { REGISTER, foldInto, pcAtOrAbove, type Midi } from './pitch';
import { mod } from '../lib/util';

/**
 * Turns a chord into actual pitches.
 *
 * The goal is a voicing a pianist would plausibly play, because an ear-training
 * tool that stacks every chord in root position teaches the shape of the stack
 * rather than the sound of the chord. Candidate voicings are generated and then
 * scored for voice leading, spacing and muddiness, and the best one wins.
 */
export type VoicingStyle =
  /** Root position, tones close together. The clearest way to hear a chord. */
  | 'close'
  /** Root in the left hand, colour tones spread above. */
  | 'spread'
  /** Close voicing with the second voice from the top dropped an octave. */
  | 'drop2'
  /** Root omitted — how a pianist comps behind a bass player. */
  | 'rootless'
  /** Root and guide tones only. */
  | 'shell';

export const VOICING_STYLES: VoicingStyle[] = ['close', 'spread', 'drop2', 'rootless', 'shell'];

export interface VoicingOptions {
  style?: VoicingStyle;
  /** Add a root in the bass register beneath the voicing. */
  bass?: boolean;
  lo?: Midi;
  hi?: Midi;
  /** Previous voicing's notes, so successive chords move as little as possible. */
  prev?: readonly Midi[];
  /** Upper bound on voices in the right-hand stack. */
  maxNotes?: number;
  /** Forces the lowest chord tone to a given pitch class (used for inversions). */
  bottomPc?: number;
}

export interface Voicing {
  /** Chord tones, ascending. */
  notes: Midi[];
  /** Bass note if one was requested. */
  bass?: Midi;
  /** Everything that sounds, ascending — convenience for the audio layer. */
  all: Midi[];
  style: VoicingStyle;
}

interface Tone {
  pc: number;
  /** Tones written as 9ths/11ths/13ths must stay above the core stack. */
  upper: boolean;
  essential: boolean;
}

function selectTones(chord: Chord, style: VoicingStyle, maxNotes: number): Tone[] {
  const q = chord.quality;
  const essential = new Set(q.essential ?? q.intervals.filter((i) => i !== 0 && i !== 7));
  let intervals = [...q.intervals];

  if (style === 'shell') {
    intervals = intervals.filter((i) => i === 0 || essential.has(i));
  } else if (style === 'rootless' && intervals.length >= 4) {
    intervals = intervals.filter((i) => i !== 0);
  }

  // Thin from the droppable list first — the 5th is what a pianist leaves out.
  const droppable = [...(q.droppable ?? [7])];
  while (intervals.length > maxNotes && droppable.length) {
    const drop = droppable.shift()!;
    intervals = intervals.filter((i) => i !== drop);
  }
  // Still too many: shed non-essential tones from the bottom up, keeping colour.
  while (intervals.length > maxNotes) {
    const idx = intervals.findIndex((i) => i !== 0 && !essential.has(i));
    if (idx === -1) break;
    intervals.splice(idx, 1);
  }

  return intervals.map((i) => ({
    pc: mod(chord.rootPc + i, 12),
    upper: i >= 13,
    essential: essential.has(i),
  }));
}

/** Stacks tones upward from a bottom note, keeping upper-structure tones on top. */
function stack(tones: Tone[], bottom: Midi, hi: Midi): Midi[] | null {
  const core = tones.filter((t) => !t.upper);
  const upper = tones.filter((t) => t.upper);
  const notes: Midi[] = [];
  let cursor = bottom;
  for (let i = 0; i < core.length; i++) {
    const note = i === 0 ? bottom : pcAtOrAbove(core[i].pc, cursor + 1);
    notes.push(note);
    cursor = note;
  }
  for (const t of upper) {
    // Keep 9ths and above genuinely above the core stack.
    const note = pcAtOrAbove(t.pc, Math.max(cursor + 1, bottom + 11));
    notes.push(note);
    cursor = note;
  }
  notes.sort((a, b) => a - b);
  if (notes[notes.length - 1] > hi) return null;
  return notes;
}

function voiceLeadingCost(notes: readonly Midi[], prev: readonly Midi[]): number {
  if (!prev.length) return 0;
  let cost = 0;
  for (const n of notes) {
    let best = Infinity;
    for (const p of prev) best = Math.min(best, Math.abs(n - p));
    cost += best;
  }
  const centroid = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  cost += Math.abs(centroid(notes) - centroid(prev)) * 0.8;
  return cost / notes.length;
}

function spacingPenalty(notes: readonly Midi[]): number {
  let penalty = 0;
  for (let i = 1; i < notes.length; i++) {
    const gap = notes[i] - notes[i - 1];
    // Half steps are a colour up top and mud down low.
    if (gap <= 2 && notes[i - 1] < 64) penalty += (3 - gap) * 4;
    // A gap bigger than an octave inside the stack sounds like two chords.
    if (gap > 12) penalty += (gap - 12) * 1.5;
  }
  const span = notes[notes.length - 1] - notes[0];
  if (span > 21) penalty += (span - 21) * 1.2;
  if (span < 7 && notes.length > 2) penalty += (7 - span) * 1.5;
  // Thirds below this point turn to mud on any instrument.
  if (notes[0] < 52) penalty += (52 - notes[0]) * 2;
  return penalty;
}

export function voiceChord(chord: Chord, opts: VoicingOptions = {}): Voicing {
  const style = opts.style ?? 'close';
  const lo = opts.lo ?? REGISTER.voicing.lo;
  const hi = opts.hi ?? REGISTER.voicing.hi;
  const maxNotes = opts.maxNotes ?? 5;
  const tones = selectTones(chord, style, maxNotes);
  const core = tones.filter((t) => !t.upper);

  // Candidate bottom notes: each core tone as the lowest voice (i.e. each
  // inversion), in each octave that fits the register.
  const candidates: Midi[][] = [];
  const rotations = style === 'close' || opts.bottomPc !== undefined ? 1 : core.length;
  for (let r = 0; r < Math.max(1, rotations); r++) {
    const rotated = [...core.slice(r), ...core.slice(0, r)];
    const bottomPc = opts.bottomPc !== undefined ? mod(opts.bottomPc, 12) : rotated[0]?.pc;
    if (bottomPc === undefined) continue;
    const ordered = [
      ...rotated.filter((t) => t.pc === bottomPc).slice(0, 1),
      ...rotated.filter((t) => t.pc !== bottomPc),
      ...tones.filter((t) => t.upper),
    ];
    for (let bottom = pcAtOrAbove(bottomPc, lo); bottom <= lo + 12; bottom += 12) {
      const notes = stack(ordered, bottom, hi);
      if (notes) candidates.push(notes);
    }
  }
  if (!candidates.length) {
    const fallback = tones.map((t) => foldInto(t.pc + 60, lo, hi)).sort((a, b) => a - b);
    candidates.push(Array.from(new Set(fallback)));
  }

  let best = candidates[0];
  let bestScore = Infinity;
  for (const notes of candidates) {
    const score = spacingPenalty(notes) + voiceLeadingCost(notes, opts.prev ?? []) * 2.5;
    if (score < bestScore) {
      bestScore = score;
      best = notes;
    }
  }

  if (style === 'drop2' && best.length >= 3) {
    const dropped = [...best];
    dropped[dropped.length - 2] -= 12;
    dropped.sort((a, b) => a - b);
    if (dropped[0] >= lo - 12) best = dropped;
  }

  const bass = opts.bass
    ? foldInto(chord.rootPc + 48, REGISTER.bass.lo, Math.min(REGISTER.bass.hi, best[0] - 7))
    : undefined;

  return {
    notes: best,
    bass,
    all: bass === undefined ? best : [bass, ...best],
    style,
  };
}

/** Voices a sequence, threading each chord's voice leading from the last. */
export function voiceProgression(
  chords: readonly Chord[],
  opts: VoicingOptions = {},
): Voicing[] {
  const out: Voicing[] = [];
  let prev = opts.prev;
  for (const chord of chords) {
    const v = voiceChord(chord, { ...opts, prev });
    out.push(v);
    prev = v.notes;
  }
  return out;
}

/** Ascending arpeggio of the chord, for the "what you heard" replay. */
export function arpeggiate(chord: Chord, bottom = 55, hi = 86): Midi[] {
  const notes: Midi[] = [];
  let cursor = bottom - 1;
  for (const i of chord.quality.intervals) {
    const note = pcAtOrAbove(mod(chord.rootPc + i, 12), cursor + 1);
    if (note > hi) break;
    notes.push(note);
    cursor = note;
  }
  return notes;
}
