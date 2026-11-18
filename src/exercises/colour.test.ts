import { describe, expect, it } from 'vitest';
import { getExerciseType } from './registry';
import { colourOptionsFor } from './colour';
import { colourInterval } from '../music/degrees';
import type { GenContext } from './types';
import { defaultSettings } from '../session/settings';
import { makeRng } from '../lib/rng';
import { FakePerformer } from '../test-support';
import { chordDegrees, makeChord, requireChordQuality } from '../music/chords';
import {
  ALT_SET, BASIC_QUALITIES, COLOUR_IDS, COLOUR_ID_OF, COLOUR_NAMES, coloursFor,
  isBasicQuality,
} from '../music/degrees';
import { VOICING_STYLES, voiceChord } from '../music/voicing';
import { colourConceptId } from '../music/catalog';
import { mod } from '../lib/util';

const settings = defaultSettings();
const context = (difficulty: number, seed: number): GenContext => ({
  rng: makeRng(seed),
  difficulty,
  settings,
  targetConcepts: [],
});

const type = getExerciseType('colour')!;

function* asked(difficulty: number, runs = 150) {
  for (let seed = 0; seed < runs; seed++) {
    const q = type.generate(context(difficulty, seed * 23 + difficulty));
    if (!q) continue;
    const perf = new FakePerformer();
    q.play(perf.asPerformer());
    const chord = makeChord(q.keyPc!, qualityOf(q.prompt.title));
    yield { q, perf, chord, where: `colour@${difficulty}#${seed}` };
  }
}

/**
 * The chord the prompt showed, read back off its symbol.
 *
 * Off the prompt rather than out of the generator, so the test is checking
 * what a learner is actually told the chord is.
 */
function qualityOf(title: string): string {
  const symbol = /added to this (.+)\?$/.exec(title)![1].replace(/^[A-G][♯♭]?/, '');
  const found = BASIC_QUALITIES.find((id) => requireChordQuality(id).symbol === symbol);
  if (!found) throw new Error(`No basic chord writes "${symbol}"`);
  return found;
}

/** The degrees a question actually sounded above its chord. */
const soundedColour = (chord: ReturnType<typeof makeChord>, perf: FakePerformer): string[] => {
  const held = new Set(chord.quality.intervals.map((i) => mod(i, 12)));
  const names = perf.struck
    .filter((n) => n.instrument !== 'bass')
    .filter((n) => !held.has(mod(n.midi - chord.rootPc, 12)))
    .map((n) => chordDegrees(chord, [n.midi])[0]);
  return [...new Set(names)];
};

describe('the colour question asks about what was added', () => {
  it('plays exactly what its answer names', () => {
    let singles = 0;
    let pairs = 0;
    for (const difficulty of [1, 2, 3, 4, 5]) {
      for (const { q, perf, chord, where } of asked(difficulty, 60)) {
        const named = q.correct.colour === 'alt'
          ? [...ALT_SET]
          : q.correct.colour.split('+').map((id) => COLOUR_NAMES[id]);
        expect(soundedColour(chord, perf).sort(), where).toEqual([...named].sort());
        if (named.length > 1) pairs += 1; else singles += 1;
      }
    }
    expect(singles, 'questions with one colour').toBeGreaterThan(100);
    expect(pairs, 'and questions with two').toBeGreaterThan(5);
  });

  it('marks the added note out from the chord in the reveal', () => {
    for (const difficulty of [1, 3, 5]) {
      for (const { q, chord, where } of asked(difficulty, 30)) {
        const played = q.reveal.played!;
        expect(played.added, `${where} marks something`).toBeDefined();
        const marked = played.added!.map((i) => played.degrees[i]);
        const named = q.correct.colour === 'alt'
          ? [...ALT_SET]
          : q.correct.colour.split('+').map((id) => COLOUR_NAMES[id]);
        // Exactly the colours the answer names, and nothing of the chord.
        expect([...marked].sort(), where).toEqual([...named].sort());
        // And every marked index points at a note the chord does not hold.
        const held = new Set(chord.quality.intervals.map((i) => mod(i, 12)));
        for (const i of played.added!) {
          const degree = played.degrees[i];
          expect(named, `${where} marked ${degree}, which is not the answer`).toContain(degree);
          expect(held.has(mod(colourInterval(degree) ?? -1, 12)), `${where} marked a chord tone`)
            .toBe(false);
        }
      }
    }
  });

  it('shows the chord, so the question is only about the colour', () => {
    for (const difficulty of [1, 3, 5]) {
      for (const { q, chord, where } of asked(difficulty, 40)) {
        expect(q.prompt.title, where).toMatch(/^What was added to this .+\?$/);
        expect(isBasicQuality(chord.quality.id), where).toBe(true);
        // And the answer buttons name tones, never chords.
        for (const option of q.fields[0].options) {
          expect(option.id.split('+').every((id) => COLOUR_IDS.includes(id)), where).toBe(true);
        }
      }
    }
  });

  it('offers nothing the chord would not be comped with', () => {
    for (const difficulty of [1, 3, 5]) {
      for (const { q, chord, where } of asked(difficulty, 40)) {
        const allowed = new Set(colourOptionsFor(chord, difficulty));
        for (const option of q.fields[0].options) {
          // A ♭13 is not an option over a major seventh. The learner who
          // knows that has learned something, rather than been handed a
          // free elimination.
          expect(allowed.has(option.id), `${where}: ${option.label} on ${chord.quality.id}`)
            .toBe(true);
        }
        expect(q.fields[0].options.map((o) => o.id), where).toContain(q.correct.colour);
      }
    }
  });

  it('offers wrong answers of the same size as the right one', () => {
    const sizeOf = (id: string) => (id === 'alt' ? ALT_SET.length : id.split('+').length);
    const sizes = new Set<number>();
    for (const { q, where } of asked(5, 80)) {
      const size = sizeOf(q.correct.colour);
      sizes.add(size);
      for (const option of q.fields[0].options) {
        // A single offered against a three-note answer is a free
        // elimination, and for the altered sound it was worse than free:
        // the singles were its own members, each of which had sounded.
        expect(sizeOf(option.id), `${where}: ${option.label}`).toBe(size);
      }
      // The prompt says how many, counted rather than assumed.
      expect(q.prompt.sub, where)
        .toBe(`${['', 'One', 'Two', 'Three'][size]} note${size === 1 ? '' : 's'} above the chord`);
    }
    expect([...sizes].sort(), 'questions of one, two and three notes').toEqual([1, 2, 3]);
  });

  it('never offers the altered sound its own tones to choose from', () => {
    let alt = 0;
    for (const { q, where } of asked(5, 120)) {
      if (q.correct.colour !== 'alt') continue;
      alt += 1;
      expect(q.prompt.sub, where).toBe('Three notes above the chord');
      for (const option of q.fields[0].options) {
        for (const member of ALT_SET) {
          expect(option.label, `${where}: ${option.label}`).not.toBe(member);
        }
      }
    }
    expect(alt, 'altered questions came up').toBeGreaterThan(10);
  });

  it('never offers two readings of one degree together', () => {
    // A chord sounding a 9 and a ♭9 is sounding a semitone, not two
    // colours, and no chord scale has both.
    for (const { q, where } of asked(5, 80)) {
      for (const option of q.fields[0].options) {
        const numbers = option.id.split('+').map((id) => COLOUR_NAMES[id]?.replace(/\D/g, ''));
        expect(new Set(numbers).size, `${where}: ${option.label}`).toBe(numbers.length);
      }
    }
  });
});

describe('the colour curve', () => {
  const colours = (difficulty: number) => {
    const seen = new Set<string>();
    for (const { q } of asked(difficulty, 120)) {
      for (const id of q.correct.colour.split('+')) seen.add(id);
    }
    return seen;
  };

  it('starts on the two a chord is most often comped with', () => {
    for (const difficulty of [1, 2]) {
      expect([...colours(difficulty)].sort(), `level ${difficulty}`).toEqual(['13', '9']);
    }
  });

  it('adds the elevenths at level 3, and the alterations above it', () => {
    expect([...colours(3)].sort()).toEqual(['11', '13', '#11', '9'].sort());
    const top = colours(5);
    for (const altered of ['b9', '#9', 'b13']) {
      expect(top, `level 5 reaches ${altered}`).toContain(altered);
    }
  });

  it('keeps the first levels on one chord of each family', () => {
    for (const { chord, where } of asked(1, 60)) {
      expect(['maj7', 'm7', '7'], where).toContain(chord.quality.id);
    }
  });
});

describe('the colour question records what it trained', () => {
  it('names the colour as its concept, the altered sound as one', () => {
    for (const difficulty of [1, 3, 5]) {
      for (const { q, where } of asked(difficulty, 40)) {
        expect(q.conceptIds, where).toEqual(q.correct.colour.split('+').map(colourConceptId));
        for (const id of q.conceptIds) {
          expect(id.startsWith('colour:'), where).toBe(true);
        }
      }
    }
  });

  it('offers the chord on its own, to measure the colour against', () => {
    for (const { q, where } of asked(3, 20)) {
      const chord = makeChord(q.keyPc!, qualityOf(q.prompt.title));
      expect(q.playPlain, where).toBeTruthy();
      const bare = new FakePerformer();
      q.playPlain!(bare.asPerformer());
      expect(soundedColour(chord, bare), `${where} plays the chord alone`).toEqual([]);
      // And so does the hint, which is the same offer before the answer —
      // one that played the colour would be handing it over.
      expect(q.hint?.label, where).toBe('Chord alone');
      const hinted = new FakePerformer();
      q.hint!.play(hinted.asPerformer());
      expect(soundedColour(chord, hinted), `${where} hints the chord alone`).toEqual([]);
      expect(hinted.notes.length, where).toBeGreaterThan(0);
    }
  });

  it('is in the pool only for the colours that are enabled', () => {
    expect(type.pool(settings).sort()).toEqual(COLOUR_IDS.map(colourConceptId).sort());
    expect(type.pool({ ...settings, colours: ['9', '13'] }))
      .toEqual([colourConceptId('9'), colourConceptId('13')]);
  });

  it('gives up rather than ask about a colour nothing enabled can take', () => {
    // Only major sevenths on, which take no ♭13.
    const narrow = { ...settings, chordQualities: ['maj7'], colours: ['b13'] };
    let made = 0;
    for (let seed = 0; seed < 40; seed++) {
      if (type.generate({ ...context(5, seed), settings: narrow })) made += 1;
    }
    expect(made, 'no question is invented').toBe(0);
    expect(coloursFor(requireChordQuality('maj7')), 'because ∆7 has no ♭13')
      .not.toContain(COLOUR_NAMES.b13);
    expect(COLOUR_ID_OF['♭13']).toBe('b13');
  });
});

describe('an altered dominant sounds altered', () => {
  it('always sounds an altered 9th and an altered 5th or 13th', () => {
    // 3 ♭7 1 ♭13 is a 7♯5 and nothing else: one alteration is not an
    // altered chord. Twelve of the eighty-four 7alt voicings sounded only
    // one, all of them shells.
    for (const root of [0, 3, 7, 10]) {
      const chord = makeChord(root, '7alt');
      for (const style of VOICING_STYLES) {
        for (const tensions of [false, true]) {
          const degrees = chordDegrees(chord, voiceChord(chord, {
            style, maxNotes: 5, tensions,
          }).notes);
          const where = `${style} on ${root}: ${degrees.join(' ')}`;
          expect(degrees.some((d) => d === '♭9' || d === '♯9'), where).toBe(true);
          expect(degrees.some((d) => d === '♭5' || d === '♯5' || d === '♭13'), where).toBe(true);
        }
      }
    }
  });
});
