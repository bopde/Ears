import {
  MAX_ATTEMPTS, MAX_SESSIONS, PROFILE_VERSION, emptyProfile, type Profile,
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
  return {
    ...profile,
    attempts: profile.attempts.slice(-MAX_ATTEMPTS),
    sessions: profile.sessions.slice(-MAX_SESSIONS),
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
  };
  // Version 1 moved on by itself a second after a correct answer, which was
  // not long enough to take the answer in. Settings are stored in full once
  // anything is changed, so flipping the default alone would not reach an
  // existing profile — the stale value has to be cleared for the new default
  // to apply. Anyone who wants it back can switch it on again.
  if ((raw.version ?? 1) < 2) {
    delete (profile.settings as Partial<PracticeSettings>).autoAdvance;
  }

  // Drop malformed skill records rather than letting them poison selection.
  for (const [id, skill] of Object.entries(profile.skills)) {
    if (!skill || typeof skill.strength !== 'number' || Number.isNaN(skill.strength)) {
      delete profile.skills[id];
    }
  }
  return profile;
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
