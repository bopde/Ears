import { describe, expect, it } from 'vitest';
import {
  CHORD_QUALITIES, chordDegrees, chordRootName, chordToneNames, degreeName, makeChord,
  spellInChord,
} from './chords';
import { LETTERS, PITCH_CLASSES, midiName, pcName, pcOf, spellOnLetter } from './pitch';
import { availablePcs, voiceChord, VOICING_STYLES } from './voicing';
import { mod } from '../lib/util';

/** The MIDI note `semitones` above a root in the 4th octave. */
const above = (rootPc: number, semitones: number) => 60 + rootPc + semitones;

describe('a note is named for what it is doing in the chord', () => {
  it('calls a seventh chord’s outside notes tensions, not displaced chord tones', () => {
    // Over a dominant 7th the stack keeps going past the seventh, so 9
    // semitones up is a 13th. Read off the plain table it came out "6", which
    // says the chord has a sixth in it — and a 7♭9 with a 6th in it is not a
    // chord anyone plays.
    const f7b9 = makeChord(5, '7b9');
    expect(chordDegrees(f7b9, [above(5, 9)])).toEqual(['13']);
    expect(chordDegrees(f7b9, [above(5, 5)])).toEqual(['11']);
    expect(chordDegrees(f7b9, [above(5, 3)])).toEqual(['♯9']);
    expect(chordDegrees(f7b9, [above(5, 8)])).toEqual(['♭13']);
    // Its own tones keep the quality's spelling: the ♭9 is listed, not a tension.
    expect(chordDegrees(f7b9, [above(5, 1)])).toEqual(['♭9']);
    expect(chordDegrees(f7b9, [above(5, 10)])).toEqual(['♭7']);
  });

  it('calls nine semitones a 6th where there is no seventh under it', () => {
    // A triad with an A on top is a C6, not a C13 with most of the chord
    // missing — so that one keeps its plain name. The rest of what sits
    // above a triad takes the compound name it is written with: a C with a
    // D added is Cadd9, not Cadd2, and the F and F♯ follow it.
    const c6 = makeChord(0, '6');
    expect(chordDegrees(c6, [above(0, 9)])).toEqual(['6']);
    expect(chordDegrees(c6, [above(0, 2)])).toEqual(['9']);
    expect(chordDegrees(c6, [above(0, 5)])).toEqual(['11']);
    const cmaj = makeChord(0, 'maj');
    expect(chordDegrees(cmaj, [above(0, 9)])).toEqual(['6']);
    expect(chordDegrees(cmaj, [above(0, 5)])).toEqual(['11']);
    // And no name may reuse a member number the chord is sounding: the F♯
    // is a ♯11 beside a natural 5, the E♭ a ♯9 beside a major 3rd.
    expect(chordDegrees(cmaj, [above(0, 6)])).toEqual(['♯11']);
    expect(chordDegrees(cmaj, [above(0, 3)])).toEqual(['♯9']);
    expect(chordDegrees(cmaj, [above(0, 8)])).toEqual(['♭13']);
  });

  it('treats a diminished seventh as having one, because it does', () => {
    // Its 9 semitones are a seventh spelled as a sixth, which is the one case
    // the interval alone cannot settle.
    const cdim7 = makeChord(0, 'dim7');
    expect(chordDegrees(cdim7, [above(0, 5)])).toEqual(['11']);
    expect(chordDegrees(cdim7, [above(0, 2)])).toEqual(['9']);
  });

  it('names every tension a voicing can actually add', () => {
    // No note the engine may play should come back as "?", and none should
    // be named by the plain table when the chord has a seventch under it.
    for (const quality of CHORD_QUALITIES) {
      for (const rootPc of PITCH_CLASSES) {
        const chord = makeChord(rootPc, quality.id);
        for (const pc of availablePcs(chord, true)) {
          const [name] = chordDegrees(chord, [60 + pc]);
          expect(name, `${quality.id} on ${rootPc}, pc ${pc}`).not.toBe('?');
        }
      }
    }
  });
});

describe('a note is spelled the way its degree is written', () => {
  it('spells a ♭9 as the letter a 9th up, flattened', () => {
    // G7♭9's ♭9 is an A♭. A pitch-class table reaches for G♯, which is a
    // different letter from the one the degree names.
    const g7b9 = makeChord(7, '7b9');
    expect(spellInChord(g7b9, above(7, 1))).toBe('A♭4');
    // And a ♯9 is the letter a 9th up, sharpened — where the old speller,
    // which only knew the pitch class, reached for the flat spelling and so
    // printed "E♭" beside a degree that says ♯9.
    const c7s9 = makeChord(0, '7#9');
    expect(chordDegrees(c7s9, [above(0, 3)])).toEqual(['♯9']);
    expect(spellInChord(c7s9, above(0, 3))).toBe('D♯4');
    expect(midiName(above(0, 3))).toBe('E♭4');
    // On a root whose own letter pushes it somewhere unreadable, the plain
    // enharmonic wins: the ♭9 of E♭ is an F♭, so it is written E.
    const eb7b9 = makeChord(3, '7b9');
    expect(spellInChord(eb7b9, above(3, 1))).toBe('E4');
  });

  it('calls a diminished seventh\u2019s top note a seventh, and writes it an A', () => {
    // The chord is a stack of minor thirds and its fourth tone is the
    // fourth of them, so the name is 𝄫7 — read as a 6th it spells on the
    // wrong letter, which is why B°7 used to print B D F G♯ when its
    // seventh is an A♭. The spelling still falls back where the name asks
    // for something nobody prints: C°7's 𝄫7 is a B𝄫, so it is written A.
    const cdim7 = makeChord(0, 'dim7');
    expect(chordDegrees(cdim7, [above(0, 9)])).toEqual(['\ud834\udd2b7']);
    expect(spellInChord(cdim7, above(0, 9))).toBe('A4');
    expect(chordToneNames(makeChord(11, 'dim7'))).toEqual(['B', 'D', 'F', 'A\u266d']);
    expect(chordToneNames(makeChord(6, 'dim7'))).toEqual(['F\u266f', 'A', 'C', 'E\u266d']);
    expect(spellInChord(cdim7, above(0, 3))).toBe('E♭4');
    expect(spellInChord(cdim7, above(0, 6))).toBe('G♭4');
  });

  it('refuses the four names that disagree with their octave number', () => {
    // B♯3 sounds a semitone above B3 and is written a letter below C4, so a
    // learner reading it plays the wrong octave. Same for the other three.
    const letters = LETTERS.map((l) => LETTERS.indexOf(l));
    const produced = new Set<string>();
    for (const pc of PITCH_CLASSES) {
      for (const i of letters) {
        const name = spellOnLetter(pc, i);
        if (name) produced.add(name);
      }
    }
    for (const refused of ['F♭', 'C♭', 'E♯', 'B♯']) {
      expect(produced, refused).not.toContain(refused);
    }
    // And it really does produce the ordinary ones.
    for (const wanted of ['C', 'A♭', 'F♯', 'B♭', 'D♯']) {
      expect(produced, wanted).toContain(wanted);
    }
  });

  it('agrees with the degree beside it, everywhere the chord can be voiced', () => {
    // The point of the whole exercise: a reveal that says "♭9" beside a note
    // whose letter is a 2nd up has told the reader two different things.
    const mismatches: string[] = [];
    let checked = 0;
    let fellBack = 0;
    for (const quality of CHORD_QUALITIES) {
      for (const rootPc of [0, 3, 6, 7, 10]) {
        const chord = makeChord(rootPc, quality.id);
        for (const style of VOICING_STYLES) {
          const v = voiceChord(chord, { style, tensions: true, maxNotes: 5, bass: true });
          for (const midi of v.all) {
            checked += 1;
            const [degree] = chordDegrees(chord, [midi]);
            const number = Number(degree.replace(/[^0-9]/g, ''));
            // The root's own letter, as the chord is written: a chord the
            // conventional name cannot spell is printed from the other side,
            // and its degrees are counted from there.
            const rootLetter =
              LETTERS.indexOf(chordRootName(chord)[0] as typeof LETTERS[number]);
            const wanted = spellOnLetter(pcOf(midi), rootLetter + number - 1);
            const got = spellInChord(chord, midi).replace(/-?\d+$/, '');
            if (wanted === null) {
              // The fallback fired; it must still name the right pitch.
              fellBack += 1;
              expect(pcName(pcOf(midi)), `${quality.id}/${rootPc} fallback`).toBe(got);
            } else if (wanted !== got) {
              mismatches.push(`${quality.id}/${rootPc}/${style}: ${degree} spelled ${got}, wanted ${wanted}`);
            }
          }
        }
      }
    }
    expect(mismatches.slice(0, 8), `${mismatches.length} of ${checked}`).toEqual([]);
    expect(checked).toBeGreaterThan(1000);
    // Non-vacuous: the unreadable cases really do come up and are handled.
    expect(fellBack, 'the enharmonic fallback is reachable').toBeGreaterThan(0);
  });

  it('keeps the octave number honest', () => {
    for (const quality of CHORD_QUALITIES) {
      const chord = makeChord(11, quality.id);
      const v = voiceChord(chord, { style: 'spread', tensions: true, maxNotes: 5 });
      for (const midi of v.notes) {
        const name = spellInChord(chord, midi);
        const octave = Number(name.replace(/[^-\d]/g, ''));
        expect(octave, `${quality.id} ${name}`).toBe(Math.floor(midi / 12) - 1);
      }
    }
    void degreeName;
    void mod;
  });
});
