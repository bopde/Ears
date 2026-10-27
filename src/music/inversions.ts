import type { Concept } from './concept';
import { conceptId } from './concept';

/**
 * Inversions, as a registry like everything else.
 *
 * `index` is the position in a chord's own interval list that sits in the
 * bass, so it works for any quality rather than assuming stacked thirds: a
 * sus4 chord's "first inversion" puts its 4th in the bass, which is what its
 * interval list says sits at index 1.
 */
export interface InversionDef {
  id: string;
  /** Index into the chord's tones of the note in the bass. */
  index: number;
  name: string;
  short: string;
  tier: number;
  tags: readonly string[];
  /** Which tone it puts underneath, in plain terms. */
  bassTone: string;
  blurb?: string;
}

export const INVERSIONS: InversionDef[] = [
  { id: 'root', index: 0, name: 'Root position', short: 'Root', tier: 1,
    tags: ['inversion'], bassTone: 'the root',
    blurb: 'The root is underneath — the chord sits on its own foundation.' },
  { id: '1st', index: 1, name: 'First inversion', short: '1st', tier: 2,
    tags: ['inversion'], bassTone: 'the 3rd',
    blurb: 'The 3rd is in the bass, which leaves the chord sounding lighter and less settled.' },
  { id: '2nd', index: 2, name: 'Second inversion', short: '2nd', tier: 3,
    tags: ['inversion'], bassTone: 'the 5th',
    blurb: 'The 5th is in the bass — unstable, and usually on its way somewhere.' },
  { id: '3rd', index: 3, name: 'Third inversion', short: '3rd', tier: 4,
    tags: ['inversion', 'seventh'], bassTone: 'the 7th',
    blurb: 'The 7th is in the bass. Only a seventh chord has one, and it leans hard downward.' },
];

const registry = new Map(INVERSIONS.map((i) => [i.id, i]));

export function registerInversion(def: InversionDef): void {
  registry.set(def.id, def);
  if (!INVERSIONS.some((i) => i.id === def.id)) INVERSIONS.push(def);
}

export function getInversion(id: string): InversionDef | undefined {
  return registry.get(id);
}

export function requireInversion(id: string): InversionDef {
  const found = registry.get(id);
  if (!found) throw new Error(`Unknown inversion: ${id}`);
  return found;
}

/** The inversion that puts the tone at this position in the bass. */
export function inversionByIndex(index: number): InversionDef | undefined {
  return INVERSIONS.find((i) => i.index === index);
}

/** The inversions a chord of this many tones actually has. */
export function inversionsFor(toneCount: number): InversionDef[] {
  return INVERSIONS.filter((i) => i.index < toneCount);
}

/** Neighbouring inversions are the believable wrong answers. */
export function nearestInversions(
  target: InversionDef,
  pool: readonly InversionDef[],
  n: number,
): InversionDef[] {
  return pool
    .filter((i) => i.id !== target.id)
    .sort((a, b) => Math.abs(a.index - target.index) - Math.abs(b.index - target.index))
    .slice(0, n);
}

export function inversionConcept(def: InversionDef): Concept {
  return {
    id: conceptId('inversion', def.id),
    kind: 'inversion',
    name: def.name,
    short: def.short,
    tier: def.tier,
    tags: def.tags,
    blurb: def.blurb,
  };
}

export const inversionConceptId = (id: string) => conceptId('inversion', id);
