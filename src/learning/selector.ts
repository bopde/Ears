import type { Profile, SkillRecord } from './model';
import { CONCEPTS } from '../music/catalog';
import type { PracticeSettings } from '../session/settings';
import { EXERCISE_TYPES, getExerciseType } from '../exercises/registry';
import type { Rng } from '../lib/rng';
import { clamp, uniq } from '../lib/util';

const HOUR = 3600_000;

export type Reason = 'new' | 'weak' | 'due' | 'retention' | 'rotation';

export const REASON_LABEL: Record<Reason, string> = {
  new: 'Not yet practised',
  weak: 'Needs work',
  due: 'Due for review',
  retention: 'Retention check',
  rotation: 'Keeping it turning over',
};

export interface Priority {
  conceptId: string;
  score: number;
  reason: Reason;
  skill?: SkillRecord;
}

export interface SelectionInput {
  profile: Profile;
  settings: PracticeSettings;
  /** Concept ids available under the enabled exercise types and vocabulary. */
  eligible: readonly string[];
  /** How often each concept has already come up this session. */
  sessionCounts: Readonly<Record<string, number>>;
  rng: Rng;
  now?: number;
}

/** Every concept the enabled exercise types could ask about. */
export function eligibleConcepts(settings: PracticeSettings): string[] {
  const types = settings.exerciseTypes.length
    ? settings.exerciseTypes
    : EXERCISE_TYPES.map((t) => t.id);
  return uniq(types.flatMap((id) => getExerciseType(id)?.pool(settings) ?? []));
}

/** The user's working level overall, used to pace the introduction of new material. */
export function overallLevel(profile: Profile): number {
  const practised = Object.values(profile.skills).filter((s) => s.attempts >= 2);
  if (!practised.length) return 2;
  const weighted = practised.reduce((acc, s) => acc + s.level * Math.min(s.attempts, 10), 0);
  const weight = practised.reduce((acc, s) => acc + Math.min(s.attempts, 10), 0);
  return clamp(weighted / Math.max(1, weight), 1, 5);
}

/**
 * Ranks concepts by how much they deserve the next question.
 *
 * The brief's learning principle in one function: weakness and overdue-ness
 * push a concept up, repetition within the session pushes it down, and
 * mastered material keeps a small standing claim so it resurfaces for a
 * retention check instead of vanishing. New material is introduced in rough
 * order of difficulty rather than all at once.
 */
export function prioritiseConcepts(input: SelectionInput): Priority[] {
  const { profile, settings, eligible, sessionCounts, rng } = input;
  const now = input.now ?? Date.now();
  const level = typeof settings.difficulty === 'number' ? settings.difficulty : overallLevel(profile);

  const scored: Priority[] = eligible.map((conceptId) => {
    const skill = profile.skills[conceptId];
    const concept = CONCEPTS.resolve(conceptId);
    let score: number;
    let reason: Reason;

    if (!skill || skill.attempts === 0) {
      // Worth showing, but gated so advanced material arrives when it is due.
      const beyond = Math.max(0, concept.tier - level - 0.5);
      score = 0.95 / (1 + beyond * 1.1);
      reason = 'new';
    } else {
      const weakness = 1 - skill.strength;
      const overdue = clamp((now - skill.dueAt) / (skill.intervalHours * HOUR), 0, 3);
      score = weakness * 1.6 + Math.min(overdue, 1.5) * 0.75;
      if (skill.strength >= 0.85) {
        // Mastered: mostly out of the way, but it comes back when it is due.
        score = Math.min(score, 0.35) + (overdue > 0 ? 0.6 : 0);
        reason = 'retention';
      } else if (weakness >= 0.45) {
        reason = 'weak';
      } else if (overdue > 0) {
        reason = 'due';
      } else {
        reason = 'rotation';
      }
    }

    // Spread the session around rather than drilling one item to death.
    const seen = sessionCounts[conceptId] ?? 0;
    score /= 1 + seen * 1.7;
    if (skill && now - skill.lastSeen < 45_000) score *= 0.3;

    // With a fixed difficulty, keep the material near that level.
    if (typeof settings.difficulty === 'number') {
      score /= 1 + Math.abs(concept.tier - settings.difficulty) * 0.55;
    }

    // A little noise so two sessions in a row never feel identical.
    score *= 0.85 + rng.next() * 0.3;

    return { conceptId, score, reason, skill };
  });

  return scored.sort((a, b) => b.score - a.score);
}

/**
 * The difficulty for a question about these concepts.
 *
 * In adaptive mode each concept carries its own level, so a musician can be
 * working at level 5 on major 7ths and level 2 on altered dominants in the
 * same session.
 */
export function difficultyFor(
  profile: Profile,
  settings: PracticeSettings,
  conceptIds: readonly string[],
): number {
  if (typeof settings.difficulty === 'number') return clamp(settings.difficulty, 1, 5);
  const levels = conceptIds
    .map((id) => profile.skills[id]?.level)
    .filter((l): l is number => typeof l === 'number');
  if (!levels.length) return clamp(Math.round(overallLevel(profile)), 1, 5);
  return clamp(Math.round(Math.min(...levels)), 1, 5);
}

/** Concepts the model is currently pushing — shown on the home and progress screens. */
export function focusAreas(
  profile: Profile,
  settings: PracticeSettings,
  rng: Rng,
  count = 5,
): Priority[] {
  const eligible = eligibleConcepts(settings);
  return prioritiseConcepts({ profile, settings, eligible, sessionCounts: {}, rng })
    .filter((p) => p.reason !== 'rotation')
    .slice(0, count);
}
