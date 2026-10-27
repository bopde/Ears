import { describe, expect, it } from 'vitest';
import {
  EXERCISE_TYPE_IDS, defaultSettings, normaliseSettings, type PracticeSettings,
} from './settings';
import { INSTRUMENTS } from '../audio/instruments';
import { eligibleConcepts } from '../learning/selector';

/**
 * Settings arrive from localStorage, which is editable by hand, shared with
 * every build ever served from this origin, and carried across upgrades. What
 * comes back is therefore untrusted: these tests pin the values the rest of
 * the app is allowed to see.
 */
describe('stored settings are validated, not merely filled in', () => {
  const base = defaultSettings();
  const bad = (patch: Record<string, unknown>) =>
    normaliseSettings(patch as Partial<PracticeSettings>);

  it('falls back to the defaults when every stored exercise type is unknown', () => {
    // The order matters: filtering has to run before the fallback, or a stored
    // list of ids this build dropped leaves a session with nothing to ask.
    const settings = bad({ exerciseTypes: ['nope', 'also-nope'] });
    expect(settings.exerciseTypes).toEqual(base.exerciseTypes);
    expect(eligibleConcepts(settings).length).toBeGreaterThan(0);
  });

  it('keeps the exercise types it recognises and drops the rest', () => {
    expect(bad({ exerciseTypes: ['interval', 'nope', 'mode'] }).exerciseTypes)
      .toEqual(['interval', 'mode']);
    for (const id of EXERCISE_TYPE_IDS) {
      expect(bad({ exerciseTypes: [id] }).exerciseTypes).toEqual([id]);
    }
  });

  it('refuses a difficulty outside the five levels', () => {
    expect(bad({ difficulty: 99 }).difficulty).toBe(5);
    expect(bad({ difficulty: 0 }).difficulty).toBe(1);
    expect(bad({ difficulty: 'hard' }).difficulty).toBe(base.difficulty);
    expect(bad({ difficulty: NaN }).difficulty).toBe(base.difficulty);
    expect(bad({ difficulty: 'adaptive' }).difficulty).toBe('adaptive');
    expect(bad({ difficulty: 3 }).difficulty).toBe(3);
  });

  it('refuses a tempo that would stop the clock', () => {
    // beatSeconds is 60/tempo, so a stored 0 makes every beat infinitely long
    // and the question never sounds.
    expect(bad({ tempo: 0 }).tempo).toBe(60);
    expect(bad({ tempo: -40 }).tempo).toBe(60);
    expect(bad({ tempo: 10_000 }).tempo).toBe(220);
    expect(bad({ tempo: 'fast' }).tempo).toBe(base.tempo);
    expect(Number.isFinite(60 / bad({ tempo: 0 }).tempo)).toBe(true);
  });

  it('pulls the audio levels back inside 0 to 1', () => {
    for (const key of ['volume', 'reverb', 'swing'] as const) {
      expect(bad({ [key]: 40 })[key], key).toBe(1);
      expect(bad({ [key]: -3 })[key], key).toBe(0);
      expect(bad({ [key]: 'loud' })[key], key).toBe(base[key]);
      expect(bad({ [key]: 0.4 })[key], key).toBe(0.4);
    }
  });

  it('refuses a theme, accidental or instrument it cannot render', () => {
    expect(bad({ theme: 'neon' }).theme).toBe(base.theme);
    expect(bad({ theme: 'dark' }).theme).toBe('dark');
    expect(bad({ accidental: 'x' }).accidental).toBe(base.accidental);
    expect(bad({ accidental: 'flat' }).accidental).toBe('flat');
    expect(bad({ instrument: 'theremin' }).instrument).toBe(base.instrument);
    for (const instrument of INSTRUMENTS) {
      expect(bad({ instrument: instrument.id }).instrument).toBe(instrument.id);
    }
  });

  it('keeps only real pitch classes among the chosen keys', () => {
    expect(bad({ keys: [] }).keys).toBe('all');
    expect(bad({ keys: [0, 99, 5, -1, 3.5] }).keys).toEqual([0, 5]);
    expect(bad({ keys: [1, 2] }).keys).toEqual([1, 2]);
    expect(bad({ keys: 'everything' }).keys).toBe('all');
  });

  it('keeps the session length and the question limit workable', () => {
    expect(bad({ durationMinutes: 0 }).durationMinutes).toBe(1);
    expect(bad({ durationMinutes: -5 }).durationMinutes).toBe(1);
    expect(bad({ durationMinutes: 10_000 }).durationMinutes).toBe(120);
    expect(bad({ questionLimit: 0 }).questionLimit).toBe(1);
    expect(bad({ questionLimit: 'lots' }).questionLimit).toBe(null);
    expect(bad({ questionLimit: null }).questionLimit).toBe(null);
    expect(bad({ questionLimit: 20 }).questionLimit).toBe(20);
  });

  it('refuses a flag that is not a yes or a no', () => {
    for (const key of ['hintsEnabled', 'adaptive', 'autoAdvance'] as const) {
      expect(bad({ [key]: 'yes' })[key], key).toBe(base[key]);
      expect(bad({ [key]: 1 })[key], key).toBe(base[key]);
      expect(bad({ [key]: !base[key] })[key], key).toBe(!base[key]);
    }
  });

  it('falls back on an empty or junk vocabulary rather than running out of material', () => {
    for (const key of ['chordQualities', 'intervals', 'modes', 'progressions'] as const) {
      expect(bad({ [key]: [] })[key], key).toEqual(base[key]);
      expect(bad({ [key]: 'maj7' })[key], key).toEqual(base[key]);
      expect(bad({ [key]: [null, 7] })[key], key).toEqual(base[key]);
    }
    expect(bad({ intervalDirections: ['sideways'] }).intervalDirections)
      .toEqual(base.intervalDirections);
    expect(bad({ intervalDirections: ['harmonic', 'sideways'] }).intervalDirections)
      .toEqual(['harmonic']);
  });

  it('leaves a well-formed settings object exactly as it found it', () => {
    expect(normaliseSettings(base)).toEqual(base);
    expect(normaliseSettings(null)).toEqual(base);
    expect(normaliseSettings(undefined)).toEqual(base);
  });
});
