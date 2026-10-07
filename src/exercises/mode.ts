import type { ExerciseType, Question } from './types';
import {
  buildOptions, chooseKey, chooseTarget, optionCount, pickDistractors, questionId,
} from './support';
import {
  SCALES, nearestScales, scaleConceptId, type ScaleDef,
} from '../music/scales';
import { generatePhrase, phraseDurationBeats, scaleRun, type PhraseNote } from '../music/phrase';
import { makeChord } from '../music/chords';
import { voiceChord, voiceProgression } from '../music/voicing';
import { pcNameDual } from '../music/pitch';
import type { Performer } from '../audio/performer';
import type { PracticeSettings } from '../session/settings';
import { clamp, mod } from '../lib/util';

function enabledModes(settings: PracticeSettings): ScaleDef[] {
  const allowed = new Set(settings.modes);
  const pool = SCALES.filter((s) => allowed.has(s.id));
  return pool.length ? pool : SCALES.filter((s) => s.core);
}

export const modeExercise: ExerciseType = {
  id: 'mode',
  name: 'Modes',
  short: 'Modes',
  description: 'A tonal centre is established, then a line is played over it. Name the mode.',
  baseSeconds: 24,
  pool: (settings) => enabledModes(settings).map((s) => scaleConceptId(s.id)),
  generate(ctx): Question | null {
    const pool = enabledModes(ctx.settings);
    if (pool.length < 2) return null;
    const scale = chooseTarget(ctx, pool, (s) => scaleConceptId(s.id), (s) => s.tier);
    if (!scale) return null;
    const tonic = chooseKey(ctx);
    const level = clamp(Math.round(ctx.difficulty), 1, 5);
    const tonicMidi = 60 + (tonic > 6 ? tonic - 12 : tonic);

    // Low levels hear the scale itself; higher levels only ever get a line, so
    // the mode has to be recognised from its colour rather than counted out.
    const useScaleRun = level <= 2;
    const line: PhraseNote[] = useScaleRun
      ? scaleRun(tonicMidi, scale, { descend: level === 1 })
      : generatePhrase({
          tonicMidi,
          scale,
          rng: ctx.rng,
          length: ctx.rng.range(7, 10),
          colour: level >= 5 ? 0.55 : level >= 4 ? 0.7 : 0.9,
          resolve: level <= 3 ? true : ctx.rng.chance(0.6),
        });

    // The vamp pins the tonic down without naming the mode.
    const vampDefs = level >= 5 ? scale.vamp.slice(0, 1) : scale.vamp;
    const vampChords = vampDefs.map((v) => makeChord(mod(tonic + v.degree, 12), v.quality));
    const vampVoicings = voiceProgression(vampChords, { style: 'spread', bass: true, maxNotes: 4 });
    const vampBeats = 2;
    const vampLength = vampBeats * Math.max(1, vampChords.length);
    const bedVoicing = voiceChord(vampChords[0], { style: 'rootless', maxNotes: 4 });
    const lineBeats = phraseDurationBeats(line);

    const play = (perf: Performer) => {
      const origin = perf.origin();
      vampVoicings.forEach((v, i) => {
        perf.chord(v, origin, i * vampBeats, { beats: vampBeats, velocity: 0.6, roll: 0.012 });
      });
      const lineStart = vampLength + 0.5;
      // A quiet bed under the line keeps the tonic in the ear.
      perf.chord(bedVoicing, origin, lineStart, {
        beats: lineBeats + 1,
        velocity: 0.3,
        roll: 0.02,
      });
      perf.drone(tonic, origin + (lineStart * 60) / perf.tempo, lineBeats + 1, 0.22);
      perf.melody(line, origin, lineStart + 0.5);
      return ((lineStart + lineBeats + 1.5) * 60) / perf.tempo;
    };

    const n = optionCount(ctx.difficulty, pool.length);
    const distractors = pickDistractors(ctx.rng, scale, pool, n - 1, ctx.difficulty, nearestScales);

    const characteristic = scale.characteristic
      .map((d) => scale.spelling.split(' ')[scale.degrees.indexOf(d)])
      .filter(Boolean)
      .join(', ');

    return {
      id: questionId('mode'),
      type: 'mode',
      conceptIds: [scaleConceptId(scale.id)],
      difficulty: ctx.difficulty,
      keyPc: tonic,
      prompt: {
        title: 'Which mode is this?',
        sub: useScaleRun ? 'Vamp, then the scale' : 'Vamp, then a line over it',
      },
      fields: [
        {
          key: 'mode',
          label: 'Mode',
          options: buildOptions(ctx.rng, scale, distractors, (s) => ({
            id: s.id,
            label: s.name,
            sub: s.spelling,
          })),
          columns: 2,
        },
      ],
      correct: { mode: scale.id },
      play,
      playReveal: (perf) => {
        const origin = perf.origin();
        const run = scaleRun(tonicMidi, scale, { descend: false });
        perf.chord(bedVoicing, origin, 0, { beats: phraseDurationBeats(run) + 1, velocity: 0.3 });
        perf.melody(run, origin, 0);
        return ((phraseDurationBeats(run) + 1.5) * 60) / perf.tempo;
      },
      hint: {
        label: 'Tonic',
        description: `Sounds the tonic (${pcNameDual(tonic)}) so you can hear the line against it.`,
        play: (perf) => {
          const origin = perf.origin();
          perf.note(tonicMidi - 12, origin, 2, 0.55);
          perf.note(tonicMidi, origin, 2, 0.5);
          return 2;
        },
      },
      reveal: {
        heading: `${pcNameDual(tonic)} ${scale.name}`,
        detail: scale.spelling,
        notes: characteristic ? `Listen for the ${characteristic}` : scale.blurb,
      },
      estimatedSeconds: 20 + ctx.difficulty * 2,
    };
  },
};
