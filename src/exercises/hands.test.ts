import { describe, expect, it } from 'vitest';
import { getExerciseType } from './registry';
import type { GenContext } from './types';
import { bottomTone, handsLabel, voicingAnswerLabel, voicingLabel } from './voicing-plan';
import { defaultSettings } from '../session/settings';
import { makeRng } from '../lib/rng';
import { FakePerformer } from '../test-support';
import { makeChord } from '../music/chords';
import { VOICING_STYLES, voiceChord } from '../music/voicing';
import { mod } from '../lib/util';

const settings = defaultSettings();
const context = (difficulty: number, seed: number): GenContext => ({
  rng: makeRng(seed),
  difficulty,
  settings,
  targetConcepts: [],
});

/** Every chord and voicing question, across the curve. */
function* questions(ids = ['chord-quality', 'chord-full', 'voicing'], runs = 30) {
  for (const id of ids) {
    const type = getExerciseType(id)!;
    for (let d = 1; d <= 5; d++) {
      for (let seed = 0; seed < runs; seed++) {
        const q = type.generate(context(d, seed * 37 + d));
        if (q) yield { id, d, seed, q };
      }
    }
  }
}

describe('what the hands have on the bottom', () => {
  it('names the tone, and says nothing when it is the root', () => {
    const c7 = makeChord(0, '7');
    // Root underneath: the chord symbol already implies it, the way a chart does.
    expect(bottomTone(c7, voiceChord(c7, { style: 'close', rootPosition: true })))
      .toBeUndefined();
    // Third underneath.
    expect(bottomTone(c7, voiceChord(c7, { style: 'spread', bottomPc: 4 }))).toBe('3rd');
    expect(bottomTone(c7, voiceChord(c7, { style: 'spread', bottomPc: 7 }))).toBe('5th');
    expect(bottomTone(c7, voiceChord(c7, { style: 'spread', bottomPc: 10 }))).toBe('7th');
    // A voicing with no root in it says nothing: its own name covers that.
    const rootless = voiceChord(c7, { style: 'rootless', tensions: true });
    expect(rootless.notes.some((m) => mod(m, 12) === 0)).toBe(false);
    expect(bottomTone(c7, rootless)).toBeUndefined();
  });

  it('drops the alteration, because that is a question about the chord', () => {
    const dm7 = makeChord(2, 'm7');
    expect(bottomTone(dm7, voiceChord(dm7, { style: 'spread', bottomPc: 5 })), '♭3')
      .toBe('3rd');
    // Not a 9th: the engine keeps upper tones above the stack, so one cannot
    // be the bottom note in the first place.
    const half = makeChord(0, 'm7b5');
    expect(bottomTone(half, voiceChord(half, { style: 'spread', bottomPc: 6 })), '♭5')
      .toBe('5th');
  });

  it('describes a close voicing by its family and its bottom note', () => {
    const c7 = makeChord(0, '7');
    expect(handsLabel(c7, voiceChord(c7, { style: 'close', rootPosition: true })))
      .toBe('Close, root on the bottom');
    expect(handsLabel(c7, voiceChord(c7, { style: 'spread', bottomPc: 4 })))
      .toBe('Close  ·  3rd on the bottom');
    // The other families name themselves and add the tone only when it helps.
    expect(handsLabel(c7, voiceChord(c7, { style: 'shell' }))).toBe('Shell');
    const rootless = voiceChord(makeChord(2, 'm7'), { style: 'rootless', rootlessForm: 'B' });
    expect(handsLabel(makeChord(2, 'm7'), rootless)).toBe('Rootless B');
  });

  it('offers the voicing quiz other words for a single chord', () => {
    // "Voice-led" describes a chord's relation to the one before it, and a
    // voicing question plays one chord.
    expect(voicingAnswerLabel('spread')).toBe('Close, another tone on the bottom');
    expect(voicingLabel('spread'), 'the sheet and the progressions still say it')
      .toBe('Close, voice-led');
    for (const style of VOICING_STYLES.filter((s) => s !== 'spread')) {
      expect(voicingAnswerLabel(style), style).toBe(voicingLabel(style));
    }
  });
});

describe('“inversion” and “root position” belong to the bass', () => {
  it('never pairs an inversion with a root bass', () => {
    let checked = 0;
    for (const { id, d, seed, q } of questions()) {
      checked += 1;
      const perf = new FakePerformer();
      q.play(perf.asPerformer());
      const lowest = Math.min(...perf.struck.map((n) => n.midi));
      if (mod(lowest, 12) !== q.keyPc!) continue;
      // The bass has the root, so the chord is in root position whatever the
      // hands do, and neither word belongs in the reveal.
      const text = `${q.reveal.heading} ${q.reveal.detail}`.toLowerCase();
      expect(text, `${id}@${d}#${seed}`).not.toContain('inversion');
      expect(text, `${id}@${d}#${seed}`).not.toContain('root position');
    }
    expect(checked, 'questions really come up').toBeGreaterThan(200);
  });

  it('says what the hands have on the bottom instead', () => {
    let named = 0;
    let plain = 0;
    for (const { id, d, seed, q } of questions()) {
      const perf = new FakePerformer();
      q.play(perf.asPerformer());
      const stack = perf.struck.filter((n) => n.instrument !== 'bass');
      const lowest = Math.min(...stack.map((n) => n.midi));
      const holdsRoot = stack.some((n) => mod(n.midi, 12) === q.keyPc!);
      const detail = `${q.reveal.heading}  ${q.reveal.detail}`;
      if (!holdsRoot) {
        expect(detail, `${id}@${d}#${seed} root-free`).not.toContain('on the bottom');
        continue;
      }
      if (mod(lowest, 12) === q.keyPc!) {
        plain += 1;
        expect(detail, `${id}@${d}#${seed}`).not.toMatch(/\d(?:st|nd|rd|th) on the bottom/);
      } else {
        named += 1;
        expect(detail, `${id}@${d}#${seed}`).toMatch(/\d(?:st|nd|rd|th) on the bottom/);
      }
    }
    expect(named, 'some questions really put another tone underneath').toBeGreaterThan(20);
    expect(plain, 'and some keep the root there').toBeGreaterThan(20);
  });

  it('still names an inversion and a slash chord when a bass sounds one', () => {
    // The inversion exercise is where a non-root bass actually happens.
    const type = getExerciseType('chord-inversion')!;
    let inverted = 0;
    for (let d = 1; d <= 5; d++) {
      for (let seed = 0; seed < 25; seed++) {
        const q = type.generate(context(d, seed * 17 + d));
        if (!q) continue;
        const perf = new FakePerformer();
        q.play(perf.asPerformer());
        const lowest = Math.min(...perf.struck.map((n) => n.midi));
        if (mod(lowest, 12) === q.keyPc!) continue;
        inverted += 1;
        expect(q.reveal.heading, `${d}#${seed}`).toMatch(/\/[A-G]/);
      }
    }
    expect(inverted, 'the inversion exercise really inverts').toBeGreaterThan(20);
  });
});
