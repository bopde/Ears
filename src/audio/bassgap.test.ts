import { describe, expect, it } from 'vitest';
import {
  BASS_STYLES, progressionBass, type BassChord, type BassNote, type BassStyle,
} from './performer';
import { PROGRESSIONS, realiseProgression } from '../music/progressions';
import { voiceProgression } from '../music/voicing';
import { BASS_GAP, PITCH_CLASSES, REGISTER } from '../music/pitch';
import { mod } from '../lib/util';

/**
 * How far under the voicing each bass note sits.
 *
 * A bass note too close to the bottom of the right hand is not heard under
 * the chord but inside it, and the ear takes whichever of the two was struck
 * most recently as the bass — which is how a root-position chord comes to
 * sound inverted. The root was always placed by a cost that knows this; the
 * fifth was not, and simply took the octave above the root whenever it fitted
 * the register.
 */

/** Every progression's changes, voiced the way the exercises voice them. */
function changesFor(style: 'rootless' | 'spread' | 'close') {
  const out: Array<{ where: string; chords: BassChord[] }> = [];
  for (const def of PROGRESSIONS) {
    for (const tonic of PITCH_CLASSES) {
      const realised = realiseProgression(def, tonic);
      const voicings = voiceProgression(realised.map((r) => r.chord), { style, maxNotes: 5 });
      out.push({
        where: `${def.id}/${tonic}/${style}`,
        chords: realised.map((r, i) => ({
          beats: r.beats,
          rootPc: r.chord.rootPc,
          pcs: r.chord.quality.intervals.map((iv) => mod(r.chord.rootPc + iv, 12)),
          low: voicings[i].notes[0],
        })),
      });
    }
  }
  return out;
}

/** Each bass note beside the chord it is playing under. */
function walk(chords: readonly BassChord[], style: BassStyle) {
  const out: Array<{ note: BassNote; chord: BassChord }> = [];
  let i = 0;
  let beat = 0;
  for (const note of progressionBass(chords, style)) {
    while (i < chords.length - 1 && note.beat >= beat + chords[i].beats) {
      beat += chords[i].beats;
      i += 1;
    }
    out.push({ note, chord: chords[i] });
  }
  return out;
}

describe('the bass keeps its distance from the voicing', () => {
  it('places the fifth by the same rule as the root, not above it by default', () => {
    // A perfect fourth is the least a listener can take as "underneath"; the
    // old rule produced gaps of a minor third under a rootless ii–V–I.
    const tight: string[] = [];
    let octaveChoices = 0;
    for (const style of ['rootless', 'spread', 'close'] as const) {
      for (const { where, chords } of changesFor(style)) {
        for (const { note, chord } of walk(chords, 'root-fifth')) {
          if (note.role !== 'fifth') continue;
          const gap = chord.low - note.midi;
          // Only where an octave choice existed: a fifth pinned against the
          // top or the bottom of the bass register has nowhere else to go.
          const other = note.midi - 12 >= REGISTER.bass.lo || note.midi + 12 <= REGISTER.bass.hi;
          if (other) octaveChoices += 1;
          if (other && gap < 5) tight.push(`${where}: fifth ${note.midi} under ${chord.low} (${gap})`);
        }
      }
    }
    expect(octaveChoices, 'there were octaves to choose between').toBeGreaterThan(100);
    expect(tight.slice(0, 8), `${tight.length} fifths closer than a fourth`).toEqual([]);
  });

  it('never puts any bass note inside the voicing, in any style', () => {
    const clashes: string[] = [];
    for (const style of ['rootless', 'spread', 'close'] as const) {
      for (const { where, chords } of changesFor(style)) {
        for (const bassStyle of BASS_STYLES) {
          for (const { note, chord } of walk(chords, bassStyle)) {
            if (chord.low - note.midi < BASS_GAP.min) {
              clashes.push(`${where}/${bassStyle}: ${note.midi} under ${chord.low}`);
            }
          }
        }
      }
    }
    expect(clashes.slice(0, 8), `${clashes.length} bass notes inside the voicing`).toEqual([]);
  });
});
