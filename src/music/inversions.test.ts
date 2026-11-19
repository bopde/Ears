import { describe, expect, it } from 'vitest';
import {
  INVERSIONS, inversionByIndex, inversionsFor, inversionsOf, requireInversion,
} from './inversions';
import { degreeNumber, memberName } from './degrees';
import { getExerciseType } from '../exercises/registry';
import { defaultSettings } from '../session/settings';
import { makeRng } from '../lib/rng';
import {
  CHORD_QUALITIES, makeChord, requireChordQuality, romanSuffix, slashSymbol,
} from './chords';
import { PROGRESSIONS, romanLabel, romanLine } from './progressions';
import { BASIC_OF } from './degrees';
import { inversionIndex, voiceChord } from './voicing';
import { PITCH_CLASSES, pcName } from './pitch';
import { requireProgression } from './progressions';
import { mod } from '../lib/util';

describe('roman numerals state what is played', () => {
  it('names the basic chord, never the tensions above it', () => {
    for (const progression of PROGRESSIONS) {
      for (const chord of progression.chords) {
        const basic = requireChordQuality(BASIC_OF[chord.quality] ?? chord.quality);
        const label = romanLabel(chord);
        const where = `${progression.id}: ${chord.quality}`;
        expect(label, where).toContain(romanSuffix(basic));
        // A numeral is a function, and no function is named by a 13th.
        // What the voicing added is said beside it, in the row's tag.
        expect(label, `${where} writes an extension`).not.toMatch(/9|11|13|alt/);
        // What makes the chord the kind of chord it is does survive.
        for (const token of ['ø', '°', '♯5', '♭5', 'sus', '∆']) {
          if (basic.symbol.includes(token)) {
            expect(label, `${where} must say ${token}`).toContain(token);
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

  it('writes the blues as sevenths, whatever the voicing sounds', () => {
    // These used to read IV13, ♭II9♯11 and ii9, because the numeral was
    // taken from the chord as written. The chords are still written that
    // way and still sound their colour; the numeral names the function.
    expect(romanLine(requireProgression('blues-opening'))).toContain('IV7');
    expect(romanLine(requireProgression('blues-opening'))).not.toContain('13');
    expect(romanLine(requireProgression('tritone-sub'))).toContain('♭II7');
    expect(romanLine(requireProgression('blues-turnaround'))).toContain('ii7');
    expect(romanLine(requireProgression('so-what'))).toContain('i7');
  });
});

describe('inversions', () => {
  it('never puts a sixth chord on its 6th', () => {
    // Dm6/B is a Bø7 in root position and C6/A is an Am7, note for note.
    // The exercise used to mark those "third inversion" and tell a learner
    // who heard a half-diminished chord that they were wrong.
    for (const id of ['6', 'm6']) {
      const quality = requireChordQuality(id);
      expect(inversionsOf(quality).map((i) => i.id), id).toEqual(['root', '1st', '2nd']);
    }
    // Every other four-note chord keeps all four: a ∆7 over its 7th is a
    // ∆7, however it is voiced.
    for (const quality of CHORD_QUALITIES) {
      if (quality.intervals.length !== 4 || quality.intervals.some((i) => i >= 12)) continue;
      const tones = inversionsOf(quality).map((i) => quality.intervals[i.index]);
      for (const interval of tones) {
        expect(degreeNumber(memberName(quality, interval)), `${quality.id}: ${interval}`)
          .not.toBe(6);
      }
    }
    for (const chord of ['6', 'm6']) {
      const quality = requireChordQuality(chord);
      expect(quality.intervals.length, `${chord} does have four tones`).toBe(4);
    }
  });

  it('asks about no question with a 6th underneath', () => {
    const type = getExerciseType('chord-inversion')!;
    const settings = {
      ...defaultSettings(),
      chordQualities: CHORD_QUALITIES.map((q) => q.id),
    };
    let sixes = 0;
    for (let d = 1; d <= 5; d += 1) {
      for (let seed = 0; seed < 150; seed += 1) {
        const q = type.generate({
          rng: makeRng(seed * 31 + d), difficulty: d, settings, targetConcepts: [],
        });
        if (!q) continue;
        const quality = requireChordQuality(q.conceptIds[1].split(':')[1]);
        if (quality.id === '6' || quality.id === 'm6') sixes += 1;
        const where = `inversion@${d}#${seed} ${quality.id}`;
        // Every answer on the screen, not only the one marked right: an
        // option reading "Am6/F♯" is an option that is true of another
        // chord, whether or not it is the one that sounded.
        for (const option of q.fields[0].options) {
          const interval = quality.intervals[requireInversion(option.id).index];
          expect(interval, `${where}: ${option.id}`).toBeDefined();
          expect(degreeNumber(memberName(quality, interval)), `${where}: ${option.label}`)
            .not.toBe(6);
        }
      }
    }
    expect(sixes, 'sixth chords did come up').toBeGreaterThan(20);
  });

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
