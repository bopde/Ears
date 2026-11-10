import type { ExerciseType, GenContext, Question } from './types';
import {
  buildOptions, chooseKey, chooseTarget, optionCount, pickDistractors, pitchClassField, questionId,
} from './support';
import {
  CHORD_QUALITIES, chordConceptId, chordFullName, makeChord, nearestQualities,
  addedTensions, qualityLabel, slashSymbol,
  type Chord, type ChordQuality,
} from '../music/chords';
import { soundedChord } from '../audio/reference';
import { approachInto, chooseLever, playVoicing, type Lever } from './levers';
import { namedInversion } from '../music/inversions';
import { mod } from '../lib/util';
import {
  arpeggiate, isRootFree, voiceChord, type RootlessForm, type VoicingStyle,
} from '../music/voicing';
import { COLOUR_NOTE, chooseVoicing, handsLabel, voicingBass } from './voicing-plan';
import { soundingPitchClasses, unambiguousQualities } from './ambiguity';
import { BASIC_OF, isBasicQuality } from '../music/degrees';
import { polyphonyGain } from '../audio/performer';
import { keyConceptId } from '../music/catalog';
import { pcName, pcNameDual, type Midi } from '../music/pitch';
import type { PracticeSettings } from '../session/settings';
import { clamp } from '../lib/util';

/** A reference pitch the user can measure everything else against. */
const REFERENCE_PC = 0;

/**
 * The chords this question may ask for: basic chords, and only those.
 *
 * A chord's identity is its stack up to the 7th, and everything above is
 * colour a voicing adds. Offering ∆9 beside ∆7 asked the listener to guess
 * which of two names for one sound the app had in mind — and with the
 * voicing free to add a 9th to either, there was often no way to tell.
 *
 * A saved setting naming a retired quality still counts: it enables the
 * chord that quality is. Someone who ticked ∆9 wanted major sevenths.
 */
function enabledQualities(settings: PracticeSettings): ChordQuality[] {
  const basic = CHORD_QUALITIES.filter((q) => isBasicQuality(q.id));
  const allowed = new Set(settings.chordQualities.map((id) => BASIC_OF[id] ?? id));
  const pool = basic.filter((q) => allowed.has(q.id));
  return pool.length ? pool : basic;
}

/**
 * How the chord is presented.
 *
 * This is the real difficulty lever for chord recognition: a root-position
 * close voicing with a bass note underneath hands you the root and the stack,
 * while an inversion over a bass makes you hear the chord itself.
 * The styles come from the shared curve, so what a chord question offers and
 * what a progression question offers move together.
 */
interface VoicingPlan {
  style: VoicingStyle;
  maxNotes: number;
  /** Which of the two rootless shapes, where the style is one that has them. */
  form: RootlessForm;
  /** Whether to double a root that is already at the bottom of the stack. */
  doubleRoot: boolean;
  /** What is made harder at the top of the curve, if anything. */
  lever?: Lever;
  /** The notes the bass walks in on, drawn here so a replay matches. */
  walk?: Midi[];
}

function voicingPlan(ctx: GenContext): VoicingPlan {
  const difficulty = clamp(Math.round(ctx.difficulty), 1, 5);
  const style = chooseVoicing(ctx.rng, ctx.settings.voicingMode, difficulty, ctx.voicingFocus);
  return {
    style,
    maxNotes: difficulty <= 1 ? 4 : 5,
    // A single chord has no chord before it to alternate from, so the form is
    // drawn rather than threaded. Without this every single-chord question in
    // the app was form A, and form B is half of what there is to learn.
    form: ctx.rng.chance(0.5) ? 'A' : 'B',
    doubleRoot: ctx.rng.chance(difficulty <= 2 ? 1 : 0.7),
    lever: chooseLever(ctx.rng, difficulty),
  };
}

/**
 * Voices the chord, then decides about the bass, then voices it again.
 *
 * Which way round that goes is the point. Whether the root needs stating
 * depends on where the voicing put its lowest note, and that is not known
 * until the voicing exists — so the bass cannot be chosen from the style
 * alone, which is how a rootless chord came to be played with no root
 * anywhere in it. The second call is free of randomness and sees the same
 * inputs, so it returns the same stack with a bass attached.
 */
function voiceWithBass(
  difficulty: number,
  chord: Chord,
  plan: VoicingPlan,
  tensions: boolean,
): ReturnType<typeof voiceChord> {
  const opts = {
    style: plan.style,
    maxNotes: plan.maxNotes,
    rootPosition: plan.style === 'close',
    rootlessForm: plan.form,
    tensions,
  };
  const dry = voiceChord(chord, opts);
  // Where the root is already underneath, the bass merely doubles it, and the
  // curve thins that out as the levels rise. Where it is not, it is not a
  // choice: see `voicingBass`.
  const wanted = voicingBass(chord, dry, difficulty) &&
    (isRootFree(chord, dry) || plan.doubleRoot);
  return wanted ? voiceChord(chord, { ...opts, bass: true }) : dry;
}


/**
 * The chord as it will sound, and the qualities still worth offering.
 *
 * Tensions are on wherever the style is not close position, because that is
 * how these chords are played and how the cheat sheet already teaches them.
 * Close position stays plain, so the plainest setting and the first level
 * sound exactly what they used to.
 *
 * Adding them can cost an option: every tension is a note some other quality
 * might claim, and the filter below drops any quality that could account for
 * what sounded. Where that leaves a question with no second answer, the
 * voicing gives up its tensions rather than the question giving up its
 * options — the same chord, played plainly. It is a safety net rather than a
 * road: over two thousand generated questions it never came into play.
 */
function materialFor(
  ctx: GenContext,
  pool: ChordQuality[],
  quality: ChordQuality,
  rootPc: number,
): { material: ChordMaterial; offered: ChordQuality[] } {
  const plan = voicingPlan(ctx);
  let last: { material: ChordMaterial; offered: ChordQuality[] } | null = null;
  for (const tensions of [true, false]) {
    const material = buildMaterial(ctx, quality, rootPc, plan, tensions);
    const offered = unambiguousQualities(pool, quality, soundingPitchClasses(material.voicing));
    last = { material, offered };
    // Two options is the least a question can offer.
    if (offered.length >= 2) return last;
  }
  // Even plain, this chord is indistinguishable from others in the pool —
  // a diminished seventh, say. Offer the pool as it stands rather than hand
  // back something unanswerable.
  return { material: last!.material, offered: pool };
}

function qualityOption(q: ChordQuality) {
  return { id: q.id, label: qualityLabel(q), sub: q.name, group: q.group };
}

interface ChordMaterial {
  quality: ChordQuality;
  rootPc: number;
  voicing: ReturnType<typeof voiceChord>;
  style: VoicingStyle;
  /** Whether the voicing was allowed notes the chord does not itself name. */
  tensions: boolean;
  play: (perf: import('../audio/performer').Performer) => number;
  playReveal: (perf: import('../audio/performer').Performer) => number;
  playPlain: (perf: import('../audio/performer').Performer) => number;
}

function buildMaterial(
  ctx: GenContext,
  quality: ChordQuality,
  rootPc: number,
  plan: VoicingPlan,
  tensions: boolean,
): ChordMaterial {
  const chord = makeChord(rootPc, quality.id);
  const difficulty = clamp(Math.round(ctx.difficulty), 1, 5);
  // Close position stays plain whatever is asked for, so the effective answer
  // is what the rest of the question has to reason about.
  const allowed = tensions && plan.style !== 'close';
  const voicing = voiceWithBass(difficulty, chord, plan, allowed);
  // Drawn once, here, rather than inside `play`: a replay has to sound like
  // the first hearing, and the approach is part of what was heard.
  const walk = plan.lever === 'walk-in' && voicing.bass !== undefined
    ? approachInto(ctx.rng, voicing.bass)
    : undefined;
  // The same chord stacked from its root with the root underneath: what the
  // voicing was dressing up, offered after the answer.
  const plain = voiceChord(chord, { style: 'close', rootPosition: true, bass: true, maxNotes: 5 });
  // A rolled chord at the easy end lets the ear walk up the stack; higher up
  // it is struck as a block, which is how you meet it on a bandstand.
  const roll = ctx.difficulty <= 1 ? 0.14 : ctx.difficulty <= 2 ? 0.045 : 0.012;

  return {
    quality,
    rootPc,
    voicing,
    style: plan.style,
    tensions: allowed,
    playPlain: (perf) => {
      const origin = perf.origin();
      const gain = polyphonyGain(plain.all.length);
      plain.notes.forEach((midi, i) => perf.note(midi, origin + i * 0.012, 3, 0.66, { gain }));
      if (plain.bass !== undefined) {
        perf.note(plain.bass, origin, 3, 0.72, { instrument: 'bass', gain });
      }
      return 3.2;
    },
    // Above level 3 one thing is made harder, and never two: see levers.ts
    // for why that is not the same as taking the bass away.
    play: (perf) => playVoicing(perf, chord, voicing, {
      lever: plan.lever,
      walk,
      roll,
      seconds: 4 * perf.beatSeconds,
      velocity: 0.7,
    }),
    playReveal: (perf) => {
      const origin = perf.origin();
      const notes = arpeggiate(chord, 55);
      notes.forEach((midi, i) => perf.note(midi, origin + i * 0.26, 0.5, 0.62));
      // The block chord follows the arpeggio, scheduled in absolute time.
      const after = origin + notes.length * 0.26 + 0.2;
      const voices = voicing.all.length;
      const gain = polyphonyGain(voices);
      voicing.notes.forEach((midi) => perf.note(midi, after, 2.6, 0.66, { gain }));
      if (voicing.bass !== undefined) {
        perf.note(voicing.bass, after, 2.6, 0.7, { instrument: 'bass', gain });
      }
      return after - origin + 2.6;
    },
  };
}

/**
 * What actually sounded.
 *
 * Two things here are easy to get wrong and both were. An inversion is named
 * only when the voicing contains the root to be inverted: a rootless chord
 * has no root, so "first inversion" describes nothing, and the 3rd at the
 * bottom of one is not a chord turned over but a note the voicing leaves to
 * the bass. And a slash is written only when a bass note actually sounds and
 * is not the root — with a root bass under a rootless stack, "Dm7/F" would
 * name an F that no longer has the bottom of anything.
 */
function revealFor(
  chord: Chord,
  voicing: ReturnType<typeof voiceChord>,
  accidental: PracticeSettings['accidental'],
) {
  // `namedInversion` reports the bass: it names one only where the lowest
  // sounding note, bass included, is a chord tone other than the root. The
  // hands are described separately, because what they have on the bottom is
  // not what "inversion" means.
  const named = namedInversion(chord, voicing);
  const parts = [chordFullName(chord, accidental), handsLabel(chord, voicing)];
  if (named) parts.splice(1, 0, named.name);
  const slashPc = voicing.bass !== undefined && mod(voicing.bass, 12) !== mod(chord.rootPc, 12)
    ? mod(voicing.bass, 12)
    : chord.rootPc;
  const added = addedTensions(chord, voicing.all);
  return {
    heading: slashSymbol(chord, slashPc, accidental),
    detail: parts.join('  \u00b7  '),
    // What the voicing added on top of the chord as written. The question
    // asked for the basic quality, so this says where the extra notes came
    // from rather than leaving them to look like a wrong answer.
    tag: added.length ? `played with ${formatList(added)}` : undefined,
    played: soundedChord(chord, voicing, accidental),
  };
}

/** "9", "9 and 13", "9, ♯11 and 13". */
export function formatList(parts: readonly string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

export const chordQualityExercise: ExerciseType = {
  id: 'chord-quality',
  name: 'Chord quality',
  short: 'Quality',
  description: 'One chord sounds. Name the quality.',
  baseSeconds: 13,
  pool: (settings) => enabledQualities(settings).map((q) => chordConceptId(q.id)),
  generate(ctx): Question | null {
    const pool = enabledQualities(ctx.settings);
    const quality = chooseTarget(ctx, pool, (q) => chordConceptId(q.id), (q) => q.tier);
    if (!quality) return null;
    const rootPc = chooseKey(ctx);
    const { material, offered } = materialFor(ctx, pool, quality, rootPc);
    const n = optionCount(ctx.difficulty, offered.length);
    const distractors = pickDistractors(ctx.rng, quality, offered, n - 1, ctx.difficulty, nearestQualities);
    const chord = makeChord(rootPc, quality.id);

    return {
      id: questionId('chord-quality'),
      type: 'chord-quality',
      conceptIds: [chordConceptId(quality.id)],
      difficulty: ctx.difficulty,
      keyPc: rootPc,
      prompt: {
        title: 'What quality is this chord?',
        // Said only where it is true, so it is never noise. Outside close
        // position the voicing adds what a pianist would, and the answer is
        // still the chord underneath: a Dm7 played with a 9th is a Dm7.
        sub: material.tensions ? COLOUR_NOTE : undefined,
      },
      fields: [
        {
          key: 'quality',
          label: 'Quality',
          options: buildOptions(ctx.rng, quality, distractors, qualityOption),
          columns: 2,
        },
      ],
      correct: { quality: quality.id },
      play: material.play,
      playReveal: material.playReveal,
      playPlain: material.playPlain,
      voicing: material.style,
      hint: {
        label: 'Root',
        description: `Sounds the root of the chord (${pcNameDual(rootPc)}) on its own.`,
        play: (perf) => {
          perf.note(rootPc + 48, perf.origin(), 1.6, 0.6);
          return 1.6;
        },
      },
      reveal: revealFor(chord, material.voicing, ctx.settings.accidental),
      estimatedSeconds: 11 + ctx.difficulty,
    };
  },
};

export const chordFullExercise: ExerciseType = {
  id: 'chord-full',
  name: 'Chord — root and quality',
  short: 'Root + quality',
  description: 'Name both the root and the quality of the chord.',
  baseSeconds: 18,
  pool: (settings) => enabledQualities(settings).map((q) => chordConceptId(q.id)),
  generate(ctx): Question | null {
    const pool = enabledQualities(ctx.settings);
    const quality = chooseTarget(ctx, pool, (q) => chordConceptId(q.id), (q) => q.tier);
    if (!quality) return null;
    const rootPc = chooseKey(ctx);
    const { material, offered } = materialFor(ctx, pool, quality, rootPc);
    const n = optionCount(ctx.difficulty, offered.length);
    const distractors = pickDistractors(ctx.rng, quality, offered, n - 1, ctx.difficulty, nearestQualities);
    const chord = makeChord(rootPc, quality.id);

    return {
      id: questionId('chord-full'),
      type: 'chord-full',
      conceptIds: [chordConceptId(quality.id), keyConceptId(rootPc)],
      difficulty: ctx.difficulty,
      keyPc: rootPc,
      prompt: {
        title: 'Name the chord',
        sub: material.tensions ? `Root, then quality  \u00b7  ${COLOUR_NOTE}` : 'Root, then quality',
      },
      fields: [
        pitchClassField('root', 'Root'),
        {
          key: 'quality',
          label: 'Quality',
          options: buildOptions(ctx.rng, quality, distractors, qualityOption),
          columns: 2,
        },
      ],
      correct: { root: String(rootPc), quality: quality.id },
      play: material.play,
      playReveal: material.playReveal,
      playPlain: material.playPlain,
      voicing: material.style,
      hint: {
        label: `Reference ${pcName(REFERENCE_PC, ctx.settings.accidental)}`,
        description:
          'Sounds a reference pitch so you can find the root by ear rather than by absolute pitch.',
        play: (perf) => {
          perf.note(REFERENCE_PC + 60, perf.origin(), 1.6, 0.58);
          return 1.6;
        },
      },
      reveal: revealFor(chord, material.voicing, ctx.settings.accidental),
      estimatedSeconds: 15 + ctx.difficulty,
    };
  },
};
