import { describe, expect, it } from 'vitest';
import { getExerciseType } from './registry';
import type { GenContext } from './types';
import { bottomTone, isVoicingStyle, voicingLabel } from './voicing-plan';
import { defaultSettings } from '../session/settings';
import { makeRng } from '../lib/rng';
import { FakePerformer, soundingOf } from '../test-support';
import { PROGRESSIONS, realiseProgression } from '../music/progressions';
import { octaveOf } from '../music/pitch';
import { mod } from '../lib/util';

const settings = defaultSettings();
const context = (difficulty: number, seed: number): GenContext => ({
  rng: makeRng(seed),
  difficulty,
  settings,
  targetConcepts: [],
});

/** Every progression question across the curve, with what it scheduled. */
function* played(runs = 25) {
  for (const id of ['progression', 'progression-chord']) {
    const type = getExerciseType(id)!;
    for (let d = 1; d <= 5; d++) {
      for (let seed = 0; seed < runs; seed++) {
        const q = type.generate(context(d, seed * 43 + d));
        if (!q) continue;
        const perf = new FakePerformer();
        q.play(perf.asPerformer());
        const def = PROGRESSIONS.find(
          (p) => p.id === q.correct.progression || `progression:${p.id}` === q.conceptIds[0],
        )!;
        yield { id, d, seed, q, perf, realised: realiseProgression(def, q.keyPc!) };
      }
    }
  }
}

describe('each chord of a progression says what was under it', () => {
  it('matches the lowest note of the voicing that was scheduled', () => {
    let named = 0;
    let plain = 0;
    for (const { id, d, seed, q, perf, realised } of played()) {
      const rows = q.reveal.rows!;
      expect(rows.length, `${id}@${d}#${seed}`).toBe(perf.chords.length);
      rows.forEach((row, i) => {
        // Read off what played, not worked out again from the chord.
        const wanted = bottomTone(realised[i].chord, perf.chords[i]);
        expect(row.bottom, `${id}@${d}#${seed} row ${i}`).toBe(wanted);
        if (row.bottom) named += 1; else plain += 1;
      });
    }
    // Both halves have to happen or the assertion above proves nothing.
    expect(named, 'some chords really do have another tone underneath').toBeGreaterThan(20);
    expect(plain, 'and some keep the root there').toBeGreaterThan(20);
  });

  it('never notes a bottom tone on a chord whose root is underneath', () => {
    for (const { id, d, seed, q, perf, realised } of played()) {
      q.reveal.rows!.forEach((row, i) => {
        const stack = perf.chords[i].notes;
        const rootPc = mod(realised[i].chord.rootPc, 12);
        if (mod(stack[0], 12) === rootPc) {
          expect(row.bottom, `${id}@${d}#${seed} row ${i} has its root underneath`)
            .toBeUndefined();
        }
        // A voicing with no root in it says nothing either: its family name
        // on the line below already says the root is absent.
        if (!stack.some((m) => mod(m, 12) === rootPc)) {
          expect(row.bottom, `${id}@${d}#${seed} row ${i} is root-free`).toBeUndefined();
        }
      });
    }
  });

  it('keeps the numerals as written while the bass lands on the root', () => {
    let checked = 0;
    for (const { id, d, seed, q } of played()) {
      q.reveal.rows!.forEach((row, i) => {
        checked += 1;
        // Every style starts each chord on its root, so nothing here is a
        // slash chord. The machinery for one is in place for when that
        // changes; this records that it does not fire today.
        //
        // A figure, not any slash: a numeral like ii/IV is a secondary
        // function the progression library writes down — "the two of the
        // four" — and has nothing to do with the bass. What an inversion
        // adds is a digit, as in I/3, so a digit after the slash is the
        // thing to look for.
        expect(row.roman, `${id}@${d}#${seed} row ${i}`).not.toMatch(/\/\d/);
        expect(row.symbol, `${id}@${d}#${seed} row ${i}`).not.toMatch(/\/[A-G]/);
      });
    }
    expect(checked).toBeGreaterThan(200);
  });

  it('puts the bass on the root of every chord, which is why', () => {
    // The claim the test above leans on, asserted rather than assumed: the
    // numerals can only stand as written because the note underneath each
    // change really is its root. Read off what the performer was handed.
    let landings = 0;
    for (const { id, d, seed, q, perf, realised } of played(10)) {
      let beat = 0;
      q.reveal.rows!.forEach((row, i) => {
        const start = beat;
        beat += realised[i].beats;
        // A walking line plays four notes to a chord; the one under the
        // change is the first of them.
        const landing = perf.bass.find((b) => b.beat >= start && b.beat < beat);
        expect(landing, `${id}@${d}#${seed} row ${i} has a bass note`).toBeDefined();
        expect(mod(landing!.midi, 12), `${id}@${d}#${seed} row ${i}`)
          .toBe(mod(realised[i].chord.rootPc, 12));
        // And the row reports that same note, octave and all. Which letter
        // it is spelled on is the key's business and is tested there, so
        // what is checked here is that the name points at the note played.
        expect(row.played.bass, `${id}@${d}#${seed} row ${i} is named`).toBeDefined();
        expect(soundingOf(row.played.bass!), `${id}@${d}#${seed} row ${i}`)
          .toEqual({ pc: mod(landing!.midi, 12), octave: octaveOf(landing!.midi) });
        landings += 1;
      });
    }
    expect(landings, 'the progressions really did carry a bass').toBeGreaterThan(100);
  });

  it('names the voicing family once, below the rows', () => {
    for (const { id, d, seed, q } of played(10)) {
      expect(isVoicingStyle(q.voicing), `${id}@${d}#${seed}`).toBe(true);
      expect(q.reveal.notes, `${id}@${d}#${seed}`).toBe(voicingLabel(q.voicing!));
      // The family line is about the set of changes, so it never names one
      // chord's bottom tone: that belongs on that chord's row. "Close, root
      // on the bottom" is the family's own name and says nothing per chord;
      // an ordinal there would be a row's note gone astray.
      expect(q.reveal.notes, `${id}@${d}#${seed}`).not.toMatch(/\d(?:st|nd|rd|th) on the bottom/);
    }
  });

  it('keeps every row short enough to read on one line', () => {
    // The head does not wrap at 380 px; the guard here is on the length of
    // what it is asked to fit, which is the part a test can see.
    for (const { id, d, seed, q } of played(10)) {
      for (const row of q.reveal.rows!) {
        const line = `${row.roman} ${row.symbol}${row.bottom ? ` ${row.bottom} on the bottom` : ''}`;
        expect(line.length, `${id}@${d}#${seed}: "${line}"`).toBeLessThan(46);
      }
    }
  });
});
