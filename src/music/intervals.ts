import type { Concept } from './concept';
import { conceptId } from './concept';

export type IntervalDirection = 'ascending' | 'descending' | 'harmonic';

export interface IntervalDef {
  id: string;
  /** Semitones. Values above 12 are compound intervals. */
  semitones: number;
  name: string;
  short: string;
  tier: number;
  tags: readonly string[];
  blurb?: string;
}

const I = (i: IntervalDef) => i;

export const INTERVALS: IntervalDef[] = [
  I({ id: 'P1', semitones: 0, name: 'Unison', short: 'U', tier: 1, tags: ['perfect'] }),
  I({ id: 'm2', semitones: 1, name: 'Minor 2nd', short: 'm2', tier: 3, tags: ['second', 'dissonant'] }),
  I({ id: 'M2', semitones: 2, name: 'Major 2nd', short: 'M2', tier: 2, tags: ['second'] }),
  I({ id: 'm3', semitones: 3, name: 'Minor 3rd', short: 'm3', tier: 2, tags: ['third'] }),
  I({ id: 'M3', semitones: 4, name: 'Major 3rd', short: 'M3', tier: 2, tags: ['third'] }),
  I({ id: 'P4', semitones: 5, name: 'Perfect 4th', short: 'P4', tier: 2, tags: ['perfect'] }),
  I({ id: 'TT', semitones: 6, name: 'Tritone', short: 'TT', tier: 4, tags: ['tritone', 'dissonant'],
      blurb: 'The ♯11 or ♭5 — and the interval that makes a dominant chord want to resolve.' }),
  I({ id: 'P5', semitones: 7, name: 'Perfect 5th', short: 'P5', tier: 1, tags: ['perfect'] }),
  I({ id: 'm6', semitones: 8, name: 'Minor 6th', short: 'm6', tier: 3, tags: ['sixth'] }),
  I({ id: 'M6', semitones: 9, name: 'Major 6th', short: 'M6', tier: 3, tags: ['sixth'] }),
  I({ id: 'm7', semitones: 10, name: 'Minor 7th', short: 'm7', tier: 3, tags: ['seventh'] }),
  I({ id: 'M7', semitones: 11, name: 'Major 7th', short: 'M7', tier: 4, tags: ['seventh', 'dissonant'] }),
  I({ id: 'P8', semitones: 12, name: 'Octave', short: '8ve', tier: 1, tags: ['perfect'] }),
  // Compound intervals — the distances that actually occur in jazz melodies.
  I({ id: 'm9', semitones: 13, name: 'Minor 9th', short: 'm9', tier: 5, tags: ['compound', 'tension'] }),
  I({ id: 'M9', semitones: 14, name: 'Major 9th', short: 'M9', tier: 5, tags: ['compound', 'tension'] }),
  I({ id: 'M10', semitones: 16, name: 'Major 10th', short: 'M10', tier: 5, tags: ['compound'] }),
  I({ id: 'P11', semitones: 17, name: 'Perfect 11th', short: 'P11', tier: 5, tags: ['compound'] }),
  I({ id: 'M13', semitones: 21, name: 'Major 13th', short: 'M13', tier: 5, tags: ['compound', 'tension'] }),
];

/** The simple intervals, which every difficulty level draws on. */
export const SIMPLE_INTERVALS = INTERVALS.filter((i) => i.semitones <= 12);

const registry = new Map(INTERVALS.map((i) => [i.id, i]));

export function registerInterval(def: IntervalDef): void {
  registry.set(def.id, def);
  if (!INTERVALS.some((i) => i.id === def.id)) INTERVALS.push(def);
}

export function getInterval(id: string): IntervalDef | undefined {
  return registry.get(id);
}

export function requireInterval(id: string): IntervalDef {
  const i = registry.get(id);
  if (!i) throw new Error(`Unknown interval: ${id}`);
  return i;
}

export const intervalBySemitones = (semitones: number): IntervalDef | undefined =>
  INTERVALS.find((i) => i.semitones === semitones);

/** Closeness used to pick interval distractors: adjacent sizes are the trap. */
export function intervalSimilarity(a: IntervalDef, b: IntervalDef): number {
  if (a.id === b.id) return 1;
  const gap = Math.abs(a.semitones - b.semitones);
  const inversionGap = Math.abs(12 - a.semitones - b.semitones);
  // A 4th and a 5th, or a m3 and a M6, are mixed up far more often than their
  // raw distance suggests, so inversions count as near misses too.
  const near = Math.min(gap, inversionGap === 0 ? 1.5 : inversionGap + 1.5);
  return 1 / (1 + near);
}

export function nearestIntervals(
  target: IntervalDef,
  pool: readonly IntervalDef[],
  n: number,
): IntervalDef[] {
  return pool
    .filter((i) => i.id !== target.id)
    .map((i) => ({ i, s: intervalSimilarity(target, i) }))
    .sort((x, y) => y.s - x.s)
    .slice(0, n)
    .map((x) => x.i);
}

export function directionLabel(dir: IntervalDirection): string {
  return dir === 'ascending' ? 'Ascending' : dir === 'descending' ? 'Descending' : 'Harmonic';
}

export function intervalConcept(i: IntervalDef): Concept {
  return {
    id: conceptId('interval', i.id),
    kind: 'interval',
    name: i.name,
    short: i.short,
    tier: i.tier,
    tags: i.tags,
    blurb: i.blurb,
  };
}

export const intervalConceptId = (id: string) => conceptId('interval', id);
