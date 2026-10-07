import type { ExerciseType, GenContext, Question } from './types';
import {
  buildOptions, chooseKey, chooseTarget, optionCount, pickDistractors, pitchClassField, questionId,
} from './support';
import {
  CHORD_QUALITIES, chordConceptId, chordFullName, chordSymbol, makeChord, nearestQualities,
  qualityLabel, type ChordQuality,
} from '../music/chords';
import { arpeggiate, voiceChord, type VoicingStyle } from '../music/voicing';
import { polyphonyGain } from '../audio/performer';
import { keyConceptId } from '../music/catalog';
import { midiName, pcName, pcNameDual } from '../music/pitch';
import type { PracticeSettings } from '../session/settings';
import type { Rng } from '../lib/rng';
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
 */
function voicingPlan(difficulty: number, rng: Rng): { style: VoicingStyle; bass: boolean; maxNotes: number } {
  switch (clamp(Math.round(difficulty), 1, 5)) {
    case 1:
      return { style: 'close', bass: true, maxNotes: 4 };
    case 2:
      return { style: 'close', bass: true, maxNotes: 5 };
    case 3:
      return { style: rng.pick<VoicingStyle>(['close', 'spread']), bass: rng.chance(0.75), maxNotes: 5 };
    case 4:
      return {
        style: rng.pick<VoicingStyle>(['spread', 'drop2', 'rootless']),
        bass: rng.chance(0.35),
        maxNotes: 5,
      };
    default:
      return { style: rng.pick<VoicingStyle>(['rootless', 'drop2']), bass: false, maxNotes: 5 };
  }
}

function qualityOption(q: ChordQuality) {
  return { id: q.id, label: qualityLabel(q), sub: q.name, group: q.group };
}

interface ChordMaterial {
  quality: ChordQuality;
  rootPc: number;
  voicing: ReturnType<typeof voiceChord>;
  play: (perf: import('../audio/performer').Performer) => number;
  playReveal: (perf: import('../audio/performer').Performer) => number;
}

function buildMaterial(ctx: GenContext, quality: ChordQuality, rootPc: number): ChordMaterial {
  const chord = makeChord(rootPc, quality.id);
  const plan = voicingPlan(ctx.difficulty, ctx.rng);
  const voicing = voiceChord(chord, { style: plan.style, bass: plan.bass, maxNotes: plan.maxNotes });
  // A rolled chord at the easy end lets the ear walk up the stack; higher up
  // it is struck as a block, which is how you meet it on a bandstand.
  const roll = ctx.difficulty <= 1 ? 0.14 : ctx.difficulty <= 2 ? 0.045 : 0.012;

  return {
    quality,
    rootPc,
    voicing,
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

function chordNotesLine(voicing: ReturnType<typeof voiceChord>, accidental: PracticeSettings['accidental']): string {
  return voicing.all.map((m) => midiName(m, accidental)).join('  ');
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

    const n = optionCount(ctx.difficulty, pool.length);
    const distractors = pickDistractors(ctx.rng, quality, pool, n - 1, ctx.difficulty, nearestQualities);
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
      hint: {
        label: 'Root',
        description: `Sounds the root of the chord (${pcNameDual(rootPc)}) on its own.`,
        play: (perf) => {
          perf.note(rootPc + 48, perf.origin(), 1.6, 0.6);
          return 1.6;
        },
      },
      reveal: {
        heading: chordSymbol(chord, ctx.settings.accidental),
        detail: chordFullName(chord, ctx.settings.accidental),
        notes: chordNotesLine(material.voicing, ctx.settings.accidental),
      },
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

    const n = optionCount(ctx.difficulty, pool.length);
    const distractors = pickDistractors(ctx.rng, quality, pool, n - 1, ctx.difficulty, nearestQualities);
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
      hint: {
        label: `Reference ${pcName(REFERENCE_PC, ctx.settings.accidental)}`,
        description:
          'Sounds a reference pitch so you can find the root by ear rather than by absolute pitch.',
        play: (perf) => {
          perf.note(REFERENCE_PC + 60, perf.origin(), 1.6, 0.58);
          return 1.6;
        },
      },
      reveal: {
        heading: chordSymbol(chord, ctx.settings.accidental),
        detail: chordFullName(chord, ctx.settings.accidental),
        notes: chordNotesLine(material.voicing, ctx.settings.accidental),
      },
      estimatedSeconds: 15 + ctx.difficulty,
    };
  },
};
