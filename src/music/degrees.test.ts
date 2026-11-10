import { describe, expect, it } from 'vitest';
import {
  CHORD_QUALITIES, chordDegrees, chordSymbol, chordToneNames, makeChord,
  requireChordQuality, spellInChord,
} from './chords';
import {
  BASIC_OF, BASIC_QUALITIES, colourInterval, colourName, coloursFor, degreeIn, degreeNumber,
  hasSeventh, memberNames,
} from './degrees';
import { LETTERS, PITCH_CLASSES, letterIndexOf } from './pitch';
import { tensionIntervals } from './voicing';
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
    // A handful cannot be written on seven letters: the altered dominants,
    // which name two ninths, and the six-note chords, which want more
    // letters than there are. Among the chords small enough to have a
    // letter each, three — all of them minor–major 7ths, whose seventh is a
    // semitone under the root and so lands on the root's own letter unless
    // the root is written from the flat side. One of them cannot be written
    // either way; the other two are the tie-break choosing sharps for the
    // minor family, which is the rule the app follows.
    const small = repeats.filter((r) => requireChordQuality(r.split('/')[0]).intervals.length <= 4);
    expect(small).toEqual([
      'mMaj7/1: C♯ E G♯ C',
      'mMaj7/6: F♯ A C♯ F',
      'mMaj7/8: G♯ B D♯ G',
    ]);
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
    let checked = 0;
    for (const quality of CHORD_QUALITIES) {
      const sounding = new Set(memberNames(quality).map((n) => degreeNumber(n) % 7));
      // Every colour this chord can actually be played with, which is the
      // only set the rule has to hold over: a position no voicing reaches
      // is a position nothing ever has to name.
      const colours = [
        ...coloursFor(quality),
        ...(BASIC_OF[quality.id] === '7' ? coloursFor(quality, { altered: true }) : []),
      ];
      for (const name of colours) {
        const semitones = colourInterval(name)!;
        // The name the chord would give that pitch is the name the table
        // uses: the two cannot drift apart.
        expect(degreeIn(quality, semitones), `${quality.id}: ${name}`).toBe(name);
        expect(CLAIMS[name], `${quality.id}: ${name}`).toBe(mod(semitones, 12));
        // And it does not land on a letter the chord is already using —
        // with one exception the music itself makes. A diminished seventh
        // is four notes a minor third apart and its scale has eight notes
        // for seven letters, so the natural 7th it is comped with sits on
        // the same letter as its own 𝄫7: C°7 is C E♭ G♭ B𝄫, and the
        // seventh the scale adds is a B.
        const clash = sounding.has(degreeNumber(name) % 7);
        if (clash) expect(`${quality.id}:${name}`, 'the one exception').toBe('dim7:7');
        else expect(clash, `${quality.id}: ${name}`).toBe(false);
        checked += 1;
      }
    }
    expect(checked, 'colours checked').toBeGreaterThan(60);
  });

  it('calls a note over a triad by the name a chart would give it', () => {
    const cmaj = requireChordQuality('maj');
    expect(colourName(cmaj, 2)).toBe('9');
    expect(colourName(cmaj, 6)).toBe('♯11');
    expect(colourName(cmaj, 3)).toBe('♯9');
    expect(colourName(cmaj, 9)).toBe('6');
    const cmin = requireChordQuality('min');
    expect(colourName(cmin, 5)).toBe('11');
    expect(colourName(cmin, 9)).toBe('6');
  });

  it('makes an altered fifth a member and never a colour', () => {
    // A 7♭5 and a 7 played with a ♯11 are the same five notes. What tells
    // them apart is the chord: the one that declares a ♭5 has a ♭5 in it,
    // and over the one that does not, the same pitch is colour.
    const seven = requireChordQuality('7');
    expect(colourName(seven, 6)).toBe('♯11');
    expect(colourName(seven, 8)).toBe('♭13');
    const sharp5 = requireChordQuality('7#5');
    const flat5 = requireChordQuality('7b5');
    expect(degreeIn(sharp5, 8)).toBe('♯5');
    expect(degreeIn(flat5, 6)).toBe('♭5');
    expect(colourName(sharp5, 6)).toBe('♯11');
    expect(colourName(flat5, 8)).toBe('♭13');
    // A diminished triad has no natural 5, and naming its A♭ a ♯5 would
    // put a ♭5 and a ♯5 in one chord.
    expect(colourName(requireChordQuality('dim'), 8)).toBe('♭13');
    // A 6/9 has no fifth at all, and its F♯ is the ♯11 of the scale it
    // comes from, not a fifth that went missing.
    expect(colourName(requireChordQuality('69'), 6)).toBe('♯11');
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

  it('settles a tie by family: flats above, sharps below', () => {
    // Where both spellings write the chord, the family decides. The minor
    // and diminished side takes sharps, everything else flats.
    expect(chordSymbol(makeChord(3, 'm7'))).toBe('D♯m7');
    expect(chordSymbol(makeChord(3, 'm7b5'))).toBe('D♯ø7');
    expect(chordSymbol(makeChord(6, 'maj'))).toBe('G♭');
    expect(chordSymbol(makeChord(6, '6'))).toBe('G♭6');
    // And an alteration the chord's own name warns you about gets no vote,
    // or every altered dominant would be dragged across: a ♭9 needs an
    // awkward letter whichever root it is written from.
    expect(chordSymbol(makeChord(3, '7b9'))).toBe('E♭7♭9');
    expect(chordSymbol(makeChord(8, '7alt'))).toBe('A♭7alt');
    expect(chordSymbol(makeChord(1, '7b9'))).toBe('D♭7♭9');
    // A plain 9 is a member like any other and does count, which keeps the
    // add-9 chords off a root whose 9th would be a second F.
    expect(chordToneNames(makeChord(3, 'madd9'))).toEqual(['E♭', 'G♭', 'B♭', 'F']);
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

describe('one colour table per basic chord', () => {
  it('gives each basic chord the colours its scale offers', () => {
    const colour = (id: string) => coloursFor(requireChordQuality(id)).join(' ');
    // Lydian and the major scale. The ♯11 and the 13 are a ∆7's two most
    // ordinary colours and it used to get neither, which is why ∆9 stayed
    // on offer against a ∆7♯11 that had been played with a 9th.
    expect(colour('maj7')).toBe('9 ♯11 13');
    // A 6 chord's 13 is the 6th it already has, so what is left to add is
    // the other two.
    expect(colour('6')).toBe('9 ♯11');
    expect(colour('m6')).toBe('9 11');
    // Dorian.
    expect(colour('m7')).toBe('9 11 13');
    expect(colour('mMaj7')).toBe('9 11 13');
    // Mixolydian, with the altered set asked for separately.
    expect(colour('7')).toBe('9 13');
    expect(colour('7sus4')).toBe('9 13');
    expect(colour('7b5')).toBe('9 13');
    expect(coloursFor(requireChordQuality('7'), { altered: true }).join(' '))
      .toBe('9 13 ♭9 ♯9 ♯11 ♭13');
    // Locrian ♮2. A natural 13 would sit a semitone above the chord's own
    // ♭5, which is what it was being handed.
    expect(colour('m7b5')).toBe('9 11 ♭13');
    // The diminished scale, whose eight notes include a natural 7th above
    // the chord's 𝄫7.
    expect(colour('dim7')).toBe('9 11 ♭13 7');
    // Whole-tone and Lydian augmented: no natural 5 to clash with.
    expect(colour('7#5')).toBe('9 ♯11');
    expect(colour('maj7#5')).toBe('9 ♯11');
    // And the triads take their seventh chord's, less what needs a seventh
    // underneath it to be heard as an extension at all.
    expect(colour('maj')).toBe('9 ♯11');
    expect(colour('min')).toBe('9 11');
    expect(colour('dim')).toBe('9 11 ♭13');
    expect(colour('aug')).toBe('9 ♯11');
    expect(colour('sus4')).toBe('9');
    expect(colour('sus2')).toBe('');
  });

  it('is the table the voicing engine plays from', () => {
    // The filter that drops ambiguous answers, the engine that builds the
    // voicing and the exercise that asks about the colour all read this
    // one table, or they would disagree about what a chord may sound.
    for (const quality of CHORD_QUALITIES) {
      const chord = makeChord(0, quality.id);
      expect(tensionIntervals(chord).map((i) => degreeIn(quality, i)), quality.id)
        .toEqual(coloursFor(quality));
    }
  });

  it('knows which basic chord every quality is', () => {
    expect(BASIC_QUALITIES).toHaveLength(18);
    for (const quality of CHORD_QUALITIES) {
      const basic = BASIC_OF[quality.id];
      expect(basic, quality.id).toBeTruthy();
      expect(BASIC_QUALITIES, quality.id).toContain(basic);
      // A basic chord is its own, and every other chord sounds what makes
      // the basic chord that chord — its third or sus, its fifth where the
      // fifth is altered, its seventh or sixth. The plain fifth is not on
      // the list: a 6/9 is a 6 chord with the fifth left out.
      const held = new Set(quality.intervals.map((i) => mod(i, 12)));
      const base = requireChordQuality(basic);
      const essential = base.essential ?? base.intervals.filter((i) => i !== 0 && i !== 7);
      for (const interval of essential) {
        expect(held.has(mod(interval, 12)), `${quality.id} sounds ${basic}'s ${interval}`).toBe(true);
      }
    }
  });
});
