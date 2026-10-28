import type { ExerciseType, Question } from './types';
import { buildOptions, chooseKey, chooseTarget, optionCount, questionId, tempoFor } from './support';
import {
  CHORD_QUALITIES, chordDegrees, chordSymbol, makeChord,
  type Chord, type ChordQuality,
} from '../music/chords';
import { voiceChord, voiceProgression, type Voicing, type VoicingStyle } from '../music/voicing';
import { NAMEABLE_VOICINGS, approachFromAbove, bassStyleFor, voicingLabel } from './voicing-plan';
import { Performer, polyphonyGain } from '../audio/performer';
import { midiName, pcNameDual, type PitchClass } from '../music/pitch';
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
function shapesFor(settings: PracticeSettings): VoicingStyle[] {
  void settings;
  return NAMEABLE_VOICINGS;
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

function voiceIn(chord: Chord, style: VoicingStyle, bass: boolean): Voicing {
  return voiceChord(chord, {
    style,
    bass,
    maxNotes: 5,
    ...(style === 'close' ? { bottomPc: chord.rootPc } : {}),
  });
}

export const voicingExercise: ExerciseType = {
  id: 'voicing',
  name: 'Name the voicing',
  short: 'Voicing',
  description: 'One chord sounds. Say how it is voiced, not what it is.',
  baseSeconds: 16,
  pool: (settings) => shapesFor(settings).map((s) => voicingConceptId(s)),
  generate(ctx): Question | null {
    const shapes = shapesFor(ctx.settings);
    const target = chooseTarget(
      ctx,
      shapes,
      (s) => voicingConceptId(s),
      (s) => (s === 'close' ? 1 : s === 'spread' ? 2 : s === 'shell' ? 3 : 4),
    );
    if (!target) return null;

    const qualities = voicableQualities(ctx.settings);
    const rootPc = chooseKey(ctx);
    // A quality whose shapes come out audibly different, so the question has
    // exactly one answer. Everything else in the pool is tried before giving up.
    const bass = ctx.difficulty <= 3;
    let chord: Chord | null = null;
    let voicing: Voicing | null = null;
    let offered: VoicingStyle[] = [];
    for (const quality of ctx.rng.shuffle([...qualities])) {
      const candidate = makeChord(rootPc, quality.id);
      const byShape = new Map<VoicingStyle, Voicing>();
      for (const style of shapes) byShape.set(style, voiceIn(candidate, style, bass));
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

    const n = Math.min(optionCount(ctx.difficulty, offered.length), offered.length);
    const distractors = ctx.rng.sample(offered.filter((s) => s !== target), n - 1);
    const gain = polyphonyGain(voicing.all.length);

    const sound = (perf: Performer, roll: number) => {
      const origin = perf.origin();
      voicing.notes.forEach((midi, i) => perf.note(midi, origin + i * roll, 3.2, 0.68, { gain }));
      if (voicing.bass !== undefined) {
        perf.note(voicing.bass, origin, 3.2, 0.72, { instrument: 'bass', gain });
      }
      return 3.4 + roll * voicing.notes.length;
    };

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
        sub: `${chordSymbol(chord, ctx.settings.accidental)} — the shape, not the chord`,
      },
      fields: [
        {
          key: 'voicing',
          label: 'Shape',
          options: buildOptions(ctx.rng, target, distractors, (s) => ({
            id: s,
            label: voicingLabel(s),
          })),
          columns: 1,
        },
      ],
      correct: { voicing: target },
      voicing: target,
      // Struck as a block: a rolled chord would give the spacing away by
      // laying the notes out one at a time.
      play: (perf) => sound(perf, 0.008),
      playReveal: (perf) => sound(perf, 0.16),
      playPlain: (perf) => {
        const plain = voiceIn(chord!, 'close', true);
        const origin = perf.origin();
        const g = polyphonyGain(plain.all.length);
        plain.notes.forEach((midi) => perf.note(midi, origin, 3, 0.66, { gain: g }));
        if (plain.bass !== undefined) {
          perf.note(plain.bass, origin, 3, 0.72, { instrument: 'bass', gain: g });
        }
        return 3.2;
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
        heading: voicingLabel(target),
        detail: `${chordSymbol(chord, ctx.settings.accidental)}  ·  ${chordDegrees(chord, voicing.notes).join(' ')}`,
        notes: voicing.all.map((m) => midiName(m, ctx.settings.accidental)).join('  '),
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
    // Wrong answers are the same line with one or two notes moved, so the only
    // way to reject one is to have followed the voice the whole way.
    const alternatives = new Set<string>([answer]);
    const wrong: string[] = [];
    for (let attempt = 0; attempt < 60 && wrong.length < 7; attempt++) {
      const copy = [...line];
      const swaps = ctx.rng.chance(0.6) ? 1 : 2;
      for (let k = 0; k < swaps; k++) {
        const at = ctx.rng.int(copy.length);
        const t = tones[at];
        // Swap to the other guide tone of that chord, or to a neighbour of it.
        copy[at] = (copy[at] === t.third ? t.seventh : t.third) as PitchClass;
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
    const spell = (ids: string) =>
      ids.split('-').map((pc) => pcNameDual(Number(pc) as PitchClass)).join('  →  ');

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
        heading: spell(answer),
        detail: `${def.name}  ·  in ${pcNameDual(tonic)}`,
        notes: realised
          .map((r, i) => `${chordSymbol(r.chord, ctx.settings.accidental)} ${
            line[i] === tones[i].third ? '3rd' : '7th'}`)
          .join('   '),
      },
      estimatedSeconds: 20 + ctx.difficulty * 2,
    };
  },
};
