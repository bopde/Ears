import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from 'react';
import { AudioEngine } from '../audio/engine';
import { Performer } from '../audio/performer';
import { clearProfile, loadProfile, saveProfile, storageAvailable } from '../learning/store';
import type { Profile } from '../learning/model';
import { normaliseSettings, type PracticeSettings } from '../session/settings';

// One context and one performer for the life of the page. Safari allows a
// limited number of AudioContexts, so creating them per screen is not an option.
const engine = new AudioEngine();
const performer = new Performer(engine);

export interface AppValue {
  profile: Profile;
  setProfile: (profile: Profile) => void;
  resetProfile: () => void;
  settings: PracticeSettings;
  updateSettings: (patch: Partial<PracticeSettings>) => void;
  engine: AudioEngine;
  performer: Performer;
  audioReady: boolean;
  unlockAudio: () => Promise<void>;
  storageOk: boolean;
}

const AppContext = createContext<AppValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [profile, setProfileState] = useState<Profile>(() => loadProfile());
  const [audioReady, setAudioReady] = useState(false);
  const storageOk = useMemo(storageAvailable, []);
  const saveTimer = useRef<number | null>(null);

  const settings = useMemo(() => normaliseSettings(profile.settings), [profile.settings]);

  // Writes are debounced: a session records an attempt every few seconds and
  // serialising the whole profile on each one would show up as jitter.
  const setProfile = useCallback((next: Profile) => {
    setProfileState(next);
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => saveProfile(next), 350);
  }, []);

  const updateSettings = useCallback(
    (patch: Partial<PracticeSettings>) => {
      setProfileState((prev) => {
        const next: Profile = {
          ...prev,
          settings: normaliseSettings({ ...prev.settings, ...patch }),
        };
        if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
        saveTimer.current = window.setTimeout(() => saveProfile(next), 350);
        return next;
      });
    },
    [],
  );

  const resetProfile = useCallback(() => {
    const fresh = clearProfile();
    setProfileState(fresh);
    saveProfile(fresh);
  }, []);

  const unlockAudio = useCallback(async () => {
    await engine.unlock();
    setAudioReady(engine.ready);
  }, []);

  // Flush any pending write when the tab goes away — iOS kills backgrounded
  // pages without warning, and an unsaved session is lost practice.
  useEffect(() => {
    const flush = () => {
      if (saveTimer.current !== null) {
        window.clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      saveProfile(profile);
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
    });
    return () => window.removeEventListener('pagehide', flush);
  }, [profile]);

  useEffect(() => {
    engine.setVolume(settings.volume);
    engine.setReverb(settings.reverb);
    performer.configure({
      instrument: settings.instrument,
      tempo: settings.tempo,
      swing: settings.swing,
    });
  }, [settings.volume, settings.reverb, settings.instrument, settings.tempo, settings.swing]);

  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'auto') root.removeAttribute('data-theme');
    else root.dataset.theme = settings.theme;
  }, [settings.theme]);

  const value = useMemo<AppValue>(
    () => ({
      profile,
      setProfile,
      resetProfile,
      settings,
      updateSettings,
      engine,
      performer,
      audioReady,
      unlockAudio,
      storageOk,
    }),
    [profile, setProfile, resetProfile, settings, updateSettings, audioReady, unlockAudio, storageOk],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppValue {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used inside AppProvider');
  return value;
}

export type Screen = 'home' | 'setup' | 'session' | 'results' | 'progress' | 'settings';

/**
 * Hash routing, so the iPhone back gesture and the browser back button work
 * without pulling in a router.
 */
export function useRoute(): [Screen, (screen: Screen, replace?: boolean) => void] {
  const read = (): Screen => {
    const hash = window.location.hash.replace('#/', '').replace('#', '');
    const screens: Screen[] = ['home', 'setup', 'session', 'results', 'progress', 'settings'];
    return (screens as string[]).includes(hash) ? (hash as Screen) : 'home';
  };
  const [screen, setScreen] = useState<Screen>(read);

  useEffect(() => {
    const onHash = () => setScreen(read());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const navigate = useCallback((next: Screen, replace = false) => {
    const target = `#/${next}`;
    if (window.location.hash === target) {
      setScreen(next);
      return;
    }
    if (replace) window.history.replaceState(null, '', target);
    else window.location.hash = target;
    setScreen(next);
  }, []);

  return [screen, navigate];
}
