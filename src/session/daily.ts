import type { Question } from '../exercises/types';
import { EXERCISE_TYPES, getExerciseType } from '../exercises/registry';
import { EXERCISE_TYPE_IDS, defaultSettings, type PracticeSettings } from './settings';
import { makeRng, type Rng } from '../lib/rng';
import { dayKey } from '../learning/model';
import { CHORD_QUALITIES } from '../music/chords';
import { SIMPLE_INTERVALS } from '../music/intervals';
import { CORE_MODES } from '../music/scales';
import { CORE_PROGRESSIONS } from '../music/progressions';

/**
 * The Daily: ten questions, no clock, the same for everybody.
 *
 * Every question in the app is generated from a seeded RNG, so making a shared
 * daily is a matter of removing everything that could differ between two
 * people. Three things are fixed here:
 *
 *   - the seed, which comes from the date and nothing else;
 *   - the vocabulary and difficulty, which ignore the user's own settings,
 *     since a musician who has turned off everything but intervals must still
 *     get the same ten questions as everyone else;
 *   - the selection, which passes no target concepts, so practice history
 *     cannot steer it.
 *
 * What stays personal is presentation only — the instrument, note spelling and
 * theme change how the questions look and sound, never what they ask.
 */

/** Difficulty of each question, in order: open gently, finish hard. */
const DIFFICULTY_RAMP = [2, 2, 3, 3, 3, 4, 4, 4, 5, 5];

export const DAILY_QUESTION_COUNT = DIFFICULTY_RAMP.length;

/** The day the Daily is keyed on, in the user's own timezone. */
export function todayKey(now = Date.now()): string {
  return dayKey(now);
}

/**
 * FNV-1a over the date string. Any stable hash would do; what matters is that
 * it depends on the date alone and that consecutive days look unrelated.
 */
export function dailySeed(day: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < day.length; i++) {
    hash ^= day.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Puzzle number, so two people can say which day they are talking about. */
const EPOCH = Date.UTC(2026, 0, 1);

export function dailyNumber(day: string): number {
  const [year, month, date] = day.split('-').map(Number);
  if (!year || !month || !date) return 0;
  // Compared as UTC midnights so daylight saving cannot shift the count.
  return Math.floor((Date.UTC(year, month - 1, date) - EPOCH) / 86_400_000) + 1;
}

export function dailyLabel(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  if (!year || !month || !date) return day;
  return new Date(year, month - 1, date).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

/**
 * The settings every Daily is generated under.
 *
 * Anything that decides *what is asked* is pinned to the full default
 * vocabulary. Anything that decides *how it is presented* follows the user.
 */
/** Single-letter weekday, for the seven-day strip on the home screen. */
export function dailyWeekday(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  if (!year || !month || !date) return '?';
  return new Date(year, month - 1, date).toLocaleDateString(undefined, { weekday: 'narrow' });
}

export function dailySettings(user?: PracticeSettings): PracticeSettings {
  const base = defaultSettings();
  return {
    ...base,

    // Content — identical for everyone.
    exerciseTypes: [...EXERCISE_TYPE_IDS],
    chordQualities: CHORD_QUALITIES.map((q) => q.id),
    intervals: SIMPLE_INTERVALS.map((i) => i.id),
    modes: CORE_MODES.map((m) => m.id),
    progressions: CORE_PROGRESSIONS.map((p) => p.id),
    intervalDirections: ['ascending', 'descending', 'harmonic'],
    keys: 'all',
    // Overridden per question by the ramp; set here so nothing reads 'adaptive'.
    difficulty: 3,
    adaptive: false,
    questionLimit: DAILY_QUESTION_COUNT,

    // Presentation and assistance — the user's own. None of these change what
    // is asked, only how it reaches them.
    hintsEnabled: user?.hintsEnabled ?? base.hintsEnabled,
    instrument: user?.instrument ?? base.instrument,
    accidental: user?.accidental ?? base.accidental,
    tempo: user?.tempo ?? base.tempo,
    swing: user?.swing ?? base.swing,
    volume: user?.volume ?? base.volume,
    reverb: user?.reverb ?? base.reverb,
    autoAdvance: user?.autoAdvance ?? base.autoAdvance,
    theme: user?.theme ?? base.theme,
  };
}

/**
 * Which exercise type each slot asks.
 *
 * Shuffling the full list first means every Daily covers every kind of
 * exercise at least once before anything repeats.
 */
function typeSequence(rng: Rng): string[] {
  const available = EXERCISE_TYPES.map((t) => t.id);
  const sequence = rng.shuffle(available).slice(0, DAILY_QUESTION_COUNT);
  while (sequence.length < DAILY_QUESTION_COUNT) sequence.push(rng.pick(available));
  return sequence;
}

export interface DailyPlanEntry {
  type: string;
  difficulty: number;
}

/** The shape of the day, without generating the questions. */
export function buildDailyPlan(day: string): DailyPlanEntry[] {
  const rng = makeRng(dailySeed(day));
  return typeSequence(rng).map((type, i) => ({ type, difficulty: DIFFICULTY_RAMP[i] }));
}

/**
 * The ten questions for a given day.
 *
 * One RNG runs through the whole build, so the questions depend on the date
 * and on nothing else whatsoever.
 */
export function buildDailyQuestions(day: string, user?: PracticeSettings): Question[] {
  const settings = dailySettings(user);
  const rng = makeRng(dailySeed(day));
  const sequence = typeSequence(rng);
  const everyType = EXERCISE_TYPES.map((t) => t.id);
  const questions: Question[] = [];

  for (let i = 0; i < DAILY_QUESTION_COUNT; i++) {
    const difficulty = DIFFICULTY_RAMP[i];
    // If a type cannot produce a question, fall through the rest in a fixed
    // order rather than at random, so one person's day can never diverge.
    const order = [sequence[i], ...everyType.filter((id) => id !== sequence[i])];
    for (const id of order) {
      const question = getExerciseType(id)?.generate({
        rng,
        difficulty,
        settings,
        targetConcepts: [],
      });
      if (question) {
        questions.push(question);
        break;
      }
    }
  }
  return questions;
}
