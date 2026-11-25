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
  // Three questions in ten ignore the wish list and take whatever the
  // level offers. The adaptive model is right about what needs work and
  // wrong about being the only thing that decides.
  if (ctx.rng.chance(EXPLORE)) return ctx.rng.pick(pool);
  // The rest lean on it rather than obey it. The wish list used to be a
  // filter: whatever of it the exercise could serve *was* the question.
  // Where a level offers a dozen things that is a nudge, but where it
  // offers three it narrows to one — and since a concept just practised
  // drops off the list, the one it narrows to is never the one just
  // heard. That is how an exercise came to repeat an answer in 0% of
  // questions where chance says a quarter, with the session penalty
  // turned off entirely making no difference to it at all.
  return ctx.rng.weighted(pool, (item) => {
    const rank = ctx.targetConcepts.indexOf(conceptIdOf(item));
    const wish = rank === -1 ? 1 : WISH / (1 + rank * 0.35);
    return wish * nearLevel(tierOf(item), ctx.difficulty);
  });
}

/** How often a question is drawn from the level rather than from the wish list. */
const EXPLORE = 0.3;

/** How much more likely the model's first choice is than something it did not ask for. */
const WISH = 2.2;

/**
 * How much the level's own material is favoured over what sits away from it.
 *
 * Shallow on purpose, and this is the whole of the tier weighting that is
 * left. It used to be 1/(1 + gap²), which at level 1 made a tier-5 chord
 * one seventeenth as likely as a tier-1 one: too rare to practise and
 * common enough to meet. Anything that can be the answer at a level has
 * to come up often enough that its absence says nothing — the most
 * frequent at most twice the least — and across the widest gap the
 * catalogue holds this is 1.9 to 1.
 */
const nearLevel = (tier: number, difficulty: number): number =>
  1 / (1 + Math.abs(tier - difficulty) * 0.22);

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

/** The chromatic answer grid, used for roots and key centres. */
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
