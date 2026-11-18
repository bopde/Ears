import { describe, expect, it } from 'vitest';
import { getExerciseType } from './registry';
import { handsLabel } from './voicing-plan';
import type { GenContext } from './types';
import { defaultSettings } from '../session/settings';
import { makeRng } from '../lib/rng';
import { FakePerformer } from '../test-support';
import {
  CHORD_QUALITIES, basicChord, chordDegrees, makeChord, requireChordQuality, type Chord,
} from '../music/chords';
import { COLOUR_IDS } from '../music/degrees';
import { voiceChord } from '../music/voicing';
import { BASS_INSTRUMENT } from '../audio/instruments';
import { mod } from '../lib/util';

const settings = {
  ...defaultSettings(),
  chordQualities: CHORD_QUALITIES.map((q) => q.id),
  colours: [...COLOUR_IDS],
};

const context = (difficulty: number, seed: number): GenContext => ({
  rng: makeRng(seed),
  difficulty,
  settings,
  targetConcepts: [],
});

/**
 * What makes a voicing close: the chord's own tones inside an octave, in
 * the order the chord stacks them, with none stepped over.
 *
 * The chord's own tones means the basic chord's. A 13th is colour — it
 * lives above the octave by definition, and a close voicing with a 13 on
 * top is still close.
 */
function closeness(chord: Chord, hands: readonly number[]) {
  const basic = basicChord(chord).quality;
  const own = new Set(basic.intervals.map((i) => mod(i, 12)));
  const tones = hands.filter((m) => own.has(mod(m - chord.rootPc, 12)));
  if (!tones.length) return { span: 0, skipped: [] as string[], tones };
  const stack = [...basic.intervals].sort((a, b) => a - b).map((i) => mod(chord.rootPc + i, 12));
  const start = stack.indexOf(mod(tones[0], 12));
  const rotated = start < 0 ? stack : [...stack.slice(start), ...stack.slice(0, start)];
  const skipped: string[] = [];
  let at = 0;
  for (const midi of tones) {
    while (at < rotated.length && rotated[at] !== mod(midi, 12)) {
      skipped.push(chordDegrees(chord, [60 + rotated[at]])[0]);
      at += 1;
    }
    at += 1;
  }
  return { span: Math.max(...tones) - Math.min(...tones), skipped, tones };
}

/** The chord a voicing question printed, and the notes its hands played. */
function* closeQuestions(runs = 300) {
  const type = getExerciseType('voicing')!;
  for (let d = 1; d <= 5; d++) {
    for (let seed = 0; seed < runs; seed++) {
      const q = type.generate(context(d, seed * 19 + d));
      if (!q) continue;
      const style = q.correct.voicing;
      if (style !== 'close' && style !== 'spread') continue;
      const perf = new FakePerformer();
      q.play(perf.asPerformer());
      const hands = perf.notes
        .filter((n) => n.instrument !== BASS_INSTRUMENT)
        .map((n) => n.midi)
        .sort((a, b) => a - b);
      const symbol = q.prompt.sub!.split(' — ')[0];
      const quality = CHORD_QUALITIES.find((x) => x.symbol === symbol.replace(/^[A-G][♯♭]?/, ''))!;
      yield { q, style, hands, chord: makeChord(q.keyPc!, quality.id), where: `${d}#${seed} ${symbol}` };
    }
  }
}

describe('a voicing called Close is close', () => {
  it('pins the bottom note by rotating the stack, not by lifting a note out', () => {
    // An F6 pinned on its 3rd. Moving the A to the front and leaving F C D
    // where they were is not an inversion: it is the same stack with the A
    // an octave down, seventeen semitones wide.
    const f6 = makeChord(5, '6');
    const v = voiceChord(f6, { style: 'spread', bottomPc: 9, maxNotes: 4 });
    expect(chordDegrees(f6, v.notes)).toEqual(['3', '5', '6', '1']);
    expect(Math.max(...v.notes) - Math.min(...v.notes)).toBeLessThanOrEqual(12);
  });

  it('keeps its chord tones inside an octave, with none stepped over', () => {
    let checked = 0;
    for (const { chord, hands, where } of closeQuestions()) {
      const { span, skipped } = closeness(chord, hands);
      expect(span, `${where}: ${chordDegrees(chord, hands).join(' ')}`).toBeLessThanOrEqual(12);
      expect(skipped, `${where}: ${chordDegrees(chord, hands).join(' ')}`).toEqual([]);
      checked += 1;
    }
    expect(checked, 'close-family questions').toBeGreaterThan(200);
  });

  it('puts the inversion exercise’s hands close above the bass', () => {
    const type = getExerciseType('chord-inversion')!;
    let checked = 0;
    for (let d = 1; d <= 5; d++) {
      for (let seed = 0; seed < 120; seed++) {
        const q = type.generate(context(d, seed * 23 + d));
        if (!q) continue;
        const perf = new FakePerformer();
        q.play(perf.asPerformer());
        const hands = perf.notes
          .filter((n) => n.instrument !== BASS_INSTRUMENT)
          .map((n) => n.midi)
          .sort((a, b) => a - b);
        const chord = makeChord(q.keyPc!, q.conceptIds[1].split(':')[1]);
        const { span, skipped } = closeness(chord, hands);
        const where = `${d}#${seed} ${chord.quality.id}`;
        expect(span, `${where}: ${chordDegrees(chord, hands).join(' ')}`).toBeLessThanOrEqual(12);
        expect(skipped, `${where}: ${chordDegrees(chord, hands).join(' ')}`).toEqual([]);
        checked += 1;
      }
    }
    expect(checked, 'inversion questions').toBeGreaterThan(200);
  });

  it('honours the pin on every tone of every chord, at every budget', () => {
    // Three notes as well as five: the tight budgets are where the chord's
    // own tones have to give way, and where pinning a tone that was then
    // shed used to go wrong. The engine stacked from a note the voicing
    // did not hold and pushed another off the top — a dominant pinned on
    // its 5th came out 5 3 ♭7 9 13, with no root in it at all.
    let checked = 0;
    for (const quality of CHORD_QUALITIES) {
      for (const interval of quality.intervals.filter((i) => i < 12 && i !== 0)) {
        for (const tensions of [false, true]) {
          for (const maxNotes of [3, 4, 5]) {
            for (const style of ['close', 'spread'] as const) {
              const chord = makeChord(0, quality.id);
              const v = voiceChord(chord, { style, bottomPc: interval, maxNotes, tensions });
              const where = `${style} ${quality.id} pinned +${interval}, ${maxNotes} notes`;
              expect(mod(v.notes[0], 12), where).toBe(mod(interval, 12));
              // And the root survives however tight it gets, because a
              // close voicing without one is a rootless voicing.
              expect(
                v.notes.some((m) => mod(m, 12) === 0),
                `${where}: ${chordDegrees(chord, v.notes).join(' ')}`,
              ).toBe(true);
              checked += 1;
            }
          }
        }
      }
    }
    expect(checked, 'pinned voicings').toBeGreaterThan(900);
  });
});

describe('a close voicing keeps its root, and its label says what is there', () => {
  it('never sheds the root out of the hands', () => {
    for (const { chord, hands, where } of closeQuestions()) {
      expect(
        hands.some((m) => mod(m, 12) === mod(chord.rootPc, 12)),
        `${where}: ${chordDegrees(chord, hands).join(' ')} has no root`,
      ).toBe(true);
    }
    // And directly, on every chord: colour gives way before the chord does.
    for (const quality of CHORD_QUALITIES) {
      for (const style of ['close', 'spread'] as const) {
        const chord = makeChord(0, quality.id);
        const v = voiceChord(chord, { style, maxNotes: 4, tensions: true });
        expect(v.notes.map((m) => mod(m, 12)), `${style} ${quality.id}`).toContain(0);
      }
    }
  });

  it('names the lowest hand note, and only calls it the root when it is', () => {
    let named = 0;
    let onRoot = 0;
    for (const { chord, hands, where } of closeQuestions()) {
      const voicing = { notes: hands, all: hands, style: 'close' as const };
      const label = handsLabel(chord, voicing);
      const lowest = chordDegrees(chord, [hands[0]])[0];
      if (lowest === '1') {
        expect(label, where).toBe('Close, root on the bottom');
        onRoot += 1;
      } else {
        expect(label, `${where}: lowest is ${lowest}`).not.toContain('root on the bottom');
        expect(label, where).toContain('on the bottom');
        named += 1;
      }
    }
    expect(onRoot, 'questions with the root underneath').toBeGreaterThan(50);
    expect(named, 'and questions with something else').toBeGreaterThan(50);
  });

  it('says nothing false about a voicing that really has no root', () => {
    // It cannot happen in a close voicing now, but the label is what a
    // reader trusts, so it has to be true of whatever it is handed.
    const dm7 = makeChord(2, 'm7');
    const headless = voiceChord(dm7, { style: 'rootless' });
    expect(headless.notes.some((m) => mod(m, 12) === 2), 'really has no root').toBe(false);
    expect(handsLabel(dm7, { ...headless, style: 'close' })).not.toContain('root on the bottom');
    // And the ordinary case still reads as it did.
    const plain = voiceChord(dm7, { style: 'close', rootPosition: true });
    expect(handsLabel(dm7, plain)).toBe('Close, root on the bottom');
    expect(handsLabel(dm7, voiceChord(dm7, { style: 'spread', bottomPc: 5 })))
      .toBe('Close  ·  3rd on the bottom');
    expect(requireChordQuality('m7').symbol).toBe('m7');
  });
});
