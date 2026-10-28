import { describe, expect, it } from 'vitest';
import {
  BASS_CEILING_HZ, BASS_PARTIALS, BASS_TILT, bassFilterGain, bassPartials,
} from './instruments';
import { REGISTER, midiToFreq } from '../music/pitch';

/**
 * Whether the bass can be heard on the speakers people actually use.
 *
 * The bass register is MIDI 33 to 50 — 55 Hz to 147 Hz. A phone's speaker
 * radiates almost nothing below about 500 Hz and a modest laptop gives up
 * around 200, so none of these fundamentals reach the listener. What reaches
 * them is the harmonics, and the ear reconstructs the root from those. The
 * question this file settles is whether there are enough of them, high
 * enough, for that to work — which is a property of the partial series rather
 * than of any rendered waveform, and so can be checked without audio.
 *
 * The model was calibrated against real renders through Chromium's Web Audio:
 * it is pessimistic by a few dB, because it covers the sustained tone and not
 * the attack, which carries its own high-frequency energy. A design that
 * passes here was measured to sit within about 3 dB of the chord on a phone.
 */

interface Partial {
  hz: number;
  amplitude: number;
}

/**
 * Small speakers, as cascaded high-passes. Each is roughly where that class
 * of device stops moving air; the orders approximate how steeply they fall.
 */
const SPEAKERS = {
  laptop: { hz: 200, order: 2 },
  phone: { hz: 500, order: 3 },
} as const;

/** Magnitude of one second-order high-pass stage. */
function highpassGain(hz: number, cutoff: number, order: number): number {
  const r = hz / cutoff;
  return (r * r / Math.hypot(1 - r * r, r / 0.707)) ** order;
}

/** How much of a voice's energy survives a speaker, in dB. */
function survival(partials: readonly Partial[], speaker: { hz: number; order: number }): number {
  const energy = (gain: (p: Partial) => number) =>
    Math.sqrt(partials.reduce((sum, p) => sum + (p.amplitude * gain(p)) ** 2, 0));
  const kept = energy((p) => highpassGain(p.hz, speaker.hz, speaker.order));
  const total = energy(() => 1);
  return 20 * Math.log10(Math.max(kept, 1e-12) / Math.max(total, 1e-12));
}

/** Every note the bass can be asked to play. */
const REGISTER_NOTES = Array.from(
  { length: REGISTER.bass.hi - REGISTER.bass.lo + 1 },
  (_, i) => REGISTER.bass.lo + i,
);

/**
 * The bass as it was before this was measured: a sine, a little triangle, and
 * a lowpass at 3.2 times the fundamental. Kept here so the test can show it
 * is measuring something real rather than asserting a number that any design
 * would meet.
 */
function formerBassPartials(midi: number): Partial[] {
  const f = midiToFreq(midi);
  const cutoff = Math.min(Math.max(f * 3.2, 150), 900);
  const triangle = (h: number) => (h % 2 === 1 ? 8 / Math.PI ** 2 / h ** 2 : 0);
  const out: Partial[] = [];
  for (let h = 1; h <= BASS_PARTIALS; h++) {
    const amplitude = (h === 1 ? 1 : 0) + 0.5 * triangle(h) + (h % 2 === 0 ? 0.1 * triangle(h / 2) : 0);
    if (amplitude > 0) out.push({ hz: f * h, amplitude: amplitude * bassFilterGain(f * h, cutoff) });
  }
  return out;
}

describe('the bass reaches a small speaker', () => {
  it('runs its harmonics up to a frequency, not up to a count', () => {
    // The mistake this guards against: six harmonics is plenty for the top of
    // the register and useless at the bottom, because six harmonics of 55 Hz
    // still only reach 330 Hz — under every speaker corner that matters.
    const lowest = midiToFreq(REGISTER.bass.lo);
    expect(lowest * BASS_PARTIALS, 'the series clears the ceiling on the lowest note')
      .toBeGreaterThanOrEqual(BASS_CEILING_HZ);
    expect(BASS_CEILING_HZ, 'the ceiling clears a phone speaker')
      .toBeGreaterThan(SPEAKERS.phone.hz * 2);
  });

  it('puts real energy above a phone speaker on every note it can play', () => {
    const scores = REGISTER_NOTES.map((midi) => ({
      midi, db: survival(bassPartials(midi), SPEAKERS.phone),
    }));
    const worst = scores.reduce((a, b) => (b.db < a.db ? b : a));
    expect(worst.db, `MIDI ${worst.midi} is the quietest note on a phone`).toBeGreaterThan(-14);
  });

  it('and above a laptop speaker', () => {
    const scores = REGISTER_NOTES.map((midi) => ({
      midi, db: survival(bassPartials(midi), SPEAKERS.laptop),
    }));
    const worst = scores.reduce((a, b) => (b.db < a.db ? b : a));
    expect(worst.db, `MIDI ${worst.midi} is the quietest note on a laptop`).toBeGreaterThan(-8);
  });

  it('is as audible at the bottom of the register as at the top', () => {
    // Evenness matters as much as level. Root motion is an interval between
    // two notes, and a bass that fades as it descends makes the interval
    // harder to hear than a bass that is quiet but consistent.
    for (const speaker of Object.values(SPEAKERS)) {
      const dbs = REGISTER_NOTES.map((midi) => survival(bassPartials(midi), speaker));
      expect(Math.max(...dbs) - Math.min(...dbs), `spread at ${speaker.hz} Hz`).toBeLessThan(6);
    }
  });

  it('measures something the previous design failed', () => {
    // Before this, the lowest note lost 69 dB through a phone and the highest
    // 40 — not quiet, absent, and unevenly so.
    const former = REGISTER_NOTES.map((midi) => survival(formerBassPartials(midi), SPEAKERS.phone));
    const now = REGISTER_NOTES.map((midi) => survival(bassPartials(midi), SPEAKERS.phone));
    expect(Math.max(...former), 'its best note was worse than this design’s worst')
      .toBeLessThan(Math.min(...now));
    expect(Math.min(...now) - Math.max(...former), 'the improvement, in dB').toBeGreaterThan(25);
    expect(Math.max(...former) - Math.min(...former), 'and it was uneven').toBeGreaterThan(20);
  });

  it('describes the tone the instrument actually builds', () => {
    for (const midi of [REGISTER.bass.lo, REGISTER.bass.hi]) {
      const parts = bassPartials(midi);
      expect(parts.length).toBe(BASS_PARTIALS);
      const f = midiToFreq(midi);
      parts.forEach((p, i) => {
        expect(p.hz, 'partials are exact multiples, or the ear hears no root').toBeCloseTo(f * (i + 1), 6);
      });
      // Falling, and rolled off rather than cut: the filter does the trimming.
      for (let i = 1; i < parts.length; i++) {
        expect(parts[i].amplitude, `partial ${i + 1} of ${midi}`).toBeLessThan(parts[i - 1].amplitude);
      }
      expect(parts[0].amplitude).toBeCloseTo(bassFilterGain(f), 6);
    }
    expect(BASS_TILT, 'brighter than a sawtooth, which would be 1').toBeLessThan(1);
    expect(bassFilterGain(BASS_CEILING_HZ * 4), 'well past the ceiling is gone').toBeLessThan(0.1);
  });
});
