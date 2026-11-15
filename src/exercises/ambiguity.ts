import { couldSound, type Voicing } from '../music/voicing';
import { makeChord, type Chord, type ChordQuality } from '../music/chords';
import { PITCH_CLASSES, type PitchClass } from '../music/pitch';
import { mod } from '../lib/util';

/**
 * Everything that sounded, as pitch classes — the bass included.
 *
 * The bass is part of what a listener heard, so it is part of what a rival
 * answer has to account for: a chord that cannot play the note underneath is
 * not a chord that could have produced this.
 */
export function soundingPitchClasses(voicing: Voicing): Set<PitchClass> {
  return new Set(voicing.all.map((m) => mod(m, 12)));
}

/**
 * Whether a rival chord could have produced what sounded.
 *
 * Tensions are always allowed the rival, whatever this question was voiced
 * with. A listener cannot know which setting produced what they heard, so a
 * chord that can account for it is a defensible answer whether or not this
 * particular question would have voiced it that way.
 *
 * `couldSound` is the voicing engine's own account of what a chord may play,
 * so the filter and the engine cannot disagree about it.
 */
export const couldAccountFor = (rival: Chord, sounding: ReadonlySet<PitchClass>): boolean =>
  couldSound(rival, sounding, true);

/**
 * Drops the wrong answers that would in fact be right.
 *
 * A voicing that leaves the root out can land exactly on another chord: a
 * rootless Em7♭5 is a G minor triad note for note, and D sus2 and A sus4 are
 * the same three notes read from different roots. Offering both gives the
 * listener nothing to decide on, so any quality that reproduces what sounded
 * — from any root — is kept out of the running.
 *
 * Not "sounds exactly this quality's notes", which was the old test and is
 * too narrow once voicings may add tensions: a rootless Dm7 sounds F A C E,
 * which no quality names exactly and which an F major triad plus a 9th names
 * perfectly well.
 */
export function unambiguousQualities(
  pool: readonly ChordQuality[],
  target: ChordQuality,
  sounding: ReadonlySet<PitchClass>,
): ChordQuality[] {
  const matchesEar = (q: ChordQuality) =>
    PITCH_CLASSES.some((root) => couldAccountFor(makeChord(root, q.id), sounding));
  return pool.filter((q) => q === target || !matchesEar(q));
}

/**
 * The same filter where the answers name a root as well as a quality.
 *
 * A question that asks "which chord was that" offers whole chords, so each
 * one is tested on its own root rather than on every root: Gm13 is a wrong
 * answer to a Gm7 played with its 13 and B♭13 is not, and the difference is
 * the root the listener is being asked to hear.
 */
export function unambiguousChords(
  pool: readonly Chord[],
  target: Chord,
  sounding: ReadonlySet<PitchClass>,
): Chord[] {
  const isTarget = (c: Chord) =>
    mod(c.rootPc, 12) === mod(target.rootPc, 12) && c.quality.id === target.quality.id;
  return pool.filter((c) => isTarget(c) || !couldAccountFor(c, sounding));
}

/**
 * Drops a chord whose notes another already offered.
 *
 * Two wrong answers that are the same notes are one wrong answer printed
 * twice, and a listener who can tell them apart is hearing the spelling
 * rather than the sound. A diminished seventh is the usual culprit — it
 * repeats every minor third, so F♯°7 and A°7 are the same four keys — but
 * B♭6 and Gm7 do it too.
 *
 * Order decides which survives, so shuffle first where the caller wants the
 * choice to vary.
 */
export function distinctChords(pool: readonly Chord[]): Chord[] {
  const seen = new Set<string>();
  const out: Chord[] = [];
  for (const chord of pool) {
    const key = [...new Set(chord.quality.intervals.map((i) => mod(chord.rootPc + i, 12)))]
      .sort((a, b) => a - b)
      .join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(chord);
  }
  return out;
}
