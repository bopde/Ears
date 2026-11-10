import { describe, expect, it } from 'vitest';
import {
  CHORD_QUALITIES, chordDegrees, chordToneNames, makeChord, requireChordQuality, spellInChord,
} from './chords';
import { colourName, degreeIn, degreeNumber, hasSeventh, memberNames } from './degrees';
import { LETTERS, PITCH_CLASSES, letterIndexOf } from './pitch';
import { mod } from '../lib/util';

/** The note `semitones` above a root in the 4th octave. */
const above = (rootPc: number, semitones: number) => 60 + rootPc + semitones;

/** What a degree name claims, written out separately from the code. */
const CLAIMS: Record<string, number> = {
  '1': 0, '♭2': 1, '2': 2, '♭3': 3, '3': 4, '4': 5, '♭5': 6, '5': 7,
  '♯5': 8, '6': 9, '𝄫7': 9, '♭7': 10, '7': 11,
  '♭9': 1, '9': 2, '♯9': 3, '11': 5, '♯11': 6, '♭13': 8, '13': 9,
};

describe('a chord names its own members by member number', () => {
  it('names every quality’s tones as that quality writes them', () => {
    for (const quality of CHORD_QUALITIES) {
      const names = memberNames(quality);
      expect(names.length, quality.id).toBe(quality.intervals.length);
      quality.intervals.forEach((interval, i) => {
        // The name is a claim about the note; this checks it against the note.
        expect(CLAIMS[names[i]], `${quality.id}: ${names[i]} for ${interval}`)
          .toBe(mod(interval, 12));
      });
      // One letter per member, which is what writing a chord down means —
      // unless the quality deliberately names two alterations of the same
      // degree, which only the altered dominant does: its ♭9 and ♯9 are
      // both ninths, and that is the chord.
      const numbers = names.map(degreeNumber);
      const repeated = numbers.filter((n, i) => numbers.indexOf(n) !== i);
      for (const number of repeated) {
        const both = names.filter((n) => degreeNumber(n) === number);
        expect(new Set(both).size, `${quality.id}: ${names.join(' ')}`).toBe(both.length);
        expect(quality.id, `${quality.id} names two ${number}ths`).toBe('7alt');
      }
    }
  });

  it('spells every quality on every root without repeating a letter', () => {
    const repeats: string[] = [];
    for (const quality of CHORD_QUALITIES) {
      for (const root of PITCH_CLASSES) {
        const chord = makeChord(root, quality.id);
        const tones = chordToneNames(chord);
        expect(tones.length, `${quality.id}/${root}`).toBe(quality.intervals.length);
        for (const tone of tones) {
          // Nothing unreadable survives: no double accidental, and none of
          // the four names pitch.ts refuses.
          expect(tone.length, `${quality.id}/${root}: ${tones.join(' ')}`).toBeLessThanOrEqual(2);
          expect(['F♭', 'C♭', 'E♯', 'B♯']).not.toContain(tone);
        }
        if (new Set(tones.map((t) => t[0])).size !== tones.length) {
          repeats.push(`${quality.id}/${root}: ${tones.join(' ')}`);
        }
      }
    }
    // A handful cannot be written on seven letters from either root: the
    // altered dominants, which name two ninths, and the six-note chords,
    // which want more letters than there are. Among the chords small enough
    // to have a letter each, exactly one: a minor–major 7th on F♯, whose
    // seventh is an E♯ and whose other spelling wants a B𝄫.
    const small = repeats.filter((r) => requireChordQuality(r.split('/')[0]).intervals.length <= 4);
    expect(small).toEqual(['mMaj7/6: F♯ A C♯ F']);
    expect(repeats.length, repeats.slice(0, 6).join(' | ')).toBeLessThan(40);
  });

  it('puts each tone on the letter its number asks for, where it can', () => {
    let placed = 0;
    for (const quality of CHORD_QUALITIES) {
      for (const root of PITCH_CLASSES) {
        const chord = makeChord(root, quality.id);
        const rootLetter = letterIndexOf(chordToneNames(chord)[0]);
        memberNames(quality).forEach((name, i) => {
          const tone = chordToneNames(chord)[i];
          const wanted = LETTERS[mod(rootLetter + degreeNumber(name) - 1, 7)];
          // Either the letter the number asks for, or the readability
          // fallback — never a third thing.
          if (tone[0] === wanted) placed += 1;
        });
      }
    }
    expect(placed, 'tones on the letter their number asks for').toBeGreaterThan(1500);
  });
});

describe('what a chord does not hold is named by the colour rules', () => {
  it('never reuses a member number the chord is already sounding', () => {
    for (const quality of CHORD_QUALITIES) {
      const members = new Set(quality.intervals.map((i) => mod(i, 12)));
      const sounding = new Set(memberNames(quality).map((n) => degreeNumber(n) % 7));
      // The positions colour can occupy. The others — 0, 4, 7, 10, 11 — are
      // where a chord's own root, third, fifth and seventh live, and a chord
      // missing one of those is missing a chord tone rather than taking
      // colour, so there is no tension name for them to collide with.
      for (const semitones of [1, 2, 3, 5, 6, 8, 9]) {
        if (members.has(semitones)) continue;
        const name = colourName(quality, semitones);
        expect(CLAIMS[name], `${quality.id}: ${name} for ${semitones}`).toBe(semitones);
        // The rule: a name whose letter step the chord already uses would
        // put two different notes on one line of the staff, so it is never
        // chosen while a free name for that pitch exists. A couple of
        // positions have no free name — a sus4 chord's F♯ is a second F
        // whether it is called ♭5 or ♯11 — and those are nowhere in any
        // chord's colour, so nothing ever asks.
        const free = Object.entries(CLAIMS)
          .filter(([other, pitch]) => pitch === semitones && !sounding.has(degreeNumber(other) % 7))
          .map(([other]) => other);
        if (free.length) expect(free, `${quality.id} at ${semitones}`).toContain(name);
      }
    }
  });

  it('decides the two enharmonic pairs by whether a fifth is already there', () => {
    const seven = requireChordQuality('7');
    expect(colourName(seven, 6)).toBe('♯11');
    expect(colourName(seven, 8)).toBe('♭13');
    // A chord whose fifth is altered has still accounted for its fifth, so
    // what sits beside it is colour: a 7♯5 takes a ♯11, not a second fifth.
    const sharp5 = requireChordQuality('7#5');
    expect(colourName(sharp5, 6)).toBe('♯11');
    const flat5 = requireChordQuality('7b5');
    expect(colourName(flat5, 8)).toBe('♭13');
    expect(colourName(requireChordQuality('dim'), 8)).toBe('♭13');
    // And where the altered fifth is the chord's own, it is a member.
    expect(degreeIn(sharp5, 8)).toBe('♯5');
    expect(degreeIn(flat5, 6)).toBe('♭5');
    // With no fifth of any kind, six and eight semitones are the chord's.
    const sixNine = requireChordQuality('69');
    expect(colourName(sixNine, 6)).toBe('♭5');
    expect(colourName(sixNine, 8)).toBe('♯5');
  });

  it('keeps going past a seventh, and stops where there is none', () => {
    const c7 = makeChord(0, '7');
    expect(chordDegrees(c7, [above(0, 2)])).toEqual(['9']);
    expect(chordDegrees(c7, [above(0, 5)])).toEqual(['11']);
    expect(chordDegrees(c7, [above(0, 9)])).toEqual(['13']);
    // A triad has no seventh for the stack to reach past, so its added 6th
    // is a 6th: a C with an A on top is a C6, not most of a C13.
    const cmaj = makeChord(0, 'maj');
    expect(chordDegrees(cmaj, [above(0, 9)])).toEqual(['6']);
    expect(hasSeventh(requireChordQuality('6'))).toBe(false);
    expect(hasSeventh(requireChordQuality('dim7')), 'a °7 has one').toBe(true);
    expect(hasSeventh(requireChordQuality('7sus4'))).toBe(true);
  });
});

describe('the naming bugs this model was built to end', () => {
  it('1. reads a sus2 as 1 2 5, not 1 9 5', () => {
    expect(chordDegrees(makeChord(0, 'sus2'), [60, 62, 67])).toEqual(['1', '2', '5']);
    expect(chordDegrees(makeChord(0, 'sus4'), [60, 65, 67])).toEqual(['1', '4', '5']);
  });

  it('2. calls a °7’s top note a seventh, and spells it on that letter', () => {
    expect(chordDegrees(makeChord(0, 'dim7'), [60, 63, 66, 69]))
      .toEqual(['1', '♭3', '♭5', '𝄫7']);
    // The letter follows the number, so the seventh of B°7 is an A.
    expect(chordToneNames(makeChord(11, 'dim7'))).toEqual(['B', 'D', 'F', 'A♭']);
    expect(chordToneNames(makeChord(6, 'dim7'))).toEqual(['F♯', 'A', 'C', 'E♭']);
  });

  it('3. spells a keyless root so the chord can be written from it', () => {
    expect(chordToneNames(makeChord(1, 'min'))).toEqual(['C♯', 'E', 'G♯']);
    expect(chordToneNames(makeChord(8, 'min'))).toEqual(['G♯', 'B', 'D♯']);
    expect(chordToneNames(makeChord(3, 'm7b5'))).toEqual(['D♯', 'F♯', 'A', 'C♯']);
    expect(chordToneNames(makeChord(6, 'maj7'))).toEqual(['G♭', 'B♭', 'D♭', 'F']);
  });

  it('4. calls an added F♯ over a major triad a ♯11, not a ♭5', () => {
    const cmaj = makeChord(0, 'maj');
    expect(chordDegrees(cmaj, [above(0, 6)])).toEqual(['♯11']);
    expect(chordDegrees(cmaj, [above(0, 3)])).toEqual(['♯9']);
    // And the spelling follows: a ♯11 of C is an F♯, not a G♭.
    expect(spellInChord(cmaj, above(0, 6))).toBe('F♯4');
    expect(spellInChord(cmaj, above(0, 3))).toBe('D♯4');
  });
});
