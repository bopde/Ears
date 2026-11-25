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
  ALT_SET, BASIC_OF, BASIC_QUALITIES, COLOUR_IDS, COLOUR_ID_OF, COLOUR_NAMES,
  alteredFifthQuality, alteredFifthsFor, coloursFor, isBasicQuality,
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
  const symbol = /added or changed on this (.+)\?$/.exec(title)![1].replace(/^[A-G][♯♭]?/, '');
  const found = BASIC_QUALITIES.find((id) => requireChordQuality(id).symbol === symbol);
  if (!found) throw new Error(`No basic chord writes "${symbol}"`);
  return found;
}

/**
  * The degrees a question actually sounded, as the answer would name them.
  *
  * Read against the chord that sounds rather than the one printed, which
  * is the only way a moved fifth reads as a fifth: a G7 whose 5th is
  * raised sounds a G7♯5, and eight semitones over a chord that still has
  * its natural 5th in the interval list would be called a ♭13.
  */
const soundedColour = (chord: ReturnType<typeof makeChord>, perf: FakePerformer): string[] => {
  const struck = perf.struck.filter((n) => n.instrument !== 'bass').map((n) => n.midi);
  const pcs = new Set(struck.map((m) => mod(m - chord.rootPc, 12)));
  // Which chord really sounded: the printed one unless its fifth moved.
  const basic = BASIC_OF[chord.quality.id] ?? chord.quality.id;
  const moved = alteredFifthsFor(basic)
    .find((name) => pcs.has(mod(colourInterval(name)!, 12)) && !pcs.has(7));
  const sounded = moved
    ? makeChord(chord.rootPc, alteredFifthQuality(basic, moved)!)
    : chord;
  const held = new Set(chord.quality.intervals.map((i) => mod(i, 12)));
  const names = struck
    .filter((m) => moved !== undefined || !held.has(mod(m - chord.rootPc, 12)))
    .filter((m) => !sounded.quality.intervals.some((i) => mod(i, 12) === mod(m - chord.rootPc, 12))
      || mod(m - chord.rootPc, 12) === mod(colourInterval(moved ?? '') ?? -1, 12))
    .map((m) => chordDegrees(sounded, [m])[0]);
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
        expect(q.prompt.title, where).toMatch(/^What was added or changed on this .+\?$/);
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
      // The prompt says how many, counted rather than assumed — and says
      // nothing about where they are, because from level 3 one of them
      // may be a chord tone moved rather than a note added over it.
      expect(q.prompt.sub, where)
        .toBe(`${['', 'One', 'Two', 'Three'][size]} note${size === 1 ? '' : 's'}`);
    }
    expect([...sizes].sort(), 'questions of one, two and three notes').toEqual([1, 2, 3]);
  });

  it('never offers the altered sound its own tones to choose from', () => {
    let alt = 0;
    for (const { q, where } of asked(5, 120)) {
      if (q.correct.colour !== 'alt') continue;
      alt += 1;
      expect(q.prompt.sub, where).toBe('Three notes');
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
    expect([...colours(1)].sort(), 'level 1').toEqual(['13', '9']);
  });

  it('darkens at level 2, long before it used to', () => {
    // A ♭9 over a dominant is one of the first sounds anybody recognises
    // in this music, and it used to wait until level 4 — which left the
    // first two levels asking 9 or 13 and nothing else.
    expect([...colours(2)].sort()).toEqual(['13', '9', 'b13', 'b9'].sort());
  });

  it('adds the ones that need a reference in the chord at level 3', () => {
    // The 11th and the ♯11 against the third; the moved fifths against
    // the fifth, which is the note that tells them from a ♭13 or a ♯11.
    expect([...colours(3)].sort())
      .toEqual(['9', '13', 'b9', 'b13', '#9', '11', '#11', '#5', 'b5'].sort());
    const top = colours(5);
    for (const id of ['alt', '#5', 'b5', 'b9', '#9', 'b13']) {
      expect(top, `level 5 reaches ${id}`).toContain(id);
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

describe('a moved fifth and a note above the fifth', () => {
  /**
   * The pair the exercise exists to tell apart.
   *
   * A ♯5 and a ♭13 are the same pitch; so are a ♭5 and a ♯11. What
   * separates them is whether the chord still has its natural 5th, and
   * nothing else does — so the question offers them against each other
   * and the answer is in that one note.
   */
  /** Whether an answer moves the chord's fifth rather than adding over it. */
  const moves = (names: readonly string[]) => names.includes('♯5') || names.includes('♭5');

  const fifths = (difficulty: number, runs = 400) => {
    const out: Array<{
      q: ReturnType<typeof type.generate>; pcs: Set<number>; fifth: boolean; where: string;
    }> = [];
    for (const item of asked(difficulty, runs)) {
      const pcs = new Set(item.perf.struck
        .filter((n) => n.instrument !== 'bass')
        .map((n) => mod(n.midi - item.chord.rootPc, 12)));
      // Only a chord with a natural 5th of its own has a 5th to move or
      // to sit above: over a half-diminished chord a ♭13 is just a ♭13,
      // and there is no ♯5 on offer to confuse it with.
      const fifth = item.chord.quality.intervals.some((i) => mod(i, 12) === 7);
      out.push({ q: item.q, pcs, fifth, where: item.where });
    }
    return out;
  };

  it('takes the natural 5th away for a ♯5 or a ♭5, and never otherwise', () => {
    let moved = 0;
    let above = 0;
    for (const difficulty of [3, 4, 5]) {
      for (const { q, pcs, fifth, where } of fifths(difficulty)) {
        const names = q!.correct.colour === 'alt'
          ? [...ALT_SET]
          : q!.correct.colour.split('+').map((id) => COLOUR_NAMES[id]);
        const what = `${where}: ${names.join('+')}`;
        if (names.includes('♯5') || names.includes('♭5')) {
          expect(pcs.has(7), `${what} still sounds the natural 5th`).toBe(false);
          expect(pcs.has(names.includes('♯5') ? 8 : 6), `${what} sounds the altered one`).toBe(true);
          moved += 1;
        } else if (fifth && !moves(names)
          && (names.includes('♭13') || names.includes('♯11'))) {
          // The other half of the pair: these are added over a 5th that
          // is still there, which is the whole of what makes them those
          // and not the other two.
          expect(pcs.has(7), `${what} has no 5th to be above`).toBe(true);
          above += 1;
        }
      }
    }
    expect(moved, 'moved fifths came up').toBeGreaterThan(80);
    expect(above, 'and notes above the fifth').toBeGreaterThan(80);
  });

  it('never offers two answers that are both true of the sound', () => {
    for (const difficulty of [3, 4, 5]) {
      for (const { q, pcs, fifth, where } of fifths(difficulty)) {
        // Judged from the notes rather than from the answer: an option is
        // true if every tone it names sounded and, for the four that come
        // in pairs, the natural 5th agrees.
        const trueOnes = q!.fields[0].options.filter((option) => {
          const names = option.id === 'alt'
            ? [...ALT_SET]
            : option.id.split('+').map((id) => COLOUR_NAMES[id]);
          return names.every((name) => {
            const semitones = mod(colourInterval(name) ?? -1, 12);
            if (!pcs.has(semitones)) return false;
            if (name === '♯5' || name === '♭5') return !pcs.has(7);
            // Above the 5th — unless the answer moved it, in which case
            // the ♯11 is sitting above the moved one. A ♯11 over an
            // E♭∆7♯5 is Lydian augmented, and nothing else reads it.
            if (fifth && !moves(names) && (name === '♭13' || name === '♯11')) return pcs.has(7);
            return true;
          });
        });
        expect(trueOnes.map((o) => o.label), `${where} has one answer`).toHaveLength(1);
        expect(trueOnes[0].id, where).toBe(q!.correct.colour);
      }
    }
  });

  it('offers the one it is not, so the 5th is what decides', () => {
    let paired = 0;
    for (const { q } of fifths(4, 600)) {
      const ids = q!.fields[0].options.map((o) => o.id);
      const answer = String(q!.correct.colour);
      if (answer === '#5' && ids.includes('b13')) paired += 1;
      if (answer === 'b13' && ids.includes('#5')) paired += 1;
      if (answer === 'b5' && ids.includes('#11')) paired += 1;
      if (answer === '#11' && ids.includes('b5')) paired += 1;
    }
    expect(paired, 'the two readings were offered against each other').toBeGreaterThan(20);
  });
});
