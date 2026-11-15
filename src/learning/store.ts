import { BASIC_OF, ALT_SET, COLOUR_ID_OF, degreeIn, isBasicQuality } from '../music/degrees';
import { chordConceptId, qualityIdFromConcept, requireChordQuality } from '../music/chords';
import { colourConceptId } from '../music/catalog';
import { mod } from '../lib/util';
import type { SkillRecord } from './model';
import {
  MAX_ATTEMPTS, MAX_DAILY_RESULTS, MAX_SESSIONS, PROFILE_VERSION, emptyProfile, type Profile,
} from './model';
import { normaliseSettings, type PracticeSettings } from '../session/settings';

const STORAGE_KEY = 'ears.profile';

/**
 * Practice history lives in the browser.
 *
 * Every read and write is guarded: Safari throws on localStorage in private
 * mode, and the app has to keep working without an account, a server or even
 * storage. A failed save costs history, not the session in progress.
 */
export function loadProfile(): Profile {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyProfile();
    const parsed = JSON.parse(raw) as Partial<Profile>;
    return migrate(parsed);
  } catch {
    return emptyProfile();
  }
}

export function saveProfile(profile: Profile): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trim(profile)));
    return true;
  } catch {
    return false;
  }
}

export function clearProfile(): Profile {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing stored */
  }
  return emptyProfile();
}

/** Keeps the stored blob bounded; skill records carry the long-term summary. */
function trim(profile: Profile): Profile {
  // Day keys sort chronologically as strings, so the newest are simply the last.
  const days = Object.keys(profile.dailyResults).sort().slice(-MAX_DAILY_RESULTS);
  return {
    ...profile,
    attempts: profile.attempts.slice(-MAX_ATTEMPTS),
    sessions: profile.sessions.slice(-MAX_SESSIONS),
    dailyResults: Object.fromEntries(days.map((day) => [day, profile.dailyResults[day]])),
  };
}

function migrate(raw: Partial<Profile>): Profile {
  const base = emptyProfile();
  const profile: Profile = {
    ...base,
    ...raw,
    version: PROFILE_VERSION,
    createdAt: raw.createdAt ?? base.createdAt,
    skills: raw.skills ?? {},
    sessions: Array.isArray(raw.sessions) ? raw.sessions : [],
    attempts: Array.isArray(raw.attempts) ? raw.attempts : [],
    settings: raw.settings ?? {},
    streak: raw.streak ?? base.streak,
    // Added after version 2; absent simply means no Daily has been played.
    dailyResults: raw.dailyResults ?? {},
  };
  // Version 1 moved on by itself a second after a correct answer, which was
  // not long enough to take the answer in. Settings are stored in full once
  // anything is changed, so flipping the default alone would not reach an
  // existing profile — the stale value has to be cleared for the new default
  // to apply. Anyone who wants it back can switch it on again.
  if ((raw.version ?? 1) < 2) {
    delete (profile.settings as Partial<PracticeSettings>).autoAdvance;
  }

  // Version 3 stopped offering extended chords as answers. A ∆9 is a ∆7
  // played with its 9th, so the work someone did on ∆9 was work on both —
  // and it moves onto both rather than being thrown away.
  if ((raw.version ?? 1) < 3) {
    retireExtendedChords(profile);
  }

  // Drop malformed skill records rather than letting them poison selection.
  for (const [id, skill] of Object.entries(profile.skills)) {
    if (!skill || typeof skill.strength !== 'number' || Number.isNaN(skill.strength)) {
      delete profile.skills[id];
    }
  }
  return profile;
}

/**
 * Moves a retired quality's settings and history onto what it has become.
 *
 * Someone who ticked ∆9 in the settings wanted major sevenths, so ∆7 is
 * ticked. Someone with 40 attempts on ∆9 has practised major sevenths and
 * has practised hearing a 9th on top, so both records get them.
 *
 * The id is only dropped once it has been merged, so a profile saved
 * mid-migration is never left with the history in neither place.
 */
function retireExtendedChords(profile: Profile): void {
  const settings = profile.settings as Partial<PracticeSettings>;
  if (Array.isArray(settings.chordQualities)) {
    const basic = settings.chordQualities
      .map((id) => BASIC_OF[id] ?? id)
      .filter((id) => isBasicQuality(id));
    settings.chordQualities = [...new Set(basic)];
  }

  for (const [id, skill] of Object.entries(profile.skills)) {
    const quality = qualityIdFromConcept(id);
    if (quality === null || isBasicQuality(quality)) continue;
    const basic = BASIC_OF[quality];
    if (!basic) continue;
    delete profile.skills[id];
    if (!skill) continue;
    merge(profile.skills, chordConceptId(basic), skill);
    // And onto the colour it was named for, where it names one: a ∆9's
    // extra note is a 9th, and that is a thing this app now asks about.
    for (const colour of coloursRetiredWith(quality)) {
      merge(profile.skills, colourConceptId(colour), skill);
    }
  }
}

/** Which colour ids a retired quality was carrying in its name. */
function coloursRetiredWith(quality: string): string[] {
  const basic = requireChordQuality(BASIC_OF[quality]);
  const held = new Set(basic.intervals.map((i) => mod(i, 12)));
  const out = new Set<string>();
  for (const interval of requireChordQuality(quality).intervals) {
    if (held.has(mod(interval, 12))) continue;
    const id = COLOUR_ID_OF[degreeIn(requireChordQuality(quality), interval)];
    if (id) out.add(id);
  }
  // Three alterations at once is the altered sound, which is asked about as
  // one thing rather than as three.
  const altered = ALT_SET.map((n) => COLOUR_ID_OF[n]);
  if (altered.every((id) => out.has(id))) {
    for (const id of altered) out.delete(id);
    out.add('alt');
  }
  return [...out];
}

/**
 * Folds one record into another, keeping the practice rather than the id.
 *
 * Attempts and corrects add up because they happened. Strength is their
 * weighted mean, so merging a solid record into a shaky one does not hand
 * the learner a level they have not earned. Everything about scheduling
 * comes from whichever record was seen more recently, which is the one
 * that knows when this is next due.
 */
function merge(skills: Record<string, SkillRecord>, id: string, from: SkillRecord): void {
  const into = skills[id];
  if (!into) {
    skills[id] = { ...from, conceptId: id };
    return;
  }
  const attempts = into.attempts + from.attempts;
  const weight = attempts > 0 ? from.attempts / attempts : 0.5;
  const newer = from.lastSeen > into.lastSeen ? from : into;
  skills[id] = {
    ...newer,
    conceptId: id,
    attempts,
    correct: into.correct + from.correct,
    hintCount: into.hintCount + from.hintCount,
    strength: into.strength * (1 - weight) + from.strength * weight,
    recent: [...into.recent, ...from.recent].slice(-8),
  };
}

export function exportProfile(profile: Profile): string {
  return JSON.stringify({ ...trim(profile), exportedAt: Date.now() }, null, 2);
}

export function importProfile(json: string): Profile | null {
  try {
    const parsed = JSON.parse(json) as Partial<Profile>;
    if (!parsed || typeof parsed !== 'object') return null;
    const profile = migrate(parsed);
    profile.settings = normaliseSettings(profile.settings);
    return profile;
  } catch {
    return null;
  }
}

/** True when the browser will actually keep what we write. */
export function storageAvailable(): boolean {
  try {
    const probe = '__ears_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}
