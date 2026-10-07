import type { AudioEngine } from './engine';
import { BASS_INSTRUMENT, DEFAULT_INSTRUMENT, PAD_INSTRUMENT, getInstrument } from './instruments';
import type { Voicing } from '../music/voicing';
import type { RealisedChord } from '../music/progressions';
import type { PhraseNote } from '../music/phrase';
import { REGISTER, foldInto, pcAtOrAbove } from '../music/pitch';
import { clamp, mod } from '../lib/util';

export interface PerformerOptions {
  /** Id of the main voice. */
  instrument?: string;
  tempo?: number;
  /** 0 = straight eighths, 1 = full triplet swing. */
  swing?: number;
  /** 0–1 timing and velocity jitter. */
  humanize?: number;
}

export interface NotePlayOptions {
  instrument?: string;
  /** −1 (left) to 1 (right). */
  pan?: number;
  /** Amplitude trim that leaves the timbre alone. */
  gain?: number;
}

export interface ChordPlayOptions {
  beats?: number;
  velocity?: number;
  /** Seconds between successive notes — 0 is a block chord. */
  roll?: number;
  /** Spread the voices across the stereo field by pitch. */
  spread?: number;
  instrument?: string;
}

const LOOKAHEAD = 0.09;

/**
 * Level trim for a texture of `voices` simultaneous notes.
 *
 * Partially incoherent voices sum closer to √n than to n, so this keeps a
 * dense chord at about the same perceived loudness as a single note while
 * leaving plenty of headroom.
 */
export function polyphonyGain(voices: number): number {
  return voices <= 1 ? 1 : 1 / Math.sqrt(voices);
}

/**
 * Turns musical intentions — a chord, a line, a set of changes — into scheduled
 * audio. Exercises describe what should be heard; this decides how it is played.
 */
export class Performer {
  private opts: Required<PerformerOptions>;

  constructor(private engine: AudioEngine, opts: PerformerOptions = {}) {
    this.opts = {
      instrument: opts.instrument ?? DEFAULT_INSTRUMENT,
      tempo: opts.tempo ?? 120,
      swing: opts.swing ?? 0.55,
      humanize: opts.humanize ?? 0.5,
    };
  }

  configure(opts: PerformerOptions): void {
    this.opts = { ...this.opts, ...opts };
  }

  get tempo(): number {
    return this.opts.tempo;
  }

  get beatSeconds(): number {
    return 60 / this.opts.tempo;
  }

  /** Time at which a freshly started phrase should begin. */
  origin(): number {
    return this.engine.now() + LOOKAHEAD;
  }

  stop(): void {
    this.engine.stopAll();
  }

  /** Beat position → seconds, with a swing warp applied inside each beat. */
  private beatOffset(beat: number): number {
    const whole = Math.floor(beat);
    const frac = beat - whole;
    const s = clamp(this.opts.swing, 0, 1);
    const pivot = 0.5 + s / 6;
    const warped = frac <= 0.5 ? frac * (pivot / 0.5) : pivot + (frac - 0.5) * ((1 - pivot) / 0.5);
    return (whole + warped) * this.beatSeconds;
  }

  private jitter(scale = 1): number {
    const h = this.opts.humanize;
    return h === 0 ? 0 : (Math.random() - 0.5) * 0.016 * h * scale;
  }

  note(midi: number, at: number, seconds: number, velocity = 0.7, opts: NotePlayOptions = {}): void {
    // Audio needs a user gesture to start. Until it has one, scheduling is a
    // no-op rather than an exception, so the session stays usable and the
    // "enable sound" prompt can recover it.
    if (!this.engine.ready) return;
    const inst = getInstrument(opts.instrument ?? this.opts.instrument);
    const v = clamp(velocity * (1 + (Math.random() - 0.5) * 0.12 * this.opts.humanize), 0.05, 1);
    const time = Math.max(at, this.engine.now());
    const voice = inst.play(this.engine.context, this.engine.destination, {
      midi,
      time,
      duration: seconds,
      velocity: v,
      pan: opts.pan ?? 0,
      gain: opts.gain ?? 1,
    });
    // Allow for the release tail before the voice is considered finished.
    this.engine.track(voice, time + seconds + 3);
  }

  /** A single note placed by beat. Returns the time it starts. */
  noteAtBeat(
    midi: number,
    origin: number,
    beat: number,
    beats: number,
    velocity = 0.7,
    opts: NotePlayOptions = {},
  ): number {
    const at = origin + this.beatOffset(beat) + this.jitter();
    this.note(midi, at, beats * this.beatSeconds, velocity, opts);
    return at;
  }

  /** Plays a voicing. Returns its length in seconds. */
  chord(voicing: Voicing, origin: number, beat: number, opts: ChordPlayOptions = {}): number {
    const beats = opts.beats ?? 4;
    const seconds = beats * this.beatSeconds;
    const roll = opts.roll ?? 0;
    const spread = opts.spread ?? 0.28;
    const base = origin + this.beatOffset(beat);
    const notes = voicing.notes;
    const lo = notes[0];
    const hi = notes[notes.length - 1];

    // Voices sum, so a six-note chord played at single-note level would be far
    // louder than one note and would clip. Trimming by the square root of the
    // voice count keeps perceived loudness roughly constant across textures.
    const voices = notes.length + (voicing.bass === undefined ? 0 : 1);
    const gain = polyphonyGain(voices);

    notes.forEach((midi, i) => {
      const pan = hi > lo ? ((midi - lo) / (hi - lo) - 0.5) * 2 * spread : 0;
      this.note(
        midi,
        base + roll * i + this.jitter(),
        seconds,
        (opts.velocity ?? 0.68) * (i === 0 ? 1 : 0.94),
        { instrument: opts.instrument, pan, gain },
      );
    });
    if (voicing.bass !== undefined) {
      this.note(voicing.bass, base + this.jitter(), seconds, 0.72, {
        instrument: BASS_INSTRUMENT,
        gain,
      });
    }
    return seconds;
  }

  /** Melodic line from a generated phrase. Returns its length in seconds. */
  melody(notes: readonly PhraseNote[], origin: number, startBeat = 0, instrumentId?: string): number {
    let end = 0;
    for (const n of notes) {
      const at = origin + this.beatOffset(startBeat + n.beat) + this.jitter();
      const seconds = n.beats * this.beatSeconds * 0.92;
      this.note(n.midi, at, seconds, n.velocity, { instrument: instrumentId });
      end = Math.max(end, this.beatOffset(startBeat + n.beat + n.beats));
    }
    return end;
  }

  /** Sustained drone for modal exercises. */
  drone(rootPc: number, origin: number, beats: number, velocity = 0.5): void {
    const root = foldInto(rootPc + 36, REGISTER.drone.lo, REGISTER.drone.hi);
    const seconds = beats * this.beatSeconds;
    this.note(root, origin, seconds, velocity, { instrument: PAD_INSTRUMENT, gain: 0.7 });
    this.note(root + 7, origin, seconds, velocity * 0.8, { instrument: PAD_INSTRUMENT, gain: 0.7 });
  }

  /**
   * Plays changes with a rhythm section.
   *
   * `comp` adds a walking bass and syncopated chord hits, which is how a
   * musician actually meets this harmony; `sustained` holds each chord, which
   * is clearer when the point is to pick the chords apart.
   */
  progression(
    chords: readonly { voicing: Voicing; beats: number; rootPc: number }[],
    origin: number,
    opts: { style?: 'sustained' | 'comp'; startBeat?: number; velocity?: number } = {},
  ): number {
    const style = opts.style ?? 'sustained';
    const velocity = opts.velocity ?? 0.66;
    let beat = opts.startBeat ?? 0;

    for (let i = 0; i < chords.length; i++) {
      const { voicing, beats, rootPc } = chords[i];
      const next = chords[i + 1];
      const stripped: Voicing = { ...voicing, bass: undefined, all: voicing.notes };

      if (style === 'comp') {
        // Chord hits: on the downbeat and pushed into the middle of the bar.
        const hits = beats >= 4 ? [0, 1.5, 3] : [0, 1.5];
        hits.forEach((h, idx) => {
          const length = idx === hits.length - 1 ? beats - h : 1.2;
          this.chord(stripped, origin, beat + h, {
            beats: Math.max(0.6, length),
            velocity: velocity * (idx === 0 ? 1 : 0.78),
            roll: 0.006,
          });
        });
        for (const [b, midi] of this.walk(rootPc, next?.rootPc ?? rootPc, beats)) {
          this.noteAtBeat(midi, origin, beat + b, 1, 0.72, { instrument: BASS_INSTRUMENT });
        }
      } else {
        this.chord(stripped, origin, beat, { beats, velocity, roll: 0.012 });
        const root = foldInto(rootPc + 36, REGISTER.bass.lo, REGISTER.bass.hi);
        this.noteAtBeat(root, origin, beat, beats, 0.74, { instrument: BASS_INSTRUMENT });
        if (beats >= 4) {
          this.noteAtBeat(pcAtOrAbove(mod(rootPc + 7, 12), root + 1), origin, beat + 2, beats - 2, 0.6, {
            instrument: BASS_INSTRUMENT,
          });
        }
      }
      beat += beats;
    }
    return this.beatOffset(beat);
  }

  /**
   * Quarter-note bass line from one root to the next: root, fifth, a passing
   * tone, then a half step into the following root.
   */
  private walk(rootPc: number, nextRootPc: number, beats: number): Array<[number, number]> {
    const root = foldInto(rootPc + 36, REGISTER.bass.lo, REGISTER.bass.hi);
    const nextRoot = foldInto(nextRootPc + 36, REGISTER.bass.lo, REGISTER.bass.hi);
    const out: Array<[number, number]> = [[0, root]];
    if (beats >= 2) out.push([1, pcAtOrAbove(mod(rootPc + 7, 12), root - 5)]);
    if (beats >= 3) out.push([2, pcAtOrAbove(mod(rootPc + 10, 12), root - 2)]);
    if (beats >= 4) {
      const approach = nextRoot + (nextRoot >= root ? -1 : 1);
      out.push([3, approach]);
    }
    return out.filter(([b]) => b < beats);
  }

  /** Builds the chord list a progression needs, with voice leading threaded. */
  static changes(
    realised: readonly RealisedChord[],
    voicings: readonly Voicing[],
  ): Array<{ voicing: Voicing; beats: number; rootPc: number }> {
    return realised.map((r, i) => ({
      voicing: voicings[i],
      beats: r.beats,
      rootPc: r.chord.rootPc,
    }));
  }
}
