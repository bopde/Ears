import { describe, expect, it } from 'vitest';
import { getExerciseType } from './registry';
import { COLOUR_NOTE } from './voicing-plan';
import { bassLandings } from './rows';
import { couldAccountFor, distinctChords, unambiguousChords } from './ambiguity';
import type { GenContext } from './types';
import { defaultSettings } from '../session/settings';
import { makeRng } from '../lib/rng';
import { FakePerformer } from '../test-support';
import { CHORD_QUALITIES, addedTensions, makeChord } from '../music/chords';
import { PROGRESSIONS, realiseProgression } from '../music/progressions';
import { mod } from '../lib/util';

// Every quality enabled, which is the hardest case for the filter: the more
// names there are for a set of notes, the more of them a voicing can land on.
const settings = {
  ...defaultSettings(),
  chordQualities: CHORD_QUALITIES.map((q) => q.id),
};

const context = (difficulty: number, seed: number): GenContext => ({
  rng: makeRng(seed),
  difficulty,
  settings,
  targetConcepts: [],
});

const type = getExerciseType('progression-chord')!;

/** Each question, with what the chord it asked about actually sounded. */
function* asked(runs = 120) {
  for (let d = 1; d <= 5; d++) {
    for (let seed = 0; seed < runs; seed++) {
      const q = type.generate(context(d, seed * 37 + d));
      if (!q) continue;
      const perf = new FakePerformer();
      q.play(perf.asPerformer());
      const def = PROGRESSIONS.find((p) => `progression:${p.id}` === q.conceptIds[0])!;
      const realised = realiseProgression(def, q.keyPc!);
      const index = q.reveal.rows!.findIndex((r) => r.target);
      // What a listener heard under that change: the hands and the bass.
      const sounding = new Set(perf.chords[index].notes.map((m) => mod(m, 12)));
      const landing = bassLandings(realised, perf.bass)[index];
      if (landing) sounding.add(mod(landing.midi, 12));
      const [rootPc, qualityId] = q.correct.chord.split(':');
      yield {
        q, perf, index, sounding, realised,
        target: makeChord(Number(rootPc), qualityId),
        where: `progression-chord@${d}#${seed}`,
      };
    }
  }
}

const chordOf = (id: string) => {
  const [root, quality] = id.split(':');
  return makeChord(Number(root), quality);
};

describe('a chord in context is never offered an answer that is also right', () => {
  it('offers no wrong answer that could have produced what sounded', () => {
    let options = 0;
    for (const { q, sounding, where } of asked()) {
      for (const option of q.fields[0].options) {
        if (option.id === q.correct.chord) continue;
        options += 1;
        expect(
          couldAccountFor(chordOf(option.id), sounding),
          `${where}: ${option.label} accounts for {${[...sounding].sort((a, b) => a - b)}}`,
        ).toBe(false);
      }
    }
    expect(options, 'wrong answers checked').toBeGreaterThan(1000);
  });

  it('would offer plenty of them unfiltered, which is the point', () => {
    // The assertion above proves nothing unless the pool really does throw up
    // chords that could account for what sounded. Ask the filter directly.
    let dropped = 0;
    let kept = 0;
    for (const { target, sounding } of asked(40)) {
      // Every chord in the book, on every root: a superset of what the
      // exercise builds, so what survives here bounds what survives there.
      const pool = CHORD_QUALITIES.flatMap((quality) =>
        [0, 2, 3, 5, 7, 9, 10].map((step) => makeChord(mod(target.rootPc + step, 12), quality.id)),
      );
      const live = unambiguousChords(pool, target, sounding);
      dropped += pool.length - live.length;
      kept += live.length;
    }
    expect(dropped, 'chords the ear test drops').toBeGreaterThan(500);
    expect(kept, 'and chords it leaves alone').toBeGreaterThan(500);
  });

  it('drops Gm13 from a Gm7 that was played with its 13', () => {
    const gm7 = makeChord(7, 'm7');
    const gm13 = makeChord(7, 'm13');
    // G B♭ D F, with the E a pianist puts on top: note for note a Gm13.
    const sounding = new Set([7, 10, 2, 5, 4]);
    expect(couldAccountFor(gm13, sounding), 'Gm13 is a defensible answer here').toBe(true);
    expect(unambiguousChords([gm13], gm7, sounding)).toEqual([]);
    // And without the 13 it is not, so the filter is reading the voicing and
    // not merely refusing every chord that shares a root.
    expect(couldAccountFor(gm13, new Set([7, 10, 2, 5]))).toBe(false);
  });

  it('never prints the same notes twice among its options', () => {
    // °7 repeats every minor third, so E°7, F♯°7 and A°7 are the same four
    // keys and only one of them can be a wrong answer. The helper first,
    // because the sweep below finds it about once in two thousand draws and
    // a test that rare is a test that passes by luck.
    const sevenths = [4, 7, 10].map((root) => makeChord(root, 'dim7'));
    expect(distinctChords(sevenths)).toHaveLength(1);
    expect(distinctChords([makeChord(7, 'm7'), makeChord(10, '6')])).toHaveLength(1);
    expect(distinctChords([makeChord(7, 'm7'), makeChord(7, 'maj7')])).toHaveLength(2);

    let drawn = 0;
    for (const { q, where } of asked(200)) {
      const chords = q.fields[0].options.map((o) => chordOf(o.id));
      expect(distinctChords(chords).length, `${where}: ${q.fields[0].options.map((o) => o.label)}`)
        .toBe(chords.length);
      drawn += 1;
    }
    // Wide enough to reach the draw that used to collide (level 2, the 182nd).
    expect(drawn, 'draws swept').toBeGreaterThan(900);
  });

  it('gives up options rather than a bad one, and never the answer', () => {
    const counts = new Map<number, number>();
    for (const { q, where } of asked(60)) {
      const options = q.fields[0].options;
      counts.set(options.length, (counts.get(options.length) ?? 0) + 1);
      // A question is still a question with two answers; it is not one with
      // a single button, and it is nothing at all without the right one.
      expect(options.length, where).toBeGreaterThanOrEqual(2);
      expect(options.some((o) => o.id === q.correct.chord), `${where} offers the answer`).toBe(true);
    }
    expect([...counts.keys()].every((n) => n >= 2)).toBe(true);
  });
});

describe('a chord in context says what was added to it', () => {
  it('warns that tensions may be on, exactly when they are', () => {
    let warned = 0;
    let plain = 0;
    for (const { q, where } of asked(40)) {
      const says = (q.prompt.sub ?? '').includes(COLOUR_NOTE);
      // Close position is the one style that stays plain, so the note is
      // said everywhere else and nowhere there.
      expect(says, `${where} voiced ${q.voicing}`).toBe(q.voicing !== 'close');
      if (says) warned += 1; else plain += 1;
    }
    expect(warned, 'questions that comp with tensions').toBeGreaterThan(20);
    expect(plain, 'and questions that do not').toBeGreaterThan(20);
  });

  it('tags the reveal with what this chord sounded over its symbol', () => {
    let tagged = 0;
    for (const { q, perf, index, target, where } of asked(40)) {
      const added = addedTensions(target, perf.chords[index].all);
      if (!added.length) {
        expect(q.reveal.tag, `${where} added nothing`).toBeUndefined();
        continue;
      }
      tagged += 1;
      for (const degree of added) {
        expect(q.reveal.tag, `${where} sounded a ${degree}`).toContain(degree);
      }
    }
    expect(tagged, 'chords played with something extra').toBeGreaterThan(20);
  });
});
