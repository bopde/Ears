import { describe, expect, it } from 'vitest';
import {
  applyAttempt, bumpStreak, credit, dayKey, emptyProfile, mastery, newSkill,
  type Profile, type SkillRecord,
} from './model';
import { difficultyFor, eligibleConcepts, overallLevel, prioritiseConcepts } from './selector';
import { overview, weakest } from './stats';
import { importProfile } from './store';
import { defaultSettings } from '../session/settings';
import { chordConceptId } from '../music/chords';
import { makeRng } from '../lib/rng';

const settings = defaultSettings();
const HOUR = 3600_000;

function withSkill(profile: Profile, skill: SkillRecord): Profile {
  return { ...profile, skills: { ...profile.skills, [skill.conceptId]: skill } };
}

/** Feeds a concept a run of identical answers. */
function drill(
  conceptId: string,
  outcomes: boolean[],
  opts: { hintUsed?: boolean; now?: number } = {},
): SkillRecord {
  let skill = newSkill(conceptId, opts.now ?? Date.now());
  let t = opts.now ?? Date.now();
  for (const correct of outcomes) {
    t += 60_000;
    skill = applyAttempt(
      conceptId,
      skill,
      { correct, hintUsed: opts.hintUsed ?? false, ms: 2500 },
      t,
    ).skill;
  }
  return skill;
}

describe('credit', () => {
  it('values a cold answer above a hinted one', () => {
    expect(credit(true, false)).toBe(1);
    expect(credit(true, true)).toBeLessThan(credit(true, false));
    expect(credit(true, true)).toBeGreaterThan(credit(false, false));
    expect(credit(false, true)).toBeLessThan(credit(false, false));
  });
});

describe('applyAttempt', () => {
  it('raises strength on a right answer and drops it on a wrong one', () => {
    const good = drill('chord:maj7', [true, true, true]);
    const bad = drill('chord:maj7', [false, false, false]);
    expect(good.strength).toBeGreaterThan(0.8);
    expect(bad.strength).toBeLessThan(0.2);
    expect(good.correct).toBe(3);
    expect(bad.correct).toBe(0);
  });

  it('stretches the review gap when answers are right and collapses it when wrong', () => {
    const start = newSkill('chord:7', 0);
    const right = applyAttempt('chord:7', start, { correct: true, hintUsed: false, ms: 1000 }, 0).skill;
    const wrong = applyAttempt('chord:7', start, { correct: false, hintUsed: false, ms: 1000 }, 0).skill;
    expect(right.intervalHours).toBeGreaterThan(start.intervalHours);
    expect(wrong.intervalHours).toBeLessThan(start.intervalHours);
    expect(right.dueAt).toBeGreaterThan(wrong.dueAt);
  });

  it('brings mastered material back eventually rather than never', () => {
    const mastered = drill('chord:maj7', Array(40).fill(true));
    expect(mastered.intervalHours).toBeLessThanOrEqual(24 * 30);
    expect(mastered.strength).toBeGreaterThan(0.9);
  });

  it('promotes a concept once the current level is solid', () => {
    const skill = drill('chord:m7', [true, true, true, true]);
    expect(skill.level).toBe(3);
    expect(skill.recent.length, 'the window resets after a promotion').toBe(0);
  });

  it('demotes a concept that is failing at its current level', () => {
    const skill = drill('chord:7alt', [false, false, false, false]);
    expect(skill.level).toBe(1);
  });

  it('does not promote on hinted answers alone', () => {
    const hinted = drill('chord:m9', [true, true, true, true, true, true], { hintUsed: true });
    expect(hinted.level, 'hinted credit of 0.6 stays under the 0.85 bar').toBe(2);
  });

  it('keeps the level inside 1–5', () => {
    expect(drill('chord:maj7', Array(60).fill(true)).level).toBe(5);
    expect(drill('chord:maj7', Array(60).fill(false)).level).toBe(1);
  });

  it('reports what changed', () => {
    const update = applyAttempt('chord:6', newSkill('chord:6', 0), {
      correct: true, hintUsed: false, ms: 900,
    }, 0);
    expect(update.delta).toBeGreaterThan(0);
    expect(update.levelChange).toBe(0);
  });
});

describe('mastery', () => {
  it('labels a record by how solid it is', () => {
    expect(mastery(undefined)).toBe('new');
    expect(mastery(drill('x', Array(10).fill(true)))).toBe('mastered');
    expect(mastery(drill('x', Array(10).fill(false)))).toBe('shaky');
  });
});

describe('selector', () => {
  const now = Date.now();
  const rng = makeRng(7);

  it('puts a weak concept ahead of a mastered one', () => {
    let profile = emptyProfile();
    profile = withSkill(profile, { ...drill('chord:7alt', [false, false, false]), conceptId: 'chord:7alt', lastSeen: now - 10 * HOUR });
    profile = withSkill(profile, { ...drill('chord:maj7', Array(10).fill(true)), conceptId: 'chord:maj7', lastSeen: now - 10 * HOUR, dueAt: now + 100 * HOUR });
    const ranked = prioritiseConcepts({
      profile, settings, eligible: ['chord:7alt', 'chord:maj7'], sessionCounts: {}, rng,
    });
    expect(ranked[0].conceptId).toBe('chord:7alt');
    expect(ranked[0].reason).toBe('weak');
    expect(ranked[1].reason).toBe('retention');
  });

  it('brings mastered material back when it falls due', () => {
    let profile = emptyProfile();
    const base = drill('chord:maj7', Array(10).fill(true));
    profile = withSkill(profile, { ...base, conceptId: 'chord:maj7', dueAt: now + 500 * HOUR, lastSeen: now - 500 * HOUR });
    profile = withSkill(profile, { ...base, conceptId: 'chord:m7', dueAt: now - 500 * HOUR, lastSeen: now - 500 * HOUR });
    const ranked = prioritiseConcepts({
      profile, settings, eligible: ['chord:maj7', 'chord:m7'], sessionCounts: {}, rng,
    });
    expect(ranked[0].conceptId, 'the overdue one comes first').toBe('chord:m7');
  });

  it('stops drilling the same concept over and over inside one session', () => {
    const profile = withSkill(emptyProfile(), {
      ...drill('chord:7alt', [false, false]), conceptId: 'chord:7alt', lastSeen: now - 10 * HOUR,
    });
    const fresh = prioritiseConcepts({
      profile, settings, eligible: ['chord:7alt'], sessionCounts: {}, rng,
    })[0].score;
    const repeated = prioritiseConcepts({
      profile, settings, eligible: ['chord:7alt'], sessionCounts: { 'chord:7alt': 3 }, rng,
    })[0].score;
    expect(repeated).toBeLessThan(fresh);
  });

  it('introduces advanced material behind basic material', () => {
    const profile = emptyProfile();
    const ranked = prioritiseConcepts({
      profile,
      settings: { ...settings, difficulty: 'adaptive' },
      eligible: [chordConceptId('maj'), chordConceptId('7alt')],
      sessionCounts: {},
      rng: makeRng(3),
    });
    expect(ranked[0].conceptId).toBe(chordConceptId('maj'));
  });

  it('keeps a fixed difficulty near that tier', () => {
    const ranked = prioritiseConcepts({
      profile: emptyProfile(),
      settings: { ...settings, difficulty: 2 },
      eligible: [chordConceptId('maj7'), chordConceptId('7alt')],
      sessionCounts: {},
      rng: makeRng(11),
    });
    expect(ranked[0].conceptId).toBe(chordConceptId('maj7'));
  });

  it('uses the concept’s own level when difficulty is adaptive', () => {
    const profile = withSkill(emptyProfile(), {
      ...newSkill('chord:maj7'), conceptId: 'chord:maj7', level: 5, attempts: 9,
    });
    expect(difficultyFor(profile, settings, ['chord:maj7'])).toBe(5);
    expect(difficultyFor(profile, { ...settings, difficulty: 2 }, ['chord:maj7'])).toBe(2);
  });

  it('counts every concept the enabled exercises can reach', () => {
    const all = eligibleConcepts(settings);
    expect(all.length).toBeGreaterThan(50);
    expect(all).toContain(chordConceptId('maj7'));
    const narrow = eligibleConcepts({ ...settings, exerciseTypes: ['interval'] });
    expect(narrow.every((id) => id.startsWith('interval:'))).toBe(true);
  });
});

describe('a learner over time', () => {
  it('drops what is solid, chases what is not, and raises the bar as it improves', () => {
    // Someone who hears major 7ths cleanly but cannot hear altered dominants.
    let profile = emptyProfile();
    const strongId = chordConceptId('maj7');
    const weakId = chordConceptId('7alt');
    let t = Date.now() - 20 * HOUR;
    for (let i = 0; i < 24; i++) {
      t += 5 * 60_000;
      for (const [id, correct] of [[strongId, true], [weakId, false]] as const) {
        const update = applyAttempt(id, profile.skills[id], { correct, hintUsed: false, ms: 2000 }, t);
        profile = withSkill(profile, update.skill);
      }
    }

    const strong = profile.skills[strongId];
    const weak = profile.skills[weakId];
    expect(strong.level, 'the solid concept has been pushed to the top level').toBe(5);
    expect(weak.level, 'the weak concept has been dialled right back').toBe(1);
    expect(strong.intervalHours, 'solid material is parked for days').toBeGreaterThan(24);
    expect(weak.intervalHours, 'weak material comes straight back').toBeLessThan(2);

    const ranked = prioritiseConcepts({
      profile, settings, eligible: [strongId, weakId], sessionCounts: {}, rng: makeRng(5),
    });
    expect(ranked[0].conceptId, 'the next question is about the weakness').toBe(weakId);
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score * 2);

    expect(difficultyFor(profile, settings, [strongId])).toBe(5);
    expect(difficultyFor(profile, settings, [weakId])).toBe(1);
    expect(overallLevel(profile)).toBeGreaterThan(1);

    expect(weakest(profile, 3)[0].concept.id).toBe(weakId);
  });
});

describe('streak', () => {
  it('counts consecutive days and resets after a gap', () => {
    const now = Date.now();
    const yesterday = dayKey(now - 24 * HOUR);
    expect(bumpStreak({ count: 3, lastDay: yesterday }, now).count).toBe(4);
    expect(bumpStreak({ count: 3, lastDay: dayKey(now - 5 * 24 * HOUR) }, now).count).toBe(1);
    const today = bumpStreak({ count: 1, lastDay: dayKey(now) }, now);
    expect(today.count, 'practising twice in a day does not double count').toBe(1);
  });
});

describe('stats', () => {
  it('summarises an empty profile without dividing by zero', () => {
    const stats = overview(emptyProfile());
    expect(stats.accuracy).toBe(0);
    expect(stats.attempts).toBe(0);
    expect(Number.isFinite(stats.hintRate)).toBe(true);
  });
});

describe('profile migration', () => {
  /** A profile as version 1 wrote it: settings stored in full. */
  const v1 = (overrides: Record<string, unknown> = {}) =>
    JSON.stringify({
      version: 1,
      createdAt: 1,
      skills: {},
      sessions: [],
      attempts: [],
      streak: { count: 2, lastDay: '2026-01-01' },
      settings: { durationMinutes: 20, autoAdvance: true, ...overrides },
    });

  it('clears the old auto-advance default so feedback waits for a tap', () => {
    const migrated = importProfile(v1());
    expect(migrated).not.toBeNull();
    expect(migrated!.settings.autoAdvance, 'stale value dropped').toBe(false);
  });

  it('keeps everything else the profile was carrying', () => {
    const migrated = importProfile(v1())!;
    expect(migrated.settings.durationMinutes, 'unrelated settings survive').toBe(20);
    expect(migrated.streak.count).toBe(2);
    expect(migrated.version).toBe(2);
  });

  it('leaves a current profile alone, including a deliberate opt-in', () => {
    const current = JSON.parse(v1()) as Record<string, unknown>;
    current.version = 2;
    const migrated = importProfile(JSON.stringify(current))!;
    expect(migrated.settings.autoAdvance, 'a chosen setting is not overridden').toBe(true);
  });

  it('survives a profile with no settings at all', () => {
    const migrated = importProfile(JSON.stringify({ version: 1, skills: {} }))!;
    expect(migrated.settings.autoAdvance).toBe(false);
    expect(migrated.skills).toEqual({});
  });
});
