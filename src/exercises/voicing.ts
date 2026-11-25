import type { ExerciseType, GenContext, Question } from './types';
import { buildOptions, chooseKey, chooseTarget, optionCount, questionId, tempoFor } from './support';
import {
  CHORD_QUALITIES, addedTensions, chordSymbol, makeChord, spellInChord,
  type Chord, type ChordQuality,
} from '../music/chords';
import { soundedChord } from '../audio/reference';
import { formatList } from './chord';
import {
  shellIntervals, voiceChord, voiceProgression,
  type RootlessForm, type Voicing, type VoicingStyle,
} from '../music/voicing';
import {
  NAMEABLE_VOICINGS, approachFromAbove, bassStyleFor, handsLabel, labelsTrueOf,
  nameableVoicings, voicingAnswerLabel, voicingBass,
} from './voicing-plan';
import { Performer } from '../audio/performer';
import { approachInto, chooseLever, playVoicing } from './levers';
import { keyName, pcNameDual, type PitchClass } from '../music/pitch';
import { PROGRESSIONS, realiseProgression } from '../music/progressions';
import { voicingConceptId } from '../music/catalog';
import type { PracticeSettings } from '../session/settings';
import { clamp, mod } from '../lib/util';

/**
 * Which voicing shapes a question may be about.
 *
 * Quartal and upper-structure voicings are left out: both are reference
 * material rather than things to be told apart under time pressure, and both
 * sound enough like each other on some chords that the question would have
 * more than one defensible answer.
 */
function shapesFor(settings: PracticeSettings, difficulty: number): VoicingStyle[] {
  void settings;
  return nameableVoicings(difficulty);
}

/** A quality wide enough that the shapes it is voiced in differ audibly. */
function voicableQualities(settings: PracticeSettings): ChordQuality[] {
  const allowed = new Set(settings.chordQualities);
  const usable = (q: ChordQuality) => q.intervals.length >= 4 && q.intervals.every((i) => i < 22);
  const pool = CHORD_QUALITIES.filter((q) => allowed.has(q.id) && usable(q));
  return pool.length ? pool : CHORD_QUALITIES.filter(usable);
}

/**
 * Two shapes only count as different if they sound different.
 *
 * On a plain seventh chord a spread voicing and a drop 2 can land on the same
 * four notes, and then the question has two right answers. Comparing what is
 * actually scheduled is the only way to be sure.
 */
const fingerprint = (v: Voicing) => v.all.join(',');

/**
 * One shape of one chord, with a bass under it wherever the root needs one.
 *
 * The bass is not a difficulty setting here. A rootless or inverted stack
 * does not state its own root, and this question prints the chord symbol in
 * the prompt — so without one the listener is being shown a D minor 7 and
 * played an F major triad, and asked only about the shape. The level decides
 * whether a stack that *does* state its root gets the doubling as well.
 */
/** What every candidate shape of one question is voiced with. */
interface Colour {
  difficulty: number;
  /** On or off for the whole question, never per shape: see `colourFor`. */
  tensions: boolean;
  form: RootlessForm;
  /**
   * Which tone the voice-led candidate puts underneath, as an index into
   * the chord's own tones. Never 0 — see `voiceIn`.
   */
  bottom: number;
}

/**
 * Whether this question's chords carry their tensions, decided once.
 *
 * Once per question and not once per shape, which is the only part of this
 * that matters. Rootless voicings add a 9th and close ones do not, so a
 * listener who hears a 9th and knows that would have the answer before
 * hearing the shape — the colour would be the tell rather than the voicing.
 * On or off, every candidate gets the same treatment, and the question stays
 * about where the notes are.
 *
 * Off below level 3, where there is enough to listen past already.
 */
function colourFor(ctx: GenContext, difficulty: number): Colour {
  return {
    difficulty,
    tensions: difficulty >= 3 && ctx.rng.chance(0.5),
    form: ctx.rng.chance(0.5) ? 'A' : 'B',
    bottom: ctx.rng.range(1, 3),
  };
}

/**
 * One candidate shape, voiced so that its answer describes it truthfully.
 *
 * The two close shapes are offered as "root on the bottom" and "another
 * tone on the bottom", because a single chord has no chord before it for
 * voice leading to mean anything against. So the bottom note is what the
 * two answers are about, and both have to be made true: the first is
 * pinned to the root, and the second to something else.
 *
 * Left to itself the voice-led candidate picked whichever position scored
 * best, and with nothing to lead from that was often root position — so
 * the answer read "another tone on the bottom" over a chord with its root
 * underneath, and a listener who heard that correctly was marked wrong.
 * It happened in 353 of 2,000 questions.
 */
function voiceIn(chord: Chord, style: VoicingStyle, colour: Colour): Voicing {
  const tones = chord.quality.intervals.filter((i) => i < 12 && i !== 0);
  const other = tones.length
    ? mod(chord.rootPc + tones[colour.bottom % tones.length], 12)
    : chord.rootPc;
  const opts = {
    style,
    maxNotes: 5,
    rootlessForm: colour.form,
    tensions: colour.tensions,
    ...(style === 'close' ? { bottomPc: chord.rootPc } : {}),
    ...(style === 'spread' ? { bottomPc: other } : {}),
  };
  const dry = voiceChord(chord, opts);
  return voicingBass(chord, dry, colour.difficulty)
    ? voiceChord(chord, { ...opts, bass: true })
    : dry;
}

/**
 * Whether a candidate really is the shape its answer names.
 *
 * The shapes are built by a search that scores spacing and voice leading,
 * and `bottomPc` is one term in that score rather than a promise. Most of
 * the time it wins; sometimes the search finds something it likes better,
 * and then the answer on the button describes a chord that did not sound.
 *
 * Both of the ways that has gone wrong were reported from use: a B♭∆13
 * offered as "root on the bottom" with its 3rd underneath, and a shell
 * answer on an add9 chord, which has no seventh and so has no shell to
 * play. Nothing here can make the search infallible, so this checks the
 * result instead and the question moves to another chord.
 */
function honoursLabel(chord: Chord, style: VoicingStyle, v: Voicing): boolean {
  const onRoot = mod(v.notes[0], 12) === mod(chord.rootPc, 12);
  if (style === 'close') return onRoot;
  if (style === 'spread') return !onRoot;
  if (style !== 'shell') return true;
  const shell = shellIntervals(chord);
  if (!shell) return false;
  const wanted = new Set(shell.map((i) => mod(chord.rootPc + i, 12)));
  const own = new Set(chord.quality.intervals.map((i) => mod(chord.rootPc + i, 12)));
  // Every chord tone in it is one of the three, and all three are there.
  // A tension on top is allowed: the question turns those on for every
  // shape at once, so they are never the tell.
  const pcs = v.notes.map((m) => mod(m, 12));
  return pcs.every((pc) => !own.has(pc) || wanted.has(pc))
    && [...wanted].every((pc) => pcs.includes(pc));
}

export const voicingExercise: ExerciseType = {
  id: 'voicing',
  name: 'Voicing',
  short: 'Voicing',
  description: 'One chord sounds. Say how it is voiced, not what it is.',
  baseSeconds: 16,
  // Every shape the question can ever ask about, which is what the
  // learning model tracks against; which of them a level asks about is
  // `nameableVoicings`.
  pool: () => NAMEABLE_VOICINGS.map((s) => voicingConceptId(s)),
  generate(ctx): Question | null {
    const shapes = shapesFor(ctx.settings, ctx.difficulty);
    // Evenly across what the level asks about: the curve has already
    // decided which shapes those are, and a shape it allows has to come
    // up often enough that a guess from the base rate beats nothing.
    const target = chooseTarget(ctx, shapes, voicingConceptId, () => ctx.difficulty);
    if (!target) return null;

    const qualities = voicableQualities(ctx.settings);
    const rootPc = chooseKey(ctx);
    // A quality whose shapes come out audibly different, so the question has
    // exactly one answer. Everything else in the pool is tried before giving up.
    const level = clamp(Math.round(ctx.difficulty), 1, 5);
    const colour = colourFor(ctx, level);
    let chord: Chord | null = null;
    let voicing: Voicing | null = null;
    let offered: VoicingStyle[] = [];
    for (const quality of ctx.rng.shuffle([...qualities])) {
      const candidate = makeChord(rootPc, quality.id);
      const byShape = new Map<VoicingStyle, Voicing>();
      for (const style of shapes) byShape.set(style, voiceIn(candidate, style, colour));
      // Every answer this chord could be offered has to be true of what it
      // would sound, or the question has a button that lies.
      if (shapes.some((style) => !honoursLabel(candidate, style, byShape.get(style)!))) continue;
      // And only one of the five labels is true of the voicing that will
      // actually sound. Close and shell are the pair that overlap: a
      // seventh chord voiced close, with the 5th shed to fit the budget,
      // is root–3rd–7th in a row and answers to both names.
      const fits = labelsTrueOf(candidate, byShape.get(target)!.notes);
      if (fits.length !== 1 || fits[0] !== target) continue;
      // Pairwise distinct, not merely distinct from the answer: two options
      // that sound the same as each other are two options that cannot both be
      // wrong, and the question would be unanswerable either way.
      const seen = new Map<string, VoicingStyle>([[fingerprint(byShape.get(target)!), target]]);
      for (const style of shapes) {
        const key = fingerprint(byShape.get(style)!);
        if (!seen.has(key)) seen.set(key, style);
      }
      const distinct = [...seen.values()];
      if (distinct.length < 3) continue;
      chord = candidate;
      voicing = byShape.get(target)!;
      offered = distinct;
      break;
    }
    if (!chord || !voicing) return null;

    const added = addedTensions(chord, voicing.all);
    const n = Math.min(optionCount(ctx.difficulty, offered.length), offered.length);
    const distractors = ctx.rng.sample(offered.filter((s) => s !== target), n - 1);

    // One thing made harder above level 3, drawn here so a replay sounds like
    // the first hearing. The reveal plays it plainly: the point of hearing it
    // again is the shape, which is what the lever was in the way of.
    const lever = chooseLever(ctx.rng, level);
    const walk = lever === 'walk-in' && voicing.bass !== undefined
      ? approachInto(ctx.rng, voicing.bass)
      : undefined;
    const sound = (perf: Performer, roll: number, hard: boolean) => playVoicing(
      perf,
      chord!,
      voicing!,
      { lever: hard ? lever : undefined, walk, roll, seconds: 3.2, velocity: 0.68 },
    );

    return {
      id: questionId('voicing'),
      type: 'voicing',
      // The quality is printed in the prompt, so this question says nothing
      // about whether the learner can hear it. Marking the chord down for a
      // misnamed shape would be marking down the wrong thing.
      conceptIds: [voicingConceptId(target)],
      difficulty: ctx.difficulty,
      keyPc: rootPc,
      prompt: {
        title: 'How is this chord voiced?',
        sub: `${chordSymbol(chord, ctx.settings.accidental)} — the voicing, not the chord`,
      },
      fields: [
        {
          key: 'voicing',
          label: 'Voicing',
          options: buildOptions(ctx.rng, target, distractors, (s) => ({
            id: s,
            label: voicingAnswerLabel(s),
          })),
          columns: 1,
        },
      ],
      correct: { voicing: target },
      voicing: target,
      // Struck as a block: a rolled chord would give the spacing away by
      // laying the notes out one at a time.
      play: (perf) => sound(perf, 0.008, true),
      playReveal: (perf) => sound(perf, 0.16, false),
      playPlain: (perf) => {
        // Plain means plain: no tensions and no lever, whatever the question
        // used. This is the chord underneath, not the question again.
        const plain = voiceIn(chord!, 'close', { difficulty: 1, tensions: false, form: 'A', bottom: 1 });
        return playVoicing(perf, chord!, plain, { roll: 0, seconds: 3, velocity: 0.66 });
      },
      hint: {
        label: 'Bottom of the chord',
        description: 'Sounds the bottom of the stack on its own — which tone is down there is most of the answer.',
        play: (perf) => {
          perf.note(voicing!.notes[0], perf.origin(), 1.6, 0.62);
          return 1.6;
        },
      },
      reveal: {
        // What the hands did, with the tone they had underneath — and the
        // rootless form, which is worth knowing and is not the question, so
        // it appears here and nowhere in the options.
        heading: handsLabel(chord, voicing),
        detail: chordSymbol(chord, ctx.settings.accidental),
        tag: added.length ? `played with ${formatList(added)}` : undefined,
        played: soundedChord(chord, voicing, ctx.settings.accidental),
      },
      estimatedSeconds: 13 + ctx.difficulty,
    };
  },
};

/** The 3rd and the 7th of a chord: the two notes that decide what it is. */
function guideTones(chord: Chord): { third: number; seventh: number } | null {
  const iv = chord.quality.intervals;
  const third = iv.find((i) => i < 13 && (mod(i, 12) === 3 || mod(i, 12) === 4));
  const seventh = iv.find((i) => i >= 9 && i <= 11);
  if (third === undefined || seventh === undefined) return null;
  return {
    third: mod(chord.rootPc + third, 12),
    seventh: mod(chord.rootPc + seventh, 12),
  };
}

function guidableProgressions(settings: PracticeSettings) {
  const allowed = new Set(settings.progressions);
  const usable = (def: (typeof PROGRESSIONS)[number]) =>
    def.chords.length >= 3 &&
    realiseProgression(def, 0).every((r) => guideTones(r.chord) !== null);
  const pool = PROGRESSIONS.filter((p) => allowed.has(p.id) && usable(p));
  return pool.length ? pool : PROGRESSIONS.filter((p) => p.core && usable(p));
}

export const guideToneExercise: ExerciseType = {
  id: 'guide-tones',
  name: 'Guide tones',
  short: 'Guide tones',
  description: 'A progression plays. Follow the 3rds and 7ths through it.',
  baseSeconds: 32,
  pool: (settings) => guidableProgressions(settings).map((p) => `progression:${p.id}`),
  generate(ctx): Question | null {
    const pool = guidableProgressions(ctx.settings);
    const def = chooseTarget(ctx, pool, (p) => `progression:${p.id}`, (p) => p.tier);
    if (!def) return null;
    const tonic = chooseKey(ctx);
    const realised = realiseProgression(def, tonic);
    const tones = realised.map((r) => guideTones(r.chord)!);

    // The line a soloist would follow: whichever guide tone moves least from
    // the one before, which is how these two voices behave in real changes.
    const line: PitchClass[] = [];
    let last: number | null = null;
    for (const t of tones) {
      const step = (pc: number) => (last === null ? 0 : Math.min(mod(pc - last, 12), mod(last - pc, 12)));
      line.push((step(t.third) <= step(t.seventh) ? t.third : t.seventh) as PitchClass);
      last = line[line.length - 1];
    }

    const voicings = voiceProgression(realised.map((r) => r.chord), { style: 'shell', maxNotes: 4 });
    const changes = Performer.changes(realised, voicings);
    const level = clamp(Math.round(ctx.difficulty), 1, 5);

    const answer = line.join('-');
    // What each chord actually sounds, which is what a wrong line has to
    // depart from. Swapping a 3rd for the 7th of the same chord does not:
    // both notes are right there in the shell, so a learner who heard
    // every note of the line correctly could still not reject it. The
    // note that makes a line wrong has to be one the chord did not play.
    const sounded = voicings.map((v) => new Set(v.all.map((m) => mod(m, 12))));
    const neighbours = (at: number, pc: number) =>
      [1, -1, 2, -2]
        .map((d) => mod(pc + d, 12) as PitchClass)
        .filter((n) => !sounded[at].has(n));
    const alternatives = new Set<string>([answer]);
    const wrong: string[] = [];
    for (let attempt = 0; attempt < 60 && wrong.length < 7; attempt++) {
      const copy = [...line];
      const swaps = ctx.rng.chance(0.6) ? 1 : 2;
      for (let k = 0; k < swaps; k++) {
        const at = ctx.rng.int(copy.length);
        const near = neighbours(at, copy[at]);
        if (near.length) copy[at] = ctx.rng.pick(near);
      }
      const key = copy.join('-');
      if (!alternatives.has(key)) {
        alternatives.add(key);
        wrong.push(key);
      }
    }
    if (!wrong.length) return null;

    const n = Math.min(optionCount(ctx.difficulty, wrong.length + 1), wrong.length + 1);
    const distractors = ctx.rng.sample(wrong, n - 1);
    // Answer options stay dual: there the reader is choosing, and either
    // spelling has to be recognisable.
    const spell = (ids: string) =>
      ids.split('-').map((pc) => pcNameDual(Number(pc) as PitchClass)).join('  →  ');
    // The reveal names each tone as the 3rd or 7th of the chord it belongs
    // to, which is what the question was asking you to follow. In B that
    // reads E → E → D♯ rather than three pairs of alternatives.
    const spellInKey = (pcs: readonly PitchClass[]) =>
      pcs
        .map((pc, i) => spellInChord(realised[i].chord, 60 + pc, ctx.settings.accidental)
          .replace(/-?\d+$/, ''))
        .join('  →  ');

    return {
      id: questionId('guide-tones'),
      type: 'guide-tones',
      conceptIds: [`progression:${def.id}`],
      difficulty: ctx.difficulty,
      keyPc: tonic,
      prompt: {
        title: 'Follow the guide tones',
        sub: `${def.chords.length} chords — the 3rd or the 7th of each`,
      },
      fields: [
        {
          key: 'line',
          label: 'Line',
          options: buildOptions(ctx.rng, answer, distractors, (id) => ({
            id,
            label: spell(id),
          })),
          columns: 1,
        },
      ],
      correct: { line: answer },
      // No voicing is recorded: these always sound as shells, so the figure
      // would track how hard the exercise is rather than how a learner goes
      // in that voicing, and would drag the shell bucket down with it.

      play: (perf) => {
        perf.configure({ tempo: tempoFor(ctx, 108) });
        return perf.progression(changes, perf.origin(), {
          style: bassStyleFor(level),
          approachFromAbove: approachFromAbove(ctx.settings, level),
        }) + 0.5;
      },
      playReveal: (perf) => {
        // The line alone, over the changes, so it can be heard as a melody.
        perf.configure({ tempo: Math.round(tempoFor(ctx, 108) * 0.85) });
        const seconds = perf.progression(changes, perf.origin(), {
          style: 'root-fifth',
          velocity: 0.42,
        });
        let beat = 0;
        realised.forEach((r, i) => {
          perf.noteAtBeat(60 + line[i] - (line[i] > 6 ? 12 : 0), perf.origin(), beat, r.beats, 0.74);
          beat += r.beats;
        });
        return seconds + 0.5;
      },
      hint: {
        label: 'First guide tone',
        description: 'Sounds the note the line starts on — the 3rd or the 7th of the first chord.',
        play: (perf) => {
          perf.note(60 + line[0] - (line[0] > 6 ? 12 : 0), perf.origin(), 1.6, 0.62);
          return 1.6;
        },
      },
      reveal: {
        heading: spellInKey(line),
        detail: `${def.name}  ·  in ${keyName(tonic, def.tonality === 'minor' ? 'minor' : 'major')}`,
        notes: realised
          .map((r, i) => `${chordSymbol(r.chord, ctx.settings.accidental)} ${
            line[i] === tones[i].third ? '3rd' : '7th'}`)
          .join('   '),
      },
      estimatedSeconds: 20 + ctx.difficulty * 2,
    };
  },
};
