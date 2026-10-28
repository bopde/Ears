import { VOICING_STYLES, type RootlessForm, type VoicingStyle } from '../music/voicing';
import { CONCEPTS, voicingConceptId } from '../music/catalog';
import { clamp } from '../lib/util';
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
  { value: 'curve', label: 'Mixed', blurb: 'Plain at first, the way a pianist plays by the top levels.' },
  { value: 'plain', label: 'Plain', blurb: 'Root position over a root bass, every time.' },
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
 * Picks one of them, leaning towards whichever the learner hears least well.
 *
 * `focus` comes from the learning model: the same chord heard in close
 * position and rootless is two different listening problems, and a learner who
 * has one and not the other should meet the other more often.
 */
export function chooseVoicing(
  rng: Rng,
  mode: VoicingMode,
  difficulty: number,
  focus: readonly string[] = [],
): VoicingStyle {
  const choices = voicingChoices(mode, difficulty);
  if (choices.length === 1) return choices[0];
  return rng.weighted(choices, (style) => {
    const rank = focus.indexOf(style);
    return rank === -1 ? 1 : 2.5 / (1 + rank * 0.5);
  });
}

/** Whether a question at this level puts a bass note under the voicing. */
export function voicingBass(style: VoicingStyle, difficulty: number): boolean {
  if (style === 'rootless') return false;
  return difficulty <= 3;
}

export const voicingLabel = (style: VoicingStyle): string =>
  CONCEPTS.resolve(voicingConceptId(style)).name;

/** The styles a question can be asked about — the ones the curve can produce. */
export const NAMEABLE_VOICINGS: VoicingStyle[] = ['close', 'spread', 'drop2', 'rootless', 'shell'];

export const isVoicingStyle = (value: unknown): value is VoicingStyle =>
  typeof value === 'string' && (VOICING_STYLES as readonly string[]).includes(value);

export type { RootlessForm };
