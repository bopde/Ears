import type { ExerciseType, GenContext, Question } from './types';
import { buildOptions, chooseTarget, optionCount, pickDistractors, questionId } from './support';
import {
  INTERVALS, directionLabel, intervalConceptId, nearestIntervals,
  type IntervalDef, type IntervalDirection,
} from '../music/intervals';
import { REGISTER, midiName } from '../music/pitch';
import type { PracticeSettings } from '../session/settings';
import type { Rng } from '../lib/rng';
import { clamp } from '../lib/util';

function enabledIntervals(settings: PracticeSettings): IntervalDef[] {
  const allowed = new Set(settings.intervals);
  const pool = INTERVALS.filter((i) => allowed.has(i.id));
  return pool.length ? pool : INTERVALS.filter((i) => i.semitones <= 12);
}

/**
 * Melodic ascending is the easiest reading of an interval; descending and
 * harmonic are harder, so the mix shifts with difficulty rather than being
 * uniform random.
 */
function chooseDirection(ctx: GenContext, rng: Rng): IntervalDirection {
  const allowed = ctx.settings.intervalDirections.length
    ? ctx.settings.intervalDirections
    : (['ascending'] as IntervalDirection[]);
  const d = clamp(ctx.difficulty, 1, 5);
  return rng.weighted(allowed, (dir) => {
    if (dir === 'ascending') return 6 - d;
    if (dir === 'descending') return 1 + d * 0.8;
    return 0.6 + d * 0.9; // harmonic
  });
}

export const intervalExercise: ExerciseType = {
  id: 'interval',
  name: 'Intervals',
  short: 'Intervals',
  description: 'Two notes sound. Name the distance between them.',
  baseSeconds: 11,
  pool: (settings) => enabledIntervals(settings).map((i) => intervalConceptId(i.id)),
  generate(ctx): Question | null {
    const pool = enabledIntervals(ctx.settings);
    const interval = chooseTarget(ctx, pool, (i) => intervalConceptId(i.id), (i) => i.tier);
    if (!interval) return null;
    const direction = chooseDirection(ctx, ctx.rng);

    // Keep both notes in a singable register whichever way the interval runs.
    const span = interval.semitones;
    const lo = REGISTER.melody.lo;
    const hi = REGISTER.melody.hi - span;
    const lower = ctx.rng.range(lo, Math.max(lo, hi));
    const upper = lower + span;
    const first = direction === 'descending' ? upper : lower;
    const second = direction === 'descending' ? lower : upper;

    const n = optionCount(ctx.difficulty, pool.length);
    const distractors = pickDistractors(ctx.rng, interval, pool, n - 1, ctx.difficulty, nearestIntervals);

    const noteSeconds = ctx.difficulty >= 4 ? 0.75 : 1;

    return {
      id: questionId('interval'),
      type: 'interval',
      conceptIds: [intervalConceptId(interval.id)],
      difficulty: ctx.difficulty,
      keyPc: null,
      prompt: {
        title: 'Name the interval',
        sub: direction === 'harmonic' ? 'Both notes together' : directionLabel(direction),
      },
      fields: [
        {
          key: 'interval',
          label: 'Interval',
          options: buildOptions(ctx.rng, interval, distractors, (i) => ({
            id: i.id,
            label: i.short,
            sub: i.name,
          })),
          columns: 3,
        },
      ],
      correct: { interval: interval.id },
      play: (perf) => {
        const origin = perf.origin();
        if (direction === 'harmonic') {
          perf.note(lower, origin, 2.4, 0.66);
          perf.note(upper, origin, 2.4, 0.66);
          return 2.4;
        }
        perf.note(first, origin, noteSeconds * 1.1, 0.68);
        perf.note(second, origin + noteSeconds + 0.06, 1.8, 0.68);
        return noteSeconds + 1.9;
      },
      playReveal: (perf) => {
        const origin = perf.origin();
        perf.note(first, origin, 0.9, 0.66);
        perf.note(second, origin + 0.95, 1, 0.66);
        perf.note(lower, origin + 2.1, 2.2, 0.6);
        perf.note(upper, origin + 2.1, 2.2, 0.6);
        return 4.3;
      },
      hint: {
        label: 'First note',
        description: 'Sounds the first note again so you have something to measure from.',
        play: (perf) => {
          perf.note(first, perf.origin(), 1.6, 0.6);
          return 1.6;
        },
      },
      reveal: {
        heading: interval.name,
        detail: `${directionLabel(direction)} · ${interval.semitones} semitone${interval.semitones === 1 ? '' : 's'}`,
        notes: `${midiName(first, ctx.settings.accidental)} → ${midiName(second, ctx.settings.accidental)}`,
      },
      estimatedSeconds: 9 + ctx.difficulty,
    };
  },
};
