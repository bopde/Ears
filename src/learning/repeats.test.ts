// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { SessionEngine } from '../session/engine';
import { defaultSettings, normaliseSettings } from '../session/settings';
import { emptyProfile, type Profile } from './model';
import { EXERCISE_TYPES, getExerciseType } from '../exercises/registry';
import { FakePerformer } from '../test-support';
import { makeRng } from '../lib/rng';

/**
 * How predictable the answers are, measured by playing the app.
 *
 * Not by reading the selector: what a learner can rule out depends on the
 * selector, the exercise's own level curve and the question generator all
 * at once, and only a session actually played puts the three together.
 *
 * Every answer is marked correct, which is the worst case for predictability
 * — it is the fastest way to push a concept down the wish list, and a
 * learner who is getting them right is the one with attention to spare for
 * noticing that the answer is never the same twice.
 */

const SESSIONS = 120;
const PER_SESSION = 20;

/** One session's answers, in the order they were asked. */
function playSession(exercise: string, seed: number): string[] {
  const settings = normaliseSettings({
    ...defaultSettings(),
    exerciseTypes: [exercise],
    questionLimit: PER_SESSION,
    durationMinutes: 60,
    answerDelay: 0,
  });
  const pool = new Set(getExerciseType(exercise)!.pool(settings));
  const profile: Profile = emptyProfile();
  const engine = new SessionEngine({
    settings,
    profile,
    performer: new FakePerformer().asPerformer(),
    onProfileChange: (next) => Object.assign(profile, next),
    seed,
  });

  const answers: string[] = [];
  engine.start();
  for (let i = 0; i < PER_SESSION; i += 1) {
    const question = engine.getState().question;
    if (!question) break;
    // What the question was about, as the pool names it: the thing a
    // learner would notice coming round again.
    answers.push(question.conceptIds.find((id) => pool.has(id)) ?? question.conceptIds[0]);
    for (const field of question.fields) engine.select(field.key, question.correct[field.key]);
    engine.next();
  }
  engine.dispose();
  return answers;
}

/** The two things a learner could use: a repeat at all, and a repeat in a row. */
function predictability(sessions: readonly string[][]) {
  let asked = 0;
  let seenBefore = 0;
  let followedItself = 0;
  for (const answers of sessions) {
    const seen = new Set<string>();
    answers.forEach((answer, i) => {
      asked += 1;
      if (seen.has(answer)) seenBefore += 1;
      if (i > 0 && answers[i - 1] === answer) followedItself += 1;
      seen.add(answer);
    });
  }
  return { repeat: seenBefore / asked, inARow: followedItself / asked };
}

/**
 * The same sessions with the order shaken out of them.
 *
 * The answer at each position is redrawn from the answers the exercise
 * actually gave at that position, across every session. So whatever the
 * level curve allows at question 3 is what question 3 is redrawn from,
 * and the only thing the shaking destroys is the one thing under test:
 * whether what came earlier in this session changes what comes next.
 *
 * Averaged over twenty draws, so the number this is compared against is
 * the null itself rather than one sample of it.
 */
function byChance(sessions: readonly string[][], seed: number) {
  const longest = Math.max(...sessions.map((s) => s.length));
  const atPosition = Array.from({ length: longest }, (_, i) =>
    sessions.map((s) => s[i]).filter((a): a is string => a !== undefined));
  const rng = makeRng(seed);
  let repeat = 0;
  let inARow = 0;
  const DRAWS = 20;
  for (let d = 0; d < DRAWS; d += 1) {
    const drawn = sessions.map((session) => session.map((_, i) => rng.pick(atPosition[i])));
    const measured = predictability(drawn);
    repeat += measured.repeat / DRAWS;
    inARow += measured.inARow / DRAWS;
  }
  return { repeat, inARow, pool: new Set(sessions.flat()).size };
}

function run(exercise: string) {
  const sessions: string[][] = [];
  for (let s = 0; s < SESSIONS; s += 1) sessions.push(playSession(exercise, s * 9173 + 11));
  return { sessions, played: predictability(sessions), chance: byChance(sessions, 4242) };
}

/**
 * Within a quarter of the chance rate, or one point either way.
 *
 * The point of slack is for the rates that are small to begin with: a
 * quarter of 3% is tighter than the sampling error on 2,400 questions,
 * and the thing being caught here was 0% against 24%.
 */
const near = (got: number, want: number) => Math.abs(got - want) <= Math.max(want * 0.25, 0.01);

describe('an answer already heard is no less likely than one that has not', () => {
  for (const type of EXERCISE_TYPES) {
    it(`repeats about as often as chance in ${type.name}`, () => {
      const { played, chance } = run(type.id);
      const where = `${type.id}: ${(played.repeat * 100).toFixed(1)}% repeats against `
        + `${(chance.repeat * 100).toFixed(1)}% by chance, `
        + `${(played.inARow * 100).toFixed(1)}% in a row against `
        + `${(chance.inARow * 100).toFixed(1)}%, from ${chance.pool} answers`;
      expect(near(played.repeat, chance.repeat), where).toBe(true);
      expect(near(played.inARow, chance.inARow), where).toBe(true);
    }, 120_000);
  }

  it('lets a progression come round twice in one session', () => {
    const { sessions } = run('progression');
    const repeated = sessions.filter((s) => new Set(s).size < s.length).length;
    expect(repeated, `${repeated} of ${sessions.length} sessions heard one twice`)
      .toBeGreaterThan(SESSIONS * 0.3);
  }, 120_000);
});
