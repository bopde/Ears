import type { NotePlayOptions, Performer } from './audio/performer';
import type { Voicing } from './music/voicing';
import type { PhraseNote } from './music/phrase';

export interface RecordedNote {
  midi: number;
  time: number;
  seconds: number;
  velocity: number;
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
    this.notes.push({ midi, time, seconds, velocity });
  }

  noteAtBeat(
    midi: number,
    origin: number,
    beat: number,
    beats: number,
    velocity = 0.7,
    _opts: NotePlayOptions = {},
  ): number {
    const at = origin + beat * this.beatSeconds;
    this.note(midi, at, beats * this.beatSeconds, velocity);
    return at;
  }

  chord(voicing: Voicing, origin: number, beat: number, opts: { beats?: number } = {}): number {
    this.chords.push(voicing);
    const beats = opts.beats ?? 4;
    for (const midi of voicing.all) {
      this.note(midi, origin + beat * this.beatSeconds, beats * this.beatSeconds);
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

  drone(_rootPc: number, origin: number, beats: number): void {
    if (origin < 0) throw new Error('Drone scheduled in the past');
    this.drones += 1;
    this.progressions.push(beats);
  }

  progression(
    chords: readonly { voicing: Voicing; beats: number; rootPc: number }[],
    origin: number,
  ): number {
    let beat = 0;
    for (const c of chords) {
      this.chords.push(c.voicing);
      for (const midi of c.voicing.notes) {
        this.note(midi, origin + beat * this.beatSeconds, c.beats * this.beatSeconds);
      }
      beat += c.beats;
    }
    return beat * this.beatSeconds;
  }

  asPerformer(): Performer {
    return this as unknown as Performer;
  }
}
