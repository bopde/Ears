import { describe, expect, it } from 'vitest';
import { intervalNotes, playChordQuality, playInterval, playProgression, playScale } from './demo';
import { FakePerformer } from '../test-support';
import { PROGRESSIONS } from '../music/progressions';
import { CHORD_QUALITIES } from '../music/chords';
import { INTERVALS } from '../music/intervals';
import { SCALES } from '../music/scales';
import { PITCH_CLASSES } from '../music/pitch';

/** Everything the cheat sheet can play, in every key it can play it in. */
function check(label: string, run: (perf: FakePerformer) => number) {
  const perf = new FakePerformer();
  // FakePerformer throws on a note outside the playable range or a bad time.
  const seconds = run(perf);
  expect(perf.notes.length, `${label} sounds something`).toBeGreaterThan(0);
  expect(seconds, `${label} reports a length`).toBeGreaterThan(0);
  expect(seconds, `${label} is not interminable`).toBeLessThan(45);
}

describe('cheat sheet playback', () => {
  it('plays every progression in every key', () => {
    for (const def of PROGRESSIONS) {
      for (const key of PITCH_CLASSES) {
        check(`${def.id} in ${key}`, (perf) => playProgression(perf.asPerformer(), def, key));
      }
    }
  });

  it('plays every chord quality in every key', () => {
    for (const quality of CHORD_QUALITIES) {
      for (const key of PITCH_CLASSES) {
        check(`${quality.id} on ${key}`, (perf) =>
          playChordQuality(perf.asPerformer(), quality, key),
        );
      }
    }
  });

  it('plays every interval from every note', () => {
    for (const interval of INTERVALS) {
      for (const key of PITCH_CLASSES) {
        check(`${interval.id} from ${key}`, (perf) =>
          playInterval(perf.asPerformer(), interval, key),
        );
      }
    }
  });

  it('plays every scale in every key', () => {
    for (const scale of SCALES) {
      for (const key of PITCH_CLASSES) {
        check(`${scale.id} in ${key}`, (perf) => playScale(perf.asPerformer(), scale, key));
      }
    }
  });

  it('keeps both notes of an interval singable', () => {
    for (const interval of INTERVALS) {
      for (const key of PITCH_CLASSES) {
        const [lo, hi] = intervalNotes(interval, key);
        expect(hi - lo, `${interval.id} spans correctly`).toBe(interval.semitones);
        expect(lo, `${interval.id} low`).toBeGreaterThanOrEqual(48);
        expect(hi, `${interval.id} high`).toBeLessThanOrEqual(88);
      }
    }
  });

  it('is the same every time, so a reference can be trusted', () => {
    const once = new FakePerformer();
    const twice = new FakePerformer();
    const def = PROGRESSIONS.find((p) => p.id === 'ii-V-I')!;
    playProgression(once.asPerformer(), def, 5);
    playProgression(twice.asPerformer(), def, 5);
    expect(once.notes.map((n) => n.midi)).toEqual(twice.notes.map((n) => n.midi));
  });
});
