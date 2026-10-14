import type { PracticeSettings } from '../session/settings';
import { clamp } from '../lib/util';

export interface Attempt {
  /** Epoch milliseconds. */
  t: number;
  conceptIds: string[];
  type: string;
  difficulty: number;
  keyPc: number | null;
  correct: boolean;
  hintUsed: boolean;
  /** Response time in milliseconds, from the end of playback to the answer. */
  ms: number;
}

export interface SkillRecord {
  conceptId: string;
  attempts: number;
  correct: number;
  hintCount: number;
  /** Exponential moving average of credit, 0–1. The headline "how solid is this". */
  strength: number;
  /** Spaced-repetition interval in hours. */
  intervalHours: number;
  /** When this concept should come round again. */
  dueAt: number;
  lastSeen: number;
  /** Difficulty tier currently being practised for this concept, 1–5. */
  level: number;
  /** Credits at the current level; drives promotion and demotion. */
  recent: number[];
  /** Rolling mean response time in milliseconds. */
  avgMs: number;
}

export interface SessionRecord {
  id: string;
  startedAt: number;
  endedAt: number;
  seconds: number;
  asked: number;
  correct: number;
  hints: number;
  types: string[];
  adaptive: boolean;
  /** Strength change per concept, for the "what moved" summary. */
  deltas: Record<string, number>;
}

/** The outcome of one Daily, kept so a day can only be scored once. */
export interface DailyResult {
  day: string;
  correct: number;
  total: number;
  hints: number;
  seconds: number;
  completedAt: number;
}

export interface Profile {
  version: number;
  createdAt: number;
  skills: Record<string, SkillRecord>;
  sessions: SessionRecord[];
  /** Recent attempts, trimmed. Older detail is summarised in the skill records. */
  attempts: Attempt[];
  settings: Partial<PracticeSettings>;
  streak: { count: number; lastDay: string };
  /** Completed Dailies, keyed by day. Only the first attempt at a day counts. */
  dailyResults: Record<string, DailyResult>;
}

export const PROFILE_VERSION = 2;
export const MAX_ATTEMPTS = 4000;
export const MAX_SESSIONS = 400;
export const MAX_DAILY_RESULTS = 400;

export function emptyProfile(): Profile {
  return {
    version: PROFILE_VERSION,
    createdAt: Date.now(),
    skills: {},
    sessions: [],
    attempts: [],
    settings: {},
    streak: { count: 0, lastDay: '' },
    dailyResults: {},
  };
}

export function newSkill(conceptId: string, now = Date.now()): SkillRecord {
  return {
    conceptId,
    attempts: 0,
    correct: 0,
    hintCount: 0,
    strength: 0,
    intervalHours: 4,
    dueAt: now,
    lastSeen: 0,
    level: 2,
    recent: [],
    avgMs: 0,
  };
}

/**
 * How much an answer counts for.
 *
 * A right answer that needed a reference pitch is real progress but not the
 * same as hearing it cold, and a wrong answer after a hint is worse than a
 * wrong answer without one.
 */
export function credit(correct: boolean, hintUsed: boolean): number {
  if (correct) return hintUsed ? 0.6 : 1;
  return hintUsed ? 0 : 0.08;
}

const HOUR = 3600_000;
/** Mastered material still comes back roughly monthly. */
const MAX_INTERVAL_HOURS = 24 * 30;
const MIN_INTERVAL_HOURS = 0.25;
/** Window of results used to decide promotion or demotion. */
const LEVEL_WINDOW = 6;

export interface SkillUpdate {
  skill: SkillRecord;
  /** Change in strength, for session summaries. */
  delta: number;
  levelChange: -1 | 0 | 1;
}

/**
 * Folds one answer into a concept's record.
 *
 * Two things move: `strength`, a smoothed estimate of how reliably the concept
 * is heard, and `intervalHours`, the spaced-repetition gap. Getting something
 * right stretches the gap; getting it wrong collapses it. On top of that sits a
 * per-concept difficulty level that promotes once the current level is solid
 * and demotes when it is not, so improvement raises the bar rather than simply
 * making the concept disappear.
 */
export function applyAttempt(
  conceptId: string,
  existing: SkillRecord | undefined,
  attempt: { correct: boolean; hintUsed: boolean; ms: number },
  now = Date.now(),
): SkillUpdate {
  const skill: SkillRecord = { ...(existing ?? newSkill(conceptId, now)) };
  const value = credit(attempt.correct, attempt.hintUsed);
  const before = skill.strength;

  // Early attempts move the estimate quickly; it settles down as evidence builds.
  const alpha = clamp(0.5 - skill.attempts * 0.035, 0.16, 0.5);
  skill.strength = skill.attempts === 0 ? value : skill.strength + alpha * (value - skill.strength);
  skill.attempts += 1;
  if (attempt.correct) skill.correct += 1;
  if (attempt.hintUsed) skill.hintCount += 1;
  skill.avgMs = skill.avgMs === 0 ? attempt.ms : skill.avgMs * 0.75 + attempt.ms * 0.25;
  skill.lastSeen = now;

  if (attempt.correct) {
    // Confident answers stretch the interval further than hesitant ones.
    const growth = 1.45 + skill.strength * 1.25 - (attempt.hintUsed ? 0.45 : 0);
    skill.intervalHours = clamp(skill.intervalHours * growth, MIN_INTERVAL_HOURS, MAX_INTERVAL_HOURS);
  } else {
    skill.intervalHours = clamp(skill.intervalHours * 0.3, MIN_INTERVAL_HOURS, 12);
  }
  skill.dueAt = now + skill.intervalHours * HOUR;

  // Only results at the level currently being practised count toward promotion.
  skill.recent = [...skill.recent, value].slice(-LEVEL_WINDOW);
  let levelChange: -1 | 0 | 1 = 0;
  if (skill.recent.length >= 4) {
    const mean = skill.recent.reduce((a, b) => a + b, 0) / skill.recent.length;
    if (mean >= 0.85 && skill.level < 5) {
      skill.level += 1;
      skill.recent = [];
      levelChange = 1;
    } else if (mean < 0.45 && skill.level > 1) {
      skill.level -= 1;
      skill.recent = [];
      levelChange = -1;
    }
  }

  return { skill, delta: skill.strength - before, levelChange };
}

export type Mastery = 'new' | 'shaky' | 'developing' | 'solid' | 'mastered';

export function mastery(skill: SkillRecord | undefined): Mastery {
  if (!skill || skill.attempts === 0) return 'new';
  if (skill.attempts < 3) return skill.strength >= 0.7 ? 'developing' : 'shaky';
  if (skill.strength >= 0.88) return 'mastered';
  if (skill.strength >= 0.68) return 'solid';
  if (skill.strength >= 0.42) return 'developing';
  return 'shaky';
}

export const MASTERY_LABEL: Record<Mastery, string> = {
  new: 'Not yet practised',
  shaky: 'Needs work',
  developing: 'Developing',
  solid: 'Solid',
  mastered: 'Mastered',
};

export function dayKey(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Advances the daily streak, allowing for a session that spans midnight. */
export function bumpStreak(streak: Profile['streak'], now = Date.now()): Profile['streak'] {
  const today = dayKey(now);
  if (streak.lastDay === today) return streak;
  const yesterday = dayKey(now - 24 * HOUR);
  return {
    count: streak.lastDay === yesterday ? streak.count + 1 : 1,
    lastDay: today,
  };
}
