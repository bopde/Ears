import type { Concept } from './concept';
import { conceptId } from './concept';
import { makeChord, requireChordQuality, romanSuffix, type Chord } from './chords';
import { BASIC_OF } from './degrees';
import { keyName, letterIndexOf, spellOnLetter, type PitchClass } from './pitch';
import type { VoicingStyle } from './voicing';
import { mod } from '../lib/util';

/** A dominant resolving down a fifth, or down a half step. */
export type ArrowKind = 'fifth' | 'half';

/** A word the analysis puts beside a chord, where one is worth saying. */
export type ChordNote = 'passing' | 'backdoor' | 'deceptive';

export interface ProgressionChord {
  /** Semitones above the tonic. */
  degree: number;
  /** Chord quality id, resolved against the chord registry. */
  quality: string;
  /**
   * The numeral alone — "ii", "V", "♭II", "V/ii". The quality suffix is
   * derived from the chord's basic quality, so a numeral names a function
   * rather than a voicing's tensions.
   *
   * A slash means "of", and only that: V/ii is the five of the two. What
   * the bass has underneath is said on the row, never here.
   */
  numeral: string;
  /** Overrides the progression's default length for this chord. */
  beats?: number;

  // ── Analysis marks ──────────────────────────────────────────────────────
  // Most of these are worked out from the chords by `derivedMarks`. What a
  // progression writes down is the handful that cannot be: the judgement
  // calls, where the same two chords mean different things in different
  // places. A blues I7 moves to IV7 without being its dominant.

  /** Bracketed with the next chord as a ii–V pair. */
  pair?: boolean;
  /** `'none'` where the chords would suggest an arrow and the music does not. */
  arrow?: ArrowKind | 'none';
  /** The numeral of a key centre that starts here: "♭VI" for the A♭ of C. */
  key?: string;
  note?: ChordNote;
}

/** The marks as they end up, derivation and overrides together. */
export interface ChordMarks {
  pair: boolean;
  arrow?: ArrowKind;
  key?: string;
  note?: ChordNote;
}

export interface ProgressionDef {
  id: string;
  name: string;
  short: string;
  tonality: 'major' | 'minor' | 'modal';
  chords: readonly ProgressionChord[];
  /** Default chord length in beats. */
  beatsPerChord: number;
  tier: number;
  /** Harmonic devices on show. These are the hooks a reference library uses. */
  devices: readonly string[];
  tags: readonly string[];
  core: boolean;
  blurb?: string;
  /**
   * The voicing a player would reach for on these changes.
   *
   * Named rather than explained: the cheat sheet shows the degrees the voicing
   * actually sounds beside it, which says more than a sentence about why.
   */
  voicing?: VoicingStyle;
}

const C = (
  degree: number,
  quality: string,
  numeral: string,
  marks?: Omit<ProgressionChord, 'degree' | 'quality' | 'numeral'>,
): ProgressionChord => ({ degree, quality, numeral, ...marks });

const P = (p: ProgressionDef) => p;

export const PROGRESSIONS: ProgressionDef[] = [
  // ── Foundational cadences ────────────────────────────────────────────────
  P({ id: 'ii-V-I', name: 'ii–V–I', short: 'ii V I', tonality: 'major', tier: 1,
      beatsPerChord: 4, core: true, voicing: 'rootless', devices: ['ii-V-I'], tags: ['cadence', 'major-key'],
      // Written as a plain dominant 7th, not a 9th, although it sounds a 9th
      // in every voicing on the cheat sheet. So do the ii and the I, and
      // spelling only one of the three as an extended chord said that the V
      // was doing something the others were not. The voicing adds the tension;
      // the symbol names the chord.
      chords: [C(2, 'm7', 'ii'), C(7, '7', 'V'), C(0, 'maj7', 'I')],
      blurb: 'The backbone of jazz harmony: root motion down a fifth each time.' }),
  P({ id: 'I-IV-V-I', name: 'I–IV–V–I', short: 'I IV V I', tonality: 'major', tier: 1,
      beatsPerChord: 4, core: true, devices: ['cadence'], tags: ['cadence', 'major-key'],
      chords: [C(0, 'maj7', 'I'), C(5, 'maj7', 'IV'), C(7, '7', 'V'), C(0, 'maj7', 'I')] }),
  P({ id: 'I-vi-ii-V', name: 'I–vi–ii–V turnaround', short: 'I vi ii V', tonality: 'major', tier: 2,
      beatsPerChord: 4, core: true, devices: ['turnaround'], tags: ['turnaround', 'major-key'],
      chords: [C(0, 'maj7', 'I'), C(9, 'm7', 'vi'), C(2, 'm7', 'ii'), C(7, '7', 'V')],
      blurb: 'The standard turnaround — diatonic throughout.' }),
  P({ id: 'I-VI7-ii-V', name: 'I–VI7–ii–V turnaround', short: 'I VI7 ii V', tonality: 'major',
      tier: 3, beatsPerChord: 4, core: true, devices: ['turnaround', 'secondary-dominant'],
      tags: ['turnaround', 'major-key'],
      chords: [C(0, 'maj7', 'I'), C(9, '7b9', 'V/ii'), C(2, 'm7', 'ii'), C(7, '7', 'V')],
      blurb: 'The vi is made dominant so it pulls harder to ii.' }),
  P({ id: 'iii-VI-ii-V', name: 'iii–VI–ii–V', short: 'iii VI ii V', tonality: 'major', tier: 3,
      beatsPerChord: 4, core: true, devices: ['turnaround'], tags: ['turnaround', 'major-key'],
      chords: [C(4, 'm7', 'iii'), C(9, '7b9', 'V/ii'), C(2, 'm7', 'ii'), C(7, '7', 'V')] }),
  P({ id: 'deceptive', name: 'Deceptive cadence', short: 'ii V vi', tonality: 'major', tier: 3,
      beatsPerChord: 4, core: true, devices: ['deceptive'], tags: ['cadence', 'major-key'],
      chords: [C(2, 'm7', 'ii'), C(7, '7', 'V'), C(9, 'm7', 'vi', { note: 'deceptive' })],
      blurb: 'The V resolves to vi instead of I — the floor drops out.' }),

  // ── Minor-key harmony ────────────────────────────────────────────────────
  P({ id: 'ii-V-i-minor', name: 'Minor ii–V–i', short: 'iiø V i', tonality: 'minor', tier: 3,
      beatsPerChord: 4, core: true, voicing: 'rootless', devices: ['minor-ii-V'], tags: ['cadence', 'minor-key'],
      chords: [C(2, 'm7b5', 'ii'), C(7, '7b9', 'V'), C(0, 'm7', 'i')],
      blurb: 'Half-diminished ii and an altered V — the minor-key cadence.' }),
  P({ id: 'minor-ii-V-i-alt', name: 'Minor ii–V–i (altered)', short: 'iiø V7alt i',
      tonality: 'minor', tier: 5, beatsPerChord: 4, core: true, voicing: 'upperStructure',
      devices: ['minor-ii-V', 'altered-dominant'], tags: ['cadence', 'minor-key', 'altered'],
      chords: [C(2, 'm7b5', 'ii'), C(7, '7alt', 'V'), C(0, 'mMaj7', 'i')] }),
  P({ id: 'line-cliche', name: 'Minor line cliché', short: 'i i∆7 i7 i6', tonality: 'minor',
      tier: 4, beatsPerChord: 4, core: true, voicing: 'close', devices: ['line-cliche'], tags: ['minor-key'],
      chords: [C(0, 'min', 'i'), C(0, 'mMaj7', 'i'), C(0, 'm7', 'i'), C(0, 'm6', 'i')],
      blurb: 'A static root with an inner voice walking down from the octave.' }),
  P({ id: 'minor-plagal', name: 'Minor plagal cadence', short: 'IV iv I', tonality: 'major',
      tier: 3, beatsPerChord: 4, core: true, devices: ['modal-interchange'],
      tags: ['cadence', 'borrowed'],
      chords: [C(5, 'maj7', 'IV'), C(5, 'm7', 'iv'), C(0, 'maj7', 'I')],
      blurb: 'The borrowed minor iv — a sudden shadow before the tonic.' }),

  // ── Substitution and reharmonisation ─────────────────────────────────────
  P({ id: 'tritone-sub', name: 'Tritone substitution', short: 'ii ♭II7 I', tonality: 'major',
      tier: 4, beatsPerChord: 4, core: true, voicing: 'rootless', devices: ['tritone-sub'],
      tags: ['substitution', 'major-key'],
      chords: [C(2, 'm7', 'ii'), C(1, '9#11', '♭II'), C(0, 'maj7', 'I')],
      blurb: 'The V is swapped for the dominant a tritone away, so the bass slides down a half step.' }),
  P({ id: 'backdoor', name: 'Backdoor dominant', short: 'iv ♭VII7 I', tonality: 'major',
      tier: 4, beatsPerChord: 4, core: true, voicing: 'rootless', devices: ['backdoor', 'modal-interchange'],
      tags: ['substitution', 'borrowed'],
      // A iv–♭VII is a ii–V of nothing: it brackets like one and arrives
      // somewhere else, which is the whole point of the back door.
      chords: [C(5, 'm7', 'iv', { pair: true }), C(10, '7', '♭VII'),
               C(0, 'maj7', 'I', { note: 'backdoor' })],
      blurb: 'Arriving at I from ♭VII7 instead of V7 — borrowed from the parallel minor.' }),
  P({ id: 'dim-passing', name: 'Diminished passing chord', short: 'I ♯i°7 ii V', tonality: 'major',
      tier: 4, beatsPerChord: 4, core: true, devices: ['diminished-passing'],
      tags: ['passing', 'major-key'],
      chords: [C(0, 'maj7', 'I'), C(1, 'dim7', '♯i', { note: 'passing' }),
               C(2, 'm7', 'ii'), C(7, '7', 'V')],
      blurb: 'A chromatic bass step from I up to ii, harmonised as a °7.' }),
  P({ id: 'V-of-V', name: 'Secondary dominant (V7/V)', short: 'I II7 V7 I', tonality: 'major',
      tier: 3, beatsPerChord: 4, core: true, devices: ['secondary-dominant'],
      tags: ['secondary-dominant', 'major-key'],
      chords: [C(0, 'maj7', 'I'), C(2, '7', 'V/V'), C(7, '7', 'V'), C(0, 'maj7', 'I')],
      blurb: 'The ii is made dominant: a V of the V.' }),
  P({ id: 'V-of-IV', name: 'Secondary dominant (V7/IV)', short: 'I I7 IV ivm6', tonality: 'major',
      tier: 4, beatsPerChord: 4, core: true, devices: ['secondary-dominant', 'modal-interchange'],
      tags: ['secondary-dominant', 'major-key'],
      chords: [C(0, 'maj7', 'I'), C(0, '7', 'V/IV'), C(5, 'maj7', 'IV'), C(5, 'm6', 'iv')],
      blurb: 'The tonic turns dominant to push to IV, then IV darkens to minor.' }),
  P({ id: 'bVI-bVII-I', name: 'Modal interchange ♭VI–♭VII–I', short: '♭VI ♭VII I',
      tonality: 'major', tier: 4, beatsPerChord: 4, core: true, devices: ['modal-interchange'],
      tags: ['borrowed', 'major-key'],
      chords: [C(8, 'maj7', '♭VI'), C(10, 'maj7', '♭VII'), C(0, 'maj7', 'I')],
      blurb: 'Both chords borrowed from the parallel minor — a lift rather than a cadence.' }),
  P({ id: 'descending-turnaround', name: 'Chromatic descending turnaround', short: 'Chrom. turn.',
      tonality: 'major', tier: 4, beatsPerChord: 2, core: true,
      devices: ['turnaround', 'tritone-sub', 'diminished-passing'],
      tags: ['turnaround', 'major-key'],
      chords: [C(4, 'm7', 'iii'), C(3, 'dim7', '♭iii', { note: 'passing' }), C(2, 'm7', 'ii'),
               C(1, '9#11', '♭II'), C(0, 'maj7', 'I')],
      blurb: 'The bass walks down in half steps from the iii to the tonic.' }),
  P({ id: 'diatonic-cycle', name: 'Diatonic cycle of fourths', short: 'Diatonic cycle',
      tonality: 'major', tier: 3, beatsPerChord: 4, core: true,
      devices: ['ii-V-I', 'cadence'], tags: ['cadence', 'major-key'],
      chords: [C(2, 'm7', 'ii'), C(7, '7', 'V'), C(0, 'maj7', 'I'),
               C(5, 'maj7', 'IV'), C(11, 'm7b5', 'vii')],
      blurb: 'Every chord diatonic, each root a fourth above the last.' }),
  P({ id: 'rhythm-changes-a', name: 'Rhythm changes (A section)', short: 'Rhythm A',
      tonality: 'major', tier: 4, beatsPerChord: 2, core: true, voicing: 'rootless',
      devices: ['turnaround', 'secondary-dominant', 'diminished-passing'],
      tags: ['form', 'major-key'],
      chords: [C(0, 'maj7', 'I'), C(9, '7b9', 'V/ii'), C(2, 'm7', 'ii'), C(7, '7', 'V'),
               C(0, 'maj7', 'I'), C(0, '7', 'V/IV'), C(5, 'maj7', 'IV'),
               C(6, 'dim7', '♯iv', { note: 'passing' })],
      blurb: 'The first eight bars of the most-played form in jazz.' }),

  // ── Blues ────────────────────────────────────────────────────────────────
  P({ id: 'blues-opening', name: 'Jazz blues — opening', short: 'Blues 1–4', tonality: 'major',
      tier: 3, beatsPerChord: 4, core: true, voicing: 'shell', devices: ['blues'], tags: ['blues', 'form'],
      // The I7 of a blues is where the music lives, not a dominant pointing
      // at the IV. It acts as V7/IV in bar 4 of a full chorus, which these
      // four bars do not reach.
      chords: [C(0, '9', 'I', { arrow: 'none' }), C(5, '13', 'IV'), C(0, '9', 'I'),
               C(7, 'm7', 'v')],
      blurb: 'Bars 1–4 of a jazz blues, ending on the ii of IV.' }),
  P({ id: 'blues-turnaround', name: 'Jazz blues — turnaround', short: 'Blues 7–12',
      tonality: 'major', tier: 4, beatsPerChord: 2, core: true, voicing: 'shell',
      devices: ['blues', 'turnaround', 'diminished-passing'], tags: ['blues', 'form'],
      chords: [C(5, '13', 'IV'), C(6, 'dim7', '♯iv', { note: 'passing' }), C(0, '9', 'I'),
               C(9, '7b9', 'V/ii'), C(2, 'm9', 'ii'), C(7, '13', 'V')],
      blurb: 'The back half of a blues chorus, with the °7 passing chord.' }),
  P({ id: 'minor-blues', name: 'Minor blues — opening', short: 'Min blues', tonality: 'minor',
      tier: 4, beatsPerChord: 4, core: true, voicing: 'shell', devices: ['blues', 'minor-ii-V'],
      tags: ['blues', 'minor-key'],
      chords: [C(0, 'm7', 'i'), C(5, 'm7', 'iv'), C(0, 'm7', 'i'), C(7, '7alt', 'V')] }),

  // ── Modal ────────────────────────────────────────────────────────────────
  P({ id: 'so-what', name: 'Modal shift up a half step', short: 'Modal shift', tonality: 'modal',
      tier: 3, beatsPerChord: 4, core: true, voicing: 'quartal', devices: ['modal'], tags: ['modal'],
      chords: [C(0, 'm11', 'i'), C(1, 'm11', '♭ii'), C(0, 'm11', 'i')],
      blurb: 'Static modal harmony that lifts a half step and drops back.' }),
  P({ id: 'constant-structure', name: 'Constant structure in minor 3rds', short: 'Const. struct.',
      tonality: 'modal', tier: 5, beatsPerChord: 2, core: true, voicing: 'quartal',
      devices: ['constant-structure'], tags: ['modal', 'symmetrical'],
      chords: [C(0, 'maj7', 'I'), C(3, 'maj7', '♭III'), C(6, 'maj7', '♯IV'),
               C(9, 'maj7', 'VI'), C(0, 'maj7', 'I')],
      blurb: 'One chord shape moved in equal steps — no key centre survives it.' }),

  // ── Advanced movement ────────────────────────────────────────────────────
  P({ id: 'coltrane-cell', name: 'Coltrane changes', short: 'Coltrane', tonality: 'major',
      tier: 5, beatsPerChord: 2, core: true, voicing: 'drop2', devices: ['coltrane', 'modulation'],
      tags: ['advanced', 'symmetrical'],
      chords: [C(0, 'maj7', 'I', { key: 'I' }), C(3, '7', 'V/♭VI', { key: '♭VI' }),
               C(8, 'maj7', '♭VI'), C(11, '7', 'V/III', { key: 'III' }),
               C(4, 'maj7', 'III')],
      blurb: 'Tonic centres a major third apart, each reached by its own dominant.' }),
  P({ id: 'coltrane-substitution', name: 'Coltrane substitution over ii–V–I', short: 'Countdown',
      tonality: 'major', tier: 5, beatsPerChord: 2, core: true, voicing: 'drop2',
      devices: ['coltrane', 'substitution'], tags: ['advanced', 'substitution'],
      chords: [C(2, 'm7', 'ii', { key: 'I' }), C(3, '7', 'V/♭VI', { key: '♭VI' }),
               C(8, 'maj7', '♭VI'), C(11, '7', 'V/III', { key: 'III' }),
               C(4, 'maj7', 'III'), C(7, '7', 'V', { key: 'I' }), C(0, 'maj7', 'I')],
      blurb: 'A two-bar ii–V filled in with two extra key centres before it lands.' }),
  P({ id: 'giant-steps-head', name: 'Giant Steps opening', short: 'Giant Steps',
      tonality: 'major', tier: 5, beatsPerChord: 2, core: true, voicing: 'drop2',
      devices: ['coltrane', 'modulation', 'ii-V-I'], tags: ['advanced', 'symmetrical', 'form'],
      chords: [C(0, 'maj7', 'I', { key: 'I' }), C(3, '7', 'V/♭VI', { key: '♭VI' }),
               C(8, 'maj7', '♭VI'), C(11, '7', 'V/III', { key: 'III' }),
               C(4, 'maj7', 'III'), C(10, 'm7', 'ii/♭VI', { key: '♭VI' }),
               C(3, '7', 'V/♭VI')],
      blurb: 'The Coltrane cell, then a ii–V setting up the next turn of it.' }),
  P({ id: 'dominant-cycle', name: 'Cycle of dominants', short: 'Dom. cycle',
      tonality: 'major', tier: 5, beatsPerChord: 2, core: true,
      devices: ['secondary-dominant', 'rapid-movement'], tags: ['advanced', 'major-key'],
      chords: [C(6, '7', '♯IV'), C(11, '7', 'VII'), C(4, '7', 'III'), C(9, '7', 'VI'),
               C(2, '7', 'II'), C(7, '7', 'V'), C(0, 'maj7', 'I')],
      blurb: 'Six dominants in a row, each resolving a fourth up into the next.' }),
  P({ id: 'rhythm-changes-b', name: 'Rhythm changes (bridge)', short: 'Rhythm B',
      tonality: 'major', tier: 4, beatsPerChord: 2, core: true,
      devices: ['secondary-dominant', 'turnaround'], tags: ['form', 'major-key'],
      chords: [C(4, '7', 'III'), C(9, '7', 'VI'), C(2, '7', 'II'), C(7, '7', 'V'),
               C(0, 'maj7', 'I'), C(9, 'm7', 'vi'), C(2, 'm7', 'ii'), C(7, '7', 'V')],
      blurb: 'Four dominants round the cycle, then back into the turnaround.' }),
  P({ id: 'stella-opening', name: 'Half-diminished opening', short: 'ivø opening',
      tonality: 'major', tier: 5, beatsPerChord: 2, core: true,
      devices: ['modulation', 'modal-interchange', 'backdoor'],
      tags: ['advanced', 'form', 'borrowed'],
      chords: [C(6, 'm7b5', 'ii/iii'), C(11, '7alt', 'V/iii'), C(2, 'm7', 'ii'),
               C(7, '7', 'V'), C(7, 'm7', 'ii/IV'), C(0, '7', 'V/IV'),
               C(5, 'maj7', 'IV'), C(10, '7', '♭VII')],
      blurb: 'Opens on a ♯ivø7 that belongs to no key yet, then cadences away from the tonic.' }),
  P({ id: 'modulation-up-tone', name: 'Modulation up a whole tone', short: 'Mod +2',
      tonality: 'major', tier: 4, beatsPerChord: 2, core: true, devices: ['modulation'],
      tags: ['modulation'],
      chords: [C(2, 'm7', 'ii', { key: 'I' }), C(7, '7', 'V'), C(0, 'maj7', 'I'),
               C(4, 'm7', 'ii/II', { key: 'II' }), C(9, '7', 'V/II'), C(2, 'maj7', 'II')],
      blurb: 'A complete cadence, then the same cadence a whole tone higher.' }),
  P({ id: 'modulation-to-IV', name: 'Modulation to IV', short: 'Mod to IV', tonality: 'major',
      tier: 4, beatsPerChord: 2, core: true, devices: ['modulation'], tags: ['modulation'],
      chords: [C(2, 'm7', 'ii', { key: 'I' }), C(7, '7', 'V'), C(0, 'maj7', 'I'),
               C(7, 'm7', 'ii/IV', { key: 'IV' }), C(0, '7', 'V/IV'),
               C(5, 'maj7', 'IV')] }),
  P({ id: 'rapid-ii-V', name: 'Descending ii–Vs', short: 'Rapid ii–V', tonality: 'major',
      tier: 5, beatsPerChord: 2, core: true, devices: ['rapid-movement', 'ii-V-I'],
      tags: ['advanced'],
      chords: [C(2, 'm7', 'ii', { key: 'I' }), C(7, '7', 'V'),
               C(0, 'm7', 'ii/♭VII', { key: '♭VII' }), C(5, '7', 'V/♭VII'),
               C(10, 'm7', 'ii/♭VI', { key: '♭VI' }), C(3, '7', 'V/♭VI')],
      blurb: 'ii–V pairs stepping down in whole tones without ever resolving.' }),
];

export const CORE_PROGRESSIONS = PROGRESSIONS.filter((p) => p.core);

const registry = new Map(PROGRESSIONS.map((p) => [p.id, p]));

export function registerProgression(def: ProgressionDef): void {
  registry.set(def.id, def);
  if (!PROGRESSIONS.some((p) => p.id === def.id)) PROGRESSIONS.push(def);
}

export function getProgression(id: string): ProgressionDef | undefined {
  return registry.get(id);
}

export function requireProgression(id: string): ProgressionDef {
  const p = registry.get(id);
  if (!p) throw new Error(`Unknown progression: ${id}`);
  return p;
}

/**
 * Roman numeral with the chord's basic quality written out: IV7, not IV13.
 *
 * A numeral is a function, and the function of a thirteenth chord is the
 * function of the dominant inside it. Writing IV13 beside ii9 and V13 said
 * the three were doing three different things, when the difference was only
 * which tensions each voicing happened to take. The quality is kept as
 * written so the voicing still sounds the colour, and the row beside the
 * numeral names it: "♭II7 · D♭7 · 9, ♯11".
 */
export function romanLabel(chord: ProgressionChord): string {
  const basic = BASIC_OF[chord.quality] ?? chord.quality;
  const suffix = romanSuffix(requireChordQuality(basic));
  // Secondary-function notation takes the suffix on the numeral itself, so
  // V7/IV rather than V/IV7.
  const slash = chord.numeral.indexOf('/');
  return slash === -1
    ? chord.numeral + suffix
    : chord.numeral.slice(0, slash) + suffix + chord.numeral.slice(slash);
}

/** How far up the letters each numeral sits: I is 0, VII is 6. */
const NUMERAL_STEPS: Record<string, number> = {
  i: 0, ii: 1, iii: 2, iv: 3, v: 4, vi: 5, vii: 6,
};

/**
 * How many letters above the tonic a numeral sits.
 *
 * The accidental on the front moves the pitch, never the letter — a ♭II of C
 * is still written on D, as a D♭ — so it is stripped before counting. A
 * secondary function adds the two: V/IV is four letters above the IV, which
 * is itself three above the tonic.
 *
 * Returns null for anything it does not recognise, so a caller falls back
 * rather than spelling a chord on a letter it guessed at.
 */
export function numeralSteps(numeral: string): number | null {
  let total = 0;
  for (const part of numeral.split('/')) {
    const bare = part.replace(/[\u266d\u266f]/g, '').toLowerCase();
    const step = NUMERAL_STEPS[bare];
    if (step === undefined) return null;
    total += step;
  }
  return total;
}

/**
 * How each chord of a progression is written in a given key.
 *
 * The key and the numeral together fix the letter, which the pitch class on
 * its own cannot: the ii of B is a C♯ because it is written on the letter
 * above B, and the ♭II of C is a D♭ because it is written on the letter
 * above C — the same two pitches, spelled apart by what they are doing.
 *
 * Falls back to the conventional name where the letter would need a double
 * accidental or one of the four names pitch.ts refuses.
 */
export function rootNames(def: ProgressionDef, tonic: PitchClass): Array<string | undefined> {
  const tonality = def.tonality === 'minor' ? 'minor' : 'major';
  const letter = letterIndexOf(keyName(tonic, tonality));
  return def.chords.map((c) => {
    const steps = letter < 0 ? null : numeralSteps(c.numeral);
    if (steps === null) return undefined;
    return spellOnLetter(mod(tonic + c.degree, 12), letter + steps) ?? undefined;
  });
}

export interface RealisedChord {
  chord: Chord;
  /** The numeral in the home key, which is what the summary counts in. */
  roman: string;
  /**
   * The numeral in the key centre in force here.
   *
   * The same as `roman` until a progression modulates. Under A♭, Coltrane's
   * V7/♭VI is a V7 and its ♭VI∆7 is the I∆7 — what the rows show, once the
   * key label above them has said where the counting starts.
   */
  localRoman: string;
  /** "A♭" where a new key centre starts at this chord. */
  keyLabel?: string;
  marks: ChordMarks;
  beats: number;
  /** Semitones above the tonic, kept for root-motion analysis. */
  degree: number;
}

/** Puts a progression into a concrete key. */
export function realiseProgression(def: ProgressionDef, tonic: PitchClass): RealisedChord[] {
  const names = rootNames(def, tonic);
  const marks = progressionMarks(def);
  const tonality = def.tonality === 'minor' ? 'minor' : 'major';
  const letter = letterIndexOf(keyName(tonic, tonality));
  let key: string | undefined;
  return def.chords.map((c, i) => {
    if (marks[i].key) key = marks[i].key;
    const keyDegree = key === undefined ? null : numeralDegree(key);
    const keySteps = key === undefined ? null : numeralSteps(key);
    const label = marks[i].key === undefined || keyDegree === null || keySteps === null
      || letter < 0
      ? undefined
      : spellOnLetter(mod(tonic + keyDegree, 12), letter + keySteps) ?? undefined;
    return {
      chord: makeChord(mod(tonic + c.degree, 12), c.quality, names[i]),
      roman: romanLabel(c),
      localRoman: key === undefined
        ? romanLabel(c)
        : romanLabel({ ...c, numeral: numeralIn(c.numeral, c.degree, key) }),
      ...(label ? { keyLabel: label } : {}),
      marks: marks[i],
      beats: c.beats ?? def.beatsPerChord,
      degree: mod(c.degree, 12),
    };
  });
}

export const progressionBeats = (def: ProgressionDef): number =>
  def.chords.reduce((n, c) => n + (c.beats ?? def.beatsPerChord), 0);

/**
 * The progression on one line, as a jazz book marks it up.
 *
 * Arrows where a dominant resolves — solid down a fifth, dashed down a half
 * step — and a plain dash where one chord merely follows another. Brackets
 * are drawn rather than written, as an underline under the two chords of a
 * ii–V, so a line of text leaves them out; `brackets` puts them in for a
 * test, which is the one place the pairs have to be read back.
 *
 * Home-key numerals throughout, with no key labels: a modulation is marked
 * in the rows, where there is room to say it once and count from it.
 */
export function romanLine(def: ProgressionDef, opts: { brackets?: boolean } = {}): string {
  const tokens = analysisTokens(def);
  let out = '';
  tokens.forEach((token, i) => {
    const open = opts.brackets && token.pair;
    const close = opts.brackets && i > 0 && tokens[i - 1].pair;
    out += (open ? '\u230a' : '') + token.roman + (token.note ? ` (${token.note})` : '')
      + (close ? '\u230b' : '');
    if (token.join) out += ` ${token.join} `;
  });
  return out;
}

// ── Functional analysis ─────────────────────────────────────────────────────

/** The function part of a numeral: the "V" of "V/ii". */
const head = (numeral: string): string => numeral.split('/')[0];

/** What it is the five (or the two) of: the "ii" of "V/ii", else "". */
const target = (numeral: string): string => {
  const at = numeral.indexOf('/');
  return at === -1 ? '' : numeral.slice(at + 1);
};

const isDominant = (quality: string): boolean => (BASIC_OF[quality] ?? quality) === '7';
const isMinorSeventh = (quality: string): boolean => {
  const basic = BASIC_OF[quality] ?? quality;
  return basic === 'm7' || basic === 'm7b5';
};

/**
 * The marks the chords themselves imply.
 *
 * An arrow is root motion under a dominant: a dominant-quality chord whose
 * next chord's root is a fifth below gets a solid one, a half step below a
 * dashed one. A bracket joins a ii (or a iiø) to the V or ♭II7 of the same
 * thing — "the same thing" being what makes a ii–V of IV a pair and a ii of
 * the home key followed by the V of somewhere else two separate chords.
 *
 * Everything the chords cannot say is written down in the library instead,
 * and `progressionMarks` lays one over the other.
 */
export function derivedMarks(def: ProgressionDef): ChordMarks[] {
  return def.chords.map((c, i) => {
    const next = def.chords[i + 1];
    const marks: ChordMarks = { pair: false };
    if (next && isDominant(c.quality)) {
      const step = mod(next.degree - c.degree, 12);
      if (step === 5) marks.arrow = 'fifth';
      else if (step === 11) marks.arrow = 'half';
    }
    if (next
      && isMinorSeventh(c.quality) && head(c.numeral) === 'ii'
      && isDominant(next.quality) && ['V', '♭II'].includes(head(next.numeral))
      && target(c.numeral) === target(next.numeral)) {
      marks.pair = true;
    }
    return marks;
  });
}

/** The marks as they are read: derived, with the library's overrides over them. */
export function progressionMarks(def: ProgressionDef): ChordMarks[] {
  return derivedMarks(def).map((derived, i) => {
    const c = def.chords[i];
    const arrow = c.arrow ?? derived.arrow;
    return {
      pair: c.pair ?? derived.pair,
      ...(arrow && arrow !== 'none' ? { arrow } : {}),
      ...(c.key ? { key: c.key } : {}),
      ...(c.note ? { note: c.note } : {}),
    };
  });
}

const DIATONIC = [0, 2, 4, 5, 7, 9, 11];
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

/** How many semitones above the tonic a numeral sits. */
export function numeralDegree(numeral: string): number | null {
  let semitones = 0;
  for (const part of numeral.split('/')) {
    const bare = part.replace(/[♭♯]/g, '').toLowerCase();
    const step = NUMERAL_STEPS[bare];
    if (step === undefined) return null;
    const flats = (part.match(/♭/g) ?? []).length;
    const sharps = (part.match(/♯/g) ?? []).length;
    semitones += DIATONIC[step] + sharps - flats;
  }
  return mod(semitones, 12);
}

/**
 * The same chord, read against another key centre.
 *
 * What a modulation does to a numeral: under A♭, the V7/♭VI of C is just a
 * V7 and the ♭VI∆7 is the I∆7. The rows say the key once and then count
 * from it, which is how a chart is marked up and how the passage is heard
 * — two bars of ii–V–I, not a secondary function pointing sideways.
 *
 * Returns the numeral unchanged where the result would need a double
 * accidental, which no key centre in the library reaches.
 */
export function numeralIn(numeral: string, degree: number, key: string): string {
  const steps = numeralSteps(numeral);
  const keySteps = numeralSteps(key);
  const keyDegree = numeralDegree(key);
  if (steps === null || keySteps === null || keyDegree === null) return numeral;
  const step = mod(steps - keySteps, 7);
  const accidental = mod(degree - keyDegree, 12) - DIATONIC[step];
  const mark = accidental === 0 ? '' : accidental === -1 ? '♭' : accidental === 1 ? '♯' : null;
  if (mark === null) return numeral;
  const upper = head(numeral) !== head(numeral).toLowerCase();
  return mark + (upper ? ROMAN[step] : ROMAN[step].toLowerCase());
}

/** One chord of the analysis, with what joins it to the next. */
export interface AnalysisToken {
  roman: string;
  note?: ChordNote;
  /** Underlined, or bracketed, with the token after it. */
  pair: boolean;
  /** How it reaches the next chord; absent on the last. */
  join?: '→' | '⇢' | '–';
}

/** The whole progression as functional analysis, in its home key. */
export function analysisTokens(def: ProgressionDef): AnalysisToken[] {
  const marks = progressionMarks(def);
  return def.chords.map((c, i) => ({
    roman: romanLabel(c),
    ...(marks[i].note ? { note: marks[i].note } : {}),
    pair: marks[i].pair,
    ...(i === def.chords.length - 1
      ? {}
      : { join: marks[i].arrow === 'fifth' ? '→' as const
        : marks[i].arrow === 'half' ? '⇢' as const
          : '–' as const }),
  }));
}

/** Progressions a listener could plausibly mix up with `target`. */
export function nearestProgressions(
  target: ProgressionDef,
  pool: readonly ProgressionDef[],
  n: number,
): ProgressionDef[] {
  return pool
    .filter((p) => p.id !== target.id)
    .map((p) => {
      const sharedDevices = p.devices.filter((d) => target.devices.includes(d)).length;
      const lengthGap = Math.abs(p.chords.length - target.chords.length);
      const sameTonality = p.tonality === target.tonality ? 1 : 0;
      const rootMotionOverlap = p.chords.filter((c, i) =>
        target.chords[i] ? c.degree === target.chords[i].degree : false,
      ).length;
      return { p, score: sharedDevices * 2 + sameTonality + rootMotionOverlap * 0.5 - lengthGap };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map((x) => x.p);
}

export function progressionConcept(p: ProgressionDef): Concept {
  return {
    id: conceptId('progression', p.id),
    kind: 'progression',
    name: p.name,
    short: p.short,
    tier: p.tier,
    tags: [...p.tags, ...p.devices.map((d) => `device:${d}`), `tonality:${p.tonality}`],
    blurb: p.blurb,
  };
}

export const progressionConceptId = (id: string) => conceptId('progression', id);
