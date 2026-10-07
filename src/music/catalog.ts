import { ConceptRegistry, conceptId, type Concept } from './concept';
import { CHORD_QUALITIES, chordConcept } from './chords';
import { INTERVALS, intervalConcept } from './intervals';
import { SCALES, scaleConcept } from './scales';
import { PROGRESSIONS, progressionConcept } from './progressions';
import { PITCH_CLASSES, pcNameDual, type PitchClass } from './pitch';

/** Keys get concepts too, so the model can tell C major from G♭ major. */
const KEY_TIER: Record<number, number> = {
  0: 1, 7: 2, 5: 2, 2: 2, 10: 2, 9: 3, 3: 3, 4: 3, 8: 3, 11: 4, 1: 4, 6: 4,
};

export function keyConcept(pc: PitchClass): Concept {
  return {
    id: conceptId('key', String(pc)),
    kind: 'key',
    name: `Key of ${pcNameDual(pc)}`,
    short: pcNameDual(pc),
    tier: KEY_TIER[pc] ?? 3,
    tags: ['tonal-centre'],
  };
}

export const keyConceptId = (pc: PitchClass) => conceptId('key', String(pc));

/**
 * Every trainable idea in one place. Built from the music definitions rather
 * than written out by hand, so registering a new chord quality, mode or
 * progression automatically makes it trackable and practisable.
 */
export function buildCatalog(): ConceptRegistry {
  return new ConceptRegistry([
    ...CHORD_QUALITIES.map(chordConcept),
    ...INTERVALS.map(intervalConcept),
    ...SCALES.map(scaleConcept),
    ...PROGRESSIONS.map(progressionConcept),
    ...PITCH_CLASSES.map(keyConcept),
  ]);
}

export const CONCEPTS = buildCatalog();
