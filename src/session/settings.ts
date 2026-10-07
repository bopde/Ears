import type { Accidental, PitchClass } from '../music/pitch';
import type { IntervalDirection } from '../music/intervals';
import { CHORD_QUALITIES } from '../music/chords';
import { SIMPLE_INTERVALS } from '../music/intervals';
import { CORE_MODES } from '../music/scales';
import { CORE_PROGRESSIONS } from '../music/progressions';
import { DEFAULT_INSTRUMENT } from '../audio/instruments';

export const EXERCISE_TYPE_IDS = [
  'chord-quality',
  'chord-full',
  'interval',
  'key',
  'mode',
  'progression',
  'progression-chord',
] as const;

export type ExerciseTypeId = (typeof EXERCISE_TYPE_IDS)[number];

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
  /** Move on automatically after a correct answer. */
  autoAdvance: boolean;
  theme: 'auto' | 'dark' | 'light';
}

export const DURATION_OPTIONS = [5, 10, 20, 30] as const;

export function defaultSettings(): PracticeSettings {
  return {
    exerciseTypes: ['chord-quality', 'chord-full', 'interval', 'key', 'mode', 'progression'],
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
    autoAdvance: true,
    theme: 'auto',
  };
}

/** Fills in anything missing so stored settings survive a version bump. */
export function normaliseSettings(partial: Partial<PracticeSettings> | null | undefined): PracticeSettings {
  const base = defaultSettings();
  if (!partial) return base;
  const merged = { ...base, ...partial };
  const nonEmpty = <T>(value: T[] | undefined, fallback: T[]) =>
    Array.isArray(value) && value.length ? value : fallback;
  return {
    ...merged,
    exerciseTypes: nonEmpty(merged.exerciseTypes, base.exerciseTypes).filter((t) =>
      (EXERCISE_TYPE_IDS as readonly string[]).includes(t),
    ),
    chordQualities: nonEmpty(merged.chordQualities, base.chordQualities),
    intervals: nonEmpty(merged.intervals, base.intervals),
    modes: nonEmpty(merged.modes, base.modes),
    progressions: nonEmpty(merged.progressions, base.progressions),
    intervalDirections: nonEmpty(merged.intervalDirections, base.intervalDirections),
    durationMinutes: Math.min(120, Math.max(1, merged.durationMinutes || base.durationMinutes)),
  };
}
