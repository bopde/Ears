// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { SessionEngine } from './engine';
import { normaliseSettings } from './settings';
import { emptyProfile } from '../learning/model';
import { getExerciseType } from '../exercises/registry';
import { FakePerformer } from '../test-support';
import { makeRng } from '../lib/rng';

/**
 * A session that has ended has no business holding the device's audio.
 *
 * The idle timer would get there in a minute; the screen knows as soon as
 * it is closed, and a minute is long enough to notice the app sitting on
 * the lock screen after you have put the phone down.
 */
function session(performer: FakePerformer) {
  const profile = emptyProfile();
  const settings = normaliseSettings({ exerciseTypes: ['interval'], answerDelay: 0 });
  const question = getExerciseType('interval')!.generate({
    rng: makeRng(7), difficulty: 2, settings, targetConcepts: [],
  })!;
  return new SessionEngine({
    settings,
    profile,
    performer: performer.asPerformer(),
    onProfileChange: () => {},
    script: [question],
  });
}

describe('a session gives the audio back when it is over', () => {
  it('releases on dispose, rather than only stopping the notes', () => {
    const performer = new FakePerformer();
    const engine = session(performer);
    engine.start();
    expect(performer.released, 'still playing').toBe(0);

    engine.dispose();
    expect(performer.released, 'the audio session was handed back').toBe(1);
  });

  it('is the last thing it does, so nothing schedules after it', () => {
    const performer = new FakePerformer();
    const engine = session(performer);
    engine.start();
    engine.dispose();
    const after = performer.notes.length;

    // Everything the screen could still call is refused once disposed.
    engine.replay();
    engine.next();
    expect(performer.notes.length, 'nothing sounded after the release').toBe(after);
  });
});
