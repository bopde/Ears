import type { Concept } from './concept';
import { conceptId } from './concept';
import { makeChord, type Chord } from './chords';
import type { PitchClass } from './pitch';
import { mod } from '../lib/util';

export interface ProgressionChord {
  /** Semitones above the tonic. */
  degree: number;
  /** Chord quality id, resolved against the chord registry. */
  quality: string;
  /** Roman-numeral label shown in feedback. */
  roman: string;
  /** Overrides the progression's default length for this chord. */
  beats?: number;
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
}

const C = (degree: number, quality: string, roman: string, beats?: number): ProgressionChord =>
  beats === undefined ? { degree, quality, roman } : { degree, quality, roman, beats };

const P = (p: ProgressionDef) => p;

export const PROGRESSIONS: ProgressionDef[] = [
  // ── Foundational cadences ────────────────────────────────────────────────
  P({ id: 'ii-V-I', name: 'ii–V–I', short: 'ii V I', tonality: 'major', tier: 1,
      beatsPerChord: 4, core: true, devices: ['ii-V-I'], tags: ['cadence', 'major-key'],
      chords: [C(2, 'm7', 'ii7'), C(7, '9', 'V7'), C(0, 'maj7', 'I∆7')],
      blurb: 'The backbone of jazz harmony: root motion down a fifth each time.' }),
  P({ id: 'I-IV-V-I', name: 'I–IV–V–I', short: 'I IV V I', tonality: 'major', tier: 1,
      beatsPerChord: 4, core: true, devices: ['cadence'], tags: ['cadence', 'major-key'],
      chords: [C(0, 'maj7', 'I∆7'), C(5, 'maj7', 'IV∆7'), C(7, '7', 'V7'), C(0, 'maj7', 'I∆7')] }),
  P({ id: 'I-vi-ii-V', name: 'I–vi–ii–V turnaround', short: 'I vi ii V', tonality: 'major', tier: 2,
      beatsPerChord: 4, core: true, devices: ['turnaround'], tags: ['turnaround', 'major-key'],
      chords: [C(0, 'maj7', 'I∆7'), C(9, 'm7', 'vi7'), C(2, 'm7', 'ii7'), C(7, '7', 'V7')],
      blurb: 'The standard turnaround — diatonic throughout.' }),
  P({ id: 'I-VI7-ii-V', name: 'I–VI7–ii–V turnaround', short: 'I VI7 ii V', tonality: 'major',
      tier: 3, beatsPerChord: 4, core: true, devices: ['turnaround', 'secondary-dominant'],
      tags: ['turnaround', 'major-key'],
      chords: [C(0, 'maj7', 'I∆7'), C(9, '7b9', 'VI7♭9'), C(2, 'm7', 'ii7'), C(7, '7', 'V7')],
      blurb: 'The vi is made dominant so it pulls harder to ii.' }),
  P({ id: 'iii-VI-ii-V', name: 'iii–VI–ii–V', short: 'iii VI ii V', tonality: 'major', tier: 3,
      beatsPerChord: 4, core: true, devices: ['turnaround'], tags: ['turnaround', 'major-key'],
      chords: [C(4, 'm7', 'iii7'), C(9, '7b9', 'VI7♭9'), C(2, 'm7', 'ii7'), C(7, '7', 'V7')] }),
  P({ id: 'deceptive', name: 'Deceptive cadence', short: 'ii V vi', tonality: 'major', tier: 3,
      beatsPerChord: 4, core: true, devices: ['deceptive'], tags: ['cadence', 'major-key'],
      chords: [C(2, 'm7', 'ii7'), C(7, '7', 'V7'), C(9, 'm7', 'vi7')],
      blurb: 'The V resolves to vi instead of I — the floor drops out.' }),

  // ── Minor-key harmony ────────────────────────────────────────────────────
  P({ id: 'ii-V-i-minor', name: 'Minor ii–V–i', short: 'iiø V i', tonality: 'minor', tier: 3,
      beatsPerChord: 4, core: true, devices: ['minor-ii-V'], tags: ['cadence', 'minor-key'],
      chords: [C(2, 'm7b5', 'iiø7'), C(7, '7b9', 'V7♭9'), C(0, 'm7', 'i7')],
      blurb: 'Half-diminished ii and an altered V — the minor-key cadence.' }),
  P({ id: 'minor-ii-V-i-alt', name: 'Minor ii–V–i (altered)', short: 'iiø V7alt i',
      tonality: 'minor', tier: 5, beatsPerChord: 4, core: true,
      devices: ['minor-ii-V', 'altered-dominant'], tags: ['cadence', 'minor-key', 'altered'],
      chords: [C(2, 'm7b5', 'iiø7'), C(7, '7alt', 'V7alt'), C(0, 'mMaj7', 'i∆7')] }),
  P({ id: 'line-cliche', name: 'Minor line cliché', short: 'i i∆7 i7 i6', tonality: 'minor',
      tier: 4, beatsPerChord: 4, core: true, devices: ['line-cliche'], tags: ['minor-key'],
      chords: [C(0, 'min', 'i'), C(0, 'mMaj7', 'i∆7'), C(0, 'm7', 'i7'), C(0, 'm6', 'i6')],
      blurb: 'A static root with an inner voice walking down from the octave.' }),
  P({ id: 'minor-plagal', name: 'Minor plagal cadence', short: 'IV iv I', tonality: 'major',
      tier: 3, beatsPerChord: 4, core: true, devices: ['modal-interchange'],
      tags: ['cadence', 'borrowed'],
      chords: [C(5, 'maj7', 'IV∆7'), C(5, 'm7', 'iv7'), C(0, 'maj7', 'I∆7')],
      blurb: 'The borrowed minor iv — a sudden shadow before the tonic.' }),

  // ── Substitution and reharmonisation ─────────────────────────────────────
  P({ id: 'tritone-sub', name: 'Tritone substitution', short: 'ii ♭II7 I', tonality: 'major',
      tier: 4, beatsPerChord: 4, core: true, devices: ['tritone-sub'],
      tags: ['substitution', 'major-key'],
      chords: [C(2, 'm7', 'ii7'), C(1, '9#11', '♭II7'), C(0, 'maj7', 'I∆7')],
      blurb: 'The V is swapped for the dominant a tritone away, so the bass slides down a half step.' }),
  P({ id: 'backdoor', name: 'Backdoor dominant', short: 'iv ♭VII7 I', tonality: 'major',
      tier: 4, beatsPerChord: 4, core: true, devices: ['backdoor', 'modal-interchange'],
      tags: ['substitution', 'borrowed'],
      chords: [C(5, 'm7', 'iv7'), C(10, '7', '♭VII7'), C(0, 'maj7', 'I∆7')],
      blurb: 'Arriving at I from ♭VII7 instead of V7 — borrowed from the parallel minor.' }),
  P({ id: 'dim-passing', name: 'Diminished passing chord', short: 'I ♯i°7 ii V', tonality: 'major',
      tier: 4, beatsPerChord: 4, core: true, devices: ['diminished-passing'],
      tags: ['passing', 'major-key'],
      chords: [C(0, 'maj7', 'I∆7'), C(1, 'dim7', '♯i°7'), C(2, 'm7', 'ii7'), C(7, '7', 'V7')],
      blurb: 'A chromatic bass step from I up to ii, harmonised as a °7.' }),
  P({ id: 'V-of-V', name: 'Secondary dominant (V7/V)', short: 'I II7 V7 I', tonality: 'major',
      tier: 3, beatsPerChord: 4, core: true, devices: ['secondary-dominant'],
      tags: ['secondary-dominant', 'major-key'],
      chords: [C(0, 'maj7', 'I∆7'), C(2, '7', 'II7'), C(7, '7', 'V7'), C(0, 'maj7', 'I∆7')],
      blurb: 'The ii is made dominant: a V of the V.' }),
  P({ id: 'V-of-IV', name: 'Secondary dominant (V7/IV)', short: 'I I7 IV ivm6', tonality: 'major',
      tier: 4, beatsPerChord: 4, core: true, devices: ['secondary-dominant', 'modal-interchange'],
      tags: ['secondary-dominant', 'major-key'],
      chords: [C(0, 'maj7', 'I∆7'), C(0, '7', 'I7'), C(5, 'maj7', 'IV∆7'), C(5, 'm6', 'iv6')],
      blurb: 'The tonic turns dominant to push to IV, then IV darkens to minor.' }),
  P({ id: 'bVI-bVII-I', name: 'Modal interchange ♭VI–♭VII–I', short: '♭VI ♭VII I',
      tonality: 'major', tier: 4, beatsPerChord: 4, core: true, devices: ['modal-interchange'],
      tags: ['borrowed', 'major-key'],
      chords: [C(8, 'maj7', '♭VI∆7'), C(10, 'maj7', '♭VII∆7'), C(0, 'maj7', 'I∆7')],
      blurb: 'Both chords borrowed from the parallel minor — a lift rather than a cadence.' }),
  P({ id: 'rhythm-changes-a', name: 'Rhythm changes (A section)', short: 'Rhythm A',
      tonality: 'major', tier: 4, beatsPerChord: 2, core: true,
      devices: ['turnaround', 'secondary-dominant', 'diminished-passing'],
      tags: ['form', 'major-key'],
      chords: [C(0, 'maj7', 'I∆7'), C(9, '7b9', 'VI7'), C(2, 'm7', 'ii7'), C(7, '7', 'V7'),
               C(0, 'maj7', 'I∆7'), C(0, '7', 'I7'), C(5, 'maj7', 'IV∆7'), C(6, 'dim7', '♯iv°7')],
      blurb: 'The first eight bars of the most-played form in jazz.' }),

  // ── Blues ────────────────────────────────────────────────────────────────
  P({ id: 'blues-opening', name: 'Jazz blues — opening', short: 'Blues 1–4', tonality: 'major',
      tier: 3, beatsPerChord: 4, core: true, devices: ['blues'], tags: ['blues', 'form'],
      chords: [C(0, '9', 'I7'), C(5, '13', 'IV7'), C(0, '9', 'I7'), C(7, 'm7', 'v7')],
      blurb: 'Bars 1–4 of a jazz blues, ending on the ii of IV.' }),
  P({ id: 'blues-turnaround', name: 'Jazz blues — turnaround', short: 'Blues 7–12',
      tonality: 'major', tier: 4, beatsPerChord: 2, core: true,
      devices: ['blues', 'turnaround', 'diminished-passing'], tags: ['blues', 'form'],
      chords: [C(5, '13', 'IV7'), C(6, 'dim7', '♯iv°7'), C(0, '9', 'I7'), C(9, '7b9', 'VI7'),
               C(2, 'm9', 'ii7'), C(7, '13', 'V7')],
      blurb: 'The back half of a blues chorus, with the °7 passing chord.' }),
  P({ id: 'minor-blues', name: 'Minor blues — opening', short: 'Min blues', tonality: 'minor',
      tier: 4, beatsPerChord: 4, core: true, devices: ['blues', 'minor-ii-V'],
      tags: ['blues', 'minor-key'],
      chords: [C(0, 'm7', 'i7'), C(5, 'm7', 'iv7'), C(0, 'm7', 'i7'), C(7, '7alt', 'V7alt')] }),

  // ── Modal ────────────────────────────────────────────────────────────────
  P({ id: 'so-what', name: 'Modal shift up a half step', short: 'Modal shift', tonality: 'modal',
      tier: 3, beatsPerChord: 4, core: true, devices: ['modal'], tags: ['modal'],
      chords: [C(0, 'm11', 'i11'), C(1, 'm11', '♭ii11'), C(0, 'm11', 'i11')],
      blurb: 'Static modal harmony that lifts a half step and drops back.' }),
  P({ id: 'constant-structure', name: 'Constant structure in minor 3rds', short: 'Const. struct.',
      tonality: 'modal', tier: 5, beatsPerChord: 2, core: true,
      devices: ['constant-structure'], tags: ['modal', 'symmetrical'],
      chords: [C(0, 'maj7', 'I∆7'), C(3, 'maj7', '♭III∆7'), C(6, 'maj7', '♯IV∆7'),
               C(9, 'maj7', 'VI∆7'), C(0, 'maj7', 'I∆7')],
      blurb: 'One chord shape moved in equal steps — no key centre survives it.' }),

  // ── Advanced movement ────────────────────────────────────────────────────
  P({ id: 'coltrane-cell', name: 'Coltrane changes', short: 'Coltrane', tonality: 'major',
      tier: 5, beatsPerChord: 2, core: true, devices: ['coltrane', 'modulation'],
      tags: ['advanced', 'symmetrical'],
      chords: [C(0, 'maj7', 'I∆7'), C(3, '7', '♭III7'), C(8, 'maj7', '♭VI∆7'),
               C(11, '7', 'VII7'), C(4, 'maj7', 'III∆7')],
      blurb: 'Tonic centres a major third apart, each reached by its own dominant.' }),
  P({ id: 'coltrane-substitution', name: 'Coltrane substitution over ii–V–I', short: 'Countdown',
      tonality: 'major', tier: 5, beatsPerChord: 2, core: true,
      devices: ['coltrane', 'substitution'], tags: ['advanced', 'substitution'],
      chords: [C(2, 'm7', 'ii7'), C(3, '7', '♭III7'), C(8, 'maj7', '♭VI∆7'), C(11, '7', 'VII7'),
               C(4, 'maj7', 'III∆7'), C(7, '7', 'V7'), C(0, 'maj7', 'I∆7')],
      blurb: 'A two-bar ii–V filled in with two extra key centres before it lands.' }),
  P({ id: 'modulation-up-tone', name: 'Modulation up a whole tone', short: 'Mod +2',
      tonality: 'major', tier: 4, beatsPerChord: 2, core: true, devices: ['modulation'],
      tags: ['modulation'],
      chords: [C(2, 'm7', 'ii7'), C(7, '7', 'V7'), C(0, 'maj7', 'I∆7'),
               C(4, 'm7', 'ii7/II'), C(9, '7', 'V7/II'), C(2, 'maj7', 'I∆7 of II')],
      blurb: 'A complete cadence, then the same cadence a whole tone higher.' }),
  P({ id: 'modulation-to-IV', name: 'Modulation to IV', short: 'Mod to IV', tonality: 'major',
      tier: 4, beatsPerChord: 2, core: true, devices: ['modulation'], tags: ['modulation'],
      chords: [C(2, 'm7', 'ii7'), C(7, '7', 'V7'), C(0, 'maj7', 'I∆7'),
               C(7, 'm7', 'ii7/IV'), C(0, '7', 'V7/IV'), C(5, 'maj7', 'IV∆7')] }),
  P({ id: 'rapid-ii-V', name: 'Descending ii–Vs', short: 'Rapid ii–V', tonality: 'major',
      tier: 5, beatsPerChord: 2, core: true, devices: ['rapid-movement', 'ii-V-I'],
      tags: ['advanced'],
      chords: [C(2, 'm7', 'ii7'), C(7, '7', 'V7'), C(0, 'm7', 'ii7/♭VII'), C(5, '7', 'V7/♭VII'),
               C(10, 'm7', 'ii7/♭VI'), C(3, '7', 'V7/♭VI')],
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

export interface RealisedChord {
  chord: Chord;
  roman: string;
  beats: number;
  /** Semitones above the tonic, kept for root-motion analysis. */
  degree: number;
}

/** Puts a progression into a concrete key. */
export function realiseProgression(def: ProgressionDef, tonic: PitchClass): RealisedChord[] {
  return def.chords.map((c) => ({
    chord: makeChord(mod(tonic + c.degree, 12), c.quality),
    roman: c.roman,
    beats: c.beats ?? def.beatsPerChord,
    degree: mod(c.degree, 12),
  }));
}

export const progressionBeats = (def: ProgressionDef): number =>
  def.chords.reduce((n, c) => n + (c.beats ?? def.beatsPerChord), 0);

export const romanLine = (def: ProgressionDef): string =>
  def.chords.map((c) => c.roman).join('  –  ');

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
