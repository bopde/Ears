import { describe, expect, it } from 'vitest';
import { OfflineAudioContext } from 'node-web-audio-api';
import {
  COMPRESSOR, LIMITER_KNEE, LIMITER_POST, MASTER_TRIM, buildMasterChain, makeSoftClipCurve,
  type AudioEngine,
} from './engine';
import { Performer } from './performer';
import { BASS_INSTRUMENT, BASS_LEVEL } from './instruments';
import { playReference, playReferenceChord, referenceVoicings } from './reference';
import { PROGRESSIONS, realiseProgression } from '../music/progressions';
import { REGISTER, midiToFreq } from '../music/pitch';
import { voiceProgression } from '../music/voicing';
import type { BassStyle } from './performer';

/**
 * What the mix does when everything plays at once.
 *
 * Every other audio test here measures one voice on its own, analytically,
 * which is why the one thing nobody could see was how the voices sat against
 * each other. This file renders the real chain — the real instruments, the
 * real performer, the real `buildMasterChain` — through an offline context
 * and measures the result.
 *
 * Rendered at 48 kHz because that is the sample rate ITU-R BS.1770 specifies
 * its coefficients at, and loudness here is K-weighted: see the note on
 * `earGain` in audibility.test.ts for why not A.
 *
 * One caveat about the renderer, so nobody chases it twice: node-web-audio-api
 * mishandles `cancelScheduledValues` scheduled after a completed exponential
 * ramp, and the pad voice is the only one whose envelope ends on such a ramp.
 * It renders the pad some 200 times too loud here and correctly in Chromium,
 * so no test in this file uses the drone. Every other voice agrees with
 * Chromium to within 2%, and the figures below to within half a decibel.
 */

const RATE = 48000;

/** A deterministic stand-in for Math.random, so a render is reproducible. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function rig(seconds: number, volume: number) {
  const ctx = new OfflineAudioContext(2, Math.ceil(RATE * seconds), RATE);
  const chain = buildMasterChain(ctx as never, ctx.destination);
  chain.setVolume(volume);
  chain.setReverb(0.26);
  // The Performer only ever asks an engine for these five things.
  const engine = {
    ready: true,
    now: () => 0,
    context: ctx,
    destination: chain.input,
    track: (voice: unknown) => voice,
    stopAll: () => undefined,
  } as unknown as AudioEngine;
  return { ctx, engine };
}

/** Which voices to let through. */
type Voices = 'all' | 'comping' | 'bass';

/**
 * Silences one side without changing any gain the other side is given.
 *
 * `polyphonyGain` counts voices, so dropping the chord notes to measure the
 * bass would quietly re-trim the bass along with them, and the balance
 * measured would not be the balance that ships. Filtering at the point where
 * a note is scheduled leaves every level decision upstream untouched.
 */
function only(perf: Performer, voices: Voices): Performer {
  if (voices === 'all') return perf;
  const scheduled = perf.note.bind(perf);
  (perf as unknown as { note: Performer['note'] }).note = (midi, at, secs, vel, opts = {}) => {
    const isBass = opts.instrument === BASS_INSTRUMENT;
    if (voices === 'bass' ? isBass : !isBass) scheduled(midi, at, secs, vel, opts);
  };
  return perf;
}

/** ITU-R BS.1770 K-weighting, applied to a rendered channel. */
function kWeighted(samples: Float32Array): Float32Array {
  const stages: Array<[number[], number[]]> = [
    [[1.53512485958697, -2.69169618940638, 1.19839281085285], [1, -1.69065929318241, 0.73248077421585]],
    [[1, -2, 1], [1, -1.99004745483398, 0.99007225036621]],
  ];
  let signal = Float32Array.from(samples);
  for (const [b, a] of stages) {
    const out = new Float32Array(signal.length);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < signal.length; i++) {
      const y = b[0] * signal[i] + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2;
      x2 = x1; x1 = signal[i]; y2 = y1; y1 = y; out[i] = y;
    }
    signal = out;
  }
  return signal;
}

interface Measured {
  /** Largest sample magnitude anywhere in the render. */
  peak: number;
  /** K-weighted loudness over the whole render. */
  loudness: number;
  /** K-weighted loudness of the loudest 400 ms, which is what BS.1770 gates on. */
  loudest: number;
}

function measure(buffer: AudioBuffer): Measured {
  const block = Math.floor(RATE * 0.4);
  let peak = 0;
  let power = 0;
  let samples = 0;
  let loudest = 0;
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    const weighted = kWeighted(data);
    for (let i = 0; i < data.length; i++) {
      const magnitude = Math.abs(data[i]);
      if (magnitude > peak) peak = magnitude;
      power += weighted[i] * weighted[i];
      samples += 1;
    }
    for (let start = 0; start + block <= weighted.length; start += block >> 2) {
      let sum = 0;
      for (let i = start; i < start + block; i++) sum += weighted[i] * weighted[i];
      loudest = Math.max(loudest, Math.sqrt(sum / block));
    }
  }
  return { peak, loudness: Math.sqrt(power / samples), loudest };
}

const decibels = (a: number, b: number) => 20 * Math.log10(Math.max(a, 1e-12) / Math.max(b, 1e-12));

const iiVI = () => PROGRESSIONS.find((p) => p.id === 'ii-V-I')!;

/** A ii–V–I with a rhythm section, the way an exercise plays one. */
async function comping(style: BassStyle, voices: Voices, volume = 1): Promise<Measured> {
  const real = Math.random;
  Math.random = seeded(12345);
  try {
    const { ctx, engine } = rig(7, volume);
    const perf = only(new Performer(engine, { tempo: 120, humanize: 0 }), voices);
    const realised = realiseProgression(iiVI(), 0);
    const voicings = voiceProgression(realised.map((r) => r.chord), { style: 'rootless', maxNotes: 4 });
    perf.progression(Performer.changes(realised, voicings), perf.origin(), { style });
    return measure(await ctx.startRendering() as never);
  } finally {
    Math.random = real;
  }
}

/** The same changes held rather than comped, the way the cheat sheet plays them. */
async function cheatSheet(voices: Voices, volume = 1): Promise<Measured> {
  const real = Math.random;
  Math.random = seeded(999);
  try {
    const { ctx, engine } = rig(9, volume);
    const perf = only(new Performer(engine, { tempo: 120, humanize: 0 }), voices);
    playReference(perf, referenceVoicings(iiVI(), 0, 'rootless'));
    return measure(await ctx.startRendering() as never);
  } finally {
    Math.random = real;
  }
}

/** The rendered samples themselves, for comparing two volume settings. */
async function compingSamples(style: BassStyle, volume: number): Promise<Float32Array> {
  const real = Math.random;
  Math.random = seeded(12345);
  try {
    const { ctx, engine } = rig(7, volume);
    const perf = new Performer(engine, { tempo: 120, humanize: 0 });
    const realised = realiseProgression(iiVI(), 0);
    const voicings = voiceProgression(realised.map((r) => r.chord), { style: 'rootless', maxNotes: 4 });
    perf.progression(Performer.changes(realised, voicings), perf.origin(), { style });
    return (await ctx.startRendering() as never as AudioBuffer).getChannelData(0);
  } finally {
    Math.random = real;
  }
}

/** The single loudest thing a sweep of the whole catalogue turned up. */
async function loudestKnownChord(): Promise<number> {
  const real = Math.random;
  Math.random = seeded(4242);
  try {
    const { ctx, engine } = rig(5, 1);
    const perf = new Performer(engine, { tempo: 120, humanize: 0 });
    const chords = referenceVoicings(iiVI(), 6, 'quartal');
    playReferenceChord(perf, chords[0], { roll: true });
    return measure(await ctx.startRendering() as never).peak;
  } finally {
    Math.random = real;
  }
}

/** An oscillator pushed `drive` times past full scale into the limiter. */
async function driven(
  type: 'sine' | 'sawtooth',
  drive: number,
  volume = 1,
): Promise<Float32Array> {
  const ctx = new OfflineAudioContext(1, RATE, RATE);
  const chain = buildMasterChain(ctx as never, ctx.destination);
  chain.setVolume(volume);
  chain.setReverb(0);
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = 110;
  const gain = ctx.createGain();
  gain.gain.value = drive / MASTER_TRIM;
  osc.connect(gain);
  gain.connect(chain.input);
  osc.start(0);
  return (await ctx.startRendering() as never as AudioBuffer).getChannelData(0);
}

/** Its steady-state peak, past the compressor's attack. */
async function drivenPeak(type: 'sine' | 'sawtooth', drive: number): Promise<number> {
  const data = await driven(type, drive);
  let peak = 0;
  for (let i = Math.floor(RATE * 0.2); i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
  return peak;
}

describe('the bass sits under the comping', () => {
  /**
   * The balance, in every texture the bass plays in.
   *
   * It has to be under the chords — it is the ground, not the subject — and
   * it has to still be there, because root motion is most of what these
   * exercises are asking you to hear. Both bounds are real: at the level this
   * shipped with before, every comping texture here measured between 5 and
   * 7 dB *over* the chords.
   */
  const textures: Array<[string, () => Promise<[Measured, Measured]>]> = [
    ['root', async () => [await comping('root', 'bass'), await comping('root', 'comping')]],
    ['root and fifth', async () => [await comping('root-fifth', 'bass'), await comping('root-fifth', 'comping')]],
    ['walking', async () => [await comping('walking', 'bass'), await comping('walking', 'comping')]],
    ['the cheat sheet', async () => [await cheatSheet('bass'), await cheatSheet('comping')]],
  ];

  for (const [name, render] of textures) {
    it(`is under the chords and still audible: ${name}`, async () => {
      const [bass, chords] = await render();
      const balance = decibels(bass.loudness, chords.loudness);
      expect(balance, `${name}: K-weighted bass against chords`).toBeLessThan(0);
      expect(balance, `${name}: not buried`).toBeGreaterThan(-14);
      // The same holds moment to moment, not only averaged over the rests.
      expect(decibels(bass.loudest, chords.loudest), `${name}: loudest 400 ms`).toBeLessThan(0);
    }, 60000);
  }

  it('is set by one dial, and that dial is where the balance comes from', () => {
    // Doubling BASS_LEVEL would put every texture above the chords again, so
    // the bound above is a statement about this number and nothing else.
    expect(BASS_LEVEL).toBeGreaterThan(0.1);
    expect(BASS_LEVEL).toBeLessThan(0.3);
  });
});

/** Full-scale level at which the limiter stops being a straight wire. */
const KNEE = LIMITER_KNEE * LIMITER_POST;

describe('the output has headroom', () => {
  /**
   * At the top of the volume control, nothing the app plays should reach the
   * limiter at all.
   *
   * It used to, on every chord attack, because the volume control *was* the
   * pre-limiter gain: turning the app up drove the soft clipper harder rather
   * than only making it louder, and a bass and a chord clipped together
   * intermodulate — the chord picks up a buzz at the bass's frequency. The
   * trim is fixed now and the volume sits after the limiter.
   */
  it('never reaches the limiter on a ii–V–I at full volume', async () => {
    for (const style of ['root', 'root-fifth', 'walking'] as const) {
      const { peak } = await comping(style, 'all', 1);
      expect(peak, `${style} at volume 1`).toBeLessThan(KNEE);
      // And it is not passing by being silent.
      expect(peak, `${style} is actually playing`).toBeGreaterThan(0.2);
    }
  }, 60000);

  it('keeps that margin on the loudest thing in the catalogue', async () => {
    // Found by sweeping every progression comped two ways and every voicing
    // mode of the cheat sheet rolled, in four keys: a rolled quartal A♭m7.
    const peak = await loudestKnownChord();
    expect(peak, 'rolled quartal A♭m7 at volume 1').toBeLessThan(KNEE);
    expect(20 * Math.log10(KNEE / peak), 'headroom in dB').toBeGreaterThan(1.5);
  }, 60000);

  it('puts the volume control after the limiter, where it cannot distort', async () => {
    // Halving the volume has to halve every sample, even on material loud
    // enough to be clipped. If the control sat before the limiter the quieter
    // render would be clipped *less*, so it would differ in shape and not only
    // in level — which is the old behaviour: turning the app up made it
    // dirtier rather than only louder.
    const compare = (full: Float32Array, half: Float32Array, what: string) => {
      let worst = 0;
      for (let i = 0; i < full.length; i++) worst = Math.max(worst, Math.abs(half[i] - full[i] / 2));
      expect(worst, `${what}: half volume is exactly half the signal`).toBeLessThan(1e-6);
    };
    compare(await compingSamples('walking', 1), await compingSamples('walking', 0.5), 'a ii–V–I');
    compare(await driven('sawtooth', 4, 1), await driven('sawtooth', 4, 0.5), 'a clipped sawtooth');
  }, 60000);

  it('holds its ceiling when something is driven into it', async () => {
    // The limiter is a guarantee, not a tendency, and the guarantee held only
    // for smooth material until the oversampling came off: a sawtooth driven
    // into this curve at 4x left at 1.16 of full scale, in Chromium as well as
    // here. A hard edge is the case that matters, because the pad is three
    // sawtooths.
    for (const type of ['sine', 'sawtooth'] as const) {
      for (const drive of [1, 4, 20]) {
        const peak = await drivenPeak(type, drive);
        expect(peak, `${type} at ${drive}x full scale`).toBeLessThan(1);
      }
    }
    // And the curve is not merely quiet: driven hard it should reach its
    // asymptote rather than collapsing.
    expect(await drivenPeak('sine', 20)).toBeGreaterThan(0.9);
  }, 60000);

  it('compresses slower than one cycle of the lowest note it will ever see', () => {
    // Faster than that and the compressor moves its gain inside a bass cycle,
    // which is distortion rather than levelling. 55 Hz is an 18 ms period.
    const slowest = 1 / midiToFreq(REGISTER.bass.lo);
    expect(COMPRESSOR.attack, 'attack against one cycle of the lowest note')
      .toBeGreaterThan(slowest);
    // And it still has to let go between chords.
    expect(COMPRESSOR.release).toBeLessThan(0.3);
    expect(COMPRESSOR.release).toBeGreaterThan(COMPRESSOR.attack * 4);
  });

  it('is trimmed where the measurement put it', () => {
    expect(MASTER_TRIM).toBeGreaterThan(0.4);
    expect(MASTER_TRIM).toBeLessThan(0.75);
    // The curve the trim feeds has to still be a straight wire underneath it.
    const curve = makeSoftClipCurve();
    const i = Math.round(((LIMITER_KNEE / 2 + 1) / 2) * (curve.length - 1));
    expect(curve[i] * LIMITER_POST).toBeCloseTo((LIMITER_KNEE / 2) * LIMITER_POST, 3);
  });
});
