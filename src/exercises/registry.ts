import type { ExerciseType } from './types';
import { chordFullExercise, chordQualityExercise } from './chord';
import { intervalExercise } from './interval';
import { keyExercise } from './key';
import { modeExercise } from './mode';
import { progressionChordExercise, progressionExercise } from './progression';

/**
 * Every exercise type the app can run.
 *
 * A new type — transcription, guide-tone recognition, rhythm — implements the
 * ExerciseType interface and registers here. Session planning, the adaptive
 * selector and the answer UI all work off this interface, so nothing else
 * needs to change.
 */
export const EXERCISE_TYPES: ExerciseType[] = [
  chordQualityExercise,
  chordFullExercise,
  intervalExercise,
  keyExercise,
  modeExercise,
  progressionExercise,
  progressionChordExercise,
];

const registry = new Map(EXERCISE_TYPES.map((t) => [t.id, t]));

export function registerExerciseType(type: ExerciseType): void {
  registry.set(type.id, type);
  if (!EXERCISE_TYPES.some((t) => t.id === type.id)) EXERCISE_TYPES.push(type);
}

export function getExerciseType(id: string): ExerciseType | undefined {
  return registry.get(id);
}

export function exerciseName(id: string): string {
  return registry.get(id)?.name ?? id;
}

export function exerciseShort(id: string): string {
  return registry.get(id)?.short ?? id;
}
