import type { ExerciseType, Question } from './types';
import { buildOptions, chooseKey, chooseTarget, optionCount, questionId } from './support';
import {
  CHORD_QUALITIES, chordSymbol, makeChord, spellInChord, type Chord,
} from '../music/chords';
import {
  ALT_SET, BASIC_OF, COLOUR_IDS, COLOUR_ID_OF, COLOUR_NAMES, alteredFifthQuality,
  alteredFifthsFor, coloursFor, colourInterval, isBasicQuality,
} from '../music/degrees';
import { colourConceptId } from '../music/catalog';
import { formatList } from './chord';
import { voiceChord } from '../music/voicing';
import { polyphonyGain } from '../audio/performer';
import { soundedChord } from '../audio/reference';
import type { PracticeSettings } from '../session/settings';
import { pcAtOrAbove } from '../music/pitch';
import { clamp, mod } from '../lib/util';

/**
 * Which colours are on offer at each level, plainest first.
 *
 * The two a chord is most often comped with come first. The two
 * darkenings follow at level 2: a ♭9 over a dominant is one of the first
 * sounds anybody recognises in this music, and holding it to level 4 left
 * the first two levels asking 9 or 13 and nothing else — a question with
 * two answers, 35% of which were 9. Level 3 brings the ones that need a
 * reference inside the chord: the 11th and the ♯11 against the third, and
 * the altered fifths against the fifth. The top of the curve has
 * everything, with the pairs and the altered sound.
 */
const CURVE: Record<number, readonly string[]> = {
  1: ['9', '13'],
  2: ['9', '13', 'b9', 'b13'],
  3: ['9', '13', 'b9', 'b13', '#9', '11', '#11', '#5', 'b5'],
  4: COLOUR_IDS,
  5: COLOUR_IDS,
};

/** From which level a colour may be one of the chord's own tones altered. */
const FIFTHS_FROM = 3;

/** From which level a dominant may be comped with its altered tensions. */
const ALTERED_FROM = 2;

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
  const altered = level >= ALTERED_FROM;
  const names = coloursFor(chord.quality, { altered });
  const ids = names.map((n) => COLOUR_ID_OF[n]).filter(Boolean);
  // And the two that change the chord's own fifth rather than adding a
  // note over it. They are offered beside the ♭13 and the ♯11 they share
  // a pitch with, because the natural 5th is the whole of the difference
  // and hearing it is the point of the question.
  if (level >= FIFTHS_FROM) {
    for (const name of alteredFifthsFor(BASIC_OF[chord.quality.id] ?? chord.quality.id)) {
      const id = COLOUR_ID_OF[name];
      if (id && !ids.includes(id)) ids.push(id);
    }
  }
  // The altered set is one answer rather than three, so it stands in for
  // its members wherever a dominant can take all three.
  if (level >= PAIRS_FROM && ALT_SET.every((n) => names.includes(n))) ids.push('alt');
  return ids;
}

/** Whether this answer changes one of the chord's tones instead of adding one. */
const altersFifth = (id: string): boolean => id === '#5' || id === 'b5';

/** And the two that are the same pitches added over a fifth still in place. */
const aboveFifth = (id: string): boolean => id === 'b13' || id === '#11';

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
    //
    // Evenly, whatever the tier says. The curve above has already decided
    // what this level asks about, and anything it allows has to come up
    // often enough that its absence from a session says nothing: 9 used
    // to be 35% of every colour question and 13 another 29%.
    const colour = chooseTarget(ctx, offered, colourConceptId, () => ctx.difficulty);
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

    // What the chord becomes, where the answer moves one of its own tones
    // rather than adding a note over it: a G7 whose 5th is raised is a
    // G7♯5, and the question plays exactly that. Everything downstream —
    // the degrees in the reveal, what else may be stacked on top — then
    // reads against the chord that sounded rather than the one printed.
    const moved = altersFifth(colour) ? COLOUR_NAMES[colour] : undefined;
    const basic = BASIC_OF[chord.quality.id] ?? chord.quality.id;
    const sounded = moved
      ? makeChord(chord.rootPc, alteredFifthQuality(basic, moved)!, chord.root)
      : chord;

    // At the top of the curve a second colour may sound with the first, and
    // then the answer is which two. Partners come from what the chord that
    // sounds can take: a natural 13 is a semitone above a ♯5 and belongs
    // over neither.
    const open = moved ? colourOptions(sounded, level) : options;
    // Never a moved fifth as the *second* of a pair: the chord that
    // sounds is settled by the first, and a fifth cannot be moved by an
    // afterthought — stacked on top it would be a ♭13 over a chord that
    // still has its natural 5th, which is a different answer.
    //
    // And never a ♭13 or a ♯11 beside a moved fifth, which is the same
    // point from the other end. The natural 5th is the only thing that
    // separates those two names from these two, so once it is gone the
    // ear cannot choose: ♯11 over a 7♯5 and ♭13 over a 7♭5 are the same
    // four notes, and both would be true.
    const partners = level >= PAIRS_FROM && colour !== 'alt'
      ? open.filter((id) => id !== colour && id !== 'alt' && !altersFifth(id)
        && !(moved && aboveFifth(id))
        && degreeOf(id) !== degreeOf(colour) && pcOf(id) !== pcOf(colour))
      : [];
    // A quarter of the questions at the top of the curve are more than one
    // note, counting the altered sound, which is three of them.
    const wantPair = partners.length > 0 && ctx.rng.chance(0.17);
    // Wrong answers of the same shape as the right one. Offering pairs
    // against a question whose prompt says one note were free eliminations,
    // and they crowded the grid besides. A pair with no rival pair is not a
    // question, so that one is asked as a single instead.
    const second = wantPair && setsOf(options, 2).length >= 2 ? ctx.rng.pick(partners) : null;
    const answer = second ? [colour, second].sort().join('+') : colour;

    const tones = tonesOf(answer);
    const voicing = voiceChord(sounded, { style: 'close', rootPosition: true, maxNotes: 4 });
    // The colour sits above the stack, which is where a pianist puts it and
    // where it can be heard as an addition rather than as part of the chord.
    // Just above the stack, not wherever the interval's own octave lands: a
    // 13th counted from the root sits two octaves over a close voicing, and
    // a note that far away stops sounding like part of the chord at all.
    // A moved fifth is not stacked at all — it is already in the chord.
    const top = Math.max(...voicing.notes);
    const where = new Map<string, number>();
    for (const name of tones) {
      const interval = colourInterval(name);
      if (interval === undefined) continue;
      const pc = mod(chord.rootPc + interval, 12);
      where.set(name, name === moved
        ? voicing.notes.find((midi) => mod(midi, 12) === pc) ?? pcAtOrAbove(pc, top + 1)
        : pcAtOrAbove(pc, top + 1));
    }
    const added = tones
      .filter((name) => name !== moved)
      .map((name) => where.get(name)!)
      .sort((a, b) => a - b);
    const all = [...voicing.notes, ...added];
    // Every note the answer names, moved fifth included, for the reveal to
    // mark out. And the chord as printed, for the renderings that offer it
    // to measure the answer against — a G7♯5 is not "the chord alone".
    const marked = tones.map((name) => where.get(name)!).sort((a, b) => a - b);
    const plain = moved
      ? voiceChord(chord, { style: 'close', rootPosition: true, maxNotes: 4 })
      : voicing;
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
        // "Or changed", because from level 3 the answer may be one of the
        // chord's own tones moved — and it has to read the same whether it
        // is or not, or the wording gives the answer away.
        title: `What was added or changed on this ${
          chordSymbol(chord, ctx.settings.accidental)}?`,
        // How many notes are the difference, counted rather than assumed:
        // the altered sound is three, and the prompt used to say one.
        sub: `${['', 'One', 'Two', 'Three'][tones.length] ?? tones.length} note${
          tones.length === 1 ? '' : 's'
        }`,
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
        // The chord as printed first, then what the answer did to it, so
        // the ear has something to measure against. A moved fifth cannot
        // be demonstrated by adding a note — what changed is which note is
        // there — so that one plays the whole chord again, altered.
        perf.note(bassMidi, origin, 3.6, 0.7, { instrument: 'bass', gain });
        plain.notes.forEach((midi, i) => perf.note(midi, origin + i * 0.012, 3.6, 0.66, { gain }));
        const after = moved ? all : added;
        after.forEach((midi, i) => perf.note(midi, origin + 1.4 + i * 0.03, 2.2, 0.7, { gain }));
        return 4;
      },
      playPlain: (perf) => {
        const origin = perf.origin();
        const gain = polyphonyGain(plain.notes.length + 1);
        perf.note(bassMidi, origin, 2.6, 0.7, { instrument: 'bass', gain });
        plain.notes.forEach((midi, i) => perf.note(midi, origin + i * 0.012, 2.6, 0.66, { gain }));
        return 2.8;
      },
      hint: {
        label: 'Chord alone',
        description: 'Plays the chord as it is written, to measure the answer against.',
        play: (perf) => {
          const origin = perf.origin();
          const gain = polyphonyGain(plain.notes.length);
          plain.notes.forEach((midi, i) => perf.note(midi, origin + i * 0.012, 2, 0.64, { gain }));
          return 2.2;
        },
      },
      reveal: {
        heading: `${chordSymbol(chord, ctx.settings.accidental)}  ·  ${labelOf(answer)}`,
        detail: `${chordSymbol(chord, ctx.settings.accidental)} played with ${
          formatList(tones.map((name) => (name === moved
            ? `its 5th ${name === '♯5' ? 'raised' : 'lowered'}`
            : article(name))))
        }`,
        // Read against the chord that sounded, so a raised fifth is named
        // as the fifth it is rather than as a ♭13 sitting on a fifth that
        // is not there.
        played: soundedChord(
          sounded, { notes: all, bass: bassMidi, added: marked }, ctx.settings.accidental,
        ),
        notes: tones
          .map((name) => explain(name, sounded, chord, where.get(name)!, ctx.settings.accidental))
          .join('   '),
      },
      estimatedSeconds: 12 + level,
    };
  },
};

/**
 * What a colour did to the chord, for the line under the reveal.
 *
 * The two that move the fifth say what they moved it from, because that
 * is the whole of what tells them from the ♭13 and the ♯11 they share a
 * pitch with — and those two say where they sit, for the same reason.
 * Everything else is a note, and names itself.
 */
function explain(
  name: string,
  sounded: Chord,
  printed: Chord,
  midi: number,
  accidental: 'sharp' | 'flat' | 'both',
): string {
  const plain = (chord: Chord, note: number) =>
    spellInChord(chord, note, accidental).replace(/-?\d+$/, '');
  if (name === '♯5' || name === '♭5') {
    const natural = pcAtOrAbove(mod(printed.rootPc + 7, 12), midi - 6);
    return `${name}: the 5th ${name === '♯5' ? 'raised' : 'lowered'} (${
      plain(sounded, midi)} instead of ${plain(printed, natural)})`;
  }
  if (name === '♭13' || name === '♯11') {
    return `${name}: added above the 5th (${plain(sounded, midi)})`;
  }
  return `${name} = ${spellInChord(sounded, midi, accidental)}`;
}

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
      if (taken.some((id) => degreeOf(id) === degreeOf(singles[i])
        || pcOf(id) === pcOf(singles[i]))) continue;
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

/**
 * Which key it is, which is not the same question.
 *
 * A ♯5 and a ♭13 are the same pitch and different degrees, and a chord
 * cannot sound both: the pair that makes them worth telling apart makes
 * them impossible to hear together.
 */
const pcOf = (id: string): number => mod(colourInterval(COLOUR_NAMES[id] ?? '') ?? -1, 12);

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
