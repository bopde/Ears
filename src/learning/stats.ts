import type { Attempt, Profile, SkillRecord } from './model';
import { dayKey, mastery, type Mastery } from './model';
import { CONCEPTS } from '../music/catalog';
import type { Concept, ConceptKind } from '../music/concept';
import { exerciseName } from '../exercises/registry';
import { mean } from '../lib/util';

export interface Overview {
  attempts: number;
  correct: number;
  accuracy: number;
  hintRate: number;
  sessions: number;
  practiceSeconds: number;
  streak: number;
  conceptsTouched: number;
  conceptsMastered: number;
  /** Median response time in milliseconds, 0 when there is nothing to measure. */
  medianMs: number;
}

export function overview(profile: Profile): Overview {
  const attempts = profile.attempts;
  const correct = attempts.filter((a) => a.correct).length;
  const hints = attempts.filter((a) => a.hintUsed).length;
  const skills = Object.values(profile.skills);
  const times = attempts.map((a) => a.ms).filter((ms) => ms > 0).sort((a, b) => a - b);
  return {
    attempts: attempts.length,
    correct,
    accuracy: attempts.length ? correct / attempts.length : 0,
    hintRate: attempts.length ? hints / attempts.length : 0,
    sessions: profile.sessions.length,
    practiceSeconds: profile.sessions.reduce((n, s) => n + s.seconds, 0),
    streak: profile.streak.count,
    conceptsTouched: skills.filter((s) => s.attempts > 0).length,
    conceptsMastered: skills.filter((s) => mastery(s) === 'mastered').length,
    medianMs: times.length ? times[Math.floor(times.length / 2)] : 0,
  };
}

export interface ConceptStat {
  concept: Concept;
  skill: SkillRecord;
  mastery: Mastery;
}

export function conceptStats(profile: Profile, kind?: ConceptKind): ConceptStat[] {
  return Object.values(profile.skills)
    .filter((s) => s.attempts > 0)
    .map((skill) => ({ concept: CONCEPTS.resolve(skill.conceptId), skill, mastery: mastery(skill) }))
    .filter((s) => !kind || s.concept.kind === kind)
    .sort((a, b) => a.skill.strength - b.skill.strength);
}

/** Weakest first. Needs a couple of attempts before a concept counts as weak. */
export function weakest(profile: Profile, n = 5, minAttempts = 2): ConceptStat[] {
  return conceptStats(profile)
    .filter((s) => s.skill.attempts >= minAttempts && s.skill.strength < 0.75)
    .slice(0, n);
}

export function strongest(profile: Profile, n = 5, minAttempts = 3): ConceptStat[] {
  return conceptStats(profile)
    .filter((s) => s.skill.attempts >= minAttempts)
    .reverse()
    .slice(0, n);
}

export interface Bucket {
  label: string;
  asked: number;
  correct: number;
  accuracy: number;
}

function bucket(label: string, items: readonly Attempt[]): Bucket {
  const correct = items.filter((a) => a.correct).length;
  return { label, asked: items.length, correct, accuracy: items.length ? correct / items.length : 0 };
}

export function byExerciseType(profile: Profile): Bucket[] {
  const groups = new Map<string, Attempt[]>();
  for (const a of profile.attempts) {
    const list = groups.get(a.type);
    if (list) list.push(a);
    else groups.set(a.type, [a]);
  }
  return Array.from(groups.entries())
    .map(([type, items]) => bucket(exerciseName(type), items))
    .sort((a, b) => b.asked - a.asked);
}

export function byKey(profile: Profile): Array<Bucket & { pc: number }> {
  const groups = new Map<number, Attempt[]>();
  for (const a of profile.attempts) {
    if (a.keyPc === null || a.keyPc === undefined) continue;
    const list = groups.get(a.keyPc);
    if (list) list.push(a);
    else groups.set(a.keyPc, [a]);
  }
  return Array.from(groups.entries())
    .map(([pc, items]) => ({ pc, ...bucket(String(pc), items) }))
    .sort((a, b) => a.pc - b.pc);
}

export interface DayStat {
  day: string;
  asked: number;
  correct: number;
  accuracy: number;
  seconds: number;
}

/** The last `days` calendar days, oldest first, including days with no practice. */
export function dailyHistory(profile: Profile, days = 14): DayStat[] {
  const out: DayStat[] = [];
  const now = Date.now();
  const byDay = new Map<string, Attempt[]>();
  for (const a of profile.attempts) {
    const k = dayKey(a.t);
    const list = byDay.get(k);
    if (list) list.push(a);
    else byDay.set(k, [a]);
  }
  const secondsByDay = new Map<string, number>();
  for (const s of profile.sessions) {
    const k = dayKey(s.startedAt);
    secondsByDay.set(k, (secondsByDay.get(k) ?? 0) + s.seconds);
  }
  for (let i = days - 1; i >= 0; i--) {
    const day = dayKey(now - i * 86400_000);
    const items = byDay.get(day) ?? [];
    const correct = items.filter((a) => a.correct).length;
    out.push({
      day,
      asked: items.length,
      correct,
      accuracy: items.length ? correct / items.length : 0,
      seconds: secondsByDay.get(day) ?? 0,
    });
  }
  return out;
}

/**
 * Accuracy over the most recent attempts, split into equal slices — enough to
 * show a trend line without pretending to statistical rigour.
 */
export function accuracyTrend(profile: Profile, slices = 8, window = 240): number[] {
  const recent = profile.attempts.slice(-window);
  if (recent.length < slices) return [];
  const size = Math.floor(recent.length / slices);
  const out: number[] = [];
  for (let i = 0; i < slices; i++) {
    const part = recent.slice(i * size, i === slices - 1 ? undefined : (i + 1) * size);
    out.push(mean(part.map((a) => (a.correct ? 1 : 0))));
  }
  return out;
}

export interface SessionConceptRow {
  concept: Concept;
  asked: number;
  correct: number;
  hints: number;
  /** Change in strength over the session. */
  delta: number;
  /** Strength now. */
  strength: number;
}

/**
 * What the session actually did to each concept.
 *
 * Reported as results rather than as a strength delta on its own: the first
 * time a concept is ever answered the strength moves up from zero whether the
 * answer was right or wrong, so a delta alone would call a missed chord an
 * improvement.
 */
export function sessionBreakdown(
  profile: Profile,
  outcomes: Record<string, { asked: number; correct: number; hints: number }>,
  deltas: Record<string, number>,
  n = 6,
): SessionConceptRow[] {
  return Object.entries(outcomes)
    .map(([id, outcome]) => ({
      concept: CONCEPTS.resolve(id),
      asked: outcome.asked,
      correct: outcome.correct,
      hints: outcome.hints,
      delta: deltas[id] ?? 0,
      strength: profile.skills[id]?.strength ?? 0,
    }))
    // Weakest first: what was missed is the useful part of a results screen.
    .sort((a, b) => a.correct / a.asked - b.correct / b.asked || b.asked - a.asked)
    .slice(0, n);
}
