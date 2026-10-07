import type { Concept } from './concept';
import { conceptId } from './concept';
import { pcName, pcSetSimilarity, type Accidental, type Midi, type PitchClass } from './pitch';
import { mod } from '../lib/util';

/**
 * Chord qualities are data, not code.
 *
 * Adding 7♭9♯11, a polychord, a slash chord or a specific voicing means adding
 * an entry here (or registering one at runtime via `registerChordQuality`).
 * Nothing in the exercise engine, the audio layer or the UI enumerates
 * qualities by hand, so the vocabulary can grow without redesign.
 */
export type ChordFamily =
  | 'major'
  | 'minor'
  | 'dominant'
  | 'diminished'
  | 'augmented'
  | 'sus';

export type ChordGroup =
  | 'Triads'
  | 'Sevenths'
  | 'Sixths & adds'
  | 'Extended'
  | 'Altered'
  | 'Suspended';

export interface ChordQuality {
  id: string;
  /** Full name used in feedback, e.g. "Half-diminished". */
  name: string;
  /** Suffix appended to the root for lead-sheet display, e.g. "∆7". */
  symbol: string;
  /** Compact answer-button label. Defaults to `symbol` when omitted. */
  short?: string;
  /** Semitones above the root. Values above 12 are upper-structure tones. */
  intervals: readonly number[];
  tier: number;
  family: ChordFamily;
  group: ChordGroup;
  tags: readonly string[];
  /** Tones that must survive a thinned voicing (the colour of the chord). */
  essential?: readonly number[];
  /** Tones a pianist drops first, in the order they are dropped. */
  droppable?: readonly number[];
  /** Qualities this is genuinely easy to mistake for; biases hard distractors. */
  confusable?: readonly string[];
  blurb?: string;
}

const Q = (q: ChordQuality) => q;

export const CHORD_QUALITIES: ChordQuality[] = [
  // ── Triads ───────────────────────────────────────────────────────────────
  Q({ id: 'maj', name: 'Major', symbol: '', short: 'maj', intervals: [0, 4, 7], tier: 1,
      family: 'major', group: 'Triads', tags: ['triad', 'major-family'],
      essential: [4], droppable: [7], confusable: ['sus4', 'aug', '6'] }),
  Q({ id: 'min', name: 'Minor', symbol: 'm', short: 'min', intervals: [0, 3, 7], tier: 1,
      family: 'minor', group: 'Triads', tags: ['triad', 'minor-family'],
      essential: [3], droppable: [7], confusable: ['dim', 'm7', 'm6'] }),
  Q({ id: 'dim', name: 'Diminished', symbol: '°', short: 'dim', intervals: [0, 3, 6], tier: 2,
      family: 'diminished', group: 'Triads', tags: ['triad', 'diminished'],
      essential: [3, 6], confusable: ['dim7', 'm7b5', 'min'] }),
  Q({ id: 'aug', name: 'Augmented', symbol: '+', short: 'aug', intervals: [0, 4, 8], tier: 2,
      family: 'augmented', group: 'Triads', tags: ['triad', 'augmented', 'symmetrical'],
      essential: [4, 8], confusable: ['maj', 'maj7#5', '7#5'],
      blurb: 'Symmetrical — every inversion is another augmented triad.' }),
  Q({ id: 'sus4', name: 'Suspended 4th', symbol: 'sus4', intervals: [0, 5, 7], tier: 2,
      family: 'sus', group: 'Suspended', tags: ['triad', 'sus'],
      essential: [5], confusable: ['sus2', 'maj', '7sus4'] }),
  Q({ id: 'sus2', name: 'Suspended 2nd', symbol: 'sus2', intervals: [0, 2, 7], tier: 3,
      family: 'sus', group: 'Suspended', tags: ['triad', 'sus'],
      essential: [2], confusable: ['sus4', 'add9'],
      blurb: 'An inversion of sus4 a fourth away — context decides which you hear.' }),

  // ── Sevenths ─────────────────────────────────────────────────────────────
  Q({ id: 'maj7', name: 'Major 7', symbol: '∆7', intervals: [0, 4, 7, 11], tier: 2,
      family: 'major', group: 'Sevenths', tags: ['seventh', 'major-family'],
      essential: [4, 11], droppable: [7], confusable: ['6', 'maj9', 'min'] }),
  Q({ id: 'm7', name: 'Minor 7', symbol: 'm7', intervals: [0, 3, 7, 10], tier: 2,
      family: 'minor', group: 'Sevenths', tags: ['seventh', 'minor-family'],
      essential: [3, 10], droppable: [7], confusable: ['m9', '6', 'm6'] }),
  Q({ id: '7', name: 'Dominant 7', symbol: '7', intervals: [0, 4, 7, 10], tier: 2,
      family: 'dominant', group: 'Sevenths', tags: ['seventh', 'dominant'],
      essential: [4, 10], droppable: [7], confusable: ['9', '13', '7sus4'] }),
  Q({ id: 'm7b5', name: 'Half-diminished', symbol: 'ø7', short: 'm7♭5', intervals: [0, 3, 6, 10],
      tier: 3, family: 'diminished', group: 'Sevenths', tags: ['seventh', 'diminished', 'minor-key'],
      essential: [3, 6, 10], confusable: ['dim7', 'm6', 'dim'],
      blurb: 'The ii chord of a minor ii–V–i. Shares its notes with a m6 chord a minor third up.' }),
  Q({ id: 'dim7', name: 'Diminished 7', symbol: '°7', short: 'dim7', intervals: [0, 3, 6, 9], tier: 3,
      family: 'diminished', group: 'Sevenths', tags: ['seventh', 'diminished', 'symmetrical'],
      essential: [3, 6, 9], confusable: ['m7b5', '7b9', 'dim'],
      blurb: 'Symmetrical — the same four notes serve as four different °7 chords.' }),
  Q({ id: 'mMaj7', name: 'Minor–major 7', symbol: 'm∆7', intervals: [0, 3, 7, 11], tier: 4,
      family: 'minor', group: 'Sevenths', tags: ['seventh', 'minor-family', 'melodic-minor'],
      essential: [3, 11], droppable: [7], confusable: ['min', 'maj7', 'm7'],
      blurb: 'Tonic chord of melodic minor; the sound of a minor line cliché.' }),
  Q({ id: '7sus4', name: 'Dominant 7 sus4', symbol: '7sus4', intervals: [0, 5, 7, 10], tier: 3,
      family: 'sus', group: 'Suspended', tags: ['seventh', 'sus', 'dominant'],
      essential: [5, 10], confusable: ['7', 'sus4', '11', 'm7'] }),
  Q({ id: 'maj7#5', name: 'Major 7 ♯5', symbol: '∆7♯5', intervals: [0, 4, 8, 11], tier: 5,
      family: 'augmented', group: 'Sevenths', tags: ['seventh', 'augmented', 'melodic-minor'],
      essential: [4, 8, 11], confusable: ['maj7', 'aug', 'maj7#11'] }),

  // ── Sixths & adds ────────────────────────────────────────────────────────
  Q({ id: '6', name: 'Major 6', symbol: '6', intervals: [0, 4, 7, 9], tier: 3,
      family: 'major', group: 'Sixths & adds', tags: ['sixth', 'major-family'],
      essential: [4, 9], droppable: [7], confusable: ['m7', 'maj7', '69'],
      blurb: 'The same four notes as the m7 chord a minor third below.' }),
  Q({ id: 'm6', name: 'Minor 6', symbol: 'm6', intervals: [0, 3, 7, 9], tier: 3,
      family: 'minor', group: 'Sixths & adds', tags: ['sixth', 'minor-family', 'melodic-minor'],
      essential: [3, 9], droppable: [7], confusable: ['m7b5', 'min', 'm7'] }),
  Q({ id: '69', name: 'Six-nine', symbol: '6/9', intervals: [0, 4, 9, 14], tier: 4,
      family: 'major', group: 'Sixths & adds', tags: ['sixth', 'extension', 'major-family'],
      essential: [4, 9, 14], confusable: ['6', 'maj9', 'add9'] }),
  Q({ id: 'add9', name: 'Add 9', symbol: 'add9', intervals: [0, 4, 7, 14], tier: 3,
      family: 'major', group: 'Sixths & adds', tags: ['add', 'major-family'],
      essential: [4, 14], confusable: ['maj9', 'sus2', 'maj'] }),
  Q({ id: 'madd9', name: 'Minor add 9', symbol: 'm(add9)', short: 'm add9',
      intervals: [0, 3, 7, 14], tier: 4, family: 'minor', group: 'Sixths & adds',
      tags: ['add', 'minor-family'], essential: [3, 14], confusable: ['m9', 'min', 'madd9'] }),

  // ── Extended ─────────────────────────────────────────────────────────────
  Q({ id: 'maj9', name: 'Major 9', symbol: '∆9', intervals: [0, 4, 7, 11, 14], tier: 3,
      family: 'major', group: 'Extended', tags: ['extension', 'ninth', 'major-family'],
      essential: [4, 11, 14], droppable: [7], confusable: ['maj7', '69', 'add9'] }),
  Q({ id: 'm9', name: 'Minor 9', symbol: 'm9', intervals: [0, 3, 7, 10, 14], tier: 3,
      family: 'minor', group: 'Extended', tags: ['extension', 'ninth', 'minor-family'],
      essential: [3, 10, 14], droppable: [7], confusable: ['m7', 'm11', 'maj7'] }),
  Q({ id: '9', name: 'Dominant 9', symbol: '9', intervals: [0, 4, 7, 10, 14], tier: 3,
      family: 'dominant', group: 'Extended', tags: ['extension', 'ninth', 'dominant'],
      essential: [4, 10, 14], droppable: [7], confusable: ['7', '13', '9#11'] }),
  Q({ id: 'm11', name: 'Minor 11', symbol: 'm11', intervals: [0, 3, 7, 10, 14, 17], tier: 4,
      family: 'minor', group: 'Extended', tags: ['extension', 'eleventh', 'minor-family'],
      essential: [3, 10, 17], droppable: [7], confusable: ['m9', 'm7', '11'] }),
  Q({ id: '11', name: 'Dominant 11', symbol: '11', intervals: [0, 7, 10, 14, 17], tier: 5,
      family: 'dominant', group: 'Extended', tags: ['extension', 'eleventh', 'dominant', 'sus'],
      essential: [10, 14, 17], confusable: ['7sus4', 'm11', '9'],
      blurb: 'In practice a 9sus4 — the 3rd is left out so it does not clash with the 11th.' }),
  Q({ id: '13', name: 'Dominant 13', symbol: '13', intervals: [0, 4, 7, 10, 14, 21], tier: 4,
      family: 'dominant', group: 'Extended', tags: ['extension', 'thirteenth', 'dominant'],
      essential: [4, 10, 21], droppable: [7], confusable: ['9', '7', '13b9'] }),
  Q({ id: 'maj13', name: 'Major 13', symbol: '∆13', intervals: [0, 4, 7, 11, 14, 21], tier: 5,
      family: 'major', group: 'Extended', tags: ['extension', 'thirteenth', 'major-family'],
      essential: [4, 11, 21], droppable: [7], confusable: ['maj9', '69', 'maj7'] }),
  Q({ id: 'm13', name: 'Minor 13', symbol: 'm13', intervals: [0, 3, 7, 10, 14, 21], tier: 5,
      family: 'minor', group: 'Extended', tags: ['extension', 'thirteenth', 'minor-family', 'dorian'],
      essential: [3, 10, 21], droppable: [7], confusable: ['m9', 'm11', 'm6'] }),
  Q({ id: 'maj7#11', name: 'Major 7 ♯11', symbol: '∆7♯11', intervals: [0, 4, 7, 11, 18], tier: 4,
      family: 'major', group: 'Extended', tags: ['extension', 'alteration', 'lydian', 'major-family'],
      essential: [4, 11, 18], droppable: [7], confusable: ['maj7', 'maj9', 'maj7#5'],
      blurb: 'The Lydian sound — a tonic major chord with a raised 4th.' }),
  Q({ id: '9#11', name: 'Dominant 9 ♯11', symbol: '9♯11', intervals: [0, 4, 7, 10, 14, 18], tier: 5,
      family: 'dominant', group: 'Extended', tags: ['extension', 'alteration', 'lydian-dominant', 'dominant'],
      essential: [4, 10, 18], droppable: [7], confusable: ['9', '13', '7b5'],
      blurb: 'Lydian dominant — the usual sound of a tritone substitute.' }),

  // ── Altered ──────────────────────────────────────────────────────────────
  Q({ id: '7b9', name: 'Dominant 7 ♭9', symbol: '7♭9', intervals: [0, 4, 7, 10, 13], tier: 4,
      family: 'dominant', group: 'Altered', tags: ['alteration', 'dominant', 'minor-key'],
      essential: [4, 10, 13], droppable: [7], confusable: ['dim7', '7#9', '13b9'],
      blurb: 'Drop the root and a °7 chord is left — the two sounds overlap.' }),
  Q({ id: '7#9', name: 'Dominant 7 ♯9', symbol: '7♯9', intervals: [0, 4, 7, 10, 15], tier: 4,
      family: 'dominant', group: 'Altered', tags: ['alteration', 'dominant', 'blues'],
      essential: [4, 10, 15], droppable: [7], confusable: ['7alt', '7b9', '7'] }),
  Q({ id: '7b5', name: 'Dominant 7 ♭5', symbol: '7♭5', intervals: [0, 4, 6, 10], tier: 4,
      family: 'dominant', group: 'Altered', tags: ['alteration', 'dominant', 'whole-tone'],
      essential: [4, 6, 10], confusable: ['9#11', '7#5', '7'] }),
  Q({ id: '7#5', name: 'Dominant 7 ♯5', symbol: '7♯5', intervals: [0, 4, 8, 10], tier: 4,
      family: 'dominant', group: 'Altered', tags: ['alteration', 'dominant', 'whole-tone', 'augmented'],
      essential: [4, 8, 10], confusable: ['aug', '7b13', '7alt'] }),
  Q({ id: '7b13', name: 'Dominant 7 ♭13', symbol: '7♭13', intervals: [0, 4, 10, 14, 20], tier: 5,
      family: 'dominant', group: 'Altered', tags: ['alteration', 'dominant'],
      essential: [4, 10, 20], confusable: ['7#5', '7alt', '13'] }),
  Q({ id: '13b9', name: 'Dominant 13 ♭9', symbol: '13♭9', intervals: [0, 4, 7, 10, 13, 21], tier: 5,
      family: 'dominant', group: 'Altered', tags: ['alteration', 'dominant', 'diminished-scale'],
      essential: [4, 10, 13, 21], droppable: [7], confusable: ['7b9', '13', '7alt'] }),
  Q({ id: '7alt', name: 'Altered dominant', symbol: '7alt', intervals: [0, 4, 10, 13, 15, 20],
      tier: 5, family: 'dominant', group: 'Altered',
      tags: ['alteration', 'dominant', 'altered-scale', 'melodic-minor'],
      essential: [4, 10, 13, 20], confusable: ['7#9', '7#5', '7b13'],
      blurb: 'Every available tension altered: ♭9, ♯9, ♯11 and ♭13.' }),
];

export const CHORD_GROUP_ORDER: ChordGroup[] = [
  'Triads', 'Sevenths', 'Sixths & adds', 'Extended', 'Altered', 'Suspended',
];

const registry = new Map<string, ChordQuality>(CHORD_QUALITIES.map((q) => [q.id, q]));

/** Runtime extension point — a later version can add qualities without a rebuild. */
export function registerChordQuality(quality: ChordQuality): void {
  registry.set(quality.id, quality);
  if (!CHORD_QUALITIES.some((q) => q.id === quality.id)) CHORD_QUALITIES.push(quality);
}

export function getChordQuality(id: string): ChordQuality | undefined {
  return registry.get(id);
}

export function requireChordQuality(id: string): ChordQuality {
  const q = registry.get(id);
  if (!q) throw new Error(`Unknown chord quality: ${id}`);
  return q;
}

export const qualityLabel = (q: ChordQuality): string => q.short ?? q.symbol ?? q.name;

// ── Chord instances ────────────────────────────────────────────────────────

export interface Chord {
  rootPc: PitchClass;
  quality: ChordQuality;
}

export function makeChord(rootPc: PitchClass, qualityId: string): Chord {
  return { rootPc: mod(rootPc, 12), quality: requireChordQuality(qualityId) };
}

export function chordSymbol(chord: Chord, pref: Accidental = 'both'): string {
  return `${pcName(chord.rootPc, pref)}${chord.quality.symbol}`;
}

export function chordFullName(chord: Chord, pref: Accidental = 'both'): string {
  return `${pcName(chord.rootPc, pref)} ${chord.quality.name}`;
}

/** Absolute semitone offsets above a concrete root pitch, extensions kept high. */
export function chordTones(chord: Chord, rootMidi: Midi): Midi[] {
  return chord.quality.intervals.map((i) => rootMidi + i);
}

export function chordPitchClasses(chord: Chord): PitchClass[] {
  return chord.quality.intervals.map((i) => mod(chord.rootPc + i, 12));
}

// ── Similarity, for choosing distractors ──────────────────────────────────

/**
 * How easy two qualities are to confuse: pitch-class overlap, plus a bonus for
 * hand-listed traps and for sharing a family. Computed rather than tabulated so
 * a newly registered quality immediately gets sensible distractors.
 */
export function qualitySimilarity(a: ChordQuality, b: ChordQuality): number {
  if (a.id === b.id) return 1;
  let score = pcSetSimilarity(a.intervals, b.intervals);
  if (a.confusable?.includes(b.id) || b.confusable?.includes(a.id)) score += 0.3;
  if (a.family === b.family) score += 0.1;
  if (a.group === b.group) score += 0.05;
  return Math.min(1, score);
}

/** Qualities ranked by how plausibly they could be mistaken for `target`. */
export function nearestQualities(
  target: ChordQuality,
  pool: readonly ChordQuality[],
  n: number,
): ChordQuality[] {
  return pool
    .filter((q) => q.id !== target.id)
    .map((q) => ({ q, s: qualitySimilarity(target, q) }))
    .sort((x, y) => y.s - x.s)
    .slice(0, n)
    .map((x) => x.q);
}

// ── Concepts ──────────────────────────────────────────────────────────────

export function chordConcept(q: ChordQuality): Concept {
  return {
    id: conceptId('chord', q.id),
    kind: 'chord',
    name: q.name,
    short: qualityLabel(q),
    tier: q.tier,
    tags: [...q.tags, `family:${q.family}`, `group:${q.group}`],
    blurb: q.blurb,
  };
}

export const chordConceptId = (qualityId: string) => conceptId('chord', qualityId);

export function qualityIdFromConcept(id: string): string | null {
  return id.startsWith('chord:') ? id.slice('chord:'.length) : null;
}
