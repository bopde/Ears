import type { ExerciseType, Question } from './types';
import { buildOptions, chooseKey, chooseTarget, questionId } from './support';
import {
  CHORD_QUALITIES, chordConceptId, chordFullName, makeChord, slashSymbol, type ChordQuality,
} from '../music/chords';
import { inversionConceptId, inversionsFor, type InversionDef } from '../music/inversions';
import { voiceChord, type VoicingStyle } from '../music/voicing';
import { midiName, pcName } from '../music/pitch';
import { polyphonyGain } from '../audio/performer';
import type { PracticeSettings } from '../session/settings';
import { clamp, mod } from '../lib/util';

/**
 * Inversions are only audible when the bass actually moves, so this exercise
 * draws on triads and sevenths — chords whose tones you can still count by ear
 * once they are turned over. A 13th chord has an inversion in theory and
 * nothing recognisable in practice.
 */
function invertibleQualities(settings: PracticeSettings): ChordQuality[] {
  const allowed = new Set(settings.chordQualities);
  const usable = (q: ChordQuality) =>
    q.intervals.length >= 3 && q.intervals.length <= 4 && q.intervals.every((i) => i < 12);
  const pool = CHORD_QUALITIES.filter((q) => allowed.has(q.id) && usable(q));
  return pool.length ? pool : CHORD_QUALITIES.filter(usable);
}

function voicingStyle(difficulty: number): VoicingStyle {
  return difficulty >= 4 ? 'spread' : 'close';
}

export const inversionExercise: ExerciseType = {
  id: 'chord-inversion',
  name: 'Inversions',
  short: 'Inversions',
  description: 'A chord sounds with one of its notes in the bass. Which inversion is it?',
  baseSeconds: 12,
  pool: (settings) => {
    const tones = Math.max(...invertibleQualities(settings).map((q) => q.intervals.length));
    return inversionsFor(tones).map((i) => inversionConceptId(i.id));
  },
  generate(ctx): Question | null {
    const qualities = invertibleQualities(ctx.settings);
    if (!qualities.length) return null;

    // Choose the inversion first so the adaptive model can ask for one, then a
    // chord with enough tones to actually have it.
    const widest = Math.max(...qualities.map((q) => q.intervals.length));
    const available = inversionsFor(widest);
    if (available.length < 2) return null;
    const inversion = chooseTarget(
      ctx,
      available,
      (i) => inversionConceptId(i.id),
      (i) => i.tier,
    );
    if (!inversion) return null;

    const fitting = qualities.filter((q) => q.intervals.length > inversion.index);
    if (!fitting.length) return null;
    // Triads first while the ear is learning the shape; sevenths once it is not.
    const quality = ctx.rng.weighted(fitting, (q) => {
      const triad = q.intervals.length === 3;
      const shape = ctx.difficulty <= 2 ? (triad ? 4 : 1) : ctx.difficulty >= 4 ? (triad ? 1 : 3) : 2;
      return shape / (1 + Math.abs(q.tier - ctx.difficulty));
    });

    const rootPc = chooseKey(ctx);
    const chord = makeChord(rootPc, quality.id);
    const bassPc = mod(rootPc + quality.intervals[inversion.index], 12);
    const voicing = voiceChord(chord, {
      style: voicingStyle(ctx.difficulty),
      bass: true,
      bottomPc: bassPc,
      bassPc,
      maxNotes: 4,
    });

    const options = inversionsFor(quality.intervals.length);
    const toOption = (i: InversionDef) => ({ id: i.id, label: i.name, sub: i.bassTone });
    // Rolling the chord at the easy end lets the bass be heard arriving first.
    const roll = ctx.difficulty <= 2 ? 0.1 : 0.012;

    return {
      id: questionId('chord-inversion'),
      type: 'chord-inversion',
      conceptIds: [inversionConceptId(inversion.id), chordConceptId(quality.id)],
      difficulty: ctx.difficulty,
      keyPc: rootPc,
      prompt: {
        title: 'Which inversion is this?',
        sub: ctx.difficulty <= 2 ? `A ${quality.name.toLowerCase()} chord` : undefined,
      },
      fields: [
        {
          key: 'inversion',
          label: 'Inversion',
          options: buildOptions(
            ctx.rng,
            inversion,
            options.filter((i) => i.id !== inversion.id),
            toOption,
          ),
          columns: 2,
        },
      ],
      correct: { inversion: inversion.id },
      play: (perf) => {
        const origin = perf.origin();
        perf.chord(voicing, origin, 0, { beats: 4, roll, velocity: 0.7 });
        return 4 * perf.beatSeconds;
      },
      playReveal: (perf) => {
        const origin = perf.origin();
        // Bottom upward and slowly, so the bass note is unmistakable.
        const gain = polyphonyGain(voicing.all.length);
        voicing.all.forEach((midi, i) => perf.note(midi, origin + i * 0.42, 0.9, 0.64, { gain }));
        const after = origin + voicing.all.length * 0.42 + 0.25;
        voicing.notes.forEach((midi) => perf.note(midi, after, 2.6, 0.66, { gain }));
        if (voicing.bass !== undefined) {
          perf.note(voicing.bass, after, 2.6, 0.7, { instrument: 'bass', gain });
        }
        return after - origin + 2.8;
      },
      hint: {
        label: 'Root',
        description: `Sounds the root (${pcName(rootPc, ctx.settings.accidental)}) on its own, to measure the bass note against.`,
        play: (perf) => {
          perf.note(rootPc + 48, perf.origin(), 1.6, 0.6);
          return 1.6;
        },
      },
      reveal: {
        heading: slashSymbol(chord, bassPc, ctx.settings.accidental),
        detail: `${inversion.name} — ${inversion.bassTone} of ${chordFullName(chord, ctx.settings.accidental)} is in the bass`,
        notes: voicing.all.map((m) => midiName(m, ctx.settings.accidental)).join('  '),
      },
      estimatedSeconds: 10 + clamp(ctx.difficulty, 1, 5),
    };
  },
};
