import { BASS_INSTRUMENT } from './instruments';
import {
  BASS_STYLE_CAPTION, Performer, bassLine, polyphonyGain,
  type BassNote, type BassRole, type BassStyle,
} from './performer';
import { realiseProgression, type ProgressionDef } from '../music/progressions';
import {
  voiceChord, voiceProgression, type Voicing, type VoicingOptions, type VoicingStyle,
} from '../music/voicing';
import { chordDegrees, chordSymbol, slashSymbol, type Chord } from '../music/chords';
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
export type ReferenceVoicing =
  | 'root' | 'voice-led' | 'shell' | 'rootless' | 'drop2' | 'quartal' | 'upperStructure';

export interface VoicingLesson {
  id: ReferenceVoicing;
  label: string;
  short: string;
  /** What the voicing is, as a shape. */
  blurb: string;
  /** When a player reaches for it. Absent on the one that is not a voicing. */
  use?: string;
  /** The thing worth knowing that the shape alone does not tell you. */
  detail?: string;
  /** The progression that shows it off, if the plain ii–V–I does not. */
  demo?: string;
}

export const REFERENCE_VOICINGS: VoicingLesson[] = [
  {
    id: 'root', label: 'Root position', short: 'Root',
    blurb: 'Every chord stacked from its root — 1, 3, 5, 7 and upward — with that root doubled underneath and nothing moving down there.',
    use: 'Learning a chord, and checking one. Nobody comps like this, and that is the point: there is nothing in the way of the chord itself.',
    detail: 'Because every chord here is built the same way, the shapes can be compared directly against each other. It is also the only mode on this page where what you read is exactly what you hear — everywhere else the notes have been rearranged.',
  },
  {
    id: 'voice-led', label: 'Voice led', short: 'Voice led',
    blurb: 'Each chord takes whichever inversion moves least from the last, over a root bass.',
    use: 'Everywhere. It is less a voicing than the rule that decides which one to use next.',
    detail: 'Watch the note names rather than the chord symbols: between one chord and the next, most of them stay put. That is what voice leading is, and it is why changes played this way sound like one line moving rather than a series of separate grabs.',
  },
  {
    id: 'shell', label: 'Shell', short: 'Shell',
    blurb: 'Root, 3rd and 7th only — three notes, nothing else.',
    use: 'Behind a soloist, and in stride and blues playing, where the left hand has to state the chord and stay out of the way at the same time.',
    detail: 'Three notes is the least that still names a chord. Lose the 3rd and major and minor sound alike; lose the 7th and a dominant and a major 7th do. The 5th says almost nothing on its own, which is why it is the first note to go here and the first to be replaced by a tension everywhere else.',
    demo: 'blues-opening',
  },
  {
    id: 'rootless', label: 'Rootless', short: 'Rootless',
    blurb: 'The root left to the bass, so the hand plays 3rd, 5th, 7th and 9th — or 7th, 9th, 3rd, 5th, which is the same four notes rotated.',
    use: 'Comping with a bass player, which is most of the time. Playing the root as well only doubles what is already there and muddies the bottom.',
    detail: 'The two shapes exist so they can alternate. Take form A on the ii and form B on the V and the hand barely moves — a note or two shifts and the rest stays. Down a chain of fourths that economy is the whole reason to learn both rather than one.',
  },
  {
    id: 'drop2', label: 'Drop 2', short: 'Drop 2',
    blurb: 'A close voicing with the second voice from the top dropped an octave. The same notes, opened out.',
    use: 'Chord melody and horn-section writing, where the top note is the tune and everything underneath has to move without turning to mud.',
    detail: 'Close voicings go muddy below middle C because neighbouring notes are too near each other down there. Spreading one voice an octave down opens a gap in the middle and the chord stays clear. A chord too low to drop without landing in the bass register is left alone here rather than played into it.',
    demo: 'coltrane-cell',
  },
  {
    id: 'quartal', label: 'Quartal', short: 'Quartal',
    blurb: 'Fourths stacked instead of thirds — three perfect fourths and a major third on top is the shape everybody learns from "So What".',
    use: 'Modal playing, where a chord is a colour to sit in rather than a step on the way somewhere.',
    detail: 'Built from fourths, it often has no 3rd in it at all, so it never commits to major or minor. That vagueness is the point: it states a key centre without stating a chord. It also moves in parallel without anything clashing, which is why modal writing slides the same shape up and down a scale.',
    demo: 'so-what',
  },
  {
    id: 'upperStructure', label: 'Upper structure', short: 'Upper str.',
    blurb: 'Guide tones underneath — just the 3rd and the 7th — with an ordinary major or minor triad built on the chord’s tensions above them.',
    use: 'Altered dominants, where reading the symbol is harder than playing it.',
    detail: 'The triad is always rooted on a tension — a 9th, a ♯11th, a ♭13th — never on a chord tone, or it would just be the chord again. That is why something as forbidding as G7alt turns out to be a plain E♭ triad in the right hand over two notes in the left. A chord with no tensions of its own has no triad to build, and falls back to rootless.',
    demo: 'minor-ii-V-i-alt',
  },
];

/** The voicings the Voicings tab teaches — voice leading is a rule, not a shape. */
export const VOICING_LESSONS = REFERENCE_VOICINGS.filter((v) => v.id !== 'voice-led');

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

/**
 * Tensions are on throughout the cheat sheet.
 *
 * The 9th a pianist adds to every rootless voicing is not in the chord symbol,
 * and in a question that would make the answer ambiguous. Here the chord is
 * already named on the card above the notes, so the voicing may be the one a
 * player would actually use.
 */
function voicingOptions(mode: ReferenceVoicing, chord: Chord): VoicingOptions {
  const base = { maxNotes: 5, tensions: true };
  switch (mode) {
    // bottomPc pins the stack to the root, so no inversion can creep in.
    case 'root': return { ...base, style: 'close', bottomPc: chord.rootPc, tensions: false };
    case 'shell': return { ...base, style: 'shell', maxNotes: 4 };
    case 'rootless': return { ...base, style: 'rootless' };
    case 'drop2': return { ...base, style: 'drop2' };
    case 'quartal': return { ...base, style: 'quartal' };
    case 'upperStructure': return { ...base, style: 'upperStructure' };
    default: return { ...base, style: 'spread' };
  }
}

/**
 * The cheat sheet never walks: a moving line is one more thing to hear past
 * when the point is to check what a chord or a change sounds like. Root
 * position gets roots alone; every other voicing gets the root and its fifth.
 */
export const referenceBassStyle = (mode: ReferenceVoicing): BassStyle =>
  mode === 'root' ? 'root' : 'root-fifth';

/** One line saying what the bass is doing, shown rather than offered. */
export const referenceBassCaption = (mode: ReferenceVoicing): string =>
  BASS_STYLE_CAPTION[referenceBassStyle(mode)];

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
      referenceBassStyle(mode),
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

/**
 * The degrees a chord's voicing sounds, bottom to top.
 *
 * This is what the voicing is, stated rather than described: "♭7 9 3 5" says
 * more about a rootless shape than a paragraph would, and it is read straight
 * off the notes that are about to be scheduled.
 */
export const referenceDegrees = (chord: ReferenceChord): string[] =>
  chordDegrees(chord.chord, chord.notes);

/** What a bass note is called on screen. Roots need no label; the rest do. */
export const BASS_ROLE_TAG: Record<BassRole, string> = {
  root: '',
  fifth: '5th',
  passing: 'passing',
  approach: 'approach',
};

export interface BassDisplay {
  name: string;
  role: BassRole;
  tag: string;
  /** Which degree of the chord this note is, where it is one at all. */
  degree: string;
}

export interface NoteDisplay {
  name: string;
  degree: string;
}

/**
 * Note names for display, in the order the ear meets them.
 *
 * Every bass note is listed, not only the roots, because every one of them
 * sounds. Which is which is the thing worth knowing: root motion is what a
 * learner is trying to hear, and a fifth or a passing note between two roots
 * is exactly what makes that hard.
 */
export function referenceNoteNames(
  chord: ReferenceChord,
  accidental: Accidental = 'both',
): { bass: BassDisplay[]; notes: NoteDisplay[] } {
  const degrees = chordDegrees(chord.chord, chord.notes);
  return {
    bass: chord.bass.map((b) => ({
      name: midiName(b.midi, accidental),
      role: b.role,
      tag: BASS_ROLE_TAG[b.role],
      degree: chordDegrees(chord.chord, [b.midi])[0],
    })),
    notes: chord.notes.map((m, i) => ({ name: midiName(m, accidental), degree: degrees[i] })),
  };
}

/**
 * The reference mode that plays a progression's recommended voicing.
 *
 * The music layer names a `VoicingStyle`, which is what a voicing *is*; the
 * cheat sheet's modes are how it offers them, and plain close voicings are
 * offered as root position.
 */
export function modeForStyle(style: VoicingStyle): ReferenceVoicing {
  switch (style) {
    case 'close': return 'root';
    case 'spread': return 'voice-led';
    default: return style;
  }
}

/** Schedules exactly what `referenceVoicings` describes. */
export function playReference(
  perf: Performer,
  chords: readonly ReferenceChord[],
  opts: { roll?: boolean; offsetBeats?: number } = {},
): number {
  const origin = perf.origin();
  const base = (chords[0]?.startBeat ?? 0) - (opts.offsetBeats ?? 0);
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
  return ((end - (opts.offsetBeats ?? 0)) * 60) / perf.tempo + 0.4;
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

/**
 * The same changes twice: root position first, then the voicing.
 *
 * Hearing them back to back is the only way to tell what a voicing adds from
 * what the harmony was doing anyway, which is hard to do when they only ever
 * arrive one at a time.
 */
export function playComparison(
  perf: Performer,
  def: ProgressionDef,
  tonic: PitchClass,
  mode: ReferenceVoicing,
): number {
  const plain = referenceVoicings(def, tonic, 'root');
  const dressed = referenceVoicings(def, tonic, mode);
  const first = playReference(perf, plain);
  const gap = 0.9;
  const beats = plain.reduce((n, c) => n + c.beats, 0);
  const second = playReference(perf, dressed, { offsetBeats: beats + (gap * perf.tempo) / 60 });
  return first + gap + second;
}

/** Plain names for the distances a bass can move between two roots. */
const MOTION_NAMES: Record<number, string> = {
  0: 'stays', 1: 'a half step', 2: 'a tone', 3: 'a minor third', 4: 'a major third',
  5: 'a fourth', 6: 'a tritone', 7: 'a fifth', 8: 'a minor sixth', 9: 'a major sixth',
  10: 'a minor seventh', 11: 'a major seventh', 12: 'an octave',
};

/**
 * What the bass does between one root and the next, as it actually plays.
 *
 * Read off the scheduled notes rather than off the roman numerals, so it
 * cannot disagree with the audio: a progression written as a fall of a fifth
 * is heard as a rise of a fourth when the bass turns the corner, and the
 * learner is listening to the second of those.
 */
export function rootMotion(bass: readonly BassNote[]): string[] {
  const roots = bass.filter((b) => b.role === 'root').map((b) => b.midi);
  const out: string[] = [];
  for (let i = 1; i < roots.length; i++) {
    const delta = roots[i] - roots[i - 1];
    const name = MOTION_NAMES[Math.min(Math.abs(delta), 12)] ?? 'a long way';
    out.push(delta === 0 ? 'stays' : `${delta > 0 ? 'rises' : 'falls'} ${name}`);
  }
  return out;
}

/**
 * The same thing as one line, for the reveal.
 *
 * A hint about what to listen for next time, not a lesson: repeated moves are
 * collapsed so a cycle of fourths does not read as a list.
 */
export function rootMotionLine(bass: readonly BassNote[]): string {
  const moves = rootMotion(bass);
  if (!moves.length) return '';
  // A line cliché holds one root the whole way; counting the times it does
  // nothing would be a strange way to say so.
  if (moves.every((m) => m === 'stays')) return 'Bass stays on one note throughout.';
  const runs: Array<{ move: string; count: number }> = [];
  for (const move of moves) {
    const last = runs[runs.length - 1];
    if (last && last.move === move) last.count += 1;
    else runs.push({ move, count: 1 });
  }
  const parts = runs.map(({ move, count }, i) => {
    const text = i === 0 ? `Bass ${move}` : move;
    return count > 1 ? `${text} ${count === 2 ? 'twice' : `${count} times`}` : text;
  });
  return `${parts.join(', then ')}.`;
}
