// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AppContext, type AppValue } from './state';
import { Home } from './screens/Home';
import { Progress } from './screens/Progress';
import { Reference } from './screens/Reference';
import { Settings } from './screens/Settings';
import { Setup } from './screens/Setup';
import { FakePerformer } from '../test-support';
import { AudioEngine } from '../audio/engine';
import { emptyProfile, MASTERY_LABEL } from '../learning/model';
import { REASON_LABEL } from '../learning/selector';
import { normaliseSettings } from '../session/settings';
import { EXERCISE_TYPES } from '../exercises/registry';
import { CHORD_QUALITIES } from '../music/chords';
import { COLOUR_IDS } from '../music/degrees';
import { VOICING_MODES } from '../exercises/voicing-plan';
import { makeRng } from '../lib/rng';
import { INVERSIONS } from '../music/inversions';
import { PROGRESSIONS } from '../music/progressions';
import { VOICING_STYLES } from '../music/voicing';
import { defaultSettings } from '../session/settings';
import { importProfile } from '../learning/store';
import type { AnswerOption } from '../exercises/types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The words the app retired, and what each was replaced with.
 *
 * One name per idea, everywhere a reader meets it: the same thing called
 * two things on two screens is two things to learn. Internal ids are
 * untouched, so a saved profile keeps loading.
 */
const RETIRED: Array<[term: string, instead: string]> = [
  ['Tonal centre', 'Key centre'],
  ['tonal centre', 'key centre'],
  ['Chord changes', 'Progressions'],
  ['What movement', 'Which progression is this?'],
  ['Shape', 'Voicing'],
  ['Difficulty', 'Level'],
  ['Needs work', 'Next to practise, or Building'],
  ['shaky', 'building'],
  ['maj (', 'the chart symbol'],
  ['min (', 'the chart symbol'],
  ['an ♯', 'a ♯'],
  ['an ♭', 'a ♭'],
];

function check(text: string, where: string) {
  for (const [term, instead] of RETIRED) {
    expect(text.includes(term), `${where} still says "${term}" — ${instead}\n  ${text}`)
      .toBe(false);
  }
}

const mounted: Array<{ root: Root; host: HTMLElement }> = [];

/** A whole screen's visible text, with the chord and colour settings wide open. */
function screenText(what: 'home' | 'setup' | 'progress' | 'reference' | 'settings'): string {
  const profile = emptyProfile();
  // Some history, so the screens that report on it have something to say:
  // the progress screen says "Nothing recorded yet" to an empty profile,
  // and a test against that is a test against an empty page.
  profile.attempts = Array.from({ length: 12 }, (_, i) => ({
    t: 1 + i,
    conceptIds: [i % 2 ? 'chord:maj7' : 'key:0'],
    type: i % 2 ? 'chord-quality' : 'key',
    difficulty: 2,
    keyPc: 0,
    correct: i % 3 !== 0,
    hintUsed: false,
    ms: 2000,
  }));
  profile.sessions = [{
    id: 's', startedAt: 0, endedAt: 1, seconds: 300, asked: 12, correct: 8, hints: 0,
    types: ['chord-quality'], adaptive: true, deltas: {},
  }];
  profile.skills = {
    'chord:maj7': {
      conceptId: 'chord:maj7', attempts: 9, correct: 3, strength: 0.3,
      lastSeen: 1, level: 2, streak: 0, history: [],
    } as never,
    'key:0': {
      conceptId: 'key:0', attempts: 9, correct: 8, strength: 0.9,
      lastSeen: 1, level: 3, streak: 3, history: [],
    } as never,
  };
  const value: AppValue = {
    profile,
    setProfile: () => {},
    resetProfile: () => {},
    settings: normaliseSettings({
      ...profile.settings,
      chordQualities: CHORD_QUALITIES.map((q) => q.id),
      colours: [...COLOUR_IDS],
    }),
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
  const screens = {
    home: <Home navigate={() => {}} onStart={() => {}} onStartDaily={() => {}} />,
    setup: <Setup onBack={() => {}} onStart={() => {}} />,
    progress: <Progress onBack={() => {}} onStart={() => {}} />,
    reference: <Reference onBack={() => {}} />,
    settings: <Settings onBack={() => {}} />,
  };
  act(() => {
    root.render(<AppContext.Provider value={value}>{screens[what]}</AppContext.Provider>);
  });
  mounted.push({ root, host });
  return host.textContent ?? '';
}

afterEach(() => {
  for (const { root, host } of mounted.splice(0)) {
    act(() => root.unmount());
    host.remove();
  }
});

describe('one name per idea', () => {
  it('uses none of the retired words on any screen', () => {
    for (const what of ['home', 'setup', 'progress', 'reference', 'settings'] as const) {
      check(screenText(what), `the ${what} screen`);
    }
  });

  it('uses the words that replaced them, so nothing passes by vanishing', () => {
    const progress = screenText('progress');
    expect(progress, 'the weak end of the progress screen').toContain('Next to practise');
    expect(progress, 'and the strong end, unchanged').toContain('Strong');
    const setup = screenText('setup');
    expect(setup).toContain('Level');
    expect(setup, 'the exercises, by their settled names').toContain('Key centre');
    expect(setup).toContain('Progressions');
    expect(setup).toContain('Voicing');
    expect(screenText('reference'), 'and the cheat sheet tab').toContain('Progressions');
  });

  it('uses none of them in a question, at any level', () => {
    const settings = normaliseSettings({
      chordQualities: CHORD_QUALITIES.map((q) => q.id),
      colours: [...COLOUR_IDS],
    });
    let asked = 0;
    for (const type of EXERCISE_TYPES) {
      check(`${type.name} · ${type.short} · ${type.description}`, `the ${type.id} exercise`);
      for (let d = 1; d <= 5; d += 1) {
        for (let seed = 0; seed < 30; seed += 1) {
          const q = type.generate({
            rng: makeRng(seed * 101 + d * 7), difficulty: d, settings, targetConcepts: [],
          });
          if (!q) continue;
          asked += 1;
          const where = `${type.id}@${d}#${seed}`;
          const parts = [
            q.prompt.title, q.prompt.sub ?? '',
            ...q.fields.flatMap((f) => [f.label, ...f.options.flatMap((o) => [o.label, o.sub ?? ''])]),
            q.reveal.heading, q.reveal.detail, q.reveal.notes ?? '', q.reveal.tag ?? '',
            q.hint?.label ?? '', q.hint?.description ?? '',
            ...(q.reveal.rows ?? []).flatMap((r) => [r.roman, r.symbol, r.note ?? '', r.tag ?? '']),
          ];
          for (const part of parts) check(part, where);
        }
      }
    }
    expect(asked, 'questions were generated to read').toBeGreaterThan(800);
  });

  it('uses none of them in the words the model puts on a concept', () => {
    for (const label of [...Object.values(MASTERY_LABEL), ...Object.values(REASON_LABEL)]) {
      check(label, 'a strength label');
    }
    for (const mode of VOICING_MODES) check(`${mode.label} ${mode.blurb}`, 'a voicing mode');
    expect(MASTERY_LABEL.building).toBe('Building');
    expect(REASON_LABEL.weak).toBe('Next to practise');
    expect(MASTERY_LABEL.solid, 'the strong end is unchanged').toBe('Solid');
  });
});

describe('the names themselves', () => {
  it('calls each exercise by a short noun', () => {
    const names = Object.fromEntries(EXERCISE_TYPES.map((t) => [t.id, t.name]));
    expect(names).toEqual({
      interval: 'Intervals',
      'chord-quality': 'Chord quality',
      'chord-full': 'Chord (root and quality)',
      colour: 'Colour',
      'chord-inversion': 'Inversions',
      voicing: 'Voicing',
      progression: 'Progressions',
      'progression-chord': 'Chords in context',
      'guide-tones': 'Guide tones',
      key: 'Key centre',
      mode: 'Modes',
    });
  });

  it('asks for the tonic by that name, in the prompt and on the field', () => {
    const type = EXERCISE_TYPES.find((t) => t.id === 'key')!;
    const q = type.generate({
      rng: makeRng(5), difficulty: 3, settings: normaliseSettings({}), targetConcepts: [],
    })!;
    expect(q.prompt.title).toBe('Which note is the tonic?');
    expect(q.fields[0].label).toBe('Tonic');
  });

  it('puts the chart symbol on a quality button, with the name under it', () => {
    const type = EXERCISE_TYPES.find((t) => t.id === 'chord-quality')!;
    const settings = normaliseSettings({ chordQualities: CHORD_QUALITIES.map((q) => q.id) });
    const seen = new Map<string, AnswerOption>();
    for (let seed = 0; seed < 200; seed += 1) {
      const q = type.generate({ rng: makeRng(seed * 13 + 1), difficulty: 4, settings, targetConcepts: [] });
      if (!q) continue;
      for (const option of q.fields[0].options) seen.set(option.id, option);
    }
    expect(seen.get('maj')?.label, 'a major triad has no symbol, so it is named')
      .toBe('Major');
    expect(seen.get('maj')?.sub, 'and nothing is repeated under it').toBeUndefined();
    expect(seen.get('min')).toMatchObject({ label: 'm', sub: 'Minor' });
    expect(seen.get('7')).toMatchObject({ label: '7', sub: 'Dominant 7' });
    expect(seen.get('maj7')).toMatchObject({ label: '∆7', sub: 'Major 7' });
    expect(seen.size, 'plenty of qualities came up').toBeGreaterThan(8);
  });

  it('reads a tension the way it is said aloud', () => {
    const type = EXERCISE_TYPES.find((t) => t.id === 'colour')!;
    const settings = normaliseSettings({ colours: [...COLOUR_IDS] });
    const details = new Set<string>();
    for (let d = 3; d <= 5; d += 1) {
      for (let seed = 0; seed < 120; seed += 1) {
        const q = type.generate({ rng: makeRng(seed * 17 + d), difficulty: d, settings, targetConcepts: [] });
        if (q) details.add(q.reveal.detail);
      }
    }
    const said = [...details].filter((d) => / an? [♭♯]?\d+$/.test(d));
    expect(said.length, 'single colours came up').toBeGreaterThan(10);
    expect(said.some((d) => d.endsWith('an 11')), '"an 11"').toBe(true);
    expect(said.some((d) => d.endsWith('a 9')), '"a 9"').toBe(true);
    for (const detail of said) {
      expect(detail, detail).not.toMatch(/ an [♭♯]/);
    }
  });
});

describe('renaming what a reader sees, not what a profile stores', () => {
  /**
   * The ids a saved profile is written in.
   *
   * None of them changed with the names on the screen, and none of them
   * may: a concept id is the key a learner's history is stored under, a
   * quality id is what a settings list holds, and renaming one silently
   * drops the work somebody did. The settings key `difficulty` is the
   * plainest case — the control says "Level" now and the stored field is
   * what it always was.
   */
  it('keeps every stored id exactly as it was', () => {
    expect(EXERCISE_TYPES.map((t) => t.id)).toEqual([
      'chord-quality', 'chord-full', 'colour', 'chord-inversion', 'interval', 'key',
      'mode', 'progression', 'progression-chord', 'voicing', 'guide-tones',
    ]);
    expect(CHORD_QUALITIES.map((q) => q.id)).toEqual([
      'maj', 'min', 'dim', 'aug', 'sus4', 'sus2', 'maj7', 'm7', '7', 'm7b5', 'dim7',
      'mMaj7', '7sus4', 'maj7#5', '6', 'm6', '69', 'add9', 'madd9', 'maj9', 'm9', '9',
      'm11', '11', '13', 'maj13', 'm13', 'maj7#11', '9#11', '7b9', '7#9', '7b5', '7#5',
      '7b13', '13b9', '7alt',
    ]);
    expect(INVERSIONS.map((i) => i.id)).toEqual(['root', '1st', '2nd', '3rd']);
    expect([...COLOUR_IDS]).toEqual(['9', 'b9', '#9', '11', '#11', '13', 'b13', 'alt']);
    expect([...VOICING_STYLES]).toEqual([
      'close', 'spread', 'drop2', 'rootless', 'shell', 'quartal', 'upperStructure',
    ]);
    expect(PROGRESSIONS.map((p) => p.id)).toEqual([
      'ii-V-I', 'I-IV-V-I', 'I-vi-ii-V', 'I-VI7-ii-V', 'iii-VI-ii-V', 'deceptive',
      'ii-V-i-minor', 'minor-ii-V-i-alt', 'line-cliche', 'minor-plagal', 'tritone-sub',
      'backdoor', 'dim-passing', 'V-of-V', 'V-of-IV', 'bVI-bVII-I',
      'descending-turnaround', 'diatonic-cycle', 'rhythm-changes-a', 'blues-opening',
      'blues-turnaround', 'minor-blues', 'so-what', 'constant-structure', 'coltrane-cell',
      'coltrane-substitution', 'giant-steps-head', 'dominant-cycle', 'rhythm-changes-b',
      'stella-opening', 'modulation-up-tone', 'modulation-to-IV', 'rapid-ii-V',
    ]);
    expect(Object.keys(defaultSettings()).sort()).toEqual([
      'accidental', 'adaptive', 'answerDelay', 'autoAdvance', 'chordQualities', 'colours',
      'difficulty', 'durationMinutes', 'exerciseTypes', 'hintsEnabled', 'instrument',
      'intervalDirections', 'intervals', 'keys', 'modes', 'progressions', 'questionLimit',
      'referenceKey', 'referenceVoicing', 'reverb', 'swing', 'tempo', 'theme',
      'voicingMode', 'volume',
    ]);
  });

  it('loads a profile written before the renaming, with its history intact', () => {
    const saved = {
      version: 3,
      createdAt: 1,
      skills: {
        'chord:maj7': {
          conceptId: 'chord:maj7', attempts: 12, correct: 9, strength: 0.74,
          lastSeen: 2, level: 3, streak: 2, history: [],
        },
        'progression:rhythm-changes-a': {
          conceptId: 'progression:rhythm-changes-a', attempts: 4, correct: 1,
          strength: 0.2, lastSeen: 2, level: 1, streak: 0, history: [],
        },
      },
      sessions: [],
      attempts: [],
      settings: { difficulty: 4, exerciseTypes: ['progression', 'key'], voicingMode: 'curve' },
      streak: { count: 3, lastDay: '2026-11-18' },
      dailyResults: {},
    };
    const loaded = importProfile(JSON.stringify(saved))!;
    expect(loaded, 'it loaded at all').not.toBeNull();
    expect(loaded.skills['chord:maj7'].strength).toBe(0.74);
    expect(loaded.skills['progression:rhythm-changes-a'].attempts).toBe(4);
    expect(loaded.settings.difficulty, 'the level the control sets').toBe(4);
    expect(loaded.settings.exerciseTypes).toEqual(['progression', 'key']);
    expect(loaded.streak.count).toBe(3);
    // And the exercises those ids name are still there to practise.
    for (const id of loaded.settings.exerciseTypes!) {
      expect(EXERCISE_TYPES.map((t) => t.id), id).toContain(id);
    }
  });
});
