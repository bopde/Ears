import type { Rng } from '../lib/rng';
import type { AnswerOption, GenContext } from './types';
import type { PitchClass } from '../music/pitch';
import { PITCH_CLASSES, pcNameDual } from '../music/pitch';
import { clamp } from '../lib/util';

/** Number of choices offered at each difficulty. More options, harder question. */
const OPTION_COUNT = [4, 4, 5, 6, 8];

export function optionCount(difficulty: number, poolSize: number): number {
  const want = OPTION_COUNT[clamp(Math.round(difficulty), 1, 5) - 1];
  return Math.max(2, Math.min(want, poolSize));
}

/**
 * Picks what the question is about.
 *
 * Concepts the adaptive selector asked for come first; otherwise the pool is
 * weighted so that items near the current difficulty are most likely, which
 * keeps a level-2 session from constantly throwing 13♭9 chords at the user.
 */
export function chooseTarget<T>(
  ctx: GenContext,
  pool: readonly T[],
  conceptIdOf: (item: T) => string,
  tierOf: (item: T) => number,
): T | null {
  if (!pool.length) return null;
  const wanted = pool.filter((item) => ctx.targetConcepts.includes(conceptIdOf(item)));
  if (wanted.length) {
    // Honour the selector's priority order, with a little slack.
    return ctx.rng.weighted(wanted, (item) => {
      const rank = ctx.targetConcepts.indexOf(conceptIdOf(item));
      return 1 / (1 + rank * 0.35);
    });
  }
  return ctx.rng.weighted(pool, (item) => {
    const gap = Math.abs(tierOf(item) - ctx.difficulty);
    return 1 / (1 + gap * gap);
  });
}

/**
 * Chooses wrong answers.
 *
 * Difficulty is expressed as *how close the wrong answers sit to the right one*
 * rather than as anything about the audio: at level 1 the alternatives are
 * spread across the whole pool, at level 5 they are the genuine near misses.
 */
export function pickDistractors<T>(
  rng: Rng,
  target: T,
  pool: readonly T[],
  count: number,
  difficulty: number,
  ranked: (target: T, pool: readonly T[], n: number) => T[],
): T[] {
  if (count <= 0) return [];
  const others = pool.filter((p) => p !== target);
  if (others.length <= count) return others;
  const hardness = clamp((difficulty - 1) / 4, 0, 1);
  const order = ranked(target, others, others.length);
  const windowSize = Math.max(count, Math.round(order.length * (1 - hardness * 0.8)));
  return rng.sample(order.slice(0, windowSize), count);
}

/** Shuffles the right answer in among the wrong ones. */
export function buildOptions<T>(
  rng: Rng,
  target: T,
  distractors: readonly T[],
  toOption: (item: T) => AnswerOption,
): AnswerOption[] {
  return rng.shuffle([target, ...distractors]).map(toOption);
}

/** The chromatic answer grid, used for roots and tonal centres. */
export function pitchClassField(key: string, label: string): {
  key: string;
  label: string;
  variant: 'pitch';
  options: AnswerOption[];
} {
  return {
    key,
    label,
    variant: 'pitch',
    options: PITCH_CLASSES.map((pc) => ({ id: String(pc), label: pcNameDual(pc) })),
  };
}

/** Keys the session is allowed to use. */
export function allowedKeys(ctx: GenContext): PitchClass[] {
  const keys = ctx.settings.keys;
  return keys === 'all' || !keys.length ? PITCH_CLASSES : keys;
}

export function chooseKey(ctx: GenContext): PitchClass {
  return ctx.rng.pick(allowedKeys(ctx));
}

/** Tempo for the question, slower at low difficulty and faster at high. */
export function tempoFor(ctx: GenContext, base = 120): number {
  const d = clamp(ctx.difficulty, 1, 5);
  return Math.round(base * (0.82 + d * 0.06));
}

let counter = 0;
export function questionId(type: string): string {
  counter += 1;
  return `${type}-${Date.now().toString(36)}-${counter.toString(36)}`;
}
