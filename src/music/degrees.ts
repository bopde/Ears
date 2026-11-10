import type { ChordQuality } from './chords';
import { mod } from '../lib/util';

/**
 * What a note is called over the chord it is sounding in.
 *
 * One module, because a degree name is not a property of an interval. Six
 * semitones above the root is a ♭5 in a half-diminished chord and a ♯11 in a
 * Lydian dominant, and the difference is not the pitch but whether the chord
 * has a natural 5th for it to argue with. Spelling then follows the name —
 * `spellInChord` takes its letter from the number — so a name that is wrong
 * makes a spelling that is wrong too, and a reveal that reads "♭5" beside a
 * note written F♯ has told the reader two different things.
 *
 * The rules, in full:
 *
 * 1. A chord's own members are named by member number — 1, 3, 5, 7, with
 *    ♭, ♯ or 𝄫 as needed, plus 2 and 4 in sus chords and 6 in sixth chords.
 *    A quality may declare its members' names; the table below is only what
 *    is used when it does not.
 * 2. Anything above the 7th is 9, 11 or 13 with alterations, never 2, 4 or
 *    6 — whenever the chord has a 7th for the stack to continue past.
 * 3. Over a chord with no 7th the added tones are 9, ♯11 and 6, and no name
 *    may reuse a member number the chord is already sounding: not "♭5"
 *    beside a natural 5, not "♭3" beside a major 3rd.
 * 4. Which way round the two enharmonics go is decided by whether the chord
 *    already names a fifth. With one — natural, flattened or raised — six
 *    semitones is a ♯11 and eight a ♭13, colour above a fifth that is
 *    already accounted for. With none, they are the chord's own ♭5 and ♯5.
 *
 *    Asking for a fifth of any kind rather than a natural one is rule 3
 *    doing its work: a diminished triad has no natural 5, and naming its
 *    added A♭ a ♯5 would put a ♭5 and a ♯5 in the same chord. It also
 *    agrees with how the altered fifths are comped — a 7♯5 takes a ♯11,
 *    not a ♭5, which is what every chord-scale book gives it.
 */

/** What an interval is called as a chord member, where a quality says nothing. */
const MEMBER_FALLBACK: Record<number, string> = {
  0: '1', 1: '♭2', 2: '2', 3: '♭3', 4: '3', 5: '4',
  6: '♭5', 7: '5', 8: '♯5', 9: '6', 10: '♭7', 11: '7',
  12: '1', 13: '♭9', 14: '9', 15: '♯9', 16: '3', 17: '11',
  18: '♯11', 19: '5', 20: '♭13', 21: '13',
};

/**
 * The qualities whose members the table above would misname.
 *
 * Only three, because the table reads an interval under the octave as the
 * member it usually is. These are the chords where that is not what the
 * member is:
 *
 * A fully diminished seventh's top note is a seventh — the chord is a stack
 * of minor thirds and its fourth tone is the fourth of them. Read as a 6th
 * it spells on the wrong letter, which is why B°7 printed B D F G♯: the G♯
 * is a 6th above B, and the chord's seventh is an A♭.
 *
 * A six-nine chord and a dominant 11th both reach past the octave, so their
 * upper tones are extensions and not displaced members.
 */
const MEMBER_NAMES: Record<string, readonly string[]> = {
  dim7: ['1', '♭3', '♭5', '𝄫7'],
  69: ['1', '3', '6', '9'],
  11: ['1', '5', '♭7', '9', '11'],
};

/**
 * What an interval is usually called as a chord member, chord unknown.
 *
 * The fallback on its own, for the few places that have an interval and no
 * chord to read it against. Anything that does have one should ask
 * `degreeIn`, which can tell a ♭5 from a ♯11.
 */
export const memberNameOf = (interval: number): string =>
  MEMBER_FALLBACK[interval] ?? MEMBER_FALLBACK[mod(interval, 12)] ?? '?';

/** What this quality calls the tone at `interval`, as one of its members. */
export function memberName(quality: ChordQuality, interval: number): string {
  const declared = MEMBER_NAMES[quality.id];
  if (declared) {
    const at = quality.intervals.indexOf(interval);
    if (at >= 0 && declared[at]) return declared[at];
  }
  return memberNameOf(interval);
}

/** Every member name this quality uses, in its own order. */
export const memberNames = (quality: ChordQuality): string[] =>
  quality.intervals.map((i) => memberName(quality, i));

/**
 * Whether the chord stacks as far as a seventh, so the stack can continue.
 *
 * Asked of the names rather than the intervals, which is the only way to
 * tell a °7's 𝄫7 from a 6 chord's 6th: both are nine semitones up, and one
 * is a seventh and the other is not.
 */
export const hasSeventh = (quality: ChordQuality): boolean =>
  memberNames(quality).some((n) => n.endsWith('7'));

/**
 * What a note the chord does not hold is called over it.
 *
 * The two enharmonic pairs are decided by the natural 5th, per rule 4, and
 * the thirds by the major 3rd: a note three semitones up is a ♯9 over a
 * chord with a major third in it, because calling it a ♭3 would put two
 * different thirds in the same chord.
 */
/** Whether the chord already names a fifth of some kind. */
const hasFifth = (members: ReadonlySet<number>): boolean =>
  members.has(6) || members.has(7) || members.has(8);

export function colourName(quality: ChordQuality, interval: number): string {
  const members = new Set(quality.intervals.map((i) => mod(i, 12)));
  const semitones = mod(interval, 12);
  switch (semitones) {
    case 1: return '♭9';
    case 2: return '9';
    case 3: return members.has(4) ? '♯9' : '♭3';
    case 5: return '11';
    case 6: return hasFifth(members) ? '♯11' : '♭5';
    case 8: return hasFifth(members) ? '♭13' : '♯5';
    // Nine semitones is a 13th where there is a seventh under it to extend,
    // and a plain 6th where there is not: a major triad with an A on top is
    // a C6, not a C13 with most of the chord missing.
    case 9: return hasSeventh(quality) ? '13' : '6';
    default: return MEMBER_FALLBACK[semitones] ?? '?';
  }
}

/**
 * What the tone `interval` above the root is called in this chord.
 *
 * A member by its member name, anything else by the colour rules. Matching
 * is by pitch class, because a voicing puts its notes wherever they fit: the
 * 9th of a C9 may sound in the same octave as the root.
 */
export function degreeIn(quality: ChordQuality, interval: number): string {
  const semitones = mod(interval, 12);
  const member = quality.intervals.find((i) => mod(i, 12) === semitones);
  return member === undefined ? colourName(quality, semitones) : memberName(quality, member);
}

/** The number a degree name carries, for the letter its spelling sits on. */
export function degreeNumber(name: string): number {
  const number = Number(name.replace(/[^0-9]/g, ''));
  return Number.isInteger(number) && number > 0 ? number : 0;
}
