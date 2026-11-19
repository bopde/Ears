import type { RevealRow } from './types';
import { bottomTone } from './voicing-plan';
import { chordDegrees, chordSymbol, colourSounded, slashSymbol } from '../music/chords';
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
/** A chord degree as it reads in prose: "♭3" is the 3rd of the chord. */
function ordinal(degree: string): string | undefined {
  const n = Number(degree.replace(/[^0-9]/g, ''));
  if (!Number.isInteger(n) || n <= 0) return undefined;
  const teen = n % 100;
  if (teen >= 11 && teen <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

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
    // Which inversion the chord is in is the bass's business, and it is
    // said where the bass is: the symbol becomes a slash chord and the row
    // names the tone. The numeral stands as written either way, so its own
    // slash keeps one meaning — "of", as in V7/IV.
    const figure = onRoot
      ? undefined
      : ordinal(chordDegrees(r.chord, [landing!.midi])[0]);
    // What the comping put on top of the basic chord. The numeral says
    // ♭II7 whatever the voicing takes, so the row is where a listener
    // finds out it took a 9 and a ♯11.
    const colour = colourSounded(r.chord, voicings[i].all);
    return {
      // The numeral in the key centre in force here, which is what the
      // label above it counts from.
      roman: r.localRoman,
      ...(r.keyLabel ? { key: r.keyLabel } : {}),
      ...(r.marks.pair ? { pair: true } : {}),
      ...(r.marks.arrow ? { arrow: r.marks.arrow } : {}),
      ...(r.marks.note ? { note: r.marks.note } : {}),
      ...(colour.length ? { tag: colour.join(', ') } : {}),
      bass: figure,
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
