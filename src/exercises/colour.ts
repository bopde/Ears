import type { ExerciseType, Question } from './types';
import { buildOptions, chooseKey, chooseTarget, optionCount, questionId } from './support';
import {
  CHORD_QUALITIES, chordDegrees, chordSymbol, makeChord, spellInChord, type Chord,
} from '../music/chords';
import {
  ALT_SET, COLOUR_IDS, COLOUR_ID_OF, COLOUR_NAMES, COLOUR_TIER, coloursFor, colourInterval,
  isBasicQuality,
} from '../music/degrees';
import { colourConceptId } from '../music/catalog';
import { voiceChord } from '../music/voicing';
import { polyphonyGain } from '../audio/performer';
import { soundedChord } from '../audio/reference';
import type { PracticeSettings } from '../session/settings';
import { pcAtOrAbove } from '../music/pitch';
import { clamp, mod } from '../lib/util';

/**
 * Which colours are on offer at each level, plainest first.
 *
 * The two a chord is most often comped with come first. The 11th and the
 * ♯11 need the third to tell them apart, so they wait for level 3. The
 * altered ones belong to a scale rather than to a chord, and they come last
 * — along with the pairs, where two colours sound at once and the question
 * is which two.
 */
const CURVE: Record<number, readonly string[]> = {
  1: ['9', '13'],
  2: ['9', '13'],
  3: ['9', '13', '11', '#11'],
  4: COLOUR_IDS,
  5: COLOUR_IDS,
};

/**
 * The chords the first levels use.
 *
 * Three chords, one of each family, so the question is about the colour and
 * not about working out what it is sitting on. From level 3 whatever the
 * learner has enabled is fair game.
 */
const FIRST_CHORDS = ['maj7', 'm7', '7'];

/** From which level two colours may sound at once. */
const PAIRS_FROM = 4;

function enabledColours(settings: PracticeSettings): string[] {
  const allowed = new Set(settings.colours);
  const pool = COLOUR_IDS.filter((id) => allowed.has(id));
  return pool.length ? [...pool] : [...COLOUR_IDS];
}

function enabledChords(settings: PracticeSettings, level: number): string[] {
  if (level <= 2) return FIRST_CHORDS;
  const allowed = new Set(settings.chordQualities.filter(isBasicQuality));
  const pool = CHORD_QUALITIES.filter((q) => allowed.has(q.id)).map((q) => q.id);
  return pool.length ? pool : FIRST_CHORDS;
}

/**
 * Which colours this chord can be asked about.
 *
 * Its own table and nothing else, so a question never offers a note the
 * chord would not be comped with: a ♭13 is not an option over a major
 * seventh, and the learner who knows that has learned something real
 * rather than been given a free elimination.
 */
function colourOptions(chord: Chord, level: number): string[] {
  const altered = level >= PAIRS_FROM;
  const names = coloursFor(chord.quality, { altered });
  const ids = names.map((n) => COLOUR_ID_OF[n]).filter(Boolean);
  // The altered set is one answer rather than three, so it stands in for
  // its members wherever a dominant can take all three.
  if (altered && ALT_SET.every((n) => names.includes(n))) ids.push('alt');
  return ids;
}

/** The tones an answer stands for, as degree names. */
const tonesOf = (id: string): string[] =>
  id === 'alt' ? [...ALT_SET] : id.split('+').map((part) => COLOUR_NAMES[part]);

/** How an answer reads on a button. */
const labelOf = (id: string): string =>
  id === 'alt' ? 'altered' : id.split('+').map((part) => COLOUR_NAMES[part]).join('  ·  ');

export const colourExercise: ExerciseType = {
  id: 'colour',
  name: 'Colour',
  short: 'Colour',
  description: 'A chord plays with a note added above it. Name what was added.',
  baseSeconds: 14,
  pool: (settings) => enabledColours(settings).map(colourConceptId),
  generate(ctx): Question | null {
    const level = clamp(Math.round(ctx.difficulty), 1, 5);
    const wanted = new Set(CURVE[level] ?? COLOUR_IDS);
    const offered = enabledColours(ctx.settings).filter((id) => wanted.has(id));
    if (!offered.length) return null;

    // The colour first, so the selector can ask for one it wants practised,
    // then a chord that can actually take it.
    const colour = chooseTarget(
      ctx,
      offered,
      (id) => colourConceptId(id),
      (id) => COLOUR_TIER[id] ?? 3,
    );
    if (!colour) return null;

    const chords = ctx.rng.shuffle(enabledChords(ctx.settings, level));
    let chosen: { chord: Chord; options: string[] } | null = null;
    for (const id of chords) {
      const chord = makeChord(chooseKey(ctx), id);
      const options = colourOptions(chord, level);
      if (options.includes(colour) && options.length >= 2) {
        chosen = { chord, options };
        break;
      }
    }
    // Nothing enabled takes this colour — a learner with only major
    // sevenths on cannot be asked about a ♭13.
    if (!chosen) return null;
    const { chord, options } = chosen;

    // At the top of the curve a second colour may sound with the first, and
    // then the answer is which two.
    const partners = level >= PAIRS_FROM && colour !== 'alt'
      ? options.filter((id) => id !== colour && id !== 'alt' && degreeOf(id) !== degreeOf(colour))
      : [];
    const wantPair = partners.length > 0 && ctx.rng.chance(0.4);
    // Wrong answers of the same shape as the right one. Offering pairs
    // against a question whose prompt says one note were free eliminations,
    // and they crowded the grid besides. A pair with no rival pair is not a
    // question, so that one is asked as a single instead.
    const second = wantPair && setsOf(options, 2).length >= 2 ? ctx.rng.pick(partners) : null;
    const answer = second ? [colour, second].sort().join('+') : colour;

    const tones = tonesOf(answer);
    const intervals = tones
      .map((name) => colourInterval(name))
      .filter((i): i is number => i !== undefined);

    const voicing = voiceChord(chord, { style: 'close', rootPosition: true, maxNotes: 4 });
    // The colour sits above the stack, which is where a pianist puts it and
    // where it can be heard as an addition rather than as part of the chord.
    // Just above the stack, not wherever the interval's own octave lands: a
    // 13th counted from the root sits two octaves over a close voicing, and
    // a note that far away stops sounding like part of the chord at all.
    const top = Math.max(...voicing.notes);
    const added = intervals
      .map((i) => pcAtOrAbove(mod(chord.rootPc + i, 12), top + 1))
      .sort((a, b) => a - b);
    const all = [...voicing.notes, ...added];
    const bassMidi = chord.rootPc + 36;

    // Wrong answers of the same size as the right one. Offering a single
    // against a question whose prompt says three notes is a free
    // elimination, and it crowds the grid besides — and for the altered
    // sound it was worse than free, because the singles it was offered
    // against were its own members, each of which had just sounded.
    //
    // Two at least, both ways: the chord was chosen for having two
    // colours, and a larger set is only asked for where a second of that
    // size exists to offer against it. The shared check that no field is
    // ever shorter than that is in exercises.test.ts, over every type at
    // every level.
    const answers = setsOf(options, sizeOf(answer));
    const n = optionCount(ctx.difficulty, answers.length);
    const distractors = ctx.rng.sample(answers.filter((id) => id !== answer), n - 1);

    const play = (perf: Parameters<Question['play']>[0]) => {
      const origin = perf.origin();
      const gain = polyphonyGain(all.length + 1);
      perf.note(bassMidi, origin, 3, 0.7, { instrument: 'bass', gain });
      all.forEach((midi, i) => perf.note(midi, origin + i * 0.012, 3, 0.66, { gain }));
      return 3.2;
    };

    return {
      id: questionId('colour'),
      type: 'colour',
      // The answer's own ids, so an altered question records the altered
      // sound rather than its three tones one at a time.
      conceptIds: answer.split('+').map(colourConceptId),
      difficulty: ctx.difficulty,
      keyPc: chord.rootPc,
      prompt: {
        // The chord is given, so the question is only about what is on it.
        title: `What was added to this ${chordSymbol(chord, ctx.settings.accidental)}?`,
        // How many notes were added, counted rather than assumed: the
        // altered sound is three, and the prompt used to say one.
        sub: `${['', 'One', 'Two', 'Three'][tones.length] ?? tones.length} note${
          tones.length === 1 ? '' : 's'
        } above the chord`,
      },
      fields: [
        {
          key: 'colour',
          label: 'Colour',
          options: buildOptions(ctx.rng, answer, distractors, (id) => ({
            id,
            label: labelOf(id),
            sub: id === 'alt' ? ALT_SET.join(' ') : undefined,
          })),
          columns: 2,
        },
      ],
      correct: { colour: answer },
      play,
      playReveal: (perf) => {
        const origin = perf.origin();
        const gain = polyphonyGain(all.length + 1);
        // The chord first, then the colour on top of it, so the ear has
        // something to measure the addition against.
        perf.note(bassMidi, origin, 3.6, 0.7, { instrument: 'bass', gain });
        voicing.notes.forEach((midi, i) => perf.note(midi, origin + i * 0.012, 3.6, 0.66, { gain }));
        added.forEach((midi, i) => perf.note(midi, origin + 1.4 + i * 0.3, 2.2, 0.7, { gain }));
        return 4;
      },
      playPlain: (perf) => {
        const origin = perf.origin();
        const gain = polyphonyGain(voicing.notes.length + 1);
        perf.note(bassMidi, origin, 2.6, 0.7, { instrument: 'bass', gain });
        voicing.notes.forEach((midi, i) => perf.note(midi, origin + i * 0.012, 2.6, 0.66, { gain }));
        return 2.8;
      },
      hint: {
        label: 'Chord alone',
        description: 'Plays the chord without the note that was added, to measure it against.',
        play: (perf) => {
          const origin = perf.origin();
          const gain = polyphonyGain(voicing.notes.length);
          voicing.notes.forEach((midi, i) => perf.note(midi, origin + i * 0.012, 2, 0.64, { gain }));
          return 2.2;
        },
      },
      reveal: {
        heading: `${chordSymbol(chord, ctx.settings.accidental)}  ·  ${labelOf(answer)}`,
        detail: `${chordSymbol(chord, ctx.settings.accidental)} played with ${
          tones.length === 1 ? article(tones[0]) : tones.join(' and ')
        }`,
        // The degrees, with the added ones at the end where they sounded.
        played: soundedChord(chord, { notes: all, bass: bassMidi, added }, ctx.settings.accidental),
        notes: added
          .map((midi) => `${chordDegrees(chord, [midi])[0]} = ${
            spellInChord(chord, midi, ctx.settings.accidental)
          }`)
          .join('   '),
      },
      estimatedSeconds: 12 + level,
    };
  },
};

/**
 * Every answer of a given size this chord could be asked about.
 *
 * A set is one answer rather than several, the way the altered sound is:
 * what a listener hears is a chord with notes on it, and naming them is
 * one act. Only the sets this chord could actually sound are built, so the
 * option list stays a list of things it can do.
 *
 * Never two readings of one degree — a chord sounding a 9 and a ♭9 is
 * sounding a semitone, not two colours — with one exception, which is why
 * the exception has a name. The altered sound is ♭9, ♯9 and ♭13 together,
 * two of them ninths, and it is heard as one thing.
 */
function setsOf(options: readonly string[], size: number): string[] {
  const singles = options.filter((id) => id !== 'alt');
  const out: string[] = [];
  const walk = (from: number, taken: string[]) => {
    if (taken.length === size) {
      out.push(taken.length === 1 ? taken[0] : [...taken].sort().join('+'));
      return;
    }
    for (let i = from; i < singles.length; i += 1) {
      if (taken.some((id) => degreeOf(id) === degreeOf(singles[i]))) continue;
      walk(i + 1, [...taken, singles[i]]);
    }
  };
  walk(0, []);
  if (size === ALT_SET.length && options.includes('alt')) out.push('alt');
  return out;
}

/** How many notes an answer stands for. */
const sizeOf = (id: string): number => (id === 'alt' ? ALT_SET.length : id.split('+').length);

/** Which degree a colour is an alteration of: ♭9, 9 and ♯9 are all ninths. */
const degreeOf = (id: string): number => Number(COLOUR_NAMES[id]?.replace(/\D/g, '') ?? 0);

/** Exported for the tests that check a question never offers a stray note. */
export const colourOptionsFor = (chord: Chord, level: number): string[] => {
  const options = colourOptions(chord, level);
  return [1, 2, ALT_SET.length].flatMap((size) => setsOf(options, size));
};

/**
 * "a 9", "a 13", "a ♯11" — but "an 11".
 *
 * How they are read aloud rather than how they are spelled: an accidental
 * in front is a word, and nobody says "an sharp eleven".
 */
const article = (tone: string): string => `${tone === '11' ? 'an' : 'a'} ${tone}`;
