import type { Rng } from '../lib/rng';
import type { Performer } from '../audio/performer';
import type { PracticeSettings } from '../session/settings';

export interface AnswerOption {
  id: string;
  label: string;
  /** Secondary line, e.g. the full name under a symbol. */
  sub?: string;
  /** Optional heading the option sits under. */
  group?: string;
}

export interface AnswerField {
  key: string;
  label: string;
  options: AnswerOption[];
  /** `pitch` renders the chromatic 12-button layout. */
  variant?: 'grid' | 'pitch';
  /** Preferred column count for the grid at phone width. */
  columns?: number;
}

export interface Hint {
  label: string;
  description: string;
  /** Schedules the hint audio; returns its length in seconds. */
  play(perf: Performer): number;
}

export interface Reveal {
  heading: string;
  detail: string;
  /** Extra line, e.g. the notes that sounded. */
  notes?: string;
}

export interface Question {
  id: string;
  type: string;
  /** Concepts this question exercises — the key the learning model tracks on. */
  conceptIds: string[];
  difficulty: number;
  /** Tonal centre, where the question has one. Recorded against each attempt. */
  keyPc: number | null;
  prompt: { title: string; sub?: string };
  fields: AnswerField[];
  correct: Record<string, string>;
  /** Schedules the question audio; returns its length in seconds. */
  play(perf: Performer): number;
  hint?: Hint;
  reveal: Reveal;
  /** A slower, plainer rendering offered after the answer. */
  playReveal?(perf: Performer): number;
  /** Planning estimate: audio plus thinking time. */
  estimatedSeconds: number;
}

export interface GenContext {
  rng: Rng;
  /** 1–5. */
  difficulty: number;
  settings: PracticeSettings;
  /** Concept ids the adaptive selector wants covered, most wanted first. */
  targetConcepts: readonly string[];
}

export interface ExerciseType {
  id: string;
  name: string;
  /** Short label for chips and summaries. */
  short: string;
  description: string;
  /** Typical seconds per question, before per-question adjustment. */
  baseSeconds: number;
  /** Concept ids this type can exercise under the given settings. */
  pool(settings: PracticeSettings): string[];
  /** Null when the settings leave this type with nothing to ask. */
  generate(ctx: GenContext): Question | null;
}

export type FieldAnswers = Record<string, string>;

export function isCorrect(question: Question, answers: FieldAnswers): boolean {
  return Object.entries(question.correct).every(([k, v]) => answers[k] === v);
}

export function fieldResults(question: Question, answers: FieldAnswers): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(question.correct)) out[k] = answers[k] === v;
  return out;
}
