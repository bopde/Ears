import type { Performer } from '../audio/performer';
import type { Question, FieldAnswers } from '../exercises/types';
import { fieldResults, isCorrect } from '../exercises/types';
import { getExerciseType } from '../exercises/registry';
import type { Attempt, Profile, SessionRecord } from '../learning/model';
import { applyAttempt, bumpStreak } from '../learning/model';
import { difficultyFor, eligibleConcepts, prioritiseConcepts } from '../learning/selector';
import type { PracticeSettings } from './settings';
import { makeRng, timeSeed, type Rng } from '../lib/rng';
import { clamp } from '../lib/util';

export type SessionPhase = 'ready' | 'question' | 'feedback' | 'finished';

export interface AnswerOutcome {
  correct: boolean;
  fields: Record<string, boolean>;
  hintUsed: boolean;
  ms: number;
}

export interface SessionState {
  phase: SessionPhase;
  question: Question | null;
  answers: FieldAnswers;
  hintUsed: boolean;
  outcome: AnswerOutcome | null;
  index: number;
  asked: number;
  correct: number;
  hints: number;
  elapsedSeconds: number;
  remainingSeconds: number;
  plannedQuestions: number;
  /** No clock: the session ends when the questions run out. */
  untimed: boolean;
  /** The day, when this session is the Daily. */
  daily: string | null;
  playing: boolean;
  summary: SessionSummary | null;
  /** Set when the settings leave nothing to ask. */
  error: string | null;
}

/** How a single concept fared across the session. */
export interface ConceptOutcome {
  asked: number;
  correct: number;
  hints: number;
}

export interface SessionSummary {
  record: SessionRecord;
  deltas: Record<string, number>;
  /** Per-concept results, keyed by concept id. */
  outcomes: Record<string, ConceptOutcome>;
  promotions: string[];
  /** The day, when this was the Daily. */
  daily?: string;
  /** False when the Daily had already been scored before this run. */
  dailyRecorded?: boolean;
}

export interface SessionDeps {
  settings: PracticeSettings;
  profile: Profile;
  performer: Performer;
  /** Called whenever the profile changes so the host can persist it. */
  onProfileChange: (profile: Profile) => void;
  seed?: number;
  /**
   * A fixed list of questions to work through, in order. Supplying one turns
   * off adaptive selection and the clock, which is what makes the Daily the
   * same for everybody.
   */
  script?: Question[];
  /** The day key, when the script is a Daily. Its result is recorded once. */
  daily?: string;
}

type Listener = () => void;

/**
 * Runs one practice session.
 *
 * Questions are generated one at a time rather than queued up front, so the
 * adaptive model reacts to answers *within* the session: miss two half-
 * diminished chords and the next few questions will come looking for them.
 */
export class SessionEngine {
  private state: SessionState;
  private listeners = new Set<Listener>();
  private rng: Rng;
  private profile: Profile;
  private readonly settings: PracticeSettings;
  private readonly performer: Performer;
  private readonly onProfileChange: (profile: Profile) => void;
  private readonly script: Question[] | null;
  private readonly dailyDay: string | null;

  private startedAt = 0;
  private questionReadyAt = 0;
  private sessionCounts: Record<string, number> = {};
  private typeCounts: Record<string, number> = {};
  private attempts: Attempt[] = [];
  private deltas: Record<string, number> = {};
  private outcomes: Record<string, ConceptOutcome> = {};
  private promotions: string[] = [];
  private ticker: number | null = null;
  private playTimer: number | null = null;

  constructor(deps: SessionDeps) {
    this.settings = deps.settings;
    this.profile = deps.profile;
    this.performer = deps.performer;
    this.onProfileChange = deps.onProfileChange;
    this.script = deps.script ?? null;
    this.dailyDay = deps.daily ?? null;
    this.rng = makeRng(deps.seed ?? timeSeed());
    this.state = {
      phase: 'ready',
      question: null,
      answers: {},
      hintUsed: false,
      outcome: null,
      index: 0,
      asked: 0,
      correct: 0,
      hints: 0,
      elapsedSeconds: 0,
      remainingSeconds: this.settings.durationMinutes * 60,
      plannedQuestions: this.planQuestionCount(),
      untimed: this.script !== null,
      daily: deps.daily ?? null,
      playing: false,
      summary: null,
      error: null,
    };
  }

  // ── Subscription ─────────────────────────────────────────────────────────

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getState = (): SessionState => this.state;

  private set(patch: Partial<SessionState>): void {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  // ── Planning ─────────────────────────────────────────────────────────────

  private get durationSeconds(): number {
    return this.settings.durationMinutes * 60;
  }

  /** Question count. Exact for a script, an estimate for the progress bar otherwise. */
  private planQuestionCount(): number {
    if (this.script) return this.script.length;
    const types = this.enabledTypes();
    if (!types.length) return 0;
    const avg = types.reduce((n, t) => n + t.baseSeconds, 0) / types.length;
    const byTime = Math.max(1, Math.round(this.durationSeconds / avg));
    return this.settings.questionLimit ? Math.min(this.settings.questionLimit, byTime) : byTime;
  }

  private enabledTypes() {
    return this.settings.exerciseTypes
      .map((id) => getExerciseType(id))
      .filter((t): t is NonNullable<typeof t> => !!t);
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  start(): void {
    this.startedAt = Date.now();
    this.ticker = window.setInterval(() => this.tick(), 250);
    this.nextQuestion();
  }

  dispose(): void {
    if (this.ticker !== null) window.clearInterval(this.ticker);
    if (this.playTimer !== null) window.clearTimeout(this.playTimer);
    this.ticker = null;
    this.playTimer = null;
    this.performer.stop();
    this.listeners.clear();
  }

  private tick(): void {
    if (this.state.phase === 'finished') return;
    const elapsed = (Date.now() - this.startedAt) / 1000;
    this.set({
      elapsedSeconds: elapsed,
      remainingSeconds: Math.max(0, this.durationSeconds - elapsed),
    });
  }

  private get outOfTime(): boolean {
    if (this.script) return this.state.asked >= this.script.length;
    if (this.settings.questionLimit) return this.state.asked >= this.settings.questionLimit;
    return (Date.now() - this.startedAt) / 1000 >= this.durationSeconds;
  }

  // ── Question generation ──────────────────────────────────────────────────

  private nextQuestion(): void {
    if (this.outOfTime) {
      this.finish();
      return;
    }
    const question = this.generate();
    if (!question) {
      if (this.state.asked > 0) {
        this.finish();
      } else {
        this.set({ error: 'Nothing to practise with these settings. Widen the selection and try again.' });
      }
      return;
    }
    this.set({
      phase: 'question',
      question,
      answers: {},
      hintUsed: false,
      outcome: null,
      index: this.state.asked,
    });
    this.play();
  }

  /**
   * Picks the exercise type, then the material.
   *
   * The type is chosen by how much of the adaptive model's current wish list it
   * can actually serve, so if the weak material is all altered dominants the
   * session leans toward chord questions without being told to.
   */
  private generate(): Question | null {
    if (this.script) {
      const question = this.script[this.state.asked];
      if (!question) return null;
      this.typeCounts[question.type] = (this.typeCounts[question.type] ?? 0) + 1;
      return question;
    }
    const types = this.enabledTypes();
    if (!types.length) return null;

    const eligible = eligibleConcepts(this.settings);
    const priorities = prioritiseConcepts({
      profile: this.profile,
      settings: this.settings,
      eligible,
      sessionCounts: this.sessionCounts,
      rng: this.rng,
    });
    const wishList = priorities.slice(0, 14);
    const remaining = this.settings.questionLimit
      ? Infinity
      : Math.max(0, this.durationSeconds - (Date.now() - this.startedAt) / 1000);

    const ranked = types.map((type) => {
      const pool = new Set(type.pool(this.settings));
      const relevance = wishList
        .filter((p) => pool.has(p.conceptId))
        .reduce((n, p) => n + p.score, 0);
      // Keep the mixture spread across the chosen types.
      const balance = 1 / (1 + (this.typeCounts[type.id] ?? 0) * 0.45);
      // Near the end of a short session, prefer something that actually fits.
      const fits = remaining === Infinity || remaining >= type.baseSeconds ? 1 : 0.15;
      return { type, weight: Math.max(0.05, relevance) * balance * fits };
    });

    // Try the most promising types first; fall through if one cannot generate.
    const order = this.rng.shuffle(ranked).sort((a, b) => b.weight - a.weight);
    const attempts = [
      this.rng.weighted(ranked, (r) => r.weight).type,
      ...order.map((r) => r.type),
    ];

    for (const type of attempts) {
      const pool = new Set(type.pool(this.settings));
      const targetConcepts = wishList.filter((p) => pool.has(p.conceptId)).map((p) => p.conceptId);
      const difficulty = difficultyFor(this.profile, this.settings, targetConcepts.slice(0, 1));
      const question = type.generate({
        rng: this.rng,
        difficulty: clamp(difficulty, 1, 5),
        settings: this.settings,
        targetConcepts,
      });
      if (question) {
        this.typeCounts[type.id] = (this.typeCounts[type.id] ?? 0) + 1;
        return question;
      }
    }
    return null;
  }

  // ── Playback ─────────────────────────────────────────────────────────────

  private play(): void {
    const question = this.state.question;
    if (!question) return;
    this.performer.stop();
    this.performer.configure({ instrument: this.settings.instrument, swing: this.settings.swing });
    const seconds = question.play(this.performer);
    this.markPlaying(seconds);
  }

  private markPlaying(seconds: number): void {
    if (this.playTimer !== null) window.clearTimeout(this.playTimer);
    this.set({ playing: true });
    this.playTimer = window.setTimeout(
      () => {
        this.questionReadyAt = Date.now();
        this.set({ playing: false });
      },
      Math.max(200, seconds * 1000),
    );
  }

  replay(): void {
    if (this.state.phase === 'finished' || !this.state.question) return;
    this.play();
  }

  playReveal(): void {
    const question = this.state.question;
    if (!question) return;
    this.performer.stop();
    const seconds = question.playReveal ? question.playReveal(this.performer) : question.play(this.performer);
    this.markPlaying(seconds);
  }

  useHint(): void {
    const question = this.state.question;
    if (!question?.hint || this.state.phase !== 'question') return;
    this.performer.stop();
    const seconds = question.hint.play(this.performer);
    this.markPlaying(seconds);
    if (!this.state.hintUsed) this.set({ hintUsed: true, hints: this.state.hints + 1 });
  }

  // ── Answering ────────────────────────────────────────────────────────────

  /** Records a choice. Submits automatically once every field has an answer. */
  select(fieldKey: string, optionId: string): void {
    if (this.state.phase !== 'question' || !this.state.question) return;
    const answers = { ...this.state.answers, [fieldKey]: optionId };
    this.set({ answers });
    if (this.state.question.fields.every((f) => answers[f.key] !== undefined)) {
      this.submit(answers);
    }
  }

  clearField(fieldKey: string): void {
    if (this.state.phase !== 'question') return;
    const answers = { ...this.state.answers };
    delete answers[fieldKey];
    this.set({ answers });
  }

  private submit(answers: FieldAnswers): void {
    const question = this.state.question;
    if (!question) return;
    this.performer.stop();
    if (this.playTimer !== null) window.clearTimeout(this.playTimer);

    const correct = isCorrect(question, answers);
    const fields = fieldResults(question, answers);
    const since = this.questionReadyAt || Date.now();
    const ms = clamp(Date.now() - since, 0, 120_000);
    const outcome: AnswerOutcome = { correct, fields, hintUsed: this.state.hintUsed, ms };

    this.record(question, outcome);
    this.set({
      phase: 'feedback',
      outcome,
      playing: false,
      asked: this.state.asked + 1,
      correct: this.state.correct + (correct ? 1 : 0),
    });
  }

  private record(question: Question, outcome: AnswerOutcome): void {
    const now = Date.now();
    const attempt: Attempt = {
      t: now,
      conceptIds: question.conceptIds,
      type: question.type,
      difficulty: question.difficulty,
      keyPc: question.keyPc,
      correct: outcome.correct,
      hintUsed: outcome.hintUsed,
      ms: outcome.ms,
    };
    this.attempts.push(attempt);

    const skills = { ...this.profile.skills };
    for (const conceptId of question.conceptIds) {
      this.sessionCounts[conceptId] = (this.sessionCounts[conceptId] ?? 0) + 1;
      const prior = this.outcomes[conceptId] ?? { asked: 0, correct: 0, hints: 0 };
      this.outcomes[conceptId] = {
        asked: prior.asked + 1,
        correct: prior.correct + (outcome.correct ? 1 : 0),
        hints: prior.hints + (outcome.hintUsed ? 1 : 0),
      };
      const update = applyAttempt(conceptId, skills[conceptId], outcome, now);
      skills[conceptId] = update.skill;
      this.deltas[conceptId] = (this.deltas[conceptId] ?? 0) + update.delta;
      if (update.levelChange === 1) this.promotions.push(conceptId);
    }

    this.profile = {
      ...this.profile,
      skills,
      attempts: [...this.profile.attempts, attempt],
    };
    this.onProfileChange(this.profile);
  }

  /** Moves on from feedback. */
  next(): void {
    if (this.state.phase !== 'feedback') return;
    this.nextQuestion();
  }

  /** Abandons the current question without answering it. */
  skip(): void {
    if (this.state.phase !== 'question') return;
    this.performer.stop();
    this.nextQuestion();
  }

  // ── Finishing ────────────────────────────────────────────────────────────

  finish(): void {
    if (this.state.phase === 'finished') return;
    this.performer.stop();
    if (this.ticker !== null) window.clearInterval(this.ticker);
    this.ticker = null;

    const now = Date.now();
    const record: SessionRecord = {
      id: `s-${this.startedAt.toString(36)}`,
      startedAt: this.startedAt,
      endedAt: now,
      seconds: Math.round((now - this.startedAt) / 1000),
      asked: this.state.asked,
      correct: this.state.correct,
      hints: this.state.hints,
      types: Object.keys(this.typeCounts),
      adaptive: this.settings.adaptive && this.settings.difficulty === 'adaptive',
      deltas: this.deltas,
    };

    // A Daily counts only when it was played all the way through, and only
    // the first time: replaying is useful practice but must not rewrite the
    // score for the day.
    const completedDaily =
      this.dailyDay !== null && this.script !== null && record.asked >= this.script.length;
    const alreadyScored = this.dailyDay !== null && !!this.profile.dailyResults[this.dailyDay];
    const recordDaily = completedDaily && !alreadyScored;

    if (record.asked > 0) {
      this.profile = {
        ...this.profile,
        sessions: [...this.profile.sessions, record],
        streak: bumpStreak(this.profile.streak, now),
        dailyResults: recordDaily
          ? {
              ...this.profile.dailyResults,
              [this.dailyDay!]: {
                day: this.dailyDay!,
                correct: record.correct,
                total: record.asked,
                hints: record.hints,
                seconds: record.seconds,
                completedAt: now,
              },
            }
          : this.profile.dailyResults,
      };
      this.onProfileChange(this.profile);
    }

    this.set({
      phase: 'finished',
      playing: false,
      question: null,
      summary: {
        record,
        deltas: this.deltas,
        outcomes: this.outcomes,
        promotions: this.promotions,
        ...(this.dailyDay ? { daily: this.dailyDay, dailyRecorded: recordDaily } : {}),
      },
    });
  }
}
