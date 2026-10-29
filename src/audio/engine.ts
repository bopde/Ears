/**
 * Audio engine.
 *
 * One AudioContext, one master chain, a procedurally generated reverb, and an
 * iOS unlock path. Instruments connect to `input`; nothing else touches the
 * context directly, so a sample-based instrument can be dropped in later
 * without changing the routing.
 */
export interface EngineOptions {
  /** 0–1 master output level. */
  volume?: number;
  /** 0–1 reverb send. */
  reverb?: number;
}

/** A playing note. Instruments return one so playback can be cut short. */
export interface Voice {
  stop(when?: number): void;
}

/**
 * Soft-clipping curve for the output limiter.
 *
 * A dense voicing plus a bass note sums well past full scale, and digital
 * overflow is the quickest way to make a synthesised piano sound cheap. This
 * is the last thing in the chain: a straight wire below roughly 0.78 of full
 * scale, a gentle knee above it, and a hard ceiling just under 1.
 *
 * A WaveShaper clamps its input to [-1, 1], so the signal is attenuated into
 * that window by `LIMITER_PRE` and brought back out by `LIMITER_POST`; the
 * window therefore spans three times full scale, which no realistic texture
 * reaches.
 */
export const LIMITER_PRE = 1 / 3;
export const LIMITER_POST = 1 / LIMITER_PRE;
/** Input level, in shaper units, below which the curve is exactly linear. */
export const LIMITER_KNEE = 0.26;
/**
 * Fixed trim ahead of the limiter, so the chain has somewhere to put a loud
 * texture. See `buildMasterChain` for why this is not the volume control.
 *
 * Set by measurement rather than by taste: rendered through this chain, the
 * loudest thing the app plays is a rolled quartal voicing of A♭m7 off the
 * cheat sheet, and at this trim it peaks 2.0 dB under the limiter's knee. At
 * 0.7 that margin is 0.7 dB, which is no margin at all.
 */
export const MASTER_TRIM = 0.6;
/** Asymptotic output in shaper units; times LIMITER_POST this is the ceiling. */
const LIMITER_CEILING = 0.33;

/**
 * The compressor that evens out a single note against a full voicing.
 *
 * The attack is the number with a reason behind it. It has to be longer than
 * one cycle of the lowest note the app plays — 18 ms at 55 Hz — or the
 * compressor changes its gain *within* a bass cycle, which is distortion
 * rather than levelling, and is heard as a growl on the bottom notes. It used
 * to be 6 ms.
 */
export const COMPRESSOR = {
  threshold: -16,
  knee: 24,
  ratio: 3,
  attack: 0.026,
  release: 0.24,
} as const;

export function makeSoftClipCurve(points = 4097) {
  const curve = new Float32Array(points);
  const range = LIMITER_CEILING - LIMITER_KNEE;
  for (let i = 0; i < points; i++) {
    const x = (i / (points - 1)) * 2 - 1;
    const magnitude = Math.abs(x);
    const shaped =
      magnitude <= LIMITER_KNEE
        ? magnitude
        : LIMITER_KNEE + range * Math.tanh((magnitude - LIMITER_KNEE) / range);
    curve[i] = Math.sign(x) * shaped;
  }
  return curve;
}

const SILENT_WAV =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAAAA';

/** The master signal path, independent of how the context was created. */
export interface MasterChain {
  /** Instruments connect here. */
  input: GainNode;
  setVolume(value: number): void;
  setReverb(value: number): void;
}

/**
 * Builds the output chain: a parallel reverb send, a compressor to even out
 * the difference between a single note and a full voicing, a fixed trim, a
 * soft limiter so nothing can leave the page above full scale, and the user's
 * volume after all of it.
 *
 * The order of those last two is the whole point. The volume used to sit
 * *before* the limiter, which meant turning the app up did not make it louder
 * so much as drive it further into the clipper — and a bass and a chord
 * soft-clipped together intermodulate, so the chord picks up a buzz at the
 * bass's frequency. Volume now scales what has already been limited: it can
 * only make the output quieter, never dirtier, and the limiter is back to
 * being a safety net rather than part of the sound.
 *
 * Separated from AudioEngine so the exact chain can be rendered offline and
 * measured, rather than only being heard.
 */
export function buildMasterChain(ctx: BaseAudioContext, destination: AudioNode): MasterChain {
  const input = ctx.createGain();
  const dry = ctx.createGain();
  const send = ctx.createGain();
  const wet = ctx.createGain();
  const master = ctx.createGain();
  const output = ctx.createGain();

  master.gain.value = MASTER_TRIM;

  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = COMPRESSOR.threshold;
  compressor.knee.value = COMPRESSOR.knee;
  compressor.ratio.value = COMPRESSOR.ratio;
  compressor.attack.value = COMPRESSOR.attack;
  compressor.release.value = COMPRESSOR.release;

  const convolver = ctx.createConvolver();
  convolver.buffer = makeImpulseResponse(ctx, 1.9, 2.4);

  // A gentle high shelf keeps the reverb tail from sounding brittle.
  const tone = ctx.createBiquadFilter();
  tone.type = 'highshelf';
  tone.frequency.value = 3200;
  tone.gain.value = -5;

  const limiterIn = ctx.createGain();
  limiterIn.gain.value = LIMITER_PRE;
  const shaper = ctx.createWaveShaper();
  shaper.curve = makeSoftClipCurve();
  // Not oversampled, which is the opposite of the usual advice and is right
  // here. Oversampling a shaper means upsample, shape, filter back down, and
  // that last filter rings: measured through this very curve, a sawtooth
  // driven into the knee leaves at 1.16 — past full scale, which is the one
  // thing a limiter exists to prevent, and the pad voice is three sawtooths.
  // Chromium and the offline renderer agree on the figure to three decimals.
  // Below the knee all three settings are identical, and above it this curve
  // is a gentle tanh whose harmonics are low-order, so the aliasing avoided
  // by oversampling costs less than the ceiling it breaks.
  shaper.oversample = 'none';
  const limiterOut = ctx.createGain();
  limiterOut.gain.value = LIMITER_POST;

  input.connect(dry);
  input.connect(send);
  send.connect(convolver);
  convolver.connect(tone);
  tone.connect(wet);
  dry.connect(compressor);
  wet.connect(compressor);
  compressor.connect(master);
  master.connect(limiterIn);
  limiterIn.connect(shaper);
  shaper.connect(limiterOut);
  limiterOut.connect(output);
  output.connect(destination);

  wet.gain.value = 0.9;

  return {
    input,
    setVolume(value) {
      output.gain.value = Math.min(1, Math.max(0, value));
    },
    setReverb(value) {
      const amount = Math.min(1, Math.max(0, value));
      dry.gain.value = 1 - amount * 0.35;
      send.gain.value = amount;
    },
  };
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private chain: MasterChain | null = null;
  private keepAlive: HTMLAudioElement | null = null;
  /** Sounding voices, mapped to the time they are expected to have died away. */
  private voices = new Map<Voice, number>();
  private opts: Required<EngineOptions>;

  constructor(opts: EngineOptions = {}) {
    this.opts = { volume: opts.volume ?? 0.85, reverb: opts.reverb ?? 0.26 };
  }

  get ready(): boolean {
    return this.ctx !== null && this.ctx.state === 'running' && this.chain !== null;
  }

  get context(): AudioContext {
    if (!this.ctx) throw new Error('AudioEngine used before unlock()');
    return this.ctx;
  }

  get destination(): AudioNode {
    if (!this.chain) throw new Error('AudioEngine used before unlock()');
    return this.chain.input;
  }

  now(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  /**
   * Must be called from inside a user gesture. Safari refuses to start audio
   * otherwise, and on iOS it also needs a silent media element playing so that
   * Web Audio is routed to the playback session rather than being killed by
   * the hardware mute switch.
   */
  async unlock(): Promise<void> {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor({ latencyHint: 'interactive' });
      this.chain = buildMasterChain(this.ctx, this.ctx.destination);
      this.chain.setVolume(this.opts.volume);
      this.chain.setReverb(this.opts.reverb);
    }
    if (this.ctx.state !== 'running') {
      try {
        await this.ctx.resume();
      } catch {
        /* resumed on the next gesture */
      }
    }
    // A zero-length buffer is enough to convince older Safari the context is live.
    const buf = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.ctx.destination);
    src.start(0);

    if (!this.keepAlive) {
      const el = new Audio(SILENT_WAV);
      el.loop = true;
      el.volume = 0.0001;
      el.setAttribute('playsinline', '');
      void el.play().catch(() => undefined);
      this.keepAlive = el;
    }
  }

  setVolume(value: number): void {
    this.opts.volume = Math.min(1, Math.max(0, value));
    this.chain?.setVolume(this.opts.volume);
  }

  setReverb(value: number): void {
    this.opts.reverb = Math.min(1, Math.max(0, value));
    this.chain?.setReverb(this.opts.reverb);
  }

  /**
   * Registers a voice so playback can be cut short.
   *
   * `endsAt` is when the note will have faded out; finished voices are swept
   * periodically, because a half-hour session schedules thousands of them and
   * holding every one would leak and slow `stopAll` down.
   */
  track(voice: Voice, endsAt: number): Voice {
    this.voices.set(voice, endsAt);
    if (this.voices.size > 48) this.prune();
    return voice;
  }

  private prune(): void {
    const now = this.now();
    for (const [voice, endsAt] of this.voices) {
      if (endsAt <= now) this.voices.delete(voice);
    }
  }

  /** Cuts every sounding and scheduled note — used on replay and on skip. */
  stopAll(): void {
    const when = this.ctx ? this.ctx.currentTime : 0;
    for (const voice of this.voices.keys()) {
      try {
        voice.stop(when);
      } catch {
        /* already finished */
      }
    }
    this.voices.clear();
  }
}

/**
 * Synthesised room. Exponentially decaying noise with a short build at the
 * front, which reads as a small hall and costs nothing to ship.
 */
function makeImpulseResponse(ctx: BaseAudioContext, seconds: number, decay: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * seconds);
  const buffer = ctx.createBuffer(2, length, rate);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      const t = i / length;
      // Short fade-in avoids the "click then tail" of raw exponential noise.
      const build = Math.min(1, i / (rate * 0.012));
      data[i] = (Math.random() * 2 - 1) * build * Math.pow(1 - t, decay);
    }
    // A couple of early reflections give the tail a sense of size.
    for (const [delayMs, gain] of [[17, 0.3], [29, 0.22], [41, 0.16]] as const) {
      const offset = Math.floor((delayMs / 1000) * rate) + channel * 13;
      if (offset < length) data[offset] += gain;
    }
  }
  return buffer;
}
