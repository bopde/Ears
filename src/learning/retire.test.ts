import { describe, expect, it } from 'vitest';
import { importProfile } from './store';
import { newSkill, PROFILE_VERSION, type Profile, type SkillRecord } from './model';
import { CHORD_QUALITIES, chordConceptId } from '../music/chords';
import { colourConceptId } from '../music/catalog';
import { BASIC_OF, COLOUR_IDS, isBasicQuality } from '../music/degrees';
import { normaliseSettings } from '../session/settings';

/** A profile from before the answer set was cut back to basic chords. */
function saved(skills: Record<string, Partial<SkillRecord>>, qualities: string[]): string {
  const full: Record<string, SkillRecord> = {};
  for (const [id, over] of Object.entries(skills)) {
    full[id] = { ...newSkill(id), attempts: 10, correct: 7, strength: 0.6, ...over, conceptId: id };
  }
  return JSON.stringify({
    version: 2,
    createdAt: 1,
    skills: full,
    sessions: [],
    attempts: [],
    streak: { count: 3, lastDay: '2026-11-09' },
    dailyResults: {},
    settings: { chordQualities: qualities, durationMinutes: 20 },
  } satisfies Partial<Profile> as Partial<Profile>);
}

describe('a retired quality’s history goes where the quality went', () => {
  it('loads an old profile without complaint', () => {
    const profile = importProfile(saved(
      { 'chord:maj9': {}, 'chord:7alt': {}, 'chord:m7': {} },
      ['maj9', 'm11', '7alt', 'm7', 'dim7'],
    ));
    expect(profile).not.toBeNull();
    expect(profile!.version).toBe(PROFILE_VERSION);
    expect(profile!.streak.count, 'the rest of it survives').toBe(3);
    expect(profile!.settings.durationMinutes).toBe(20);
  });

  it('ticks the chord a retired quality was, in the settings', () => {
    const profile = importProfile(saved({}, ['maj9', 'm11', '7alt', 'dim7']))!;
    // ∆9 is a ∆7, m11 is a m7, 7alt is a 7. Someone who ticked them wanted
    // those chords, and °7 was already one.
    const ticked = profile.settings.chordQualities ?? [];
    expect([...ticked].sort()).toEqual(['7', 'dim7', 'm7', 'maj7']);
    for (const id of ticked) expect(isBasicQuality(id), id).toBe(true);
  });

  it('moves the practice onto the chord and onto the colour', () => {
    const profile = importProfile(saved(
      { 'chord:maj9': { attempts: 40, correct: 30, strength: 0.75 } },
      ['maj9'],
    ))!;
    // ∆9 is gone as a concept.
    expect(profile.skills['chord:maj9']).toBeUndefined();
    // The major seventh has the attempts, because they happened.
    const chord = profile.skills[chordConceptId('maj7')];
    expect(chord, 'the chord got it').toBeTruthy();
    expect(chord.attempts).toBe(40);
    expect(chord.correct).toBe(30);
    expect(chord.strength).toBeCloseTo(0.75, 5);
    // And so does hearing a 9th on top, which is the other half of what
    // that practice was.
    const colour = profile.skills[colourConceptId('9')];
    expect(colour, 'the colour got it').toBeTruthy();
    expect(colour.attempts).toBe(40);
  });

  it('adds to a record already there rather than replacing it', () => {
    const profile = importProfile(saved({
      'chord:maj7': { attempts: 10, correct: 5, strength: 0.2, lastSeen: 100 },
      'chord:maj9': { attempts: 30, correct: 27, strength: 0.9, lastSeen: 200 },
    }, ['maj7', 'maj9']))!;
    const merged = profile.skills[chordConceptId('maj7')];
    expect(merged.attempts, 'both sets of attempts').toBe(40);
    expect(merged.correct).toBe(32);
    // Weighted by attempts, so three times as much practice counts three
    // times: 0.2 × ¼ + 0.9 × ¾.
    expect(merged.strength).toBeCloseTo(0.725, 5);
  });

  it('calls three alterations at once the altered sound, not three colours', () => {
    const profile = importProfile(saved({ 'chord:7alt': { attempts: 12 } }, ['7alt']))!;
    expect(profile.skills[colourConceptId('alt')], 'one colour').toBeTruthy();
    for (const single of ['b9', '#9', 'b13']) {
      expect(profile.skills[colourConceptId(single)], single).toBeUndefined();
    }
    // A single alteration still counts as itself.
    const one = importProfile(saved({ 'chord:7b9': { attempts: 12 } }, ['7b9']))!;
    expect(one.skills[colourConceptId('b9')]).toBeTruthy();
    expect(one.skills[colourConceptId('alt')]).toBeUndefined();
  });

  it('leaves a profile that has already moved alone', () => {
    const current = JSON.parse(saved({ 'chord:maj7': { attempts: 5 } }, ['maj7'])) as Record<string, unknown>;
    current.version = PROFILE_VERSION;
    const profile = importProfile(JSON.stringify(current))!;
    expect(profile.skills[chordConceptId('maj7')].attempts).toBe(5);
    expect(profile.skills[colourConceptId('9')]).toBeUndefined();
  });

  it('never leaves a quality with nowhere to go', () => {
    // Every retired quality maps onto a basic chord that exists, so the
    // migration cannot drop a learner's history on the floor.
    for (const quality of CHORD_QUALITIES) {
      if (isBasicQuality(quality.id)) continue;
      const profile = importProfile(saved(
        { [`chord:${quality.id}`]: { attempts: 9 } }, [quality.id],
      ))!;
      expect(profile.skills[`chord:${quality.id}`], quality.id).toBeUndefined();
      expect(profile.skills[chordConceptId(BASIC_OF[quality.id])], quality.id).toBeTruthy();
    }
  });
});

describe('the settings offer basic chords and colours', () => {
  it('defaults to every basic chord and every colour', () => {
    const settings = normaliseSettings({});
    expect(settings.chordQualities.every(isBasicQuality)).toBe(true);
    expect(settings.chordQualities).toHaveLength(18);
    expect([...settings.colours].sort()).toEqual([...COLOUR_IDS].sort());
  });

  it('turns a stored retired quality into the chord it is', () => {
    const settings = normaliseSettings({ chordQualities: ['13', 'maj9', 'maj7', 'nonsense'] });
    expect([...settings.chordQualities].sort()).toEqual(['7', 'maj7']);
  });

  it('keeps a colour list to the colours that exist', () => {
    expect(normaliseSettings({ colours: ['9', 'alt', 'made-up'] }).colours)
      .toEqual(['9', 'alt']);
  });
});
