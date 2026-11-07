import { describe, expect, it } from 'vitest';
import {
  PROGRESSIONS, numeralSteps, realiseProgression, requireProgression, rootNames,
} from './progressions';
import {
  CHORD_QUALITIES, chordDegrees, chordRootName, chordSymbol, chordToneNames, makeChord,
  slashSymbol, spellInChord,
} from './chords';
import { voiceChord } from './voicing';
import { SCALES, requireScale, scaleNoteNames, scalePitchClasses } from './scales';
import { INTERVALS, intervalLetterSteps, intervalNoteNames, requireInterval } from './intervals';
import { LETTERS, PITCH_CLASSES, keyName, letterIndexOf, pcName } from './pitch';
import { mod } from '../lib/util';

/** The chord at `index` of a progression, realised in `tonic`. */
const chordAt = (id: string, tonic: number, index: number) =>
  realiseProgression(requireProgression(id), tonic)[index].chord;

describe('a chord is spelled for the key it is in', () => {
  it('counts the letters a numeral sits above the tonic', () => {
    expect(numeralSteps('I')).toBe(0);
    expect(numeralSteps('vii')).toBe(6);
    // The accidental moves the pitch, never the letter.
    expect(numeralSteps('♭II')).toBe(numeralSteps('II'));
    expect(numeralSteps('♯iv')).toBe(numeralSteps('IV'));
    // A secondary function adds both.
    expect(numeralSteps('V/V')).toBe(8);
    expect(numeralSteps('ii/♭VII')).toBe(7);
    expect(numeralSteps('nonsense')).toBeNull();
  });

  it('spells the brief’s examples', () => {
    const spell = (numeral: string, degree: number, tonic: number, minor = false) => {
      const def = {
        ...requireProgression('ii-V-I'),
        tonality: (minor ? 'minor' : 'major') as 'major' | 'minor',
        chords: [{ degree, quality: 'maj', numeral }],
      };
      return rootNames(def, tonic)[0];
    };
    expect(spell('ii', 2, 11), 'ii of B').toBe('C♯');
    expect(spell('iii', 4, 4), 'iii of E').toBe('G♯');
    expect(spell('♭II', 1, 0), '♭II of C').toBe('D♭');
    expect(spell('♭VII', 10, 4), '♭VII of E').toBe('D');
    expect(spell('V/V', 2, 8), 'V/V of A♭').toBe('B♭');
    expect(spell('ii/♭VII', 0, 0), 'ii/♭VII of C').toBe('C');
  });

  it('writes the ii of B as C♯m7, and its notes to match', () => {
    const chord = chordAt('ii-V-I', 11, 0);
    expect(chordSymbol(chord)).toBe('C♯m7');
    const v = voiceChord(chord, { style: 'close', rootPosition: true });
    expect(v.notes.map((m) => spellInChord(chord, m).replace(/\d+$/, '')))
      .toEqual(['C♯', 'E', 'G♯', 'B']);
    expect(chordDegrees(chord, v.notes)).toEqual(['1', '♭3', '5', '♭7']);
  });

  it('writes the iii of E and the vii of D on their own letters', () => {
    expect(chordSymbol(chordAt('iii-VI-ii-V', 4, 0))).toBe('G♯m7');
    // A half-diminished on the leading note of D.
    const def = {
      ...requireProgression('ii-V-I'),
      chords: [{ degree: 11, quality: 'm7b5', numeral: 'vii' }],
    };
    expect(chordSymbol(realiseProgression(def, 2)[0].chord)).toBe('C♯ø7');
  });

  it('writes a tritone sub, a secondary dominant and a borrowed ii', () => {
    expect(chordSymbol(chordAt('tritone-sub', 0, 1))).toBe('D♭9♯11');
    expect(chordSymbol(chordAt('V-of-V', 8, 1))).toBe('B♭7');
    const backdoorII = {
      ...requireProgression('ii-V-I'),
      chords: [{ degree: 0, quality: 'm7', numeral: 'ii/♭VII' }],
    };
    expect(chordSymbol(realiseProgression(backdoorII, 0)[0].chord)).toBe('Cm7');
  });

  it('lets an explicit setting override the key', () => {
    const chord = chordAt('ii-V-I', 11, 0);
    expect(chordSymbol(chord, 'flat'), 'flats only').toBe('D♭m7');
    expect(chordSymbol(chord, 'sharp'), 'sharps only').toBe('C♯m7');
    expect(chordSymbol(chord, 'both'), 'the key decides by default').toBe('C♯m7');
  });

  it('leaves a chord with no key alone', () => {
    // A chord-quality question is in no key; there is nothing to spell it
    // against, so the conventional name stands.
    const bare = makeChord(1, 'm7');
    expect(bare.root).toBeUndefined();
    expect(chordSymbol(bare)).toBe(pcName(1, 'both') + 'm7');
    expect(chordSymbol(bare)).toBe('D♭m7');
  });

  it('falls back rather than writing a double accidental', () => {
    // The ♭II of D♭ is an E double flat. It is written D rather than printed.
    const def = { ...requireProgression('ii-V-I'), chords: [{ degree: 1, quality: 'maj', numeral: '♭II' }] };
    expect(rootNames(def, 1)[0]).toBeUndefined();
    expect(chordSymbol(realiseProgression(def, 1)[0].chord)).toBe('D');
  });

  it('spells every root in every key, or says it cannot', () => {
    let spelled = 0;
    for (const def of PROGRESSIONS) {
      for (const tonic of PITCH_CLASSES) {
        realiseProgression(def, tonic).forEach((r, i) => {
          const name = rootNames(def, tonic)[i];
          if (name === undefined) return;
          spelled += 1;
          // Whatever it is called, it is still the right pitch.
          const letter = letterIndexOf(name);
          expect(letter, `${def.id}/${tonic}: ${name}`).toBeGreaterThanOrEqual(0);
          const natural = [0, 2, 4, 5, 7, 9, 11][letter];
          const shift = name.length > 1 ? (name[1] === '♯' ? 1 : -1) : 0;
          expect(mod(natural + shift, 12), `${def.id}/${tonic} ${name}`).toBe(r.chord.rootPc);
        });
      }
    }
    expect(spelled, 'most roots really are spelled from the key').toBeGreaterThan(1700);
  });
});

describe('a key is named the way a musician writes it', () => {
  it('uses the conventional tonic for each mode', () => {
    expect(PITCH_CLASSES.map((pc) => keyName(pc, 'major')))
      .toEqual(['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B']);
    expect(PITCH_CLASSES.map((pc) => keyName(pc, 'minor')))
      .toEqual(['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'B♭', 'B']);
    // Every one of them is a letter this app will write.
    for (const pc of PITCH_CLASSES) {
      for (const tonality of ['major', 'minor'] as const) {
        expect(LETTERS).toContain(keyName(pc, tonality)[0]);
      }
    }
  });
});

describe('the other places a letter is decided by something', () => {
  it('spells a slash bass that is a chord tone as the chord does', () => {
    const chord = chordAt('ii-V-I', 11, 0);   // C♯m7
    expect(slashSymbol(chord, 8)).toBe('C♯m7/G♯');
    expect(slashSymbol(chord, 1), 'the root needs no slash').toBe('C♯m7');
  });

  it('gives every scale one letter per degree', () => {
    expect(scaleNoteNames(11, requireScale('ionian')))
      .toEqual(['B', 'C♯', 'D♯', 'E', 'F♯', 'G♯', 'A♯']);
    expect(scaleNoteNames(0, requireScale('ionian')))
      .toEqual(['C', 'D', 'E', 'F', 'G', 'A', 'B']);
    expect(scaleNoteNames(0, requireScale('aeolian')))
      .toEqual(['C', 'D', 'E♭', 'F', 'G', 'A♭', 'B♭']);
    // Across the library: a scale is either spelled one letter per degree or
    // is exactly the plain table. Never a line half one and half the other,
    // which is what a per-note fallback would produce.
    let lettered = 0;
    for (const scale of SCALES) {
      for (const tonic of PITCH_CLASSES) {
        const names = scaleNoteNames(tonic, scale);
        expect(names.length, `${scale.id}/${tonic}`).toBe(scale.degrees.length);
        const letters = new Set(names.map((n) => n[0]));
        if (letters.size === names.length) {
          lettered += 1;
        } else {
          expect(names, `${scale.id}/${tonic} is neither spelled nor plain`)
            .toEqual(scalePitchClasses(tonic, scale).map((pc) => pcName(pc, 'both')));
        }
      }
    }
    expect(lettered, 'most scales come out one letter per degree').toBeGreaterThan(80);
  });

  it('spells a chord’s own tones on the letters its degrees name', () => {
    // In B: the 3rd is a D♯, not the E♭ a pitch-class table reaches for.
    expect(chordToneNames(makeChord(11, 'maj'))).toEqual(['B', 'D♯', 'F♯']);
    expect(chordToneNames(makeChord(11, 'm7'))).toEqual(['B', 'D', 'F♯', 'A']);
    expect(chordToneNames(makeChord(11, 'maj7'))).toEqual(['B', 'D♯', 'F♯', 'A♯']);
    expect(chordToneNames(makeChord(0, 'dim7'))).toEqual(['C', 'E♭', 'G♭', 'A']);
    // Every chord in every key starts on its own root, and names as many
    // notes as the quality has. This is what caught the tones being stacked
    // from middle C rather than from the chord.
    for (const quality of CHORD_QUALITIES) {
      for (const rootPc of PITCH_CLASSES) {
        const chord = makeChord(rootPc, quality.id);
        const names = chordToneNames(chord);
        expect(names.length, `${quality.id}/${rootPc}`).toBe(quality.intervals.length);
        expect(names[0], `${quality.id}/${rootPc} starts on its root`)
          .toBe(chordRootName(chord));
      }
    }
  });

  it('spells an interval’s upper note by its number', () => {
    const b3 = 59;  // B3
    expect(intervalNoteNames(requireInterval('M3'), b3, b3 + 4).upper, 'M3 above B').toBe('D♯4');
    expect(intervalNoteNames(requireInterval('m3'), b3, b3 + 3).upper, 'm3 above B').toBe('D4');
    expect(intervalNoteNames(requireInterval('P5'), b3, b3 + 7).upper, 'P5 above B').toBe('F♯4');
    expect(intervalNoteNames(requireInterval('M3'), b3, b3 + 4).lower).toBe('B3');
    // An explicit setting still wins.
    expect(intervalNoteNames(requireInterval('M3'), b3, b3 + 4, 'flat').upper).toBe('E♭4');
  });

  it('reads the letter span off each interval’s short name', () => {
    for (const interval of INTERVALS) {
      const steps = intervalLetterSteps(interval);
      expect(steps, interval.id).not.toBeNull();
      expect(steps!, interval.id).toBeGreaterThanOrEqual(0);
      // A letter span never shrinks as the interval widens.
      expect(steps!, interval.id).toBeLessThanOrEqual(Math.ceil(interval.semitones / 12) * 7 + 7);
    }
    expect(intervalLetterSteps(requireInterval('P1'))).toBe(0);
    expect(intervalLetterSteps(requireInterval('P8'))).toBe(7);
    expect(intervalLetterSteps(requireInterval('M3'))).toBe(2);
    expect(intervalLetterSteps(requireInterval('M13'))).toBe(12);
  });
});
