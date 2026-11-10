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
 * 4. A ♭5 or a ♯5 is always a member, never a colour. Six semitones above
 *    the root is the chord's own ♭5 where the chord declares one and a ♯11
 *    where it does not; eight is its ♯5 or a ♭13. So which way round the
 *    pair goes is settled by the chord, which is the only thing that can
 *    settle it: a 7♭5 and a 7 played with a ♯11 are the same five notes,
 *    and what tells them apart is whether the fifth is there.
 *
 *    This is rule 3 again from the other side. A diminished triad has no
 *    natural 5, and naming its added A♭ a ♯5 would put a ♭5 and a ♯5 in
 *    one chord; a 6/9 has no fifth at all, and its F♯ is the ♯11 of the
 *    scale it comes from rather than a fifth that went missing.
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
export function colourName(quality: ChordQuality, interval: number): string {
  const members = new Set(quality.intervals.map((i) => mod(i, 12)));
  const semitones = mod(interval, 12);
  switch (semitones) {
    case 1: return '♭9';
    case 2: return '9';
    case 3: return members.has(4) ? '♯9' : '♭3';
    case 5: return '11';
    // Never ♭5 or ♯5: an altered fifth is a chord tone, and a chord that
    // has one has said so in its own interval list, so this is only ever
    // reached for a chord whose fifth is natural or absent.
    case 6: return '♯11';
    case 8: return '♭13';
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

/**
 * Which basic chord each quality is, as a listener would answer for it.
 *
 * A chord's identity is its stack up to the 7th: root, third or sus, fifth
 * with any alteration, and seventh or sixth. Everything above that is
 * colour, and a voicing adds it freely — so a ∆9 is a ∆7 that was played
 * with its 9th, and offering both as answers to one sound asks the listener
 * to read the app's mind rather than hear the chord.
 *
 * The retired qualities stay in the catalogue: they are still what a
 * voicing sounds, still what the cheat sheet teaches, and still where a
 * learner's history lives. They are no longer answers.
 */
export const BASIC_OF: Record<string, string> = {
  // The eighteen basic chords are their own.
  maj: 'maj', min: 'min', dim: 'dim', aug: 'aug', sus2: 'sus2', sus4: 'sus4',
  6: '6', m6: 'm6', maj7: 'maj7', m7: 'm7', 7: '7', m7b5: 'm7b5',
  dim7: 'dim7', mMaj7: 'mMaj7', '7sus4': '7sus4', 'maj7#5': 'maj7#5',
  '7#5': '7#5', '7b5': '7b5',
  // And the rest are one of them with something on top.
  add9: 'maj', madd9: 'min', 69: '6',
  maj9: 'maj7', m9: 'm7', 9: '7',
  m11: 'm7', 11: '7sus4',
  13: '7', maj13: 'maj7', m13: 'm7',
  'maj7#11': 'maj7', '9#11': '7',
  '7b9': '7', '7#9': '7', '7b13': '7', '13b9': '7', '7alt': '7',
};

/** The eighteen chords a listener is asked to name. */
export const BASIC_QUALITIES: readonly string[] = [
  'maj', 'min', 'dim', 'aug', 'sus2', 'sus4', '6', 'm6', 'maj7', 'm7', '7',
  'm7b5', 'dim7', 'mMaj7', '7sus4', 'maj7#5', '7#5', '7b5',
];

export const isBasicQuality = (id: string): boolean => BASIC_QUALITIES.includes(id);

/**
 * What a pianist may add to each basic chord, from its chord scale.
 *
 * One table, shared by the voicing engine, the filter that drops ambiguous
 * answers and the colour exercise, so the three cannot disagree about what
 * a chord may sound. Two of these were wrong and are the reason the answer
 * sets were: a half-diminished chord was being handed a natural 13, which
 * is a semitone off its own ♭5 and belongs to no scale it comes from; and a
 * ∆7 was never given the ♯11 or 13 that are its two most ordinary colours,
 * which is why ∆9 stayed on offer against a ∆7♯11 that had been played with
 * a 9th.
 */
const COLOUR_TABLE: Record<string, readonly string[]> = {
  // Lydian and the major scale: the ♯11 is what a ∆7 is comped with, and
  // the natural 11 is the one note everyone agrees to avoid over a 3rd.
  maj7: ['9', '♯11', '13'],
  6: ['9', '♯11', '13'],
  // Dorian, which is where these two live.
  m7: ['9', '11', '13'],
  m6: ['9', '11', '13'],
  mMaj7: ['9', '11', '13'],
  // Mixolydian plain; the altered set is asked for separately.
  7: ['9', '13'],
  '7sus4': ['9', '13'],
  '7b5': ['9', '13'],
  // Locrian ♮2: the ♭13 is the sixth degree, and a natural 13 would sit a
  // semitone above the chord's own ♭5.
  m7b5: ['9', '11', '♭13'],
  // The diminished scale gives a °7 a whole tone above each of its tones,
  // including a natural 7th above the 𝄫7.
  dim7: ['9', '11', '♭13', '7'],
  // Whole-tone and Lydian augmented, which have no natural 5 to clash.
  '7#5': ['9', '♯11'],
  'maj7#5': ['9', '♯11'],
  // The triads take their seventh chord's colours, less the ones that need
  // a seventh underneath them to be heard as extensions at all.
  maj: ['9', '♯11'],
  min: ['9', '11'],
  dim: ['9', '11', '♭13'],
  aug: ['9', '♯11'],
  sus4: ['9'],
  sus2: [],
};

/**
 * The one colour a chord takes beside a member of the same number.
 *
 * A diminished seventh is four notes a minor third apart, and the scale it
 * comes from has eight notes to spread over seven letters: C°7 is C E♭ G♭
 * B𝄫, and the seventh that scale adds above the 𝄫7 is a B. Two sevenths,
 * and the music really does ask for both.
 */
const DESPITE_MEMBER: ReadonlySet<string> = new Set(['dim7:7']);

/** What an altered dominant is comped with, on top of its own tones. */
export const ALTERED_COLOURS: readonly string[] = ['♭9', '♯9', '♯11', '♭13'];

/** Where each colour sits above the root. */
const COLOUR_INTERVALS: Record<string, number> = {
  '7': 11, '♭9': 13, '9': 14, '♯9': 15, '11': 17, '♯11': 18, '♭13': 20, '13': 21,
};

/**
 * The colours this chord may be played with, as degree names.
 *
 * Read off the basic chord it is, less anything it already holds: a ∆9 is a
 * ∆7 whose 9th is written into the symbol, so what is left to add is the
 * ♯11 and the 13.
 */
export function coloursFor(
  quality: ChordQuality,
  opts: { altered?: boolean } = {},
): string[] {
  const basic = BASIC_OF[quality.id] ?? quality.id;
  const table = COLOUR_TABLE[basic] ?? [];
  const extra = opts.altered && basic === '7' ? ALTERED_COLOURS : [];
  const held = new Set(quality.intervals.map((i) => mod(i, 12)));
  // Which degrees the chord has already spoken for. A natural 9 is not on
  // offer over a 7♭9 and a ♭9 is not on offer over a 9: the symbol has
  // said which ninth it is, and sounding both would contradict it.
  const stated = new Set(memberNames(quality).map(degreeNumber));
  const out: string[] = [];
  for (const name of [...table, ...extra]) {
    const interval = COLOUR_INTERVALS[name];
    if (interval === undefined || held.has(mod(interval, 12))) continue;
    if (stated.has(degreeNumber(name)) && !DESPITE_MEMBER.has(`${basic}:${name}`)) continue;
    if (!out.includes(name)) out.push(name);
  }
  return out;
}

/** The same, as semitones above the root, for the voicing engine. */
export const colourIntervals = (
  quality: ChordQuality,
  opts: { altered?: boolean } = {},
): number[] => coloursFor(quality, opts).map((n) => COLOUR_INTERVALS[n]);

/** The interval a colour name sits at, for the exercises that name one. */
export const colourInterval = (name: string): number | undefined => COLOUR_INTERVALS[name];
