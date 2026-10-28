import type { ExerciseType, GenContext, Question } from './types';
import {
  buildOptions, chooseKey, chooseTarget, optionCount, pickDistractors, pitchClassField, questionId,
} from './support';
import {
  CHORD_QUALITIES, chordConceptId, chordDegrees, chordFullName, makeChord, nearestQualities,
  qualityLabel, qualityPitchClasses, samePitchClasses, slashSymbol,
  type Chord, type ChordQuality,
} from '../music/chords';
import { inversionByIndex } from '../music/inversions';
import { inversionIndex } from '../music/voicing';
import { mod } from '../lib/util';
import { arpeggiate, voiceChord, type VoicingStyle } from '../music/voicing';
import { chooseVoicing, voicingBass, voicingLabel } from './voicing-plan';
import { polyphonyGain } from '../audio/performer';
import { keyConceptId } from '../music/catalog';
import { PITCH_CLASSES, midiName, pcName, pcNameDual, type PitchClass } from '../music/pitch';
import type { PracticeSettings } from '../session/settings';
import { clamp } from '../lib/util';

/** A reference pitch the user can measure everything else against. */
const REFERENCE_PC = 0;

function enabledQualities(settings: PracticeSettings): ChordQuality[] {
  const allowed = new Set(settings.chordQualities);
  const pool = CHORD_QUALITIES.filter((q) => allowed.has(q.id));
  return pool.length ? pool : CHORD_QUALITIES;
}

/**
 * How the chord is presented.
 *
 * This is the real difficulty lever for chord recognition: a root-position
 * close voicing with a bass note underneath hands you the root and the stack,
 * while a rootless inversion with no bass makes you hear the chord itself.
 * The styles come from the shared curve, so what a chord question offers and
 * what a progression question offers move together.
 */
function voicingPlan(ctx: GenContext): { style: VoicingStyle; bass: boolean; maxNotes: number } {
  const difficulty = clamp(Math.round(ctx.difficulty), 1, 5);
  const style = chooseVoicing(ctx.rng, ctx.settings.voicingMode, difficulty, ctx.voicingFocus);
  return {
    style,
    bass: voicingBass(style, difficulty) && ctx.rng.chance(difficulty <= 2 ? 1 : 0.7),
    maxNotes: difficulty <= 1 ? 4 : 5,
  };
}

function soundingPitchClasses(voicing: ReturnType<typeof voiceChord>): Set<PitchClass> {
  return new Set(voicing.all.map((m) => mod(m, 12)));
}

/**
 * Drops the wrong answers that would in fact be right.
 *
 * A voicing that leaves the root out can land exactly on another chord: a
 * rootless Em7♭5 is a G minor triad note for note, and D sus2 and A sus4 are
 * the same three notes read from different roots. Offering both gives the
 * listener nothing to decide on, so any quality that reproduces what sounded —
 * from any root — is kept out of the running.
 */
function unambiguous(
  pool: ChordQuality[],
  target: ChordQuality,
  sounding: Set<PitchClass>,
): ChordQuality[] {
  const matchesEar = (q: ChordQuality) =>
    PITCH_CLASSES.some((root) => samePitchClasses(qualityPitchClasses(q, root), sounding));
  const kept = pool.filter((q) => q === target || !matchesEar(q));
  // Two options is the least a question can offer; below that, take the pool
  // as it stands rather than hand back something unanswerable.
  return kept.length >= 2 ? kept : pool;
}

function qualityOption(q: ChordQuality) {
  return { id: q.id, label: qualityLabel(q), sub: q.name, group: q.group };
}

interface ChordMaterial {
  quality: ChordQuality;
  rootPc: number;
  voicing: ReturnType<typeof voiceChord>;
  style: VoicingStyle;
  play: (perf: import('../audio/performer').Performer) => number;
  playReveal: (perf: import('../audio/performer').Performer) => number;
  playPlain: (perf: import('../audio/performer').Performer) => number;
}

function buildMaterial(ctx: GenContext, quality: ChordQuality, rootPc: number): ChordMaterial {
  const chord = makeChord(rootPc, quality.id);
  const plan = voicingPlan(ctx);
  const voicing = voiceChord(chord, { style: plan.style, bass: plan.bass, maxNotes: plan.maxNotes });
  // The same chord stacked from its root with the root underneath: what the
  // voicing was dressing up, offered after the answer.
  const plain = voiceChord(chord, { style: 'close', bottomPc: rootPc, bass: true, maxNotes: 5 });
  // A rolled chord at the easy end lets the ear walk up the stack; higher up
  // it is struck as a block, which is how you meet it on a bandstand.
  const roll = ctx.difficulty <= 1 ? 0.14 : ctx.difficulty <= 2 ? 0.045 : 0.012;

  return {
    quality,
    rootPc,
    voicing,
    style: plan.style,
    playPlain: (perf) => {
      const origin = perf.origin();
      const gain = polyphonyGain(plain.all.length);
      plain.notes.forEach((midi, i) => perf.note(midi, origin + i * 0.012, 3, 0.66, { gain }));
      if (plain.bass !== undefined) {
        perf.note(plain.bass, origin, 3, 0.72, { instrument: 'bass', gain });
      }
      return 3.2;
    },
    play: (perf) => {
      const origin = perf.origin();
      perf.chord(voicing, origin, 0, { beats: 4, roll, velocity: 0.7 });
      return 4 * perf.beatSeconds;
    },
    playReveal: (perf) => {
      const origin = perf.origin();
      const notes = arpeggiate(chord, 55);
      notes.forEach((midi, i) => perf.note(midi, origin + i * 0.26, 0.5, 0.62));
      // The block chord follows the arpeggio, scheduled in absolute time.
      const after = origin + notes.length * 0.26 + 0.2;
      const voices = voicing.all.length;
      const gain = polyphonyGain(voices);
      voicing.notes.forEach((midi) => perf.note(midi, after, 2.6, 0.66, { gain }));
      if (voicing.bass !== undefined) {
        perf.note(voicing.bass, after, 2.6, 0.7, { instrument: 'bass', gain });
      }
      return after - origin + 2.6;
    },
  };
}

/**
 * What actually sounded.
 *
 * Several of the voicing styles turn the chord over, so the heading uses slash
 * notation and the detail names the inversion — otherwise the reveal reports
 * less than the ear was given.
 */
function revealFor(
  chord: Chord,
  voicing: ReturnType<typeof voiceChord>,
  style: VoicingStyle,
  accidental: PracticeSettings['accidental'],
) {
  const bassPc = mod(voicing.all[0], 12);
  const inverted = inversionByIndex(inversionIndex(chord, voicing));
  const named = inverted && inverted.index > 0 ? inverted : undefined;
  const parts = [chordFullName(chord, accidental), voicingLabel(style)];
  if (named) parts.splice(1, 0, named.name);
  return {
    heading: slashSymbol(chord, bassPc, accidental),
    detail: parts.join('  \u00b7  '),
    // The degrees say what the voicing is; the note names say what it was.
    notes: `${voicing.all.map((m) => midiName(m, accidental)).join('  ')}` +
      `   \u2014   ${chordDegrees(chord, voicing.notes).join(' ')}`,
  };
}

export const chordQualityExercise: ExerciseType = {
  id: 'chord-quality',
  name: 'Chord quality',
  short: 'Quality',
  description: 'One chord sounds. Name the quality.',
  baseSeconds: 13,
  pool: (settings) => enabledQualities(settings).map((q) => chordConceptId(q.id)),
  generate(ctx): Question | null {
    const pool = enabledQualities(ctx.settings);
    const quality = chooseTarget(ctx, pool, (q) => chordConceptId(q.id), (q) => q.tier);
    if (!quality) return null;
    const rootPc = chooseKey(ctx);
    const material = buildMaterial(ctx, quality, rootPc);

    const offered = unambiguous(pool, quality, soundingPitchClasses(material.voicing));
    const n = optionCount(ctx.difficulty, offered.length);
    const distractors = pickDistractors(ctx.rng, quality, offered, n - 1, ctx.difficulty, nearestQualities);
    const chord = makeChord(rootPc, quality.id);

    return {
      id: questionId('chord-quality'),
      type: 'chord-quality',
      conceptIds: [chordConceptId(quality.id)],
      difficulty: ctx.difficulty,
      keyPc: rootPc,
      prompt: { title: 'What quality is this chord?' },
      fields: [
        {
          key: 'quality',
          label: 'Quality',
          options: buildOptions(ctx.rng, quality, distractors, qualityOption),
          columns: 2,
        },
      ],
      correct: { quality: quality.id },
      play: material.play,
      playReveal: material.playReveal,
      playPlain: material.playPlain,
      voicing: material.style,
      hint: {
        label: 'Root',
        description: `Sounds the root of the chord (${pcNameDual(rootPc)}) on its own.`,
        play: (perf) => {
          perf.note(rootPc + 48, perf.origin(), 1.6, 0.6);
          return 1.6;
        },
      },
      reveal: revealFor(chord, material.voicing, material.style, ctx.settings.accidental),
      estimatedSeconds: 11 + ctx.difficulty,
    };
  },
};

export const chordFullExercise: ExerciseType = {
  id: 'chord-full',
  name: 'Chord — root and quality',
  short: 'Root + quality',
  description: 'Name both the root and the quality of the chord.',
  baseSeconds: 18,
  pool: (settings) => enabledQualities(settings).map((q) => chordConceptId(q.id)),
  generate(ctx): Question | null {
    const pool = enabledQualities(ctx.settings);
    const quality = chooseTarget(ctx, pool, (q) => chordConceptId(q.id), (q) => q.tier);
    if (!quality) return null;
    const rootPc = chooseKey(ctx);
    const material = buildMaterial(ctx, quality, rootPc);

    const offered = unambiguous(pool, quality, soundingPitchClasses(material.voicing));
    const n = optionCount(ctx.difficulty, offered.length);
    const distractors = pickDistractors(ctx.rng, quality, offered, n - 1, ctx.difficulty, nearestQualities);
    const chord = makeChord(rootPc, quality.id);

    return {
      id: questionId('chord-full'),
      type: 'chord-full',
      conceptIds: [chordConceptId(quality.id), keyConceptId(rootPc)],
      difficulty: ctx.difficulty,
      keyPc: rootPc,
      prompt: { title: 'Name the chord', sub: 'Root, then quality' },
      fields: [
        pitchClassField('root', 'Root'),
        {
          key: 'quality',
          label: 'Quality',
          options: buildOptions(ctx.rng, quality, distractors, qualityOption),
          columns: 2,
        },
      ],
      correct: { root: String(rootPc), quality: quality.id },
      play: material.play,
      playReveal: material.playReveal,
      playPlain: material.playPlain,
      voicing: material.style,
      hint: {
        label: `Reference ${pcName(REFERENCE_PC, ctx.settings.accidental)}`,
        description:
          'Sounds a reference pitch so you can find the root by ear rather than by absolute pitch.',
        play: (perf) => {
          perf.note(REFERENCE_PC + 60, perf.origin(), 1.6, 0.58);
          return 1.6;
        },
      },
      reveal: revealFor(chord, material.voicing, material.style, ctx.settings.accidental),
      estimatedSeconds: 15 + ctx.difficulty,
    };
  },
};
