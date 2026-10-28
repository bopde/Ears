import {
  progressionBass,
  type BassChord, type BassRole, type BassStyle, type NotePlayOptions, type Performer,
} from './audio/performer';
import { BASS_INSTRUMENT } from './audio/instruments';
import type { Voicing } from './music/voicing';
import type { PhraseNote } from './music/phrase';
import { REGISTER, foldInto } from './music/pitch';

export interface RecordedNote {
  midi: number;
  time: number;
  seconds: number;
  velocity: number;
  /** Which voice played it, so a test can tell the bass from the chord above. */
  instrument?: string;
}

/**
 * A Performer stand-in for tests: records what would have sounded instead of
 * touching Web Audio, which does not exist outside a browser.
 */
export class FakePerformer {
  notes: RecordedNote[] = [];
  chords: Voicing[] = [];
  melodies: PhraseNote[][] = [];
  progressions: number[] = [];
  /** The bass line underneath a progression, in schedule order. */
  bass: Array<{ midi: number; beat: number; time: number; role: BassRole }> = [];
  drones = 0;
  stops = 0;
  tempo = 120;

  get beatSeconds(): number {
    return 60 / this.tempo;
  }

  configure(opts: { tempo?: number }): void {
    if (opts.tempo) this.tempo = opts.tempo;
  }

  origin(): number {
    return 1;
  }

  stop(): void {
    this.stops += 1;
  }

  note(midi: number, time: number, seconds: number, velocity = 0.7, opts: NotePlayOptions = {}): void {
    if (opts.gain !== undefined && (opts.gain <= 0 || opts.gain > 1)) {
      throw new Error(`Gain trim out of range: ${opts.gain}`);
    }
    if (!Number.isFinite(midi) || midi < 12 || midi > 108) {
      throw new Error(`Note out of range: ${midi}`);
    }
    if (!Number.isFinite(time) || time < 0) throw new Error(`Bad note time: ${time}`);
    if (!Number.isFinite(seconds) || seconds <= 0) throw new Error(`Bad duration: ${seconds}`);
    this.notes.push({ midi, time, seconds, velocity, instrument: opts.instrument });
  }

  noteAtBeat(
    midi: number,
    origin: number,
    beat: number,
    beats: number,
    velocity = 0.7,
    opts: NotePlayOptions = {},
  ): number {
    const at = origin + beat * this.beatSeconds;
    this.note(midi, at, beats * this.beatSeconds, velocity, opts);
    return at;
  }

  chord(voicing: Voicing, origin: number, beat: number, opts: { beats?: number } = {}): number {
    this.chords.push(voicing);
    const beats = opts.beats ?? 4;
    for (const midi of voicing.notes) {
      this.note(midi, origin + beat * this.beatSeconds, beats * this.beatSeconds);
    }
    // The real performer sends the bass note to the bass voice, so the double
    // does too: a test that cannot tell them apart cannot check either.
    if (voicing.bass !== undefined) {
      this.note(voicing.bass, origin + beat * this.beatSeconds, beats * this.beatSeconds, 0.72, {
        instrument: BASS_INSTRUMENT,
      });
    }
    return beats * this.beatSeconds;
  }

  melody(notes: readonly PhraseNote[], origin: number, startBeat = 0): number {
    this.melodies.push([...notes]);
    let end = 0;
    for (const n of notes) {
      this.note(n.midi, origin + (startBeat + n.beat) * this.beatSeconds, n.beats * this.beatSeconds);
      end = Math.max(end, (startBeat + n.beat + n.beats) * this.beatSeconds);
    }
    return end;
  }

  drone(
    rootPc: number,
    origin: number,
    beats: number,
    velocity = 0.5,
    fifth: number | null = 7,
  ): void {
    if (origin < 0) throw new Error('Drone scheduled in the past');
    this.drones += 1;
    this.progressions.push(beats);
    // Recorded as notes as well as counted: a drone is audible material, and
    // anything checking what a question sounds has to be able to see it.
    const root = foldInto(rootPc + 36, REGISTER.drone.lo, REGISTER.drone.hi);
    const seconds = beats * this.beatSeconds;
    this.note(root, origin, seconds, velocity);
    if (fifth !== null) this.note(root + fifth, origin, seconds, velocity * 0.8);
  }

  progression(
    chords: readonly (BassChord & { voicing: Voicing })[],
    origin: number,
    opts: { style?: BassStyle; approachFromAbove?: boolean } = {},
  ): number {
    // One entry per chord, whatever the style: `chords` is what the question
    // claims to be playing, not how many times the comping hits it.
    let beat = 0;
    for (let i = 0; i < chords.length; i++) {
      const c = chords[i];
      this.chords.push(c.voicing);
      for (const midi of c.voicing.notes) {
        this.note(midi, origin + beat * this.beatSeconds, c.beats * this.beatSeconds);
      }
      beat += c.beats;
    }
    // The same bass line the real performer plays, from the same function.
    for (const b of progressionBass(chords, opts.style ?? 'root-fifth', {
      approachFromAbove: opts.approachFromAbove,
    })) {
      const time = this.noteAtBeat(b.midi, origin, b.beat, b.beats, b.velocity, {
        instrument: BASS_INSTRUMENT,
      });
      this.bass.push({ midi: b.midi, beat: b.beat, time, role: b.role });
    }
    return beat * this.beatSeconds;
  }

  asPerformer(): Performer {
    return this as unknown as Performer;
  }
}
