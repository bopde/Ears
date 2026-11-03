import { ConceptRegistry, conceptId, type Concept } from './concept';
import { CHORD_QUALITIES, chordConcept } from './chords';
import { INTERVALS, intervalConcept } from './intervals';
import { SCALES, scaleConcept } from './scales';
import { PROGRESSIONS, progressionConcept } from './progressions';
import { INVERSIONS, inversionConcept } from './inversions';
import { PITCH_CLASSES, pcNameDual, type PitchClass } from './pitch';
import { VOICING_STYLES, type VoicingStyle } from './voicing';

/**
 * The one place a voicing is named, kept here so the music layer does not
 * depend on the UI and so a style cannot be called two things in two screens.
 *
 * A name says which notes are in the voicing, how they are spaced and — only
 * where that is the difference — what is at the bottom. It never says anything
 * about voice leading or about the bass, because every style voice-leads
 * through a progression and every style can be played over a bass; those are
 * not what tells one shape from another. Tensions modify a voicing rather than
 * define one, so they are not in the name either.
 */
export const VOICING_NAMES: Record<VoicingStyle, string> = {
  close: 'Close, root position',
  // Not "Spread": the engine stacks these close (see `stack` in voicing.ts),
  // and what distinguishes them from `close` is the inversion, not the spacing.
  spread: 'Close, inversion',
  drop2: 'Drop 2',
  rootless: 'Rootless',
  shell: 'Shell',
  quartal: 'Quartal',
  upperStructure: 'Upper-structure triad',
};

/** The same names where a chip or a tab has no room for the full one. */
export const VOICING_SHORT: Record<VoicingStyle, string> = {
  close: 'Root pos.',
  spread: 'Inversion',
  drop2: 'Drop 2',
  rootless: 'Rootless',
  shell: 'Shell',
  quartal: 'Quartal',
  upperStructure: 'Upper str.',
};

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
 * Voicing shapes are concepts in their own right only for the exercise that
 * asks about them by name. Everywhere else a voicing is a modifier on a chord
 * or a progression, recorded inside that concept's own record rather than as
 * five more things to schedule.
 */
const VOICING_TIER: Record<string, number> = {
  close: 1, spread: 2, shell: 3, drop2: 4, rootless: 4, quartal: 5, upperStructure: 5,
};

export function voicingConcept(style: VoicingStyle): Concept {
  return {
    id: conceptId('voicing', style),
    kind: 'voicing',
    name: VOICING_NAMES[style],
    short: VOICING_SHORT[style],
    tier: VOICING_TIER[style] ?? 3,
    tags: ['voicing'],
  };
}

export const voicingConceptId = (style: VoicingStyle) => conceptId('voicing', style);

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
    ...INVERSIONS.map(inversionConcept),
    ...PITCH_CLASSES.map(keyConcept),
    ...VOICING_STYLES.map(voicingConcept),
  ]);
}

export const CONCEPTS = buildCatalog();
