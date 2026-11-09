import type { ExerciseType, Question } from './types';
import { buildOptions, chooseKey, chooseTarget, questionId } from './support';
import {
  CHORD_QUALITIES, chordConceptId, chordFullName, isSymmetrical, makeChord, slashSymbol,
  spellInChord, type ChordQuality,
} from '../music/chords';
import {
  bassToneOf, inversionConceptId, inversionsFor, type InversionDef,
} from '../music/inversions';
import { voiceChord, type VoicingStyle } from '../music/voicing';
import { pcName } from '../music/pitch';
import { polyphonyGain } from '../audio/performer';
import type { PracticeSettings } from '../session/settings';
import { clamp, mod } from '../lib/util';

/**
 * Inversions are only audible when the bass actually moves, so this exercise
 * draws on triads and sevenths — chords whose tones you can still count by ear
 * once they are turned over. A 13th chord has an inversion in theory and
 * nothing recognisable in practice.
 *
 * Symmetrical chords are left out for a stronger reason: an augmented triad or
 * a diminished seventh turned over is the very same set of notes, so no
 * listener could name its inversion and no answer would be more right than
 * another.
 */
export function invertibleQualities(settings: PracticeSettings): ChordQuality[] {
  const allowed = new Set(settings.chordQualities);
  const usable = (q: ChordQuality) =>
    q.intervals.length >= 3 &&
    q.intervals.length <= 4 &&
    q.intervals.every((i) => i < 12) &&
    !isSymmetrical(q);
  const pool = CHORD_QUALITIES.filter((q) => allowed.has(q.id) && usable(q));
  return pool.length ? pool : CHORD_QUALITIES.filter(usable);
}

function voicingStyle(difficulty: number): VoicingStyle {
  return difficulty >= 4 ? 'spread' : 'close';
}

/**
 * From which level the answers are slash chords rather than inversion names.
 *
 * "First inversion" is how the idea is taught and "C7/E" is how it is
 * written: a chart never says first inversion, it says the chord over the
 * note. Once the names are in the ear the useful skill is reading the bass
 * as a letter, so the top of the curve asks for what a player would see.
 *
 * Both forms grade the same answer — the option ids stay the inversion ids,
 * and so do the concepts — so a learner's history carries straight across.
 */
const SLASH_FROM = 4;

const asksForSlash = (difficulty: number) => difficulty >= SLASH_FROM;

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
    const slash = asksForSlash(ctx.difficulty);
    // The same chord over each bass note it holds: C7, C7/E, C7/G, C7/B♭.
    // The bass is spelled against the chord, so a C♯m7's third is written E
    // and never F♭ — see `slashSymbol`.
    const toOption = (i: InversionDef) => (slash
      ? {
        id: i.id,
        label: slashSymbol(
          chord, mod(rootPc + quality.intervals[i.index], 12), ctx.settings.accidental,
        ),
      }
      // Which tone is underneath, said twice over, would hand the answer to
      // anyone who knows the chord — so at this end the symbol stands alone.
      : { id: i.id, label: i.name, sub: bassToneOf(chord, i) });
    // Rolling the chord at the easy end lets the bass be heard arriving first.
    const roll = ctx.difficulty <= 2 ? 0.1 : 0.012;

    return {
      id: questionId('chord-inversion'),
      type: 'chord-inversion',
      conceptIds: [inversionConceptId(inversion.id), chordConceptId(quality.id)],
      difficulty: ctx.difficulty,
      keyPc: rootPc,
      prompt: {
        title: slash ? 'Which slash chord is this?' : 'Which inversion is this?',
        sub: ctx.difficulty <= 2 ? `A ${quality.name.toLowerCase()} chord` : undefined,
      },
      fields: [
        {
          // The key stays `inversion` whichever way the question is asked:
          // it is what the answer is graded against, and what the learning
          // model has been keeping records under all along.
          key: 'inversion',
          label: slash ? 'Chord' : 'Inversion',
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
        // The heading is the slash chord, so this names the inversion beside
        // it: whichever form the question asked for, the reveal teaches both.
        detail: `${inversion.name}  ·  ${bassToneOf(chord, inversion)} of ${chordFullName(chord, ctx.settings.accidental)} is in the bass`,
        notes: voicing.all.map((m) => spellInChord(chord, m, ctx.settings.accidental)).join('  '),
      },
      estimatedSeconds: 10 + clamp(ctx.difficulty, 1, 5),
    };
  },
};
