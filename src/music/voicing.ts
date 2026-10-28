import type { Chord } from './chords';
import { REGISTER, VOICING_FLOOR, foldInto, pcAtOrAbove, type Midi } from './pitch';
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
  /**
   * Any inversion in the right hand, spaced wide.
   *
   * Written to sit over a separate bass note, which is what states the root:
   * on its own the stack is as likely to be in third inversion as in root
   * position, so the bass below it is doing the work.
   */
  | 'spread'
  /** Close voicing with the second voice from the top dropped an octave. */
  | 'drop2'
  /** Root omitted — how a pianist comps behind a bass player. */
  | 'rootless'
  /** Root and guide tones only. */
  | 'shell'
  /** Stacked fourths — the "So What" sound, open and deliberately vague. */
  | 'quartal'
  /** Guide tones underneath, a plain triad built on the chord's tensions above. */
  | 'upperStructure';

export const VOICING_STYLES: VoicingStyle[] = [
  'close', 'spread', 'drop2', 'rootless', 'shell', 'quartal', 'upperStructure',
];

/**
 * Which of the two standard rootless shapes to use.
 *
 * A is 3–5–7–9 and B is 7–9–3–5: the same four tones, rotated. A pianist
 * alternates them through a ii–V so the hand barely moves, which is the whole
 * point of learning both.
 */
export type RootlessForm = 'A' | 'B';

export const ROOTLESS_FORMS: Array<{ id: RootlessForm; degrees: string }> = [
  { id: 'A', degrees: '3 5 ♭7 9' },
  { id: 'B', degrees: '♭7 9 3 5' },
];

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
  /**
   * Pins each chord to its own root, which `bottomPc` cannot do across a
   * progression because every chord's root is a different pitch class.
   */
  rootPosition?: boolean;
  /** Which rootless shape to use. Alternates through a progression when unset. */
  rootlessForm?: RootlessForm;
  /**
   * Allow tensions the chord does not itself name — the 9th a pianist adds to
   * every rootless voicing, the 11th and the 13th a quartal stack walks
   * through.
   *
   * Off by default, and deliberately so. Those notes are right at a piano and
   * wrong in an ear-training question: a rootless Dm7 voiced F A C E sounds a
   * 9th, and "m7" stops being the only defensible answer. The reference page
   * turns them on, because there the chord is already named.
   */
  tensions?: boolean;
  /** Pitch class for the bass note. Defaults to the root. */
  bassPc?: number;
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

/** The first interval in the chord whose place in the stack matches. */
function toneAt(chord: Chord, test: (interval: number) => boolean): number | undefined {
  return chord.quality.intervals.find(test);
}

const thirdOf = (c: Chord) => toneAt(c, (i) => i < 13 && (mod(i, 12) === 3 || mod(i, 12) === 4));
const fifthOf = (c: Chord) => toneAt(c, (i) => i >= 6 && i <= 8);
const seventhOf = (c: Chord) => toneAt(c, (i) => i >= 9 && i <= 11);
const ninthOf = (c: Chord) => toneAt(c, (i) => i >= 13 && i <= 15);

/**
 * The pitch classes a voicing of this chord may draw on.
 *
 * The chord's own tones, plus the tensions a pianist would add without being
 * asked: a 9th on any seventh chord that has not already altered one, an 11th
 * only where there is no major 3rd for it to clash with, and a 13th only over
 * a dominant 7th that has not already flattened it.
 */
function availablePcs(chord: Chord, tensions: boolean): Set<number> {
  const iv = chord.quality.intervals;
  const set = new Set(iv.map((i) => mod(chord.rootPc + i, 12)));
  if (!tensions || iv.length < 4) return set;
  const add = (semitones: number) => set.add(mod(chord.rootPc + semitones, 12));

  if (ninthOf(chord) === undefined && !iv.some((i) => mod(i, 12) === 2)) add(2);
  // A natural 11th over a major 3rd is the one note everyone agrees to avoid.
  if (thirdOf(chord) === undefined || mod(thirdOf(chord)!, 12) === 3) add(5);
  if (iv.some((i) => mod(i, 12) === 10) && !iv.some((i) => mod(i, 12) === 8)) add(9);
  return set;
}

/**
 * The two standard rootless shapes, as ordered pitch classes.
 *
 * Both are the 3rd, 5th, 7th and 9th; A starts from the 3rd and B from the
 * 7th. Where an altered chord has no fifth, its ♭13 takes that slot, which is
 * what the fifth has turned into. Returns null for anything with no third or
 * no seventh — a triad has nothing to leave out.
 */
function rootlessShape(
  chord: Chord,
  form: RootlessForm,
  tensions: boolean,
): number[] | null {
  const third = thirdOf(chord);
  const seventh = seventhOf(chord);
  if (third === undefined || seventh === undefined) return null;
  const ninth = ninthOf(chord) ?? (tensions ? 14 : undefined);
  // The 13th takes the fifth's place wherever the chord has one: that is what
  // a pianist plays on a 13 chord, and the fifth is the first note to go.
  const fifth = toneAt(chord, (i) => i === 20 || i === 21) ?? fifthOf(chord);
  const order = form === 'A' ? [third, fifth, seventh, ninth] : [seventh, ninth, third, fifth];
  const intervals = order.filter((i): i is number => i !== undefined);

  // Whatever the shape leaves out, it cannot leave out what the chord is named
  // for. A missing essential tone is added on top, and if it still will not
  // fit, there is no honest rootless voicing of this chord.
  const essential = chord.quality.essential ?? [];
  for (const i of essential) {
    if (intervals.length >= 5) break;
    if (!intervals.some((have) => mod(have, 12) === mod(i, 12))) intervals.push(i);
  }
  if (!essential.every((i) => intervals.some((have) => mod(have, 12) === mod(i, 12)))) return null;
  return intervals.map((i) => mod(chord.rootPc + i, 12));
}

/**
 * Fourths stacked through the chord's own tones.
 *
 * Three perfect fourths and a major third on top is the "So What" shape, and
 * it is the target: where the harmony has no note a fourth up, the step gives
 * way to an augmented fourth or a third rather than leaving the chord. Every
 * note still belongs to the chord, so this is an open way of playing the
 * harmony rather than a different harmony.
 */
const QUARTAL_STEPS = [5, 5, 5, 4];
/** What may stand in for each step, in order of preference. */
const QUARTAL_ALTERNATIVES: Record<number, number[]> = { 5: [5, 6, 4], 4: [4, 5, 3] };

function quartalShapes(chord: Chord, size: number, tensions: boolean): number[][] {
  const set = availablePcs(chord, tensions);
  const out: Array<{ shape: number[]; fourths: number }> = [];
  for (const start of set) {
    const notes = [start];
    let fourths = 0;
    while (notes.length < size) {
      const want = QUARTAL_STEPS[(notes.length - 1) % QUARTAL_STEPS.length];
      const step = QUARTAL_ALTERNATIVES[want].find((n) => {
        const pc = mod(notes[notes.length - 1] + n, 12);
        return set.has(pc) && !notes.includes(pc);
      });
      if (step === undefined) break;
      if (step === 5) fourths += 1;
      notes.push(mod(notes[notes.length - 1] + step, 12));
    }
    if (notes.length >= 4) out.push({ shape: notes, fourths });
  }
  // Closest to the target pattern first, then the fullest voicing. Matching
  // the pattern beats simply having more fourths: four stacked fourths is a
  // quartal voicing too, but the third on top is what makes this one sound
  // like the record everybody learned it from.
  const match = (shape: readonly number[]) => {
    let hits = 0;
    for (let i = 1; i < shape.length; i++) {
      if (mod(shape[i] - shape[i - 1], 12) === QUARTAL_STEPS[(i - 1) % QUARTAL_STEPS.length]) {
        hits += 1;
      }
    }
    return hits;
  };
  return out
    .sort((a, b) => match(b.shape) - match(a.shape) ||
      b.shape.length - a.shape.length ||
      b.fourths - a.fourths)
    .map((o) => o.shape);
}

const TRIADS: Array<{ shape: number[]; major: boolean }> = [
  { shape: [0, 4, 7], major: true },
  { shape: [0, 3, 7], major: false },
];

/**
 * Guide tones underneath, a plain triad on top.
 *
 * The left hand states what the chord is — its 3rd and 7th — and the right
 * hand plays an ordinary major or minor triad built on one of its tensions.
 * It is how an altered dominant is usually voiced, and it is why one sounds
 * so much simpler to play than to read.
 */
function upperStructureShapes(chord: Chord, tensions: boolean): RankedShape[] {
  const third = thirdOf(chord);
  const seventh = seventhOf(chord);
  if (third === undefined || seventh === undefined) return [];
  const set = availablePcs(chord, tensions);
  const guide = [mod(chord.rootPc + third, 12), mod(chord.rootPc + seventh, 12)];
  // The triad is built on a tension, never on the root, 3rd, 5th or 7th: an
  // E♭ triad over a G altered dominant is the one every player meets first,
  // while a triad rooted on a chord tone is just the chord again. An altered
  // chord spells its tensions as intervals of a 9th or more, and those are
  // precisely the notes worth building on.
  const structural = new Set(
    chord.quality.intervals.filter((i) => i < 13).map((i) => mod(chord.rootPc + i, 12)),
  );
  const out: Array<{ shape: number[]; rank: number }> = [];
  const PREFERRED = [2, 8, 6, 1, 3, 9, 10, 4, 5, 11];
  for (const offset of PREFERRED) {
    const root = mod(chord.rootPc + offset, 12);
    if (structural.has(root)) continue;
    for (const triad of TRIADS) {
      const pcs = triad.shape.map((i) => mod(root + i, 12));
      if (!pcs.every((pc) => set.has(pc))) continue;
      const above = pcs.filter((pc) => !guide.includes(pc));
      // A triad that overlaps a guide tone arrives as two notes, and two notes
      // are not a triad. Those chords have no upper structure, and saying so
      // is better than playing something else under the name.
      if (above.length < 3) continue;
      const rank = PREFERRED.indexOf(offset) * 3 + (triad.major ? 0 : 1);
      // Every inversion of the triad, because the right hand plays whichever
      // one sits closest above the left — stacking it in root position would
      // throw the top note an octave higher than anyone would reach for.
      for (let r = 0; r < above.length; r++) {
        out.push({ shape: [...guide, ...above.slice(r), ...above.slice(0, r)], rank });
      }
    }
  }
  return out.sort((a, b) => a.rank - b.rank);
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

export function voiceChord(chord: Chord, options: VoicingOptions = {}): Voicing {
  const opts: VoicingOptions = options.rootPosition
    ? { ...options, bottomPc: chord.rootPc }
    : options;
  const style = opts.style ?? 'close';
  const lo = opts.lo ?? REGISTER.voicing.lo;
  const hi = opts.hi ?? REGISTER.voicing.hi;
  const maxNotes = opts.maxNotes ?? 5;
  const tones = selectTones(chord, style, maxNotes);
  const core = tones.filter((t) => !t.upper);

  // Three styles are fixed shapes rather than a stack to be searched: the
  // order of the notes is what makes them that voicing, so they are built as
  // ordered pitch classes and only their octave is chosen.
  const shapes = shapesFor(chord, style, opts.rootlessForm ?? 'A', maxNotes, opts.tensions ?? false);
  if (shapes.length) {
    const fitted = fitShapes(shapes, lo, hi, opts.prev ?? []);
    if (fitted) return withBass(fitted, style, chord, opts);
  }

  // Candidate bottom notes: each core tone as the lowest voice (i.e. each
  // inversion), in each octave that fits the register.
  const rotations = style === 'close' || opts.bottomPc !== undefined ? 1 : core.length;
  const build = (ceiling: Midi): Midi[][] => {
    const out: Midi[][] = [];
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
        const notes = stack(ordered, bottom, ceiling);
        if (notes) out.push(notes);
      }
    }
    return out;
  };

  let candidates = build(hi);
  if (!candidates.length && opts.bottomPc !== undefined) {
    // The caller named the lowest voice, so it cannot be the thing that gives
    // way. A thirteenth chord stacked from its root spans more than two
    // octaves, and when the root sits high in the register it simply needs
    // more room than the voicing register allows. Lend it the top of the
    // singing range rather than fold the tones to wherever they land, which
    // silently drops the bottom note and with it the inversion that was asked
    // for.
    candidates = build(Math.min(hi + 12, REGISTER.melody.hi));
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
    // Dropping the second voice from the top is the whole point of drop 2, but
    // it must not drop into the bass register: a note down there is heard as
    // the bass, not as part of the voicing. Prefer a candidate high enough that
    // the drop still clears the floor; if none does, leave the chord undropped
    // rather than put the voicing where the bass player is.
    const floor = opts.lo !== undefined ? Math.min(opts.lo, VOICING_FLOOR) : VOICING_FLOOR;
    const drop = (notes: readonly Midi[]) => {
      const out = [...notes];
      out[out.length - 2] -= 12;
      return out.sort((a, b) => a - b);
    };
    const usable = candidates.map(drop).filter((n) => n[0] >= floor);
    if (usable.length) {
      best = usable.reduce(
        (a, b) => (spacingPenalty(b) + voiceLeadingCost(b, opts.prev ?? []) * 2.5
          < spacingPenalty(a) + voiceLeadingCost(a, opts.prev ?? []) * 2.5 ? b : a),
        usable[0],
      );
    } else if (drop(best)[0] >= floor) {
      best = drop(best);
    }
  }

  return withBass(best, style, chord, opts);
}

/**
 * Attaches the bass note, if one was asked for.
 *
 * An inversion is only an inversion if the bass agrees with the stack, so the
 * bass follows `bassPc` when one is given rather than always the root.
 */
function withBass(
  notes: Midi[],
  style: VoicingStyle,
  chord: Chord,
  opts: VoicingOptions,
): Voicing {
  const bassPitch = mod(opts.bassPc ?? chord.rootPc, 12);
  const bass = opts.bass
    ? foldInto(bassPitch + 48, REGISTER.bass.lo, Math.min(REGISTER.bass.hi, notes[0] - 7))
    : undefined;
  return { notes, bass, all: bass === undefined ? notes : [bass, ...notes], style };
}

/** A shape and how much the engine would rather use it than a later one. */
interface RankedShape {
  shape: number[];
  rank: number;
}

/** Ordered pitch classes for the styles whose shape is the point. */
function shapesFor(
  chord: Chord,
  style: VoicingStyle,
  form: RootlessForm,
  maxNotes: number,
  tensions: boolean,
): RankedShape[] {
  const ranked = (shapes: number[][], from = 0): RankedShape[] =>
    shapes.map((shape, i) => ({ shape, rank: from + i }));

  if (style === 'rootless') {
    const shape = rootlessShape(chord, form, tensions);
    return shape ? ranked([shape]) : [];
  }
  if (style === 'quartal') {
    return ranked(quartalShapes(chord, Math.min(maxNotes, 5), tensions));
  }
  if (style === 'upperStructure') {
    const shapes = upperStructureShapes(chord, tensions);
    // Not every chord has tensions to build a triad on, and not every triad
    // fits above its guide tones in one hand's worth of register. A pianist
    // reaches for an upper structure on the dominant and comps rootless
    // either side of it, so that is the last resort rather than the generic
    // stack, which would put the root back in the chord.
    const rootless = rootlessShape(chord, form, tensions);
    return [...shapes, ...(rootless ? [{ shape: rootless, rank: 99 }] : [])];
  }
  return [];
}

/**
 * Places a shape in the register without reordering it.
 *
 * Each note goes above the one before, so the shape survives; only the octave
 * it starts in is open, and that is chosen for spacing and voice leading.
 */
function fitShapes(
  shapes: readonly RankedShape[],
  lo: Midi,
  hi: Midi,
  prev: readonly Midi[],
): Midi[] | null {
  let best: Midi[] | null = null;
  let bestScore = Infinity;
  shapes.forEach(({ shape, rank }) => {
    for (let bottom = pcAtOrAbove(shape[0], lo); bottom <= lo + 12; bottom += 12) {
      const notes: Midi[] = [bottom];
      for (const pc of shape.slice(1)) notes.push(pcAtOrAbove(pc, notes[notes.length - 1] + 1));
      if (notes[notes.length - 1] > hi) continue;
      // The shapes arrive in preference order, and that order is musical: a
      // later one has to be clearly better placed to displace an earlier one.
      const score = spacingPenalty(notes) + voiceLeadingCost(notes, prev) * 2.5 + rank * 3;
      if (score < bestScore) {
        bestScore = score;
        best = notes;
      }
    }
  });
  return best;
}

/** Voices a sequence, threading each chord's voice leading from the last. */
export function voiceProgression(
  chords: readonly Chord[],
  opts: VoicingOptions = {},
): Voicing[] {
  const out: Voicing[] = [];
  let prev = opts.prev;
  let form: RootlessForm = opts.rootlessForm ?? 'A';
  for (const chord of chords) {
    const v = voiceChord(chord, { ...opts, prev, rootlessForm: form });
    out.push(v);
    prev = v.notes;
    // The two rootless shapes alternate down a chain of fourths, which is why
    // a ii–V–I can be played with the hand barely moving.
    if (opts.rootlessForm === undefined) form = form === 'A' ? 'B' : 'A';
  }
  return out;
}

/**
 * Which chord tone is sounding lowest: 0 the root, 1 the third, 2 the fifth,
 * 3 the seventh. -1 when the lowest note is not a chord tone at all.
 */
export function inversionIndex(chord: Chord, voicing: Voicing): number {
  const bassPc = mod(voicing.all[0], 12);
  return chord.quality.intervals.findIndex((i) => mod(chord.rootPc + i, 12) === bassPc);
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
