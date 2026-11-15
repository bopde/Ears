// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AppContext, type AppValue } from './state';
import { SessionScreen } from './screens/Session';
import { Reference } from './screens/Reference';
import { FakePerformer } from '../test-support';
import { AudioEngine } from '../audio/engine';
import { emptyProfile } from '../learning/model';
import { normaliseSettings } from '../session/settings';
import { VOICING_MODES } from '../exercises/voicing-plan';
import { REFERENCE_VOICINGS } from '../audio/reference';
import { INVERSIONS } from '../music/inversions';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mounted: Array<{ root: Root; host: HTMLElement }> = [];

/** A screen over a stand-in performer: the real one wants an AudioContext. */
function screen(what: 'session' | 'reference'): HTMLElement {
  const profile = emptyProfile();
  const settings = normaliseSettings({
    ...profile.settings,
    exerciseTypes: ['chord-quality', 'progression'],
    answerDelay: 0,
    autoAdvance: false,
    // The curve, so the levels that voice something reach for the plain
    // rendering and the button under test appears at all.
    voicingMode: 'curve',
    difficulty: 4,
  });
  const value: AppValue = {
    profile,
    setProfile: () => {},
    resetProfile: () => {},
    settings,
    updateSettings: () => {},
    engine: new AudioEngine(),
    performer: new FakePerformer().asPerformer(),
    audioReady: true,
    unlockAudio: async () => {},
    storageOk: false,
  };
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      <AppContext.Provider value={value}>
        {what === 'session'
          ? <SessionScreen daily={null} onFinish={() => {}} onExit={() => {}} />
          : <Reference onBack={() => {}} />}
      </AppContext.Provider>,
    );
  });
  mounted.push({ root, host });
  return host;
}

afterEach(() => {
  for (const m of mounted.splice(0)) {
    act(() => m.root.unmount());
    m.host.remove();
  }
});

const click = (el: Element) => act(() => {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
});

const buttonText = (host: HTMLElement) =>
  [...host.querySelectorAll('button')].map((b) => b.textContent ?? '');

/** Picks the first option of every field, which brings the reveal up. */
function answer(host: HTMLElement): void {
  for (const group of host.querySelectorAll('.optgrid')) {
    const first = group.querySelector('button');
    if (first) click(first);
  }
}

describe('the plain version is called a basic chord, not a root position', () => {
  it('offers to play the basic chord after an answer', () => {
    const host = screen('session');
    let found = false;
    // Not every question voices something, so walk on until one does.
    for (let i = 0; i < 20 && !found; i++) {
      answer(host);
      found = buttonText(host).some((t) => /Hear the basic chord/.test(t));
      if (found) break;
      const next = [...host.querySelectorAll('button')]
        .find((b) => /Next/.test(b.textContent ?? ''));
      if (!next) break;
      click(next);
    }
    expect(found, 'a question offered the plain rendering').toBe(true);
    for (const text of buttonText(host)) {
      expect(text.toLowerCase(), 'no button says root position').not.toContain('root position');
    }
  });

  it('offers to compare the cheat sheet against the basic chords', () => {
    const host = screen('reference');
    const texts = buttonText(host);
    // The voicing cards live behind the Voicings tab.
    const tab = [...host.querySelectorAll('button')]
      .find((b) => /^Voicings$/i.test((b.textContent ?? '').trim()));
    if (tab) click(tab);
    const all = [...texts, ...buttonText(host)];
    expect(all.some((t) => /Compare with the basic chords/.test(t)), all.join(' / ')).toBe(true);
    for (const text of all) {
      expect(text.toLowerCase(), 'no button says root position').not.toContain('root position');
    }
  });

  it('names the setting after the chords, not the bass', () => {
    const plain = VOICING_MODES.find((m) => m.value === 'plain')!;
    expect(plain.label).toBe('Basic chords only');
    expect(plain.blurb).toBe('Close voicings, root on the bottom, no tensions, over a root bass.');
    // Every mode label and blurb, and every lesson on the cheat sheet.
    const copy = [
      ...VOICING_MODES.flatMap((m) => [m.label, m.blurb]),
      ...REFERENCE_VOICINGS.flatMap((v) => [v.label, v.short, v.blurb ?? '']),
    ];
    for (const text of copy) {
      expect(text.toLowerCase(), `"${text}"`).not.toContain('root position');
    }
  });

  it('keeps the ids, so a saved setting still means what it meant', () => {
    expect(VOICING_MODES.map((m) => m.value)).toEqual(['curve', 'plain', 'realistic']);
    expect(REFERENCE_VOICINGS.map((v) => v.id)).toEqual(
      ['root', 'voice-led', 'shell', 'rootless', 'drop2', 'quartal', 'upperStructure'],
    );
  });

  it('still calls a bass on the root a root position, where that is the point', () => {
    // The rename is about the hands. An inversion is a fact about the bass
    // and keeps its name — otherwise this would be a find-and-replace rather
    // than a distinction.
    const root = INVERSIONS.find((i) => i.id === 'root')!;
    expect(root.name).toBe('Root position');
    expect(root.index).toBe(0);
  });
});
