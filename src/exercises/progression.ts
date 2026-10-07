import type { ExerciseType, GenContext, Question } from './types';
import {
  buildOptions, chooseKey, chooseTarget, optionCount, pickDistractors, questionId, tempoFor,
} from './support';
import {
  PROGRESSIONS, nearestProgressions, progressionConceptId, realiseProgression, romanLine,
  type ProgressionDef, type RealisedChord,
} from '../music/progressions';
import {
  CHORD_QUALITIES, chordConceptId, chordSymbol, makeChord, nearestQualities, type Chord,
} from '../music/chords';
import { voiceProgression } from '../music/voicing';
import { Performer } from '../audio/performer';
import { pcNameDual } from '../music/pitch';
import type { PracticeSettings } from '../session/settings';
import { clamp, mod } from '../lib/util';

function enabledProgressions(settings: PracticeSettings): ProgressionDef[] {
  const allowed = new Set(settings.progressions);
  const pool = PROGRESSIONS.filter((p) => allowed.has(p.id));
  return pool.length ? pool : PROGRESSIONS.filter((p) => p.core);
}

interface Changes {
  realised: RealisedChord[];
  play: (perf: Performer) => number;
  playReveal: (perf: Performer) => number;
  seconds: (tempo: number) => number;
}

function buildChanges(ctx: GenContext, def: ProgressionDef, tonic: number): Changes {
  const realised = realiseProgression(def, tonic);
  const level = clamp(Math.round(ctx.difficulty), 1, 5);
  // Rootless comping with a walking bass is how these changes are actually
  // played; block voicings with the root on the bottom are the training wheels.
  const style = level >= 3 ? ('comp' as const) : ('sustained' as const);
  const voicingStyle = level >= 4 ? ('rootless' as const) : level >= 2 ? ('spread' as const) : ('close' as const);
  const voicings = voiceProgression(realised.map((r) => r.chord), {
    style: voicingStyle,
    maxNotes: 5,
  });
  const changes = Performer.changes(realised, voicings);
  const totalBeats = realised.reduce((n, r) => n + r.beats, 0);

  return {
    realised,
    play: (perf) => {
      perf.configure({ tempo: tempoFor(ctx, 118) });
      return perf.progression(changes, perf.origin(), { style }) + 0.5;
    },
    playReveal: (perf) => {
      perf.configure({ tempo: Math.round(tempoFor(ctx, 118) * 0.82) });
      return perf.progression(changes, perf.origin(), { style: 'sustained' }) + 0.5;
    },
    seconds: (tempo) => (totalBeats * 60) / tempo,
  };
}

const chordLabel = (chord: Chord, settings: PracticeSettings) => chordSymbol(chord, settings.accidental);

export const progressionExercise: ExerciseType = {
  id: 'progression',
  name: 'Chord changes',
  short: 'Changes',
  description: 'A progression plays. Name the harmonic movement.',
  baseSeconds: 28,
  pool: (settings) => enabledProgressions(settings).map((p) => progressionConceptId(p.id)),
  generate(ctx): Question | null {
    const pool = enabledProgressions(ctx.settings);
    if (pool.length < 2) return null;
    const def = chooseTarget(ctx, pool, (p) => progressionConceptId(p.id), (p) => p.tier);
    if (!def) return null;
    const tonic = chooseKey(ctx);
    const changes = buildChanges(ctx, def, tonic);

    const n = optionCount(ctx.difficulty, pool.length);
    const distractors = pickDistractors(ctx.rng, def, pool, n - 1, ctx.difficulty, nearestProgressions);

    const symbols = changes.realised.map((r) => chordLabel(r.chord, ctx.settings)).join('  |  ');

    return {
      id: questionId('progression'),
      type: 'progression',
      conceptIds: [progressionConceptId(def.id)],
      difficulty: ctx.difficulty,
      keyPc: tonic,
      prompt: {
        title: 'What movement is this?',
        sub: ctx.difficulty <= 2 ? `In ${pcNameDual(tonic)}` : undefined,
      },
      fields: [
        {
          key: 'progression',
          label: 'Progression',
          options: buildOptions(ctx.rng, def, distractors, (p) => ({
            id: p.id,
            label: p.name,
            sub: romanLine(p),
          })),
          columns: 1,
        },
      ],
      correct: { progression: def.id },
      play: changes.play,
      playReveal: changes.playReveal,
      hint: {
        label: 'Tonic',
        description: `Sounds the tonic (${pcNameDual(tonic)}) so you can hear the chords as degrees.`,
        play: (perf) => {
          perf.note(tonic + 48, perf.origin(), 1.8, 0.6);
          return 1.8;
        },
      },
      reveal: {
        heading: def.name,
        detail: `${romanLine(def)}  ·  in ${pcNameDual(tonic)}`,
        notes: symbols,
      },
      estimatedSeconds: Math.round(changes.seconds(tempoFor(ctx, 118))) + 12,
    };
  },
};

/** Candidate wrong answers that a listener could genuinely land on. */
function chordDistractors(ctx: GenContext, realised: RealisedChord[], index: number): Chord[] {
  const target = realised[index].chord;
  const candidates: Chord[] = [];
  // The other chords in the progression — did you actually track the position?
  for (let i = 0; i < realised.length; i++) {
    if (i !== index) candidates.push(realised[i].chord);
  }
  // Same root, neighbouring quality.
  const allowed = new Set(ctx.settings.chordQualities);
  const qualityPool = CHORD_QUALITIES.filter((q) => allowed.has(q.id));
  for (const q of nearestQualities(target.quality, qualityPool.length ? qualityPool : CHORD_QUALITIES, 4)) {
    candidates.push(makeChord(target.rootPc, q.id));
  }
  // Same quality, a root a step or a fifth away.
  for (const step of [2, -2, 7, 5]) {
    candidates.push(makeChord(mod(target.rootPc + step, 12), target.quality.id));
  }
  const seen = new Set([`${target.rootPc}:${target.quality.id}`]);
  return candidates.filter((c) => {
    const key = `${c.rootPc}:${c.quality.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export const progressionChordExercise: ExerciseType = {
  id: 'progression-chord',
  name: 'Chords in context',
  short: 'In context',
  description: 'A progression plays. Name one chord from within it.',
  baseSeconds: 30,
  pool: (settings) => enabledProgressions(settings).map((p) => progressionConceptId(p.id)),
  generate(ctx): Question | null {
    const pool = enabledProgressions(ctx.settings);
    const def = chooseTarget(ctx, pool, (p) => progressionConceptId(p.id), (p) => p.tier);
    if (!def) return null;
    const tonic = chooseKey(ctx);
    const changes = buildChanges(ctx, def, tonic);
    const realised = changes.realised;

    // Easy levels ask about the chord that lands; harder levels ask about one
    // buried in the middle, which means holding the whole sequence in your ear.
    const index = ctx.rng.weighted(
      realised.map((_, i) => i),
      (i) => (ctx.difficulty <= 2 ? (i === realised.length - 1 ? 3 : 1) : 1 + i * 0.3),
    );
    const target = realised[index].chord;

    const n = optionCount(ctx.difficulty, 8);
    const candidates = chordDistractors(ctx, realised, index);
    const hardness = clamp((ctx.difficulty - 1) / 4, 0, 1);
    // At low difficulty, prefer alternatives that differ obviously.
    const ordered = hardness >= 0.5 ? candidates : ctx.rng.shuffle(candidates);
    const distractors = ctx.rng.sample(ordered.slice(0, Math.max(n - 1, 6)), n - 1);

    const ordinal = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'][index] ?? `${index + 1}th`;

    return {
      id: questionId('progression-chord'),
      type: 'progression-chord',
      conceptIds: [progressionConceptId(def.id), chordConceptId(target.quality.id)],
      difficulty: ctx.difficulty,
      keyPc: tonic,
      prompt: {
        title: `Name the ${ordinal} chord`,
        sub: ctx.difficulty <= 2 ? `${realised.length} chords, in ${pcNameDual(tonic)}` : `${realised.length} chords`,
      },
      fields: [
        {
          key: 'chord',
          label: 'Chord',
          options: buildOptions(ctx.rng, target, distractors, (c) => ({
            id: `${c.rootPc}:${c.quality.id}`,
            label: chordLabel(c, ctx.settings),
            sub: c.quality.name,
          })),
          columns: 2,
        },
      ],
      correct: { chord: `${target.rootPc}:${target.quality.id}` },
      play: changes.play,
      playReveal: changes.playReveal,
      hint: {
        label: 'Tonic',
        description: `Sounds the tonic (${pcNameDual(tonic)}) so you can place the chord as a degree.`,
        play: (perf) => {
          perf.note(tonic + 48, perf.origin(), 1.8, 0.6);
          return 1.8;
        },
      },
      reveal: {
        heading: chordLabel(target, ctx.settings),
        detail: `${realised[index].roman} of ${pcNameDual(tonic)}  ·  ${def.name}`,
        notes: realised.map((r) => chordLabel(r.chord, ctx.settings)).join('  |  '),
      },
      estimatedSeconds: Math.round(changes.seconds(tempoFor(ctx, 118))) + 14,
    };
  },
};
