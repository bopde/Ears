import type { ExerciseType, GenContext, Question } from './types';
import { approachFromAbove, bassStyleFor, voicingLabel } from './voicing-plan';
import { allowedKeys, pitchClassField, questionId } from './support';
import { revealRows } from './rows';
import { formatList } from './chord';
import { keyConceptId } from '../music/catalog';
import { keyName, pcName } from '../music/pitch';
import { addedTensions } from '../music/chords';
import { PROGRESSIONS, realiseProgression, type ProgressionDef } from '../music/progressions';
import { voiceProgression } from '../music/voicing';
import { Performer, progressionBass } from '../audio/performer';
import { rootMotionLine } from '../audio/reference';
import { generatePhrase } from '../music/phrase';
import { requireScale } from '../music/scales';
import { clamp } from '../lib/util';

/**
 * How this question comps its changes.
 *
 * Voice-led close position throughout, which is what a pianist would do
 * behind someone finding the key — the hands move as little as possible and
 * the harmony stays out of the way.
 *
 * No added tensions, unlike the progression questions. They comp in five
 * voices and a 9th goes on top of the chord; this question comps in four, so
 * the engine pays for a tension by dropping the 5th — switching them on made
 * every I∆7 in a level-one I–IV–V–I come out 1 3 7 9, rootless-sounding and
 * missing the one interval that most plainly says "here is home". What the
 * chords are written with still sounds, and the reveal names it.
 */
const KEY_VOICING = 'spread' as const;

/** The pitch the user is given to measure from. */
const REFERENCE_PC = 0;

/**
 * Material that establishes a key, ordered so that higher difficulties get
 * progressively weaker cues: a plain I–IV–V–I announces its tonic, while a
 * progression that never lands on I leaves you to work it out.
 */
const MATERIAL_BY_LEVEL: Record<number, string[]> = {
  1: ['I-IV-V-I'],
  2: ['I-IV-V-I', 'ii-V-I'],
  3: ['ii-V-I', 'I-vi-ii-V', 'ii-V-i-minor', 'I-VI7-ii-V'],
  4: ['iii-VI-ii-V', 'deceptive', 'backdoor', 'minor-plagal', 'tritone-sub'],
  5: ['bVI-bVII-I', 'deceptive', 'dim-passing', 'backdoor'],
};

function chooseMaterial(ctx: GenContext): ProgressionDef | null {
  const enabled = new Set(ctx.settings.progressions);
  const level = clamp(Math.round(ctx.difficulty), 1, 5);
  for (let l = level; l >= 1; l--) {
    const candidates = (MATERIAL_BY_LEVEL[l] ?? [])
      .map((id) => PROGRESSIONS.find((p) => p.id === id))
      .filter((p): p is ProgressionDef => !!p && enabled.has(p.id));
    if (candidates.length) return ctx.rng.pick(candidates);
  }
  const any = PROGRESSIONS.filter((p) => enabled.has(p.id) && p.tonality !== 'modal');
  return any.length ? ctx.rng.pick(any) : null;
}

export const keyExercise: ExerciseType = {
  id: 'key',
  name: 'Tonal centre',
  short: 'Key',
  description: 'Music plays. Find the note that feels like home.',
  baseSeconds: 20,
  pool: (settings) => allowedKeysFor(settings).map(keyConceptId),
  generate(ctx): Question | null {
    const keys = allowedKeys(ctx);
    // Favour tonal centres the selector flagged, so weak keys come round again.
    const wanted = keys.filter((pc) => ctx.targetConcepts.includes(keyConceptId(pc)));
    const tonic = ctx.rng.pick(wanted.length ? wanted : keys);

    // Below level 4 the reference pitch is part of the question; above it the
    // reference is only available as a hint, which the model records.
    const givesReference = ctx.difficulty <= 3;
    // At the top level the key is carried by a melodic line alone.
    const melodicOnly = ctx.difficulty >= 5 && ctx.rng.chance(0.5);

    const material = melodicOnly ? null : chooseMaterial(ctx);
    if (!material && !melodicOnly) return null;

    const scale = requireScale(material?.tonality === 'minor' ? 'aeolian' : 'ionian');
    const phrase = generatePhrase({
      tonicMidi: 60 + tonic,
      scale,
      rng: ctx.rng,
      length: ctx.rng.range(7, 10),
      colour: 0.5,
      resolve: ctx.difficulty <= 4 ? true : ctx.rng.chance(0.55),
    });

    const realised = material ? realiseProgression(material, tonic) : [];
    const voicings = voiceProgression(realised.map((r) => r.chord), {
      style: KEY_VOICING,
      maxNotes: 4,
    });
    const changes = Performer.changes(realised, voicings);
    const bassStyle = bassStyleFor(ctx.difficulty);
    const fromAbove = approachFromAbove(ctx.settings, ctx.difficulty);
    // The same call the performer makes, so the reveal reads off the line
    // that sounded rather than one that happens to agree with it.
    const bass = progressionBass(changes, bassStyle, { approachFromAbove: fromAbove });

    const playReference = (perf: Performer, origin: number) => {
      perf.note(REFERENCE_PC + 60, origin, 1.3, 0.55);
      return 1.6;
    };

    const play = (perf: Performer) => {
      const origin = perf.origin();
      let offset = 0;
      if (givesReference) offset = playReference(perf, origin) + 0.35;
      if (melodicOnly) {
        const len = perf.melody(phrase, origin + offset);
        return offset + len + 0.6;
      }
      const len = perf.progression(changes, origin + offset, {
        style: bassStyle,
        approachFromAbove: fromAbove,
      });
      return offset + len + 0.4;
    };

    // Every degree the voicings sounded that the chord symbols do not name,
    // gathered across the changes and counted in order: you can hear a 9th in
    // a cadence without being able to say which chord carried it.
    const tensions = [...new Set(
      realised.flatMap((r, i) => addedTensions(r.chord, voicings[i].all)),
    )].sort((a, b) => Number(a.replace(/\D/g, '')) - Number(b.replace(/\D/g, '')));

    // The reveal names the key; the answer buttons keep the dual form, since
    // there the reader is choosing rather than reading.
    const keyLabel = keyName(tonic, material?.tonality === 'minor' ? 'minor' : 'major');

    return {
      id: questionId('key'),
      type: 'key',
      conceptIds: [keyConceptId(tonic)],
      difficulty: ctx.difficulty,
      keyPc: tonic,
      prompt: {
        title: 'Which note is the tonal centre?',
        sub: givesReference
          ? `Reference ${pcName(REFERENCE_PC, ctx.settings.accidental)} sounds first`
          : 'No reference pitch — use the hint if you need one',
      },
      fields: [pitchClassField('key', 'Tonal centre')],
      correct: { key: String(tonic) },
      play,
      playReveal: (perf) => {
        const origin = perf.origin();
        perf.note(tonic + 48, origin, 1.2, 0.6);
        perf.note(tonic + 60, origin, 1.2, 0.5);
        if (melodicOnly) return 1.4 + perf.melody(phrase, origin + 1.5);
        return 1.5 + perf.progression(changes, origin + 1.5, { style: 'root-fifth' });
      },
      hint: {
        label: `Reference ${pcName(REFERENCE_PC, ctx.settings.accidental)}`,
        description:
          'Sounds a reference pitch. Finding the key relative to it is the skill being trained — not absolute pitch.',
        play: (perf) => playReference(perf, perf.origin()),
      },
      // Only where chords played: a melodic-only question has no voicing to
      // name and no changes to list.
      voicing: material ? KEY_VOICING : undefined,
      reveal: {
        heading: `${keyLabel} ${material?.tonality === 'minor' ? 'minor' : 'major'}`,
        // The numerals used to be a second line here, beside the name. They
        // are in the rows now, each against the symbol it belongs to, so this
        // line carries what the rows cannot: how the roots moved, read off
        // the bass that was scheduled.
        detail: melodicOnly
          ? 'Melodic line, no harmony'
          : [material?.name, rootMotionLine(bass)].filter(Boolean).join('  ·  '),
        tag: tensions.length ? `played with ${formatList(tensions)}` : undefined,
        notes: material ? voicingLabel(KEY_VOICING) : undefined,
        // One row per chord — the numeral, the symbol, what the hands had
        // underneath, and the notes themselves a tap away. The question is
        // about the key, but the changes are what you were given to find it
        // in, and a line of symbols left no way to check them against what
        // you heard.
        rows: material ? revealRows(realised, voicings, bass, ctx.settings) : undefined,
      },
      estimatedSeconds: 17 + ctx.difficulty * 2,
    };
  },
};

function allowedKeysFor(settings: { keys: PracticeKeys }): number[] {
  return settings.keys === 'all' || !settings.keys.length
    ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
    : settings.keys;
}

type PracticeKeys = number[] | 'all';
