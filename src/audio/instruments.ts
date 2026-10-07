import { midiToFreq } from '../music/pitch';
import { clamp } from '../lib/util';
import type { Voice } from './engine';

export interface NoteSpec {
  midi: number;
  /** AudioContext time to start. */
  time: number;
  /** Seconds the key is held; the tail may ring past it. */
  duration: number;
  /** 0–1. Drives both loudness and timbre, the way touch does on a real instrument. */
  velocity: number;
  /** −1 (left) to 1 (right). */
  pan?: number;
  /**
   * Amplitude trim applied on top of velocity, defaulting to 1.
   *
   * Kept separate so a chord can be balanced against a single note without
   * also making it duller — a pianist plays the notes of a chord at full
   * velocity, they simply add up to more sound.
   */
  gain?: number;
}

export interface Instrument {
  id: string;
  name: string;
  description: string;
  /** Whether the user can pick it as the main practice voice. */
  selectable: boolean;
  play(ctx: AudioContext, dest: AudioNode, note: NoteSpec): Voice;
}

const MIN = 0.0001;

/** Stereo placement, with a fallback for contexts without StereoPannerNode. */
function output(ctx: AudioContext, dest: AudioNode, pan = 0): GainNode {
  const gain = ctx.createGain();
  if (pan !== 0 && typeof ctx.createStereoPanner === 'function') {
    const panner = ctx.createStereoPanner();
    panner.pan.value = clamp(pan, -1, 1);
    gain.connect(panner);
    panner.connect(dest);
  } else {
    gain.connect(dest);
  }
  return gain;
}

/** Collects every node that must be torn down when a voice ends. */
interface Rig {
  sources: Array<OscillatorNode | AudioBufferSourceNode>;
  envelopes: AudioParam[];
  out: GainNode;
}

function finish(ctx: AudioContext, rig: Rig, note: NoteSpec, releaseTau: number): Voice {
  let stopped = false;
  const release = (when: number) => {
    if (stopped) return;
    stopped = true;
    const t = Math.max(when, ctx.currentTime);
    for (const p of rig.envelopes) {
      p.cancelScheduledValues(t);
      p.setTargetAtTime(MIN, t, releaseTau);
    }
    const end = t + releaseTau * 6 + 0.05;
    for (const s of rig.sources) {
      try {
        s.stop(end);
      } catch {
        /* already stopped */
      }
    }
    window.setTimeout(() => rig.out.disconnect(), Math.max(0, (end - ctx.currentTime) * 1000) + 120);
  };
  release(note.time + note.duration);
  return {
    stop(when?: number) {
      stopped = false;
      release(when ?? ctx.currentTime);
    },
  };
}

function noiseBurst(
  ctx: AudioContext,
  dest: AudioNode,
  time: number,
  seconds: number,
  freq: number,
  level: number,
): AudioBufferSourceNode {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = freq;
  bp.Q.value = 0.8;
  const g = ctx.createGain();
  g.gain.value = level;
  src.connect(bp);
  bp.connect(g);
  g.connect(dest);
  src.start(time);
  src.stop(time + seconds + 0.02);
  return src;
}

/**
 * FM electric piano.
 *
 * Two operator pairs: a 1:1 pair for the woody body and a 14:1 pair whose very
 * short decay gives the metallic tine. Harder notes get a brighter, longer
 * modulation index, which is what makes it respond like an instrument rather
 * than a tone generator.
 */
const rhodes: Instrument = {
  id: 'rhodes',
  name: 'Electric piano',
  description: 'Warm FM tine piano. The default practice voice.',
  selectable: true,
  play(ctx, dest, note) {
    const f = midiToFreq(note.midi);
    const t = note.time;
    const vel = clamp(note.velocity, 0.08, 1);
    const out = output(ctx, dest, note.pan ?? 0);

    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = clamp(2200 + vel * 6500, 900, 12000);
    tone.Q.value = 0.5;
    tone.connect(out);

    const amp = ctx.createGain();
    amp.gain.value = MIN;
    amp.connect(tone);

    // Low notes ring; the top of the keyboard dies away quickly.
    const decayTau = clamp(2.6 - (note.midi - 36) * 0.028, 0.45, 2.6);
    const peak = vel * 0.34 * (note.gain ?? 1);
    amp.gain.setValueAtTime(MIN, t);
    amp.gain.exponentialRampToValueAtTime(peak, t + 0.005);
    amp.gain.setTargetAtTime(peak * 0.22, t + 0.006, decayTau * 0.45);

    const sources: OscillatorNode[] = [];
    const makePair = (ratio: number, index: number, indexTau: number, level: number, detune = 0) => {
      const carrier = ctx.createOscillator();
      carrier.type = 'sine';
      carrier.frequency.value = f;
      carrier.detune.value = detune;

      const mod = ctx.createOscillator();
      mod.type = 'sine';
      mod.frequency.value = f * ratio;

      const modGain = ctx.createGain();
      modGain.gain.setValueAtTime(index, t);
      modGain.gain.setTargetAtTime(index * 0.08, t, indexTau);
      mod.connect(modGain);
      modGain.connect(carrier.frequency);

      const lvl = ctx.createGain();
      lvl.gain.value = level;
      carrier.connect(lvl);
      lvl.connect(amp);

      carrier.start(t);
      mod.start(t);
      sources.push(carrier, mod);
    };

    makePair(1, f * (1.6 + vel * 2.4), 0.11, 1);
    makePair(1, f * (1.4 + vel * 2.0), 0.13, 0.5, 4); // slight detune for width
    makePair(14, f * vel * 0.9, 0.028, 0.14);         // the tine

    return finish(ctx, { sources, envelopes: [amp.gain], out }, note, 0.09);
  },
};

/** Harmonic series weights that read as a struck string rather than an organ. */
function pianoWave(ctx: AudioContext): PeriodicWave {
  const n = 18;
  const real = new Float32Array(n);
  const imag = new Float32Array(n);
  for (let h = 1; h < n; h++) {
    const even = h % 2 === 0;
    imag[h] = (1 / Math.pow(h, 1.25)) * (even ? 0.55 : 1) * (h > 10 ? 0.4 : 1);
  }
  return ctx.createPeriodicWave(real, imag, { disableNormalization: false });
}

let cachedPianoWave: { ctx: AudioContext; wave: PeriodicWave } | null = null;

const piano: Instrument = {
  id: 'piano',
  name: 'Acoustic piano',
  description: 'Brighter and more percussive. Good for hearing inner voices.',
  selectable: true,
  play(ctx, dest, note) {
    const f = midiToFreq(note.midi);
    const t = note.time;
    const vel = clamp(note.velocity, 0.08, 1);
    const out = output(ctx, dest, note.pan ?? 0);

    if (!cachedPianoWave || cachedPianoWave.ctx !== ctx) {
      cachedPianoWave = { ctx, wave: pianoWave(ctx) };
    }

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 0.7;
    const open = clamp(f * 6 + vel * 5200, 700, 13000);
    filter.frequency.setValueAtTime(open, t);
    filter.frequency.setTargetAtTime(clamp(f * 3 + 600, 400, 5000), t + 0.01, 0.28);
    filter.connect(out);

    const amp = ctx.createGain();
    amp.gain.value = MIN;
    amp.connect(filter);

    const decayTau = clamp(3.4 - (note.midi - 33) * 0.034, 0.4, 3.4);
    const peak = vel * 0.3 * (note.gain ?? 1);
    amp.gain.setValueAtTime(MIN, t);
    amp.gain.exponentialRampToValueAtTime(peak, t + 0.004);
    amp.gain.setTargetAtTime(peak * 0.14, t + 0.005, decayTau * 0.4);

    const sources: Array<OscillatorNode | AudioBufferSourceNode> = [];
    for (const detune of [0, 5, -4]) {
      const osc = ctx.createOscillator();
      osc.setPeriodicWave(cachedPianoWave.wave);
      osc.frequency.value = f;
      osc.detune.value = detune;
      const lvl = ctx.createGain();
      lvl.gain.value = detune === 0 ? 1 : 0.32;
      osc.connect(lvl);
      lvl.connect(amp);
      osc.start(t);
      sources.push(osc);
    }
    sources.push(noiseBurst(ctx, filter, t, 0.02, 2600, vel * 0.1));

    return finish(ctx, { sources, envelopes: [amp.gain], out }, note, 0.12);
  },
};

const vibes: Instrument = {
  id: 'vibes',
  name: 'Vibraphone',
  description: 'Pure and bell-like. The clearest voice for intervals.',
  selectable: true,
  play(ctx, dest, note) {
    const f = midiToFreq(note.midi);
    const t = note.time;
    const vel = clamp(note.velocity, 0.08, 1);
    const out = output(ctx, dest, note.pan ?? 0);

    const amp = ctx.createGain();
    amp.gain.value = MIN;
    amp.connect(out);

    // The motor-driven tremolo that gives a vibraphone its shimmer.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 4.2;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.16;
    lfo.connect(lfoGain);
    lfoGain.connect(amp.gain);
    lfo.start(t);

    const decayTau = clamp(2.8 - (note.midi - 48) * 0.03, 0.5, 2.8);
    const peak = vel * 0.3 * (note.gain ?? 1);
    amp.gain.setValueAtTime(MIN, t);
    amp.gain.exponentialRampToValueAtTime(peak, t + 0.004);
    amp.gain.setTargetAtTime(peak * 0.1, t + 0.005, decayTau * 0.5);

    const sources: Array<OscillatorNode | AudioBufferSourceNode> = [lfo];
    // Fundamental plus the struck-bar partials, four octaves and a fifth up.
    for (const [mult, level, tau] of [[1, 1, 1], [4, 0.14, 0.35], [9.2, 0.05, 0.18]] as const) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f * mult;
      const lvl = ctx.createGain();
      lvl.gain.setValueAtTime(level, t);
      if (tau < 1) lvl.gain.setTargetAtTime(MIN, t, tau);
      osc.connect(lvl);
      lvl.connect(amp);
      osc.start(t);
      sources.push(osc);
    }

    return finish(ctx, { sources, envelopes: [amp.gain], out }, note, 0.2);
  },
};

/** Upright bass, used under progressions so root motion is audible. */
const bass: Instrument = {
  id: 'bass',
  name: 'Upright bass',
  description: 'Accompaniment voice for root motion.',
  selectable: false,
  play(ctx, dest, note) {
    const f = midiToFreq(note.midi);
    const t = note.time;
    const vel = clamp(note.velocity, 0.08, 1);
    const out = output(ctx, dest, note.pan ?? 0);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 1.1;
    filter.frequency.setValueAtTime(clamp(f * 9 + vel * 900, 260, 3000), t);
    filter.frequency.setTargetAtTime(clamp(f * 3.2, 150, 900), t + 0.01, 0.2);
    filter.connect(out);

    const amp = ctx.createGain();
    amp.gain.value = MIN;
    amp.connect(filter);
    const peak = vel * 0.46 * (note.gain ?? 1);
    amp.gain.setValueAtTime(MIN, t);
    amp.gain.exponentialRampToValueAtTime(peak, t + 0.012);
    amp.gain.setTargetAtTime(peak * 0.2, t + 0.013, 0.42);

    const sources: Array<OscillatorNode | AudioBufferSourceNode> = [];
    for (const [type, mult, level] of [
      ['sine', 1, 1],
      ['triangle', 1, 0.5],
      ['triangle', 2, 0.1],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = f * mult;
      const lvl = ctx.createGain();
      lvl.gain.value = level;
      osc.connect(lvl);
      lvl.connect(amp);
      osc.start(t);
      sources.push(osc);
    }
    sources.push(noiseBurst(ctx, filter, t, 0.03, 900, vel * 0.09));

    return finish(ctx, { sources, envelopes: [amp.gain], out }, note, 0.14);
  },
};

/** Sustaining pad, used for modal drones. */
const pad: Instrument = {
  id: 'pad',
  name: 'Pad',
  description: 'Sustaining drone for modal exercises.',
  selectable: false,
  play(ctx, dest, note) {
    const f = midiToFreq(note.midi);
    const t = note.time;
    const vel = clamp(note.velocity, 0.05, 1);
    const out = output(ctx, dest, note.pan ?? 0);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = clamp(f * 7 + 500, 500, 4000);
    filter.Q.value = 0.6;
    filter.connect(out);

    const amp = ctx.createGain();
    amp.gain.value = MIN;
    amp.connect(filter);
    const peak = vel * 0.15 * (note.gain ?? 1);
    amp.gain.setValueAtTime(MIN, t);
    amp.gain.exponentialRampToValueAtTime(peak, t + 0.35);

    const sources: Array<OscillatorNode | AudioBufferSourceNode> = [];
    for (const detune of [-8, 0, 7]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = f;
      osc.detune.value = detune;
      const lvl = ctx.createGain();
      lvl.gain.value = detune === 0 ? 0.5 : 0.3;
      osc.connect(lvl);
      lvl.connect(amp);
      osc.start(t);
      sources.push(osc);
    }

    return finish(ctx, { sources, envelopes: [amp.gain], out }, note, 0.5);
  },
};

export const INSTRUMENTS: Instrument[] = [rhodes, piano, vibes, bass, pad];

const registry = new Map(INSTRUMENTS.map((i) => [i.id, i]));

/** Extension point: a sampled instrument registers here and works everywhere. */
export function registerInstrument(instrument: Instrument): void {
  registry.set(instrument.id, instrument);
  if (!INSTRUMENTS.some((i) => i.id === instrument.id)) INSTRUMENTS.push(instrument);
}

export function getInstrument(id: string): Instrument {
  return registry.get(id) ?? rhodes;
}

export const SELECTABLE_INSTRUMENTS = () => INSTRUMENTS.filter((i) => i.selectable);

export const DEFAULT_INSTRUMENT = 'rhodes';
export const BASS_INSTRUMENT = 'bass';
export const PAD_INSTRUMENT = 'pad';
