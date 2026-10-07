import type { ExerciseType, GenContext, Question } from './types';
import { allowedKeys, pitchClassField, questionId } from './support';
import { keyConceptId } from '../music/catalog';
import { pcName, pcNameDual } from '../music/pitch';
import { chordSymbol } from '../music/chords';
import {
  PROGRESSIONS, realiseProgression, romanLine, type ProgressionDef,
} from '../music/progressions';
import { voiceProgression } from '../music/voicing';
import { Performer } from '../audio/performer';
import { generatePhrase } from '../music/phrase';
import { requireScale } from '../music/scales';
import { clamp } from '../lib/util';

/** The pitch the user is given to measure from. */
const REFERENCE_PC = 0;

/**
 * Material that establishes a key, ordered so that higher difficulties get
 * progressively weaker cues: a plain I–IV–V–I announces its tonic, while a
 * progression that never lands on I leaves you to work it out.
 */
const MATERIAL_BY_LEVEL: Record<number, string[]> = {
  1: ['I-IV-V-I'],
  2: ['I-IV-V-I', 'ii-V-I'],
  3: ['ii-V-I', 'I-vi-ii-V', 'ii-V-i-minor', 'I-VI7-ii-V'],
  4: ['iii-VI-ii-V', 'deceptive', 'backdoor', 'minor-plagal', 'tritone-sub'],
  5: ['bVI-bVII-I', 'deceptive', 'dim-passing', 'backdoor'],
};

function chooseMaterial(ctx: GenContext): ProgressionDef | null {
  const enabled = new Set(ctx.settings.progressions);
  const level = clamp(Math.round(ctx.difficulty), 1, 5);
  for (let l = level; l >= 1; l--) {
    const candidates = (MATERIAL_BY_LEVEL[l] ?? [])
      .map((id) => PROGRESSIONS.find((p) => p.id === id))
      .filter((p): p is ProgressionDef => !!p && enabled.has(p.id));
    if (candidates.length) return ctx.rng.pick(candidates);
  }
  const any = PROGRESSIONS.filter((p) => enabled.has(p.id) && p.tonality !== 'modal');
  return any.length ? ctx.rng.pick(any) : null;
}

export const keyExercise: ExerciseType = {
  id: 'key',
  name: 'Tonal centre',
  short: 'Key',
  description: 'Music plays. Find the note that feels like home.',
  baseSeconds: 20,
  pool: (settings) => allowedKeysFor(settings).map(keyConceptId),
  generate(ctx): Question | null {
    const keys = allowedKeys(ctx);
    // Favour tonal centres the selector flagged, so weak keys come round again.
    const wanted = keys.filter((pc) => ctx.targetConcepts.includes(keyConceptId(pc)));
    const tonic = ctx.rng.pick(wanted.length ? wanted : keys);

    // Below level 4 the reference pitch is part of the question; above it the
    // reference is only available as a hint, which the model records.
    const givesReference = ctx.difficulty <= 3;
    // At the top level the key is carried by a melodic line alone.
    const melodicOnly = ctx.difficulty >= 5 && ctx.rng.chance(0.5);

    const material = melodicOnly ? null : chooseMaterial(ctx);
    if (!material && !melodicOnly) return null;

    const scale = requireScale(material?.tonality === 'minor' ? 'aeolian' : 'ionian');
    const phrase = generatePhrase({
      tonicMidi: 60 + tonic,
      scale,
      rng: ctx.rng,
      length: ctx.rng.range(7, 10),
      colour: 0.5,
      resolve: ctx.difficulty <= 4 ? true : ctx.rng.chance(0.55),
    });

    const realised = material ? realiseProgression(material, tonic) : [];
    const voicings = voiceProgression(realised.map((r) => r.chord), { style: 'spread', maxNotes: 4 });
    const changes = Performer.changes(realised, voicings);

    const playReference = (perf: Performer, origin: number) => {
      perf.note(REFERENCE_PC + 60, origin, 1.3, 0.55);
      return 1.6;
    };

    const play = (perf: Performer) => {
      const origin = perf.origin();
      let offset = 0;
      if (givesReference) offset = playReference(perf, origin) + 0.35;
      if (melodicOnly) {
        const len = perf.melody(phrase, origin + offset);
        return offset + len + 0.6;
      }
      const len = perf.progression(changes, origin + offset, {
        style: ctx.difficulty >= 4 ? 'comp' : 'sustained',
      });
      return offset + len + 0.4;
    };

    const keyLabel = pcNameDual(tonic);

    return {
      id: questionId('key'),
      type: 'key',
      conceptIds: [keyConceptId(tonic)],
      difficulty: ctx.difficulty,
      keyPc: tonic,
      prompt: {
        title: 'Which note is the tonal centre?',
        sub: givesReference
          ? `Reference ${pcName(REFERENCE_PC, ctx.settings.accidental)} sounds first`
          : 'No reference pitch — use the hint if you need one',
      },
      fields: [pitchClassField('key', 'Tonal centre')],
      correct: { key: String(tonic) },
      play,
      playReveal: (perf) => {
        const origin = perf.origin();
        perf.note(tonic + 48, origin, 1.2, 0.6);
        perf.note(tonic + 60, origin, 1.2, 0.5);
        if (melodicOnly) return 1.4 + perf.melody(phrase, origin + 1.5);
        return 1.5 + perf.progression(changes, origin + 1.5, { style: 'sustained' });
      },
      hint: {
        label: `Reference ${pcName(REFERENCE_PC, ctx.settings.accidental)}`,
        description:
          'Sounds a reference pitch. Finding the key relative to it is the skill being trained — not absolute pitch.',
        play: (perf) => playReference(perf, perf.origin()),
      },
      reveal: {
        heading: `${keyLabel} ${material?.tonality === 'minor' ? 'minor' : 'major'}`,
        detail: melodicOnly
          ? 'Melodic line, no harmony'
          : `${material?.name ?? ''}  ·  ${material ? romanLine(material) : ''}`,
        notes: material
          ? realised.map((r) => chordSymbol(r.chord, ctx.settings.accidental)).join('  |  ')
          : undefined,
      },
      estimatedSeconds: 17 + ctx.difficulty * 2,
    };
  },
};

function allowedKeysFor(settings: { keys: PracticeKeys }): number[] {
  return settings.keys === 'all' || !settings.keys.length
    ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
    : settings.keys;
}

type PracticeKeys = number[] | 'all';
