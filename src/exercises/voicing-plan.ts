import {
  VOICING_STYLES, isRootFree, type RootlessForm, type Voicing, type VoicingStyle,
} from '../music/voicing';
import { chordDegrees, type Chord } from '../music/chords';
import { CONCEPTS, voicingConceptId } from '../music/catalog';
import { PROGRESSIONS } from '../music/progressions';
import type { PracticeSettings } from '../session/settings';
import type { BassStyle } from '../audio/performer';
import { clamp, mod } from '../lib/util';
import type { Rng } from '../lib/rng';

/**
 * How plainly a question is voiced.
 *
 * `curve` ties it to the difficulty level, which is the default and the only
 * setting that adapts. The other two exist because the curve is a compromise:
 * a learner working through a book of changes wants everything in root
 * position whatever their level, and one preparing for a gig wants none of it.
 */
export type VoicingMode = 'curve' | 'plain' | 'realistic';

export const VOICING_MODES: Array<{ value: VoicingMode; label: string; blurb: string }> = [
  // "By level" rather than "Mixed": the note-name setting is already called
  // that, and a settings screen with two Mixeds on it explains neither.
  { value: 'curve', label: 'By level', blurb: 'Plain at first, the way a pianist plays by the top levels.' },
  // "Basic chords", not "root position": root position is a fact about the
  // bass, and this mode is about the hands as well — close, nothing added,
  // the root underneath. The id stays `plain`, so a saved setting still
  // means what it meant.
  {
    value: 'plain',
    label: 'Basic chords only',
    blurb: 'Close voicings, root on the bottom, no tensions, over a root bass.',
  },
  { value: 'realistic', label: 'Realistic', blurb: 'Rootless and drop 2, the way you meet these chords on a stand.' },
];

export const VOICING_MODE_IDS = VOICING_MODES.map((m) => m.value);

/** What a listener is given at each level, plainest first. */
const CURVE: VoicingStyle[][] = [
  ['close'],
  ['close', 'spread'],
  ['spread'],
  ['spread', 'drop2', 'rootless'],
  ['rootless', 'drop2'],
];

const PLAIN: VoicingStyle[] = ['close'];
const REALISTIC: VoicingStyle[] = ['rootless', 'drop2'];

/** The styles a question may use at this level under this setting. */
export function voicingChoices(mode: VoicingMode, difficulty: number): VoicingStyle[] {
  if (mode === 'plain') return PLAIN;
  if (mode === 'realistic') return REALISTIC;
  return CURVE[clamp(Math.round(difficulty), 1, 5) - 1];
}

/**
 * Whether a progression's own recommendation is allowed to steer the choice.
 *
 * Only where the curve has stopped holding the learner's hand. Up to level 3
 * the point is to hear the changes at all, and a ii–V–I comped rootless is
 * one more thing in the way of that; from level 4 the point is to meet them
 * as they are played, and then "what would a pianist reach for here" is
 * exactly the right question. Basic chords only means basic chords only.
 */
function recommendationApplies(mode: VoicingMode, difficulty: number): boolean {
  if (mode === 'plain') return false;
  if (mode === 'realistic') return true;
  return clamp(Math.round(difficulty), 1, 5) >= 4;
}

/** How much more often the recommended style comes up where it applies. */
const RECOMMENDED_WEIGHT = 3;

/**
 * Picks one of them, leaning towards whichever the learner hears least well.
 *
 * `focus` comes from the learning model: the same chord heard in close
 * position and rootless is two different listening problems, and a learner who
 * has one and not the other should meet the other more often.
 *
 * `recommended` is the voicing the progression itself names — rootless for a
 * ii–V–I, shell for a blues, quartal for modal changes. The cheat sheet has
 * shown it all along and the exercises ignored it, so a learner could read
 * that these changes are comped rootless and never once hear them that way.
 * The two weights multiply: a recommended style the learner is also weak at
 * is the most worth playing, and the model should not have to choose.
 */
export function chooseVoicing(
  rng: Rng,
  mode: VoicingMode,
  difficulty: number,
  focus: readonly string[] = [],
  recommended?: VoicingStyle,
): VoicingStyle {
  const base = voicingChoices(mode, difficulty);
  const steer = recommended !== undefined && recommendationApplies(mode, difficulty);
  const choices = steer && !base.includes(recommended)
    ? [...base, recommended]
    : base;
  if (choices.length === 1) return choices[0];
  return rng.weighted(choices, (style) => {
    const rank = focus.indexOf(style);
    const weak = rank === -1 ? 1 : 2.5 / (1 + rank * 0.5);
    return weak * (steer && style === recommended ? RECOMMENDED_WEIGHT : 1);
  });
}

/**
 * Whether a question puts a bass note under the voicing.
 *
 * The root has to be audible somewhere, and a voicing whose lowest note is
 * not the root does not state it. Those get a bass at every level — a
 * rootless Dm7 without one is an F major triad with a 9th on top, and "minor
 * 7th" stops being a defensible answer to what sounded. An inversion is the
 * same problem in a milder form: C E G over no bass is as much an E minor
 * ♭6 as a C major.
 *
 * Where the root is already at the bottom of the stack, the bass only doubles
 * it, so it is a help rather than a necessity and the curve may take it away.
 */
export function voicingBass(chord: Chord, voicing: Voicing, difficulty: number): boolean {
  return isRootFree(chord, voicing) || difficulty <= 3;
}

export const voicingLabel = (style: VoicingStyle): string =>
  CONCEPTS.resolve(voicingConceptId(style)).name;

/**
 * The same name, with the rootless form where there is one.
 *
 * Only for describing a voicing that has already sounded. Answer buttons use
 * `voicingLabel`, because "Rootless A" and "Rootless B" are not two answers
 * to the question of how a chord is voiced — they are the same answer, and
 * offering both would make a correct one wrong half the time.
 */
export const voicingLabelFor = (style: VoicingStyle, form?: RootlessForm): string =>
  form === undefined ? voicingLabel(style) : `${voicingLabel(style)} ${form}`;

/**
 * How a shape is offered as an answer.
 *
 * `spread` is the one that needs different words here. Over a set of changes
 * it is the voicing that takes whichever position sits nearest the chord
 * before, which is what "voice-led" means — but a voicing question plays one
 * chord, and there is no chord before it for the voicing to have led from.
 * What a listener can actually hear is that something other than the root is
 * underneath the hands, so that is what the option says.
 */
export const voicingAnswerLabel = (style: VoicingStyle): string =>
  style === 'spread' ? 'Close, another tone on the bottom' : voicingLabel(style);

/** Both close styles are the same arrangement of notes; only the bottom differs. */
const CLOSE_FAMILY: ReadonlySet<VoicingStyle> = new Set<VoicingStyle>(['close', 'spread']);

/**
 * The chord member a degree names, as an ordinal: "♭3" is the 3rd.
 *
 * The alteration is dropped on purpose. This says which member of the chord
 * the hands have underneath, and whether that third is major or minor is a
 * question about the chord rather than about the arrangement — the degrees
 * printed beside the notes answer it already.
 */
function ordinalOf(degree: string): string | null {
  const number = Number(degree.replace(/[^0-9]/g, ''));
  if (!Number.isInteger(number) || number <= 0) return null;
  if (number === 1) return 'root';
  const teen = number % 100;
  if (teen >= 11 && teen <= 13) return `${number}th`;
  return `${number}${['th', 'st', 'nd', 'rd'][number % 10] ?? 'th'}`;
}

/**
 * Which member of the chord the hands have on the bottom, where saying so
 * tells the reader something.
 *
 * Nothing for a root on the bottom: the chord symbol already implies it, the
 * way a jazz chart does. Nothing either for a voicing with no root in it at
 * all — its own name says the root is absent, and "3rd on the bottom" would
 * be describing the consequence rather than the voicing.
 */
export function bottomTone(chord: Chord, voicing: Voicing): string | undefined {
  const rootPc = mod(chord.rootPc, 12);
  if (!voicing.notes.some((midi) => mod(midi, 12) === rootPc)) return undefined;
  const tone = ordinalOf(chordDegrees(chord, [voicing.notes[0]])[0]);
  return tone === null || tone === 'root' ? undefined : tone;
}

/**
 * How the hands were arranged, for a voicing that has already sounded.
 *
 * The voicing's family, and the tone underneath where that is not the root.
 * Never "root position" or "inversion": those describe the bass, which this
 * does not know about and which `namedInversion` reports separately.
 */
export function handsLabel(chord: Chord, voicing: Voicing): string {
  const family = CLOSE_FAMILY.has(voicing.style)
    ? 'Close'
    : voicingLabelFor(voicing.style, voicing.form);
  const tone = bottomTone(chord, voicing);
  if (tone) return `${family}  ·  ${tone} on the bottom`;
  // A close voicing says so, because "Close" alone would leave a reader
  // wondering what was underneath. The others do not need it.
  return CLOSE_FAMILY.has(voicing.style) ? `${family}, root on the bottom` : family;
}

/** The styles a question can be asked about — the ones the curve can produce. */
export const NAMEABLE_VOICINGS: VoicingStyle[] = ['close', 'spread', 'drop2', 'rootless', 'shell'];

export const isVoicingStyle = (value: unknown): value is VoicingStyle =>
  typeof value === 'string' && (VOICING_STYLES as readonly string[]).includes(value);

export type { RootlessForm };

/**
 * What the bass does at each level, as part of the same curve the voicings
 * follow rather than a second one beside it.
 *
 * Root motion is one of the main things a learner listens for when naming a
 * progression, and anything the bass plays between the roots is in the way of
 * hearing it. Early on there is nothing between them. Later the fifth comes
 * back, and later still the line walks, by which point telling a passing note
 * from a change is part of the skill being tested.
 */
const BASS_CURVE: BassStyle[] = ['root', 'root', 'root-fifth', 'walking', 'walking'];

export function bassStyleFor(difficulty: number): BassStyle {
  return BASS_CURVE[clamp(Math.round(difficulty), 1, 5) - 1];
}

/**
 * Whether a walking line may approach the next root from a half step above.
 *
 * It is a strong approach and it is also, note for note, the bass of a tritone
 * substitution: while a learner is still being asked to recognise one, a
 * passing note that sounds like one is a question with a misleading answer in
 * it. The point they are past it is read from the progression library rather
 * than named here — it is the tier of the highest enabled progression whose
 * roots move down a half step, which is the same tier data that decides what
 * the selector is likely to ask about.
 */
export function approachFromAbove(settings: PracticeSettings, difficulty: number): boolean {
  const enabled = new Set(settings.progressions);
  let highest = 0;
  for (const def of PROGRESSIONS) {
    if (!enabled.has(def.id)) continue;
    const roots = def.chords.map((c) => c.degree);
    const slides = roots.some((d, i) => i > 0 && mod(roots[i - 1] - d, 12) === 1);
    if (slides) highest = Math.max(highest, def.tier);
  }
  return clamp(Math.round(difficulty), 1, 5) > highest;
}

/**
 * What to tell a listener who hears a note the chord symbol does not name.
 *
 * Marking is by the written chord throughout: the extra notes belong to the
 * voicing, and a learner who answers "m7" to a rootless Dm7 with a 9th on it
 * has heard the chord correctly. Shared, because every question that comps a
 * chord with tensions owes its listener the same warning — the one that asks
 * about a chord inside a progression as much as the one that plays it alone.
 */
export const COLOUR_NOTE = 'Tensions may be added \u2014 name the basic quality.';
