import { describe, expect, it } from 'vitest';
import {
  DAILY_QUESTION_COUNT, buildDailyPlan, buildDailyQuestions, dailyLabel, dailyNumber,
  dailySeed, dailySettings, todayKey,
} from './daily';
import { defaultSettings, EXERCISE_TYPE_IDS } from './settings';
import type { Question } from '../exercises/types';
import { EXERCISE_TYPES } from '../exercises/registry';
import { CONCEPTS } from '../music/catalog';
import { FakePerformer } from '../test-support';
import { uniq } from '../lib/util';

/**
 * What the question actually asks: everything a second person must receive
 * identically. Labels and reveal text are deliberately excluded — those follow
 * the user's own note spelling, and changing how a chord is written does not
 * change which chord it is.
 */
const contentPrint = (q: Question) =>
  JSON.stringify({
    type: q.type,
    difficulty: q.difficulty,
    keyPc: q.keyPc,
    conceptIds: q.conceptIds,
    correct: q.correct,
    fields: q.fields.map((f) => ({ key: f.key, options: f.options.map((o) => o.id) })),
  });

/** The content plus everything shown on screen. */
const fullPrint = (q: Question) =>
  JSON.stringify({
    content: contentPrint(q),
    prompt: q.prompt,
    reveal: q.reveal,
    labels: q.fields.map((f) => f.options.map((o) => [o.label, o.sub])),
  });

const DAY = '2026-10-08';

describe('the daily is the same for everyone', () => {
  it('builds identically when built twice', () => {
    const a = buildDailyQuestions(DAY).map(fullPrint);
    const b = buildDailyQuestions(DAY).map(fullPrint);
    expect(a).toEqual(b);
  });

  it('ignores the practice settings of whoever is playing', () => {
    const base = buildDailyQuestions(DAY, defaultSettings()).map(contentPrint);

    // Someone who has pared the app right back.
    const minimal = buildDailyQuestions(DAY, {
      ...defaultSettings(),
      exerciseTypes: ['interval'],
      chordQualities: ['maj'],
      intervals: ['P5'],
      modes: ['ionian'],
      progressions: ['ii-V-I'],
      intervalDirections: ['ascending'],
      keys: [0],
      difficulty: 1,
      adaptive: false,
      questionLimit: 3,
      durationMinutes: 5,
      hintsEnabled: false,
    }).map(contentPrint);

    // Someone who has opened everything up.
    const maximal = buildDailyQuestions(DAY, {
      ...defaultSettings(),
      difficulty: 5,
      keys: [6],
      durationMinutes: 60,
    }).map(contentPrint);

    expect(minimal, 'a pared-back setup gets the same ten').toEqual(base);
    expect(maximal, 'a wide-open setup gets the same ten').toEqual(base);
  });

  it('lets note spelling and voice stay personal without changing the questions', () => {
    const sharps = buildDailyQuestions(DAY, { ...defaultSettings(), accidental: 'sharp' });
    const flats = buildDailyQuestions(DAY, {
      ...defaultSettings(),
      accidental: 'flat',
      instrument: 'vibes',
      tempo: 200,
      swing: 0,
    });
    expect(flats.map(contentPrint), 'same questions').toEqual(sharps.map(contentPrint));
    // Guard against the test being vacuous: the spelling really does reach the
    // screen. The notes line is where it shows most reliably, since a heading
    // only differs when the root happens to be a black key.
    const spelled = (qs: Question[]) => qs.map((q) => q.reveal.notes ?? '').join('|');
    expect(spelled(flats), 'spelling follows the user').not.toEqual(spelled(sharps));
  });

  it('gives a different set of questions on a different day', () => {
    const days = ['2026-10-07', '2026-10-08', '2026-10-09', '2026-11-08', '2027-10-08'];
    const prints = days.map((d) => buildDailyQuestions(d).map(contentPrint).join('~'));
    expect(uniq(prints).length, 'every day is its own puzzle').toBe(days.length);
  });
});

describe('the shape of a daily', () => {
  it('is ten questions on a fixed difficulty ramp', () => {
    const questions = buildDailyQuestions(DAY);
    expect(questions).toHaveLength(DAILY_QUESTION_COUNT);
    expect(DAILY_QUESTION_COUNT).toBe(10);
    const ramp = questions.map((q) => q.difficulty);
    expect(ramp, 'it opens gently and finishes hard').toEqual([2, 2, 3, 3, 3, 4, 4, 4, 5, 5]);
    expect(buildDailyPlan(DAY).map((p) => p.difficulty)).toEqual(ramp);
  });

  it('covers every kind of exercise before repeating any', () => {
    for (const day of ['2026-01-01', '2026-06-15', '2026-10-08', '2027-03-21']) {
      const types = buildDailyQuestions(day).map((q) => q.type);
      expect(uniq(types.slice(0, EXERCISE_TYPES.length)).length, `${day} covers everything`).toBe(
        EXERCISE_TYPES.length,
      );
    }
  });

  it('produces questions that are complete and playable', () => {
    for (const day of ['2026-02-28', '2026-10-08', '2026-12-31']) {
      for (const question of buildDailyQuestions(day)) {
        expect(question.conceptIds.length).toBeGreaterThan(0);
        for (const id of question.conceptIds) expect(CONCEPTS.get(id)).toBeDefined();
        for (const field of question.fields) {
          const ids = field.options.map((o) => o.id);
          expect(ids).toContain(question.correct[field.key]);
          expect(new Set(ids).size).toBe(ids.length);
        }
        const perf = new FakePerformer();
        expect(question.play(perf.asPerformer())).toBeGreaterThan(0);
        expect(perf.notes.length).toBeGreaterThan(0);
        expect(question.hint).toBeDefined();
      }
    }
  });

  it('holds up across a year of dates', () => {
    for (let i = 0; i < 365; i += 7) {
      const date = new Date(Date.UTC(2026, 0, 1) + i * 86_400_000);
      const day = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
      expect(buildDailyQuestions(day), day).toHaveLength(DAILY_QUESTION_COUNT);
    }
  });
});

describe('daily settings', () => {
  it('pins everything that decides what is asked', () => {
    const settings = dailySettings({ ...defaultSettings(), keys: [3], chordQualities: ['maj'] });
    expect(settings.keys).toBe('all');
    expect(settings.exerciseTypes).toEqual([...EXERCISE_TYPE_IDS]);
    expect(settings.chordQualities.length).toBeGreaterThan(30);
    expect(settings.adaptive).toBe(false);
    expect(settings.difficulty).not.toBe('adaptive');
    expect(settings.questionLimit).toBe(DAILY_QUESTION_COUNT);
  });

  it('passes presentation and assistance straight through', () => {
    const user = {
      ...defaultSettings(),
      instrument: 'vibes',
      accidental: 'flat' as const,
      theme: 'light' as const,
      autoAdvance: true,
      hintsEnabled: false,
      volume: 0.3,
    };
    const settings = dailySettings(user);
    expect(settings.instrument).toBe('vibes');
    expect(settings.accidental).toBe('flat');
    expect(settings.theme).toBe('light');
    expect(settings.autoAdvance).toBe(true);
    expect(settings.hintsEnabled).toBe(false);
    expect(settings.volume).toBe(0.3);
  });
});

describe('day identity', () => {
  it('numbers days consecutively and survives daylight saving', () => {
    expect(dailyNumber('2026-01-01')).toBe(1);
    expect(dailyNumber('2026-01-02')).toBe(2);
    expect(dailyNumber('2026-12-31')).toBe(365);
    // New Zealand changes clocks in late September and early April.
    expect(dailyNumber('2026-09-28') - dailyNumber('2026-09-26')).toBe(2);
    expect(dailyNumber('2026-04-06') - dailyNumber('2026-04-04')).toBe(2);
  });

  it('derives the seed from the date alone', () => {
    expect(dailySeed('2026-10-08')).toBe(dailySeed('2026-10-08'));
    expect(dailySeed('2026-10-08')).not.toBe(dailySeed('2026-10-09'));
  });

  it('keys on the local day and reads back as a date', () => {
    expect(todayKey()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(dailyLabel('2026-10-08').length).toBeGreaterThan(0);
  });
});
