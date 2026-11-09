import type { Rng } from '../lib/rng';
import type { Performer } from '../audio/performer';
import type { PracticeSettings } from '../session/settings';
import type { VoicingStyle } from '../music/voicing';

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

/**
 * What one chord actually sounded, with the bass kept apart from the stack.
 *
 * The two are different things and listing them together said they were not:
 * the names came from everything that sounded and the degrees from the right
 * hand alone, so with a bass underneath there was one more name than degree
 * and the reader had to work out which name had no degree. Naming the bass
 * separately also happens to be the truth about the music — it is the voice
 * that states the root, and what the hand plays above it is the voicing.
 */
export interface SoundedChord {
  /** The bass note, where one sounded. */
  bass?: string;
  /** The right-hand notes, lowest first. */
  notes: string[];
  /** One degree per right-hand note, in the same order. */
  degrees: string[];
}

/** One chord of a progression, as the reveal lists it. */
export interface RevealRow {
  /**
   * The roman numeral, carrying the quality that played — and the bass, where
   * the bass is not on the root: I/3 says the third is underneath.
   */
  roman: string;
  symbol: string;
  /**
   * What the hands have at the bottom, where that is not the root.
   *
   * Per chord rather than once for the whole progression, because each chord
   * has its own bottom note: a set of changes voiced to move as little as
   * possible puts a different tone underneath almost every bar.
   */
  bottom?: string;
  /** True for the chord a "name this one" question asked about. */
  target?: boolean;
  played: SoundedChord;
}

export interface Reveal {
  heading: string;
  detail: string;
  /** Extra line, e.g. the notes that sounded. */
  notes?: string;
  /**
   * A short note on what the voicing added — "played with 9".
   *
   * Only where something sounded that the chord symbol does not name, so its
   * absence means the chord was played as written rather than meaning nobody
   * checked.
   */
  tag?: string;
  /** The single chord this question played, for the chord and voicing types. */
  played?: SoundedChord;
  /** One row per chord, for the progression types. Tap a row to open it. */
  rows?: RevealRow[];
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
  /**
   * The same material as basic chords: close, nothing added, over a root bass.
   *
   * The thing a learner wants after getting a rootless drop-2 voicing wrong is
   * not the same voicing again but the chord underneath it, and that is a
   * different rendering rather than a slower one.
   */
  playPlain?(perf: Performer): number;
  /**
   * How the chords were voiced, when that was a choice the question made.
   *
   * Recorded against the attempt: hearing a ii–V–I in close position and
   * missing it rootless is a gap the model can only see if it is told which
   * one was played.
   */
  voicing?: VoicingStyle;
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
  /**
   * Voicing styles the model would like more of, weakest first.
   *
   * A hint rather than an instruction: the level still decides what is on
   * offer, and this only tilts the choice among them.
   */
  voicingFocus?: readonly VoicingStyle[];
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
