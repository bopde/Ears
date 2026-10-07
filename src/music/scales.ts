import type { Concept } from './concept';
import { conceptId } from './concept';
import type { PitchClass } from './pitch';
import { mod } from '../lib/util';

/** A chord in a modal vamp, as a scale-degree offset plus a quality id. */
export interface VampChord {
  /** Semitones above the tonic. */
  degree: number;
  quality: string;
}

export interface ScaleDef {
  id: string;
  name: string;
  short: string;
  /** Semitones above the tonic, ascending, octave excluded. */
  degrees: readonly number[];
  /** Degrees that give the mode its colour — phrases lean on these. */
  characteristic: readonly number[];
  /** Interval spelling relative to the major scale, for display. */
  spelling: string;
  /** Parent collection, for grouping in the UI. */
  parent: 'major' | 'melodic minor' | 'harmonic minor' | 'symmetric' | 'other';
  /** Bright (Lydian) to dark (Locrian); orders the answer buttons musically. */
  brightness: number;
  tier: number;
  tags: readonly string[];
  /** Two-chord vamp that pins the mode down without naming it. */
  vamp: readonly VampChord[];
  /** Included in the default mode pool. Extras are opt-in. */
  core: boolean;
  blurb?: string;
}

const S = (s: ScaleDef) => s;

export const SCALES: ScaleDef[] = [
  S({ id: 'lydian', name: 'Lydian', short: 'Lyd', degrees: [0, 2, 4, 6, 7, 9, 11],
      characteristic: [6], spelling: '1 2 3 ♯4 5 6 7', parent: 'major', brightness: 6, tier: 2,
      tags: ['church-mode', 'major-family'], core: true,
      vamp: [{ degree: 0, quality: 'maj7' }, { degree: 2, quality: '7' }],
      blurb: 'Major with a raised 4th — floating and unresolved.' }),
  S({ id: 'ionian', name: 'Ionian', short: 'Ion', degrees: [0, 2, 4, 5, 7, 9, 11],
      characteristic: [5, 11], spelling: '1 2 3 4 5 6 7', parent: 'major', brightness: 5, tier: 1,
      tags: ['church-mode', 'major-family'], core: true,
      vamp: [{ degree: 0, quality: 'maj7' }, { degree: 5, quality: 'maj7' }],
      blurb: 'The major scale. The natural 4th is what separates it from Lydian.' }),
  S({ id: 'mixolydian', name: 'Mixolydian', short: 'Mix', degrees: [0, 2, 4, 5, 7, 9, 10],
      characteristic: [10], spelling: '1 2 3 4 5 6 ♭7', parent: 'major', brightness: 4, tier: 2,
      tags: ['church-mode', 'dominant'], core: true,
      vamp: [{ degree: 0, quality: '7' }, { degree: 10, quality: 'maj7' }],
      blurb: 'Major with a flat 7th — the everyday dominant sound.' }),
  S({ id: 'dorian', name: 'Dorian', short: 'Dor', degrees: [0, 2, 3, 5, 7, 9, 10],
      characteristic: [9], spelling: '1 2 ♭3 4 5 6 ♭7', parent: 'major', brightness: 3, tier: 2,
      tags: ['church-mode', 'minor-family'], core: true,
      vamp: [{ degree: 0, quality: 'm7' }, { degree: 5, quality: '7' }],
      blurb: 'Minor with a natural 6th — brighter than Aeolian, and the modal-jazz default.' }),
  S({ id: 'aeolian', name: 'Aeolian', short: 'Aeo', degrees: [0, 2, 3, 5, 7, 8, 10],
      characteristic: [8], spelling: '1 2 ♭3 4 5 ♭6 ♭7', parent: 'major', brightness: 2, tier: 2,
      tags: ['church-mode', 'minor-family'], core: true,
      vamp: [{ degree: 0, quality: 'm7' }, { degree: 8, quality: 'maj7' }],
      blurb: 'The natural minor scale. Listen for the flat 6th against Dorian.' }),
  S({ id: 'phrygian', name: 'Phrygian', short: 'Phr', degrees: [0, 1, 3, 5, 7, 8, 10],
      characteristic: [1], spelling: '1 ♭2 ♭3 4 5 ♭6 ♭7', parent: 'major', brightness: 1, tier: 3,
      tags: ['church-mode', 'minor-family'], core: true,
      vamp: [{ degree: 0, quality: 'm7' }, { degree: 1, quality: 'maj7' }],
      blurb: 'Minor with a flat 2nd — the half step above the tonic gives it away.' }),
  S({ id: 'locrian', name: 'Locrian', short: 'Loc', degrees: [0, 1, 3, 5, 6, 8, 10],
      characteristic: [1, 6], spelling: '1 ♭2 ♭3 4 ♭5 ♭6 ♭7', parent: 'major', brightness: 0, tier: 4,
      tags: ['church-mode', 'diminished'], core: true,
      vamp: [{ degree: 0, quality: 'm7b5' }, { degree: 1, quality: 'maj7' }],
      blurb: 'Flat 2nd and flat 5th — no stable tonic triad underneath it.' }),

  // ── Beyond the church modes (opt-in) ─────────────────────────────────────
  S({ id: 'melodic-minor', name: 'Melodic minor', short: 'Mel min', degrees: [0, 2, 3, 5, 7, 9, 11],
      characteristic: [9, 11], spelling: '1 2 ♭3 4 5 6 7', parent: 'melodic minor', brightness: 3.5,
      tier: 4, tags: ['melodic-minor', 'minor-family'], core: false,
      vamp: [{ degree: 0, quality: 'mMaj7' }, { degree: 5, quality: '7' }],
      blurb: 'Minor 3rd with a natural 6th and 7th — the jazz minor tonic.' }),
  S({ id: 'lydian-dominant', name: 'Lydian dominant', short: 'Lyd dom', degrees: [0, 2, 4, 6, 7, 9, 10],
      characteristic: [6, 10], spelling: '1 2 3 ♯4 5 6 ♭7', parent: 'melodic minor', brightness: 4.5,
      tier: 5, tags: ['melodic-minor', 'dominant'], core: false,
      vamp: [{ degree: 0, quality: '9#11' }],
      blurb: 'The sound of a tritone substitute: dominant with a ♯11.' }),
  S({ id: 'altered', name: 'Altered', short: 'Alt', degrees: [0, 1, 3, 4, 6, 8, 10],
      characteristic: [1, 3, 8], spelling: '1 ♭9 ♯9 3 ♯11 ♭13 ♭7', parent: 'melodic minor',
      brightness: 0.5, tier: 5, tags: ['melodic-minor', 'dominant', 'altered'], core: false,
      vamp: [{ degree: 0, quality: '7alt' }],
      blurb: 'Melodic minor a half step up — every tension altered.' }),
  S({ id: 'harmonic-minor', name: 'Harmonic minor', short: 'Harm min', degrees: [0, 2, 3, 5, 7, 8, 11],
      characteristic: [8, 11], spelling: '1 2 ♭3 4 5 ♭6 7', parent: 'harmonic minor', brightness: 2.5,
      tier: 4, tags: ['harmonic-minor', 'minor-family'], core: false,
      vamp: [{ degree: 0, quality: 'mMaj7' }, { degree: 7, quality: '7b9' }],
      blurb: 'The augmented 2nd between ♭6 and 7 is the tell.' }),
  S({ id: 'whole-tone', name: 'Whole tone', short: 'Whole', degrees: [0, 2, 4, 6, 8, 10],
      characteristic: [6, 8], spelling: '1 2 3 ♯4 ♯5 ♭7', parent: 'symmetric', brightness: 3.5,
      tier: 4, tags: ['symmetrical', 'dominant'], core: false,
      vamp: [{ degree: 0, quality: '7#5' }],
      blurb: 'Six equal whole steps — no half steps at all, so no pull anywhere.' }),
  S({ id: 'half-whole', name: 'Half-whole diminished', short: 'H/W dim',
      degrees: [0, 1, 3, 4, 6, 7, 9, 10], characteristic: [1, 6, 9], spelling: '1 ♭9 ♯9 3 ♯11 5 13 ♭7',
      parent: 'symmetric', brightness: 1.5, tier: 5, tags: ['symmetrical', 'dominant'], core: false,
      vamp: [{ degree: 0, quality: '13b9' }],
      blurb: 'Alternating half and whole steps — ♭9, ♯9, ♯11 and a natural 13.' }),
  S({ id: 'blues', name: 'Blues', short: 'Blues', degrees: [0, 3, 5, 6, 7, 10],
      characteristic: [3, 6], spelling: '1 ♭3 4 ♯4 5 ♭7', parent: 'other', brightness: 2, tier: 3,
      tags: ['blues'], core: false,
      vamp: [{ degree: 0, quality: '7#9' }],
      blurb: 'Minor pentatonic with the ♭5 passing tone.' }),
];

export const CORE_MODES = SCALES.filter((s) => s.core);

const registry = new Map(SCALES.map((s) => [s.id, s]));

export function registerScale(def: ScaleDef): void {
  registry.set(def.id, def);
  if (!SCALES.some((s) => s.id === def.id)) SCALES.push(def);
}

export function getScale(id: string): ScaleDef | undefined {
  return registry.get(id);
}

export function requireScale(id: string): ScaleDef {
  const s = registry.get(id);
  if (!s) throw new Error(`Unknown scale: ${id}`);
  return s;
}

/** Pitch classes of the scale on a given tonic. */
export function scalePitchClasses(tonic: PitchClass, scale: ScaleDef): PitchClass[] {
  return scale.degrees.map((d) => mod(tonic + d, 12));
}

/**
 * Concrete ascending pitches across `octaves`, starting at `startMidi`.
 * Used for running the scale and as the note pool for generated phrases.
 */
export function scaleNotes(tonicMidi: number, scale: ScaleDef, octaves = 1): number[] {
  const out: number[] = [];
  for (let o = 0; o < octaves; o++) {
    for (const d of scale.degrees) out.push(tonicMidi + d + o * 12);
  }
  out.push(tonicMidi + octaves * 12);
  return out;
}

/** Modes that sit next to `target` in brightness — the believable wrong answers. */
export function nearestScales(
  target: ScaleDef,
  pool: readonly ScaleDef[],
  n: number,
): ScaleDef[] {
  return pool
    .filter((s) => s.id !== target.id)
    .map((s) => {
      const shared = s.degrees.filter((d) => target.degrees.includes(d)).length;
      const overlap = shared / Math.max(s.degrees.length, target.degrees.length);
      const brightnessGap = Math.abs(s.brightness - target.brightness);
      return { s, score: overlap * 2 - brightnessGap * 0.25 };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map((x) => x.s);
}

export function scaleConcept(s: ScaleDef): Concept {
  return {
    id: conceptId('mode', s.id),
    kind: 'mode',
    name: s.name,
    short: s.short,
    tier: s.tier,
    tags: [...s.tags, `parent:${s.parent}`],
    blurb: s.blurb,
  };
}

export const scaleConceptId = (id: string) => conceptId('mode', id);
