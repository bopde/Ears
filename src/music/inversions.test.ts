import { describe, expect, it } from 'vitest';
import {
  INVERSIONS, inversionByIndex, inversionsFor, requireInversion,
} from './inversions';
import {
  CHORD_QUALITIES, makeChord, requireChordQuality, romanSuffix, slashSymbol,
} from './chords';
import { PROGRESSIONS, romanLabel, romanLine } from './progressions';
import { inversionIndex, voiceChord } from './voicing';
import { PITCH_CLASSES, pcName } from './pitch';
import { requireProgression } from './progressions';
import { mod } from '../lib/util';

describe('roman numerals state what is played', () => {
  it('never writes a seventh where an extension sounds', () => {
    for (const progression of PROGRESSIONS) {
      for (const chord of progression.chords) {
        const quality = requireChordQuality(chord.quality);
        const label = romanLabel(chord);
        expect(label, `${progression.id}: ${chord.quality}`).toContain(romanSuffix(quality));
        // Anything that distinguishes the chord has to survive into the label.
        for (const token of ['13', '11', '9', 'alt', 'ø', '°', '♯5', '♭5', 'sus']) {
          if (quality.symbol.includes(token)) {
            expect(label, `${progression.id}: ${chord.quality} must say ${token}`).toContain(token);
          }
        }
      }
    }
  });

  it('says minor once, not twice', () => {
    // A lowercase numeral already means minor; iim7 would be saying it again.
    for (const progression of PROGRESSIONS) {
      for (const chord of progression.chords) {
        const quality = requireChordQuality(chord.quality);
        if (quality.family !== 'minor') continue;
        expect(romanLabel(chord), `${progression.id}`).not.toMatch(/[iv]m/);
      }
    }
  });

  it('puts a secondary function after the numeral, not after the slash', () => {
    const modulation = requireProgression('modulation-to-IV');
    expect(romanLine(modulation)).toContain('ii7/IV');
    expect(romanLine(modulation)).not.toContain('ii/IV7');
  });

  it('corrects the labels that used to understate the chord', () => {
    // The ii-V-I's V is a plain dominant 7th, and reads as one. It sounds a
    // 9th in every voicing on the cheat sheet — so do the ii and the I, and
    // the symbol names the chord rather than the voicing.
    expect(romanLine(requireProgression('ii-V-I'))).toBe('ii7  –  V7  –  I∆7');
    expect(romanLine(requireProgression('blues-opening'))).toContain('IV13');
    expect(romanLine(requireProgression('blues-opening'))).not.toContain('IV7');
    expect(romanLine(requireProgression('tritone-sub'))).toContain('♭II9♯11');
    expect(romanLine(requireProgression('blues-turnaround'))).toContain('ii9');
  });
});

describe('inversions', () => {
  it('only offers the ones a chord of that size has', () => {
    expect(inversionsFor(3).map((i) => i.id)).toEqual(['root', '1st', '2nd']);
    expect(inversionsFor(4).map((i) => i.id)).toEqual(['root', '1st', '2nd', '3rd']);
    expect(inversionByIndex(1)?.id).toBe('1st');
    expect(requireInversion('3rd').index).toBe(3);
    expect(() => requireInversion('nope')).toThrow();
  });

  it('puts the named tone in the bass, for every chord in every key', () => {
    const invertible = CHORD_QUALITIES.filter(
      (q) => q.intervals.length >= 3 && q.intervals.length <= 4 && q.intervals.every((i) => i < 12),
    );
    expect(invertible.length, 'there are triads and sevenths to work with').toBeGreaterThan(10);

    for (const quality of invertible) {
      for (const inversion of inversionsFor(quality.intervals.length)) {
        for (const root of PITCH_CLASSES) {
          const chord = makeChord(root, quality.id);
          const bassPc = mod(root + quality.intervals[inversion.index], 12);
          const voicing = voiceChord(chord, {
            style: 'close',
            bass: true,
            bottomPc: bassPc,
            bassPc,
            maxNotes: 4,
          });
          const where = `${quality.id} ${inversion.id} on ${root}`;
          expect(mod(voicing.all[0], 12), `${where}: bass note`).toBe(bassPc);
          expect(inversionIndex(chord, voicing), `${where}: read back`).toBe(inversion.index);
        }
      }
    }
  });

  it('writes an inversion as a slash chord and root position plainly', () => {
    const chord = makeChord(0, 'maj7');
    expect(slashSymbol(chord, 0)).toBe('C∆7');
    expect(slashSymbol(chord, 4)).toBe('C∆7/E');
    expect(slashSymbol(chord, 7)).toBe('C∆7/G');
    expect(slashSymbol(chord, 11)).toBe('C∆7/B');
  });

  it('describes which tone each inversion puts underneath', () => {
    for (const inversion of INVERSIONS) {
      expect(inversion.bassTone.length, inversion.id).toBeGreaterThan(0);
      expect(inversion.blurb, inversion.id).toBeTruthy();
      expect(pcName(0)).toBe('C'); // sanity: spelling helper still behaves
    }
  });
});
