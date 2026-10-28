import type { Accidental, PitchClass } from '../music/pitch';
import type { IntervalDirection } from '../music/intervals';
import { CHORD_QUALITIES } from '../music/chords';
import { SIMPLE_INTERVALS } from '../music/intervals';
import { CORE_MODES } from '../music/scales';
import { CORE_PROGRESSIONS } from '../music/progressions';
import { DEFAULT_INSTRUMENT, INSTRUMENTS } from '../audio/instruments';
import { REFERENCE_VOICING_IDS, type ReferenceVoicing } from '../audio/reference';

export const EXERCISE_TYPE_IDS = [
  'chord-quality',
  'chord-full',
  'chord-inversion',
  'interval',
  'key',
  'mode',
  'progression',
  'progression-chord',
] as const;

export type ExerciseTypeId = (typeof EXERCISE_TYPE_IDS)[number];

/** The closed sets a stored setting is allowed to name. */
export const INTERVAL_DIRECTIONS = ['ascending', 'descending', 'harmonic'] as const;
export const ACCIDENTALS = ['sharp', 'flat', 'both'] as const;
export const THEMES = ['auto', 'dark', 'light'] as const;

export interface PracticeSettings {
  /** Which exercise types are in play. */
  exerciseTypes: string[];
  durationMinutes: number;
  /** A fixed level, or 'adaptive' to let the learning model set it per concept. */
  difficulty: number | 'adaptive';
  /** Restrict roots and tonal centres, or 'all' for the full chromatic set. */
  keys: PitchClass[] | 'all';
  hintsEnabled: boolean;
  /** Stop after this many questions rather than on the clock. */
  questionLimit: number | null;
  /** Draw on practice history when choosing what to ask. */
  adaptive: boolean;

  // Vocabulary — the user's active musical material.
  chordQualities: string[];
  intervals: string[];
  modes: string[];
  progressions: string[];
  intervalDirections: IntervalDirection[];

  // Sound.
  instrument: string;
  tempo: number;
  swing: number;
  volume: number;
  reverb: number;
  accidental: Accidental;

  // Presentation.
  /**
   * Move on automatically after a correct answer instead of waiting for a tap.
   *
   * Off by default: the feedback is the moment the learning happens, and a
   * timer short enough to feel quick is too short to read a chord symbol, its
   * name and the notes that sounded.
   */
  autoAdvance: boolean;
  theme: 'auto' | 'dark' | 'light';
  /**
   * How long the answer options stay hidden once a question starts.
   *
   * Seeing the choices before you have listened lets you work backwards from
   * them — narrowing four plausible modes down by reading rather than by ear.
   * 0 shows them straight away; 'audio' holds them until the question has
   * finished sounding, which suits the longer exercises better than a fixed
   * count does.
   */
  answerDelay: number | 'audio';
  /** Key the cheat sheet last demonstrated things in. */
  referenceKey: number;
  /** How the cheat sheet voices progressions. */
  referenceVoicing: ReferenceVoicing;
}

export const ANSWER_DELAY_OPTIONS: Array<{ value: number | 'audio'; label: string }> = [
  { value: 0, label: 'Straight away' },
  { value: 3, label: 'After 3s' },
  { value: 5, label: 'After 5s' },
  { value: 'audio', label: 'When it finishes' },
];

export const DURATION_OPTIONS = [5, 10, 20, 30] as const;

export function defaultSettings(): PracticeSettings {
  return {
    exerciseTypes: [
      'chord-quality', 'chord-full', 'chord-inversion', 'interval', 'key', 'mode', 'progression',
    ],
    durationMinutes: 10,
    difficulty: 'adaptive',
    keys: 'all',
    hintsEnabled: true,
    questionLimit: null,
    adaptive: true,
    // The full chord vocabulary is enabled from the start; difficulty, not the
    // settings screen, decides how often the advanced material comes up.
    chordQualities: CHORD_QUALITIES.map((q) => q.id),
    intervals: SIMPLE_INTERVALS.map((i) => i.id),
    modes: CORE_MODES.map((m) => m.id),
    progressions: CORE_PROGRESSIONS.map((p) => p.id),
    intervalDirections: ['ascending', 'descending', 'harmonic'],
    instrument: DEFAULT_INSTRUMENT,
    tempo: 120,
    swing: 0.55,
    volume: 0.85,
    reverb: 0.26,
    accidental: 'both',
    autoAdvance: false,
    theme: 'auto',
    answerDelay: 3,
    referenceKey: 0,
    // Root position by default: a learner should meet the plain chord before
    // any of the voicings that disguise it.
    referenceVoicing: 'root',
  };
}

/** Keeps only the members of a closed set, so a stale id cannot reach the engine. */
function known<T extends string>(value: unknown, allowed: readonly T[], fallback: T[]): T[] {
  if (!Array.isArray(value)) return fallback;
  const kept = value.filter((v): v is T => (allowed as readonly unknown[]).includes(v));
  return kept.length ? kept : fallback;
}

/** Keeps a list of ids, dropping anything that is not a string. */
function idList(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const kept = value.filter((v): v is string => typeof v === 'string' && v.length > 0);
  return kept.length ? kept : fallback;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly unknown[]).includes(value) ? (value as T) : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/** A finite number pulled back inside its range; anything else takes the default. */
function number(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function integer(value: unknown, min: number, max: number, fallback: number): number {
  return Math.round(number(value, min, max, fallback));
}

/**
 * Fills in anything missing so stored settings survive a version bump.
 *
 * It also rejects values that are present but impossible. Settings live in
 * localStorage, which is editable, shared with every other build ever served
 * from this origin, and carried across upgrades, so a tempo of 0 or a
 * difficulty of 99 is a real thing to arrive here — and each one reaches the
 * audio engine or the question generator, where it is much harder to diagnose.
 */
export function normaliseSettings(partial: Partial<PracticeSettings> | null | undefined): PracticeSettings {
  const base = defaultSettings();
  if (!partial) return base;
  const merged = { ...base, ...partial } as Record<string, unknown> & PracticeSettings;

  const keys = merged.keys;
  const validKeys: PitchClass[] | 'all' =
    keys === 'all' || !Array.isArray(keys)
      ? 'all'
      : (() => {
          const kept = keys.filter(
            (k) => typeof k === 'number' && Number.isInteger(k) && k >= 0 && k < 12,
          );
          return kept.length ? kept : 'all';
        })();

  const difficulty = merged.difficulty;

  return {
    ...merged,
    // Filtering runs before the fallback: a stored list of ids this build no
    // longer knows must land on the defaults, not on an empty session.
    exerciseTypes: known(merged.exerciseTypes, EXERCISE_TYPE_IDS, base.exerciseTypes),
    chordQualities: idList(merged.chordQualities, base.chordQualities),
    intervals: idList(merged.intervals, base.intervals),
    modes: idList(merged.modes, base.modes),
    progressions: idList(merged.progressions, base.progressions),
    intervalDirections: known(
      merged.intervalDirections,
      INTERVAL_DIRECTIONS,
      base.intervalDirections,
    ),

    durationMinutes: integer(merged.durationMinutes, 1, 120, base.durationMinutes),
    difficulty:
      difficulty === 'adaptive'
        ? 'adaptive'
        : typeof difficulty === 'number' && Number.isFinite(difficulty)
          ? integer(difficulty, 1, 5, base.difficulty as number)
          : base.difficulty,
    keys: validKeys,
    hintsEnabled: bool(merged.hintsEnabled, base.hintsEnabled),
    questionLimit:
      merged.questionLimit === null || merged.questionLimit === undefined
        ? null
        : typeof merged.questionLimit === 'number' && Number.isFinite(merged.questionLimit)
          ? integer(merged.questionLimit, 1, 500, 10)
          : null,
    adaptive: bool(merged.adaptive, base.adaptive),

    instrument: INSTRUMENTS.some((i) => i.id === merged.instrument)
      ? merged.instrument
      : base.instrument,
    // A tempo of 0 would make every beat infinitely long; the bounds are the
    // ones the tempo slider offers.
    tempo: integer(merged.tempo, 60, 220, base.tempo),
    swing: number(merged.swing, 0, 1, base.swing),
    volume: number(merged.volume, 0, 1, base.volume),
    reverb: number(merged.reverb, 0, 1, base.reverb),
    accidental: oneOf(merged.accidental, ACCIDENTALS, base.accidental),

    autoAdvance: bool(merged.autoAdvance, base.autoAdvance),
    theme: oneOf(merged.theme, THEMES, base.theme),
    answerDelay:
      merged.answerDelay === 'audio' ||
      (typeof merged.answerDelay === 'number' &&
        Number.isFinite(merged.answerDelay) &&
        merged.answerDelay >= 0)
        ? merged.answerDelay
        : base.answerDelay,
    referenceKey:
      typeof merged.referenceKey === 'number' &&
      Number.isInteger(merged.referenceKey) &&
      merged.referenceKey >= 0 &&
      merged.referenceKey < 12
        ? merged.referenceKey
        : base.referenceKey,
    referenceVoicing: oneOf(merged.referenceVoicing, REFERENCE_VOICING_IDS, base.referenceVoicing),
  };
}
