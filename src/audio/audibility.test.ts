import { describe, expect, it } from 'vitest';
import {
  BASS_CEILING_HZ, BASS_CLOSE_TAU, BASS_FLOOR_HZ, BASS_LEVEL, BASS_PARTIALS, BASS_SUSTAIN_RATIO,
  BASS_TILT, bassAttackHz, bassFilterGain, bassPartials, bassSustainHz,
} from './instruments';
import { REGISTER, midiToFreq } from '../music/pitch';

/**
 * Whether the bass can be heard, and whether it is worth hearing.
 *
 * Its register is MIDI 33 to 50 — 55 Hz to 147 Hz. A phone's speaker radiates
 * almost nothing below about 500 Hz and a modest laptop gives up around 200,
 * so none of these fundamentals reach the listener. What reaches them is the
 * harmonics, and the ear reconstructs the root from those.
 *
 * There are three ways to get this wrong and this file guards all of them.
 * Too few harmonics and the bass vanishes on the devices people use. Too many,
 * or too strong, and partials a fundamental apart crowd inside one critical
 * band and beat against each other, which is heard as a buzz rather than as a
 * note. And hold them all in fixed proportion for the length of the note and
 * the result is a sawtooth: a plucked string loses its upper partials while
 * the fundamental rings on, so the filter has to close.
 *
 * All three are properties of the partial series and the filter rather than of
 * a rendered waveform, so none needs audio to check. Where the bass *sits* —
 * how far under the comping — is a different question, settled by a render in
 * mix.test.ts, because it depends on what else is playing.
 *
 * The figures were calibrated against renders through Chromium's Web Audio.
 */

interface Partial {
  hz: number;
  amplitude: number;
}

/**
 * Small speakers, and the least each note must gain over the old design.
 *
 * A phone gains more because it reproduced none of the old fundamentals; a
 * laptop reaches 200 Hz, so the top of the bass register was already partly
 * getting through and has less room to improve.
 */
const SPEAKERS = {
  laptop: { hz: 200, order: 2, leastGain: 6 },
  phone: { hz: 500, order: 3, leastGain: 20 },
} as const;

const REGISTER_NOTES = Array.from(
  { length: REGISTER.bass.hi - REGISTER.bass.lo + 1 },
  (_, i) => REGISTER.bass.lo + i,
);

/** The quietest a bass note is ever struck: the passing notes of a walking line. */
const SOFTEST = 0.6;

/** Magnitude of one second-order high-pass stage. */
function highpassGain(hz: number, cutoff: number, order: number): number {
  const r = hz / cutoff;
  return (r * r / Math.hypot(1 - r * r, r / 0.707)) ** order;
}

/**
 * K-weighting (ITU-R BS.1770): how loud a frequency is at a normal listening
 * level, as a gain.
 *
 * This replaced A-weighting, and the swap is the whole reason the level
 * moved. A-weighting is a 40-phon curve — the ear at a whisper — and it
 * discounts 55 Hz by nearly 29 dB and 147 Hz by 14. Setting the bass against
 * the comping through it made a bass that measured 13 dB down sound level
 * with the piano on headphones, because at any real listening level those
 * fundamentals are plainly audible. K-weighting discounts the same two by
 * 3.4 dB and 0.5, and is what broadcast loudness is measured with.
 *
 * Evaluated as the magnitude of the standard's two biquads at 48 kHz.
 */
function earGain(hz: number): number {
  const stages: Array<[number[], number[]]> = [
    // High-frequency shelf, then a high-pass that takes out the subsonic.
    [[1.53512485958697, -2.69169618940638, 1.19839281085285], [1, -1.69065929318241, 0.73248077421585]],
    [[1, -2, 1], [1, -1.99004745483398, 0.99007225036621]],
  ];
  const w = (2 * Math.PI * hz) / 48000;
  const part = (c: number[]) => {
    const re = c[0] + c[1] * Math.cos(w) + c[2] * Math.cos(2 * w);
    const im = -(c[1] * Math.sin(w) + c[2] * Math.sin(2 * w));
    return Math.hypot(re, im);
  };
  return stages.reduce((gain, [b, a]) => gain * (part(b) / part(a)), 1);
}

/**
 * How much of a voice a listener actually receives, in absolute terms.
 *
 * Weighted by the ear and by the speaker, and *not* divided by the voice's own
 * total energy. An earlier version of this file measured that ratio instead,
 * which was a mistake worth recording: the denominator is dominated by a
 * fundamental nobody can hear, so the ratio rewarded brightness for its own
 * sake, and the design that scored best on it was the one that buzzed.
 */
function audible(
  partials: readonly Partial[],
  speaker: { hz: number; order: number },
): number {
  return Math.sqrt(partials.reduce(
    (sum, p) => sum + (p.amplitude * earGain(p.hz) * highpassGain(p.hz, speaker.hz, speaker.order)) ** 2,
    0,
  ));
}

const dbBetween = (a: number, b: number) => 20 * Math.log10(Math.max(a, 1e-12) / Math.max(b, 1e-12));

/**
 * Sensory roughness, by Sethares' form of the Plomp-Levelt curve.
 *
 * Every pair of partials closer together than a critical band contributes;
 * the sum is what a buzz is. Normalised, so it describes the tone rather than
 * the level — turning the bass down does not make it less rough.
 */
function roughness(partials: readonly Partial[]): number {
  const total = Math.sqrt(partials.reduce((s, p) => s + p.amplitude ** 2, 0)) || 1;
  const n = partials.map((p) => ({ hz: p.hz, a: p.amplitude / total }));
  let sum = 0;
  for (let i = 0; i < n.length; i++) {
    for (let j = i + 1; j < n.length; j++) {
      const [lo, hi] = n[i].hz < n[j].hz ? [n[i], n[j]] : [n[j], n[i]];
      const s = 0.24 / (0.0207 * lo.hz + 18.96);
      const gap = hi.hz - lo.hz;
      sum += lo.a * hi.a * (Math.exp(-3.5 * s * gap) - Math.exp(-5.75 * s * gap));
    }
  }
  return sum;
}

/**
 * The bass as it shipped before any of this: a sine, a little triangle, and a
 * lowpass at 3.2 times the fundamental. The baseline everything is measured
 * against, because it is the one known to be inaudible on a phone.
 */
function formerBassPartials(midi: number): Partial[] {
  const f = midiToFreq(midi);
  const cutoff = Math.min(Math.max(f * 3.2, 150), 900);
  const triangle = (h: number) => (h % 2 === 1 ? 8 / Math.PI ** 2 / h ** 2 : 0);
  const out: Partial[] = [];
  for (let h = 1; h <= BASS_PARTIALS; h++) {
    const a = (h === 1 ? 1 : 0) + 0.5 * triangle(h) + (h % 2 === 0 ? 0.1 * triangle(h / 2) : 0);
    if (a > 0) out.push({ hz: f * h, amplitude: a * bassFilterGain(f * h, cutoff) * 0.46 });
  }
  return out;
}

/** How long the lowpass stays above `hz` after the attack, in seconds. */
function secondsAbove(midi: number, hz: number, velocity = SOFTEST): number {
  const from = bassAttackHz(midi, velocity);
  const to = bassSustainHz(midi);
  if (to >= hz) return Infinity;
  if (from <= hz) return 0;
  return BASS_CLOSE_TAU * Math.log((from - to) / (hz - to));
}

describe('the bass reaches a small speaker', () => {
  it('runs its harmonics up to a frequency, not up to a count', () => {
    // Six harmonics is plenty for the top of the register and useless at the
    // bottom, because six harmonics of 55 Hz still only reach 330 Hz.
    const lowest = midiToFreq(REGISTER.bass.lo);
    expect(lowest * BASS_PARTIALS, 'the series fills the attack on the lowest note')
      .toBeGreaterThanOrEqual(bassAttackHz(REGISTER.bass.lo, SOFTEST));
    expect(bassAttackHz(REGISTER.bass.lo, SOFTEST), 'the attack clears a phone speaker')
      .toBeGreaterThan(SPEAKERS.phone.hz * 2);
  });

  it('is far more audible than the design it replaced, on every note', () => {
    for (const speaker of Object.values(SPEAKERS)) {
      const gains = REGISTER_NOTES.map((midi) => ({
        midi,
        db: dbBetween(
          audible(bassPartials(midi, 'attack', SOFTEST), speaker),
          audible(formerBassPartials(midi), speaker),
        ),
      }));
      const worst = gains.reduce((a, b) => (b.db < a.db ? b : a));
      expect(worst.db, `MIDI ${worst.midi} gains least at ${speaker.hz} Hz`)
        .toBeGreaterThan(speaker.leastGain);
    }
  });

  it('does not lean on the register, the way the old one did', () => {
    // A bass that fades as it descends is hard to follow, because root motion
    // is an interval. The spread here is inherent to a fixed tone — the old
    // design had about the same — so this guards against making it worse.
    for (const speaker of Object.values(SPEAKERS)) {
      const levels = REGISTER_NOTES.map((midi) => audible(bassPartials(midi, 'attack', SOFTEST), speaker));
      const spread = dbBetween(Math.max(...levels), Math.min(...levels));
      const former = REGISTER_NOTES.map((midi) => audible(formerBassPartials(midi), speaker));
      expect(spread, `spread at ${speaker.hz} Hz`).toBeLessThan(15);
      expect(spread, 'no worse than it used to be')
        .toBeLessThanOrEqual(dbBetween(Math.max(...former), Math.min(...former)) + 1);
    }
  });

  it('holds the attack open past a phone speaker long enough to place the note', () => {
    // This is the trade the closing filter makes: the sustain is well below
    // what a phone can radiate, so everything a phone listener gets about
    // which note it is arrives in the first fraction of a second. A walking
    // quarter note at 120 lasts half a second, so a tenth of it is the least
    // that can carry a pitch.
    for (const midi of REGISTER_NOTES) {
      expect(secondsAbove(midi, SPEAKERS.phone.hz), `MIDI ${midi} above a phone's corner`)
        .toBeGreaterThan(0.1);
      expect(secondsAbove(midi, SPEAKERS.laptop.hz), `MIDI ${midi} above a laptop's corner`)
        .toBeGreaterThan(0.25);
    }
  });
});

describe('and is worth listening to when it gets there', () => {
  it('closes over the note, which is what a plucked string does', () => {
    // A fixed cutoff holds every harmonic in fixed proportion for the whole
    // note, which is the definition of a sawtooth and what this sounded like.
    for (const midi of REGISTER_NOTES) {
      expect(bassSustainHz(midi), `MIDI ${midi} settles below where it starts`)
        .toBeLessThan(bassAttackHz(midi, SOFTEST) / 2);
      const attack = bassPartials(midi, 'attack', SOFTEST);
      const sustain = bassPartials(midi, 'sustain');
      // The upper partials have to actually go, not merely dip.
      const top = (ps: Partial[]) => Math.sqrt(ps.slice(7).reduce((s, p) => s + p.amplitude ** 2, 0));
      expect(dbBetween(top(attack), top(sustain)), `MIDI ${midi} loses its upper partials`)
        .toBeGreaterThan(12);
      // While the fundamental rings on. It is not merely kept: the filter's
      // own resonance walks down onto it as the cutoff falls, so it ends the
      // note very slightly louder than it started.
      expect(sustain[0].amplitude, `the fundamental of ${midi} rings on`)
        .toBeGreaterThanOrEqual(attack[0].amplitude);
    }
    // It settles within a few hundred milliseconds rather than a few seconds.
    expect(BASS_CLOSE_TAU).toBeLessThan(0.25);
  });

  it('tracks the key rather than settling on one frequency', () => {
    // A fixed settle leaves the top of the register dull and the bottom still
    // buzzing; the ratio keeps the same handful of harmonics on every note.
    const harmonics = REGISTER_NOTES.map((midi) => bassSustainHz(midi) / midiToFreq(midi));
    expect(Math.max(...harmonics) - Math.min(...harmonics), 'the same harmonic, note to note')
      .toBeLessThan(BASS_SUSTAIN_RATIO * 0.6);
    expect(bassSustainHz(REGISTER.bass.lo)).toBe(BASS_FLOOR_HZ);
    expect(bassSustainHz(REGISTER.bass.hi)).toBe(BASS_CEILING_HZ);
  });

  it('stays below the roughness that made the first attempt buzz', () => {
    // Partials a fundamental apart sit inside one critical band up here, so
    // the tone's brightness decides whether this reads as an instrument or as
    // a buzz. The first version of this scored 0.088 on the lowest note, some
    // sixty times the sine it replaced and well past any plucked string.
    for (const phase of ['attack', 'sustain'] as const) {
      const worst = Math.max(...REGISTER_NOTES.map((midi) => roughness(bassPartials(midi, phase))));
      expect(worst, `roughness on the roughest note, ${phase}`).toBeLessThan(0.045);
    }
  });

  it('is roughest at the bottom, where the partials crowd', () => {
    const low = roughness(bassPartials(REGISTER.bass.lo));
    const high = roughness(bassPartials(REGISTER.bass.hi));
    expect(low).toBeGreaterThan(high);
  });

  it('keeps the tone and the level as separate dials', () => {
    // Roughness is normalised, so turning the bass down cannot make it
    // smoother. Anyone tuning this has to reach for the right one.
    const parts = bassPartials(REGISTER.bass.lo);
    const louder = parts.map((p) => ({ ...p, amplitude: p.amplitude * 3 }));
    expect(roughness(louder)).toBeCloseTo(roughness(parts), 9);
    expect(dbBetween(audible(louder, SPEAKERS.phone), audible(parts, SPEAKERS.phone)))
      .toBeCloseTo(20 * Math.log10(3), 6);
  });

  it('sits in the band where a tilt is an instrument rather than a buzz', () => {
    // Below about 1.2 it is brighter than a sawtooth and starts to buzz; much
    // past 2 the harmonics get too weak to carry the note on a small speaker,
    // which is what they are there for.
    expect(BASS_TILT).toBeGreaterThan(1.2);
    expect(BASS_TILT).toBeLessThan(2.2);
    expect(BASS_LEVEL).toBeGreaterThan(0);
    expect(BASS_LEVEL).toBeLessThanOrEqual(1);
  });

  it('describes the tone the instrument actually builds', () => {
    for (const midi of [REGISTER.bass.lo, REGISTER.bass.hi]) {
      const parts = bassPartials(midi, 'attack', SOFTEST);
      expect(parts.length).toBe(BASS_PARTIALS);
      const f = midiToFreq(midi);
      parts.forEach((p, i) => {
        expect(p.hz, 'partials are exact multiples, or the ear hears no root')
          .toBeCloseTo(f * (i + 1), 6);
      });
      for (let i = 1; i < parts.length; i++) {
        expect(parts[i].amplitude, `partial ${i + 1} of ${midi}`).toBeLessThan(parts[i - 1].amplitude);
      }
      expect(parts[0].amplitude).toBeCloseTo(bassFilterGain(f, bassAttackHz(midi, SOFTEST)), 6);
    }
    const sustain = bassSustainHz(REGISTER.bass.lo);
    expect(bassFilterGain(sustain * 4, sustain), 'well past the cutoff is gone').toBeLessThan(0.1);
  });
});
