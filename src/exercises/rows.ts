import type { RevealRow } from './types';
import { bottomTone } from './voicing-plan';
import { chordDegrees, chordSymbol, slashSymbol } from '../music/chords';
import type { RealisedChord } from '../music/progressions';
import type { Voicing } from '../music/voicing';
import { soundedChord } from '../audio/reference';
import type { BassNote } from '../audio/performer';
import type { PracticeSettings } from '../session/settings';
import { mod } from '../lib/util';

/**
 * The note the bass lands on under each change, matched by beat.
 *
 * Not by index: a walking line plays four notes to a chord and only the
 * first of them is under the change — the one that states the root, and the
 * one a listener hears the chord over.
 */
export function bassLandings<T extends { midi: number; beat: number }>(
  realised: readonly RealisedChord[],
  bass: readonly T[],
): Array<T | undefined> {
  let beat = 0;
  return realised.map((r) => {
    const start = beat;
    beat += r.beats;
    return bass.find((b) => b.beat >= start && b.beat < beat);
  });
}

/**
 * One row per chord of a set of changes, read off the voicings that played.
 *
 * A reveal used to be a single line of symbols, which answered "what were the
 * chords" and nothing else. What a listener who missed it wants is which
 * numeral each symbol was and what the notes under it were, and neither fits
 * on one line — so each chord gets a row, and the notes stay folded away
 * until the row is tapped.
 *
 * Shared, because every question that comps a progression owes its listener
 * the same account of it. The tonal-centre question plays the same changes
 * through the same performer, and for a while said only which key they were
 * in: you could hear a tension and have nowhere to check it.
 *
 * The bass is matched to its chord by beat rather than by index: a walking
 * line plays four notes to a chord and the first of them is the one that
 * states the root.
 */
export function revealRows(
  realised: readonly RealisedChord[],
  voicings: readonly Voicing[],
  bass: readonly BassNote[],
  settings: PracticeSettings,
  targetIndex?: number,
): RevealRow[] {
  const landings = bassLandings(realised, bass);
  return realised.map((r, i) => {
    const landing = landings[i];
    const bassPc = landing === undefined ? r.chord.rootPc : mod(landing.midi, 12);
    const onRoot = bassPc === mod(r.chord.rootPc, 12);
    // Which inversion the chord is in is the bass's business. While it lands
    // on the root the numeral stands as written; when it does not, the
    // numeral says so — I/3 — and the symbol becomes a slash chord.
    const figure = onRoot
      ? undefined
      : chordDegrees(r.chord, [landing!.midi])[0].replace(/[^0-9]/g, '');
    return {
      roman: figure ? `${r.roman}/${figure}` : r.roman,
      symbol: onRoot
        ? chordSymbol(r.chord, settings.accidental)
        : slashSymbol(r.chord, bassPc, settings.accidental),
      // What the hands have underneath, read off the voicing that was
      // scheduled rather than worked out again from the chord.
      bottom: bottomTone(r.chord, voicings[i]),
      target: targetIndex === i ? true : undefined,
      played: soundedChord(
        r.chord,
        { notes: voicings[i].notes, bass: landing?.midi },
        settings.accidental,
      ),
    };
  });
}
