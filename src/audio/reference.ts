import { BASS_INSTRUMENT } from './instruments';
import { Performer, bassLine, polyphonyGain, type BassNote, type BassStyle } from './performer';
import { realiseProgression, type ProgressionDef } from '../music/progressions';
import { voiceChord, voiceProgression, type Voicing } from '../music/voicing';
import { chordSymbol, slashSymbol, type Chord } from '../music/chords';
import { midiName, type Accidental, type Midi, type PitchClass } from '../music/pitch';
import { mod } from '../lib/util';

/**
 * How the reference page voices a progression.
 *
 * `root` is the one that teaches: every chord stacked plainly from its root
 * with the root doubled underneath, so a learner hears the chord the symbol
 * names before meeting any of the ways a pianist disguises it. The others are
 * the voicings themselves, named so they can be studied rather than merely
 * encountered.
 */
export type ReferenceVoicing = 'root' | 'voice-led' | 'shell' | 'rootless' | 'drop2';

export const REFERENCE_VOICINGS: Array<{
  id: ReferenceVoicing;
  label: string;
  short: string;
  blurb: string;
}> = [
  {
    id: 'root', label: 'Root position', short: 'Root',
    blurb: 'Every chord stacked from its root, the root doubled an octave below, nothing moving underneath. This is the sound the chord symbol names.',
  },
  {
    id: 'voice-led', label: 'Voice led', short: 'Voice led',
    blurb: 'Each chord takes whichever inversion moves least from the last, over a root bass. How a pianist actually plays changes.',
  },
  {
    id: 'shell', label: 'Shell', short: 'Shell',
    blurb: 'Root, 3rd and 7th only. The notes that decide whether a chord is major, minor or dominant, with nothing colouring them.',
  },
  {
    id: 'rootless', label: 'Rootless', short: 'Rootless',
    blurb: 'The root left to the bass, so the hand plays 3rd, 5th, 7th and 9th. Lighter, and it is what you hear behind a bass player.',
  },
  {
    id: 'drop2', label: 'Drop 2', short: 'Drop 2',
    blurb: 'A close voicing with the second voice from the top dropped an octave. The same notes, opened out so the inner lines are audible.',
  },
];

export const REFERENCE_VOICING_IDS = REFERENCE_VOICINGS.map((v) => v.id);

/** One chord of a reference progression: what is shown and what sounds. */
export interface ReferenceChord {
  chord: Chord;
  /** Roman numeral carrying the quality that actually plays. */
  roman: string;
  /** Chord symbol, written as a slash chord whenever the bass is not the root. */
  symbol: string;
  beats: number;
  /** Where this chord starts, in beats from the top of the progression. */
  startBeat: number;
  voicing: Voicing;
  /** Right-hand notes, ascending. */
  notes: Midi[];
  /** The bass underneath, in the order it is struck. */
  bass: BassNote[];
}

function voicingOptions(mode: ReferenceVoicing, chord: Chord) {
  switch (mode) {
    // bottomPc pins the stack to the root, so no inversion can creep in.
    case 'root': return { style: 'close' as const, bottomPc: chord.rootPc, maxNotes: 5 };
    case 'shell': return { style: 'shell' as const, maxNotes: 4 };
    case 'rootless': return { style: 'rootless' as const, maxNotes: 4 };
    case 'drop2': return { style: 'drop2' as const, maxNotes: 5 };
    default: return { style: 'spread' as const, maxNotes: 5 };
  }
}

const bassStyleFor = (mode: ReferenceVoicing): BassStyle =>
  mode === 'root' ? 'root' : 'sustained';

/**
 * The one description of what a reference progression looks like and sounds
 * like, in a given voicing mode and key.
 *
 * Both the audio and the note display read this, so the two cannot disagree:
 * the page can only show the notes that are about to be scheduled.
 */
export function referenceVoicings(
  def: ProgressionDef,
  tonic: PitchClass,
  mode: ReferenceVoicing = 'root',
  accidental: Accidental = 'both',
): ReferenceChord[] {
  const realised = realiseProgression(def, tonic);
  const chords = realised.map((r) => r.chord);

  // Root position is deliberately not voice led: the point is that every chord
  // is built the same way, so the shapes can be compared against each other.
  const voicings = mode === 'root'
    ? chords.map((chord) => voiceChord(chord, voicingOptions('root', chord)))
    : voiceProgression(chords, voicingOptions(mode, chords[0]));

  let startBeat = 0;
  return realised.map((r, i) => {
    const voicing = voicings[i];
    const bass = bassLine(
      {
        beats: r.beats,
        rootPc: r.chord.rootPc,
        pcs: r.chord.quality.intervals.map((iv) => mod(r.chord.rootPc + iv, 12)),
        low: voicing.notes[0],
      },
      realised[i + 1]?.chord,
      bassStyleFor(mode),
      startBeat,
    );
    const bassPc = mod(bass[0]?.midi ?? voicing.notes[0], 12);
    const out: ReferenceChord = {
      chord: r.chord,
      roman: r.roman,
      // A rootless voicing over a root bass is still that chord; it is only a
      // slash chord when the lowest sounding note is not the root.
      symbol: bassPc === r.chord.rootPc
        ? chordSymbol(r.chord, accidental)
        : slashSymbol(r.chord, bassPc, accidental),
      beats: r.beats,
      startBeat,
      voicing,
      notes: voicing.notes,
      bass,
    };
    startBeat += r.beats;
    return out;
  });
}

/** Note names for display, in the order the ear meets them. */
export function referenceNoteNames(
  chord: ReferenceChord,
  accidental: Accidental = 'both',
): { bass: string[]; notes: string[] } {
  return {
    bass: chord.bass.map((b) => midiName(b.midi, accidental)),
    notes: chord.notes.map((m) => midiName(m, accidental)),
  };
}

/** Schedules exactly what `referenceVoicings` describes. */
export function playReference(
  perf: Performer,
  chords: readonly ReferenceChord[],
  opts: { roll?: boolean } = {},
): number {
  const origin = perf.origin();
  const base = chords[0]?.startBeat ?? 0;
  // Rolling moves the chord later rather than earlier, so the bass is struck
  // first and the stack opens upward from it.
  const roll = opts.roll ? 0.16 : 0.012;
  let end = 0;

  for (const c of chords) {
    const at = c.startBeat - base;
    const voices = c.notes.length + c.bass.length;
    perf.chord({ ...c.voicing, bass: undefined, all: c.notes }, origin, at, {
      beats: c.beats,
      velocity: 0.66,
      roll,
    });
    for (const b of c.bass) {
      perf.noteAtBeat(b.midi, origin, b.beat - base, b.beats, b.velocity, {
        instrument: BASS_INSTRUMENT,
        gain: polyphonyGain(voices),
      });
    }
    end = Math.max(end, at + c.beats);
  }
  return (end * 60) / perf.tempo + 0.4;
}

/**
 * One chord on its own, in the chosen voicing.
 *
 * With `roll` the bass sounds first and the stack walks up from it a note at a
 * time, then the whole chord is struck: the only way to hear every voice in a
 * five-note voicing and still hear it as a chord.
 */
export function playReferenceChord(
  perf: Performer,
  chord: ReferenceChord,
  opts: { roll?: boolean } = {},
): number {
  const origin = perf.origin();
  const voices = chord.notes.length + chord.bass.length;
  const gain = polyphonyGain(voices);

  if (!opts.roll) {
    const bass = chord.bass[0];
    perf.chord({ ...chord.voicing, bass: undefined, all: chord.notes }, origin, 0, {
      beats: 4,
      velocity: 0.68,
      roll: 0.012,
    });
    if (bass) {
      perf.noteAtBeat(bass.midi, origin, 0, 4, bass.velocity, {
        instrument: BASS_INSTRUMENT,
        gain,
      });
    }
    return 4 * perf.beatSeconds + 0.4;
  }

  const step = 0.3;
  const bassNote = chord.bass[0];
  if (bassNote) {
    perf.note(bassNote.midi, origin, step * (chord.notes.length + 1) + 2.6, 0.7, {
      instrument: BASS_INSTRUMENT,
    });
  }
  chord.notes.forEach((midi, i) => {
    perf.note(midi, origin + step * (i + 1), step * (chord.notes.length - i) + 2.6, 0.62);
  });
  // Then the block, so the rolled notes resolve into one sound.
  const after = origin + step * (chord.notes.length + 1) + 0.25;
  chord.notes.forEach((midi) => perf.note(midi, after, 2.4, 0.64, { gain }));
  if (bassNote) {
    perf.note(bassNote.midi, after, 2.4, 0.7, { instrument: BASS_INSTRUMENT, gain });
  }
  return after - origin + 2.6;
}
