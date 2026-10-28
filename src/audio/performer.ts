import type { AudioEngine } from './engine';
import { BASS_INSTRUMENT, DEFAULT_INSTRUMENT, PAD_INSTRUMENT, getInstrument } from './instruments';
import type { Voicing } from '../music/voicing';
import type { RealisedChord } from '../music/progressions';
import type { PhraseNote } from '../music/phrase';
import { BASS_GAP, REGISTER, foldInto, pcAtOrAbove, type Midi } from '../music/pitch';
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
 * What a bass note is doing.
 *
 * Root motion is one of the main things a learner listens for when naming a
 * progression — down a fifth in a ii–V–I, down a half step in a tritone
 * substitution, up a tone from ♭VII in a backdoor. Every other note the bass
 * plays sits between those, and nothing in the audio says which is which, so
 * the line has to say it here and the display has to show it.
 */
export type BassRole = 'root' | 'fifth' | 'passing' | 'approach';

export interface BassNote {
  /** Absolute beat, measured the same way the chord above it is. */
  beat: number;
  beats: number;
  midi: number;
  velocity: number;
  role: BassRole;
}

/**
 * The bass line underneath one chord of a progression.
 *
 * Pulled out of the performer so that the test double can sound exactly what
 * the real one sounds. A bass note that only the browser ever hears is a bass
 * note no test can check, and the bass is where the root of every chord in a
 * progression is stated.
 */
export interface BassChord {
  beats: number;
  rootPc: number;
  /** Every pitch class the chord holds, so the bass can agree with it. */
  pcs: readonly number[];
  /** Lowest note of the voicing above, so the bass can stay clear of it. */
  low: Midi;
}

/** Octaves of `pc` that fit the bass register, lowest first. */
function bassOctaves(pc: number): Midi[] {
  const out: Midi[] = [];
  for (let m = pcAtOrAbove(mod(pc, 12), REGISTER.bass.lo); m <= REGISTER.bass.hi; m += 12) {
    out.push(m);
  }
  return out;
}

/** Which octave of the root to play, given what is sounding above it. */
function placeRoot(rootPc: number, low: Midi): Midi {
  const options = bassOctaves(rootPc);
  if (!options.length) return foldInto(mod(rootPc, 12) + 36, REGISTER.bass.lo, REGISTER.bass.hi);
  const cost = (m: Midi) => {
    const gap = low - m;
    return Math.abs(gap - BASS_GAP.want) +
      (gap < BASS_GAP.min ? 100 : 0) +
      (gap > BASS_GAP.max ? 24 : 0);
  };
  return options.reduce((best, m) => (cost(m) < cost(best) ? m : best), options[0]);
}

/**
 * The whole bass line under a set of changes, in one call.
 *
 * Shared by the performer that schedules it, the test double that records it,
 * and the text that describes it, so none of the three can describe a
 * different line from the other two.
 */
export function progressionBass(
  chords: readonly BassChord[],
  style: BassStyle,
  opts: { startBeat?: number; approachFromAbove?: boolean } = {},
): BassNote[] {
  const out: BassNote[] = [];
  // Where each root will land, worked out before the line is built, so a
  // walking bar can aim at the note the next bar will really play.
  const roots = chords.map((c) => placeRoot(c.rootPc, c.low));
  let beat = opts.startBeat ?? 0;
  for (let i = 0; i < chords.length; i++) {
    out.push(...bassLine(chords[i], chords[i + 1], style, beat, {
      approachFromAbove: opts.approachFromAbove,
      nextRootMidi: roots[i + 1],
    }));
    beat += chords[i].beats;
  }
  return out;
}

/**
 * The last beat of a walking bar, leading into the next chord's root.
 *
 * A half step above the target is a strong, idiomatic approach, and it is also
 * exactly the bass of a tritone substitution: D♭ under a bar that resolves
 * to C is the ♭II7 a learner is being taught to recognise. While those
 * questions are still being asked, the line comes from below instead, or from
 * the tone above, and a passing note can no longer be mistaken for a change.
 */
function approachNotes(nextRoot: Midi, from: Midi, fromAbove: boolean): Midi[] {
  // Below by a half step, or above by a tone — whichever keeps the line closer
  // to where the bass already is, with the other kept as a second choice.
  const below = nextRoot - 1;
  const above = nextRoot + 2;
  const safe = Math.abs(below - from) <= Math.abs(above - from) ? [below, above] : [above, below];
  if (!fromAbove && nextRoot < from) return safe;
  return [nextRoot + (nextRoot >= from ? -1 : 1), ...safe];
}

/**
 * Moves a bass note by octaves until it is inside the register and clear of
 * the voicing, keeping it as close as it can to where it wanted to be.
 */
function usableBass(midi: Midi, low: Midi): boolean {
  return midi >= REGISTER.bass.lo && midi <= REGISTER.bass.hi && low - midi >= BASS_GAP.min;
}

function settle(midi: Midi, low: Midi, fallback: Midi): Midi {
  for (const candidate of [midi, midi - 12, midi + 12, midi - 24, midi + 24]) {
    if (usableBass(candidate, low)) return candidate;
  }
  return fallback;
}

/**
 * The interval above the root the chord uses for a given scale degree.
 *
 * Which fifth a chord has is not a given: a half-diminished chord has a ♭5
 * and an altered dominant a ♯5, and a bass walking a perfect fifth under
 * either lands a semitone from the note that defines the chord — in the
 * register where a clash is least forgivable.
 */
function ownTone(rootPc: number, pcs: readonly number[], prefer: readonly number[]): number | null {
  const held = new Set(pcs.map((pc) => mod(pc, 12)));
  return prefer.find((offset) => held.has(mod(rootPc + offset, 12))) ?? null;
}

/**
 * How the bass behaves under a progression. There are three, and no more.
 *
 * Which one plays is never a setting: the cheat sheet picks it from the
 * voicing the learner has already chosen, and a session picks it from the
 * level. A bass toggle would be one more thing to understand before you can
 * practise, and the right answer at each point is not a matter of taste.
 */
export type BassStyle =
  /** One note per chord — the root, held. Root motion and nothing else. */
  | 'root'
  /** The root, then its fifth halfway through a long chord. */
  | 'root-fifth'
  /** Quarter notes: root, fifth, seventh, then a step into the next root. */
  | 'walking';

export const BASS_STYLES: BassStyle[] = ['root', 'root-fifth', 'walking'];

/** What the bass is doing, for the caption under a set of changes. */
export const BASS_STYLE_CAPTION: Record<BassStyle, string> = {
  root: 'Bass: roots only.',
  'root-fifth': 'Bass: the root, then its fifth.',
  walking: 'Bass: walking — root, fifth, seventh, then a step into the next root.',
};

export function bassLine(
  chord: BassChord,
  next: { rootPc: number } | undefined,
  style: BassStyle,
  startBeat: number,
  opts: { approachFromAbove?: boolean; nextRootMidi?: Midi } = {},
): BassNote[] {
  const { beats, rootPc, pcs, low } = chord;
  const root = placeRoot(rootPc, low);
  // Diminished, perfect or augmented, whichever this chord actually holds.
  const fifth = ownTone(rootPc, pcs, [7, 6, 8]);
  // Seventh, sixth or diminished seventh, in that order of preference. A
  // triad has none, and then the third stands in, so the walking line stays
  // inside the harmony rather than implying a seventh the chord has not got.
  const third = ownTone(rootPc, pcs, [3, 4]);
  const seventh = ownTone(rootPc, pcs, [10, 11, 9]) ?? third;

  if (style === 'root') {
    // Doubling the voicing's own bottom note an octave down, rather than
    // picking an octave freely, is what makes it read as a doubling — but
    // only when that note is the root. A voicing too wide to stack from its
    // root gets the root placed underneath it instead, because a bass note
    // that is not the root is not what this style promises.
    const doubles = mod(low, 12) === mod(rootPc, 12);
    const midi = doubles ? settle(low - 12, low, root) : root;
    return [{ beat: startBeat, beats, midi, velocity: 0.74, role: 'root' }];
  }

  if (style !== 'walking') {
    const out: BassNote[] = [
      { beat: startBeat, beats, midi: root, velocity: 0.74, role: 'root' },
    ];
    // A long chord gets its fifth halfway through, which keeps a whole bar of
    // one harmony from going static. A chord with no fifth holds the root.
    if (beats >= 4 && fifth !== null) {
      // The fifth above the root where the register allows it, otherwise the
      // same note a fourth down. Reaching above the bass register puts it in
      // unison with the bottom of the right hand, and the ear then takes that
      // freshly struck note as the bass while the root decays — which is how
      // a root-position chord comes to sound like an inversion.
      const above = pcAtOrAbove(mod(rootPc + fifth, 12), root + 1);
      const midi = above <= REGISTER.bass.hi ? above : above - 12;
      out.push({
        beat: startBeat + 2,
        beats: beats - 2,
        midi: settle(midi, low, root),
        velocity: 0.6,
        role: 'fifth',
      });
    }
    return out;
  }

  // Walking quarter notes from one root to the next: root, fifth, the seventh,
  // then a half step into the following root.
  // The octave the next root will actually be played in, where the caller
  // knows it. Guessing from this chord's voicing would aim the approach note
  // at an octave the next chord never visits, which is a leap rather than a
  // step and does not lead anywhere.
  const nextRoot = opts.nextRootMidi ?? placeRoot(next?.rootPc ?? rootPc, low);
  const steps: Array<[number, number, BassRole]> = [[0, root, 'root']];
  if (beats >= 2) {
    steps.push([1, pcAtOrAbove(mod(rootPc + (fifth ?? third ?? 0), 12), root - 5), 'fifth']);
  }
  if (beats >= 3) {
    steps.push([2, pcAtOrAbove(mod(rootPc + (seventh ?? 0), 12), root - 2), 'passing']);
  }
  if (beats >= 4) {
    // An approach note shifted an octave to fit the register is no longer an
    // approach, so the alternatives are tried at their own octave first.
    const candidates = approachNotes(nextRoot, root, opts.approachFromAbove ?? false);
    const fits = candidates.find((m) => usableBass(m, low));
    steps.push([3, fits ?? settle(candidates[0], low, root), 'approach']);
  }
  return steps
    .filter(([b]) => b < beats)
    // Every step, the approach note included, is held to the same two rules.
    .map(([b, midi, role]) => ({
      beat: startBeat + b,
      beats: 1,
      midi: settle(midi, low, root),
      velocity: 0.72,
      role,
    }));
}


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
  drone(
    rootPc: number,
    origin: number,
    beats: number,
    velocity = 0.5,
    fifth: number | null = 7,
  ): void {
    const root = foldInto(rootPc + 36, REGISTER.drone.lo, REGISTER.drone.hi);
    const seconds = beats * this.beatSeconds;
    this.note(root, origin, seconds, velocity, { instrument: PAD_INSTRUMENT, gain: 0.7 });
    // The fifth is an argument because not every mode has a perfect one: a
    // drone sounding a natural 5 under a Locrian line contradicts the ♭5 that
    // is the whole point of the mode. Pass null and the root drones alone.
    if (fifth !== null) {
      this.note(root + fifth, origin, seconds, velocity * 0.8, { instrument: PAD_INSTRUMENT, gain: 0.7 });
    }
  }

  /**
   * Plays changes with a rhythm section.
   *
   * `comp` adds a walking bass and syncopated chord hits, which is how a
   * musician actually meets this harmony; `sustained` holds each chord, which
   * is clearer when the point is to pick the chords apart.
   */
  progression(
    chords: readonly (BassChord & { voicing: Voicing })[],
    origin: number,
    opts: {
      style?: BassStyle;
      startBeat?: number;
      velocity?: number;
      approachFromAbove?: boolean;
    } = {},
  ): number {
    const style = opts.style ?? 'root-fifth';
    const velocity = opts.velocity ?? 0.66;
    let beat = opts.startBeat ?? 0;

    for (let i = 0; i < chords.length; i++) {
      const { voicing, beats } = chords[i];
      const stripped: Voicing = { ...voicing, bass: undefined, all: voicing.notes };

      if (style === 'walking') {
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
      } else {
        this.chord(stripped, origin, beat, { beats, velocity, roll: 0.012 });
      }
      beat += beats;
    }
    for (const b of progressionBass(chords, style, {
      startBeat: opts.startBeat ?? 0,
      approachFromAbove: opts.approachFromAbove,
    })) {
      this.noteAtBeat(b.midi, origin, b.beat, b.beats, b.velocity, {
        instrument: BASS_INSTRUMENT,
      });
    }
    return this.beatOffset(beat);
  }

  /** Builds the chord list a progression needs, with voice leading threaded. */
  static changes(
    realised: readonly RealisedChord[],
    voicings: readonly Voicing[],
  ): Array<BassChord & { voicing: Voicing }> {
    return realised.map((r, i) => ({
      voicing: voicings[i],
      beats: r.beats,
      rootPc: r.chord.rootPc,
      pcs: r.chord.quality.intervals.map((iv) => mod(r.chord.rootPc + iv, 12)),
      low: voicings[i].notes[0],
    }));
  }
}
