import { describe, expect, it } from 'vitest';
import { getExerciseType } from './registry';
import { voicingLabel } from './voicing-plan';
import type { GenContext } from './types';
import { defaultSettings } from '../session/settings';
import { makeRng } from '../lib/rng';
import { FakePerformer, soundingOf } from '../test-support';
import { PROGRESSIONS, realiseProgression } from '../music/progressions';
import { addedTensions } from '../music/chords';
import { octaveOf } from '../music/pitch';

const settings = defaultSettings();
const context = (difficulty: number, seed: number): GenContext => ({
  rng: makeRng(seed),
  difficulty,
  settings,
  targetConcepts: [],
});

const type = getExerciseType('key')!;

/** Tonal-centre questions across the curve, with what each one scheduled. */
function* asked(runs = 40) {
  for (let d = 1; d <= 5; d++) {
    for (let seed = 0; seed < runs; seed++) {
      const q = type.generate(context(d, seed * 97 + d));
      if (!q) continue;
      const perf = new FakePerformer();
      q.play(perf.asPerformer());
      yield { d, seed, q, perf, where: `key@${d}#${seed}` };
    }
  }
}

describe('the tonal centre question shows the changes it gave you', () => {
  it('lists one row per chord that sounded', () => {
    let harmonic = 0;
    let melodic = 0;
    for (const { q, perf, where } of asked()) {
      if (q.reveal.rows) {
        harmonic += 1;
        expect(q.reveal.rows.length, `${where} rows`).toBe(perf.chords.length);
        q.reveal.rows.forEach((row, i) => {
          // The notes in the row are the ones the performer was handed, not
          // the chord worked out again: that is the whole point of printing
          // them, since the voicing is what you were listening to. Which
          // letter each is spelled on is the key's business, tested there, so
          // what is compared here is the note the name points at.
          expect(row.played.notes.map(soundingOf), `${where} row ${i}`)
            .toEqual(perf.chords[i].notes.map((m) => ({ pc: m % 12, octave: octaveOf(m) })));
        });
      } else {
        melodic += 1;
        // A line on its own has no chords to list, and says so.
        expect(perf.chords.length, `${where} played no chords`).toBe(0);
        expect(q.reveal.detail, where).toMatch(/no harmony/i);
      }
    }
    // Both kinds have to turn up or neither branch is being tested.
    expect(harmonic, 'questions that comp changes').toBeGreaterThan(50);
    expect(melodic, 'and questions that only play a line').toBeGreaterThan(5);
  });

  it('gives every chord its numeral, beside its symbol', () => {
    let checked = 0;
    for (const { q, perf, where } of asked()) {
      if (!q.reveal.rows) continue;
      // Which progression it was, found the way the reveal names it.
      const def = PROGRESSIONS.find((p) => q.reveal.detail.startsWith(p.name));
      expect(def, `${where}: ${q.reveal.detail}`).toBeTruthy();
      const realised = realiseProgression(def!, q.keyPc!);
      expect(q.reveal.rows.length, where).toBe(realised.length);
      q.reveal.rows.forEach((row, i) => {
        // A figured bass would add "/3"; nothing here inverts, so the numeral
        // is the library's own.
        expect(row.roman, `${where} row ${i}`).toBe(realised[i].roman);
        expect(row.symbol.length, `${where} row ${i} has a symbol`).toBeGreaterThan(0);
        checked += 1;
      });
      expect(perf.chords.length).toBe(realised.length);
    }
    expect(checked, 'numerals checked').toBeGreaterThan(200);
  });

  it('names the voicing, and records it against the attempt', () => {
    for (const { q, where } of asked()) {
      if (!q.reveal.rows) {
        // Nothing was comped, so there is no voicing to name or to record.
        expect(q.voicing, `${where} melodic`).toBeUndefined();
        expect(q.reveal.notes, `${where} melodic`).toBeUndefined();
        continue;
      }
      expect(q.voicing, where).toBe('spread');
      expect(q.reveal.notes, where).toBe(voicingLabel('spread'));
    }
  });

  it('puts the note that sounded underneath each change in its row', () => {
    let rows = 0;
    for (const { q, perf, where } of asked(15)) {
      if (!q.reveal.rows) continue;
      let beat = 0;
      q.reveal.rows.forEach((row, i) => {
        const start = beat;
        beat += beatsOf(q, i);
        const landing = perf.bass.find((b) => b.beat >= start && b.beat < beat);
        expect(landing, `${where} row ${i} had a bass note`).toBeDefined();
        expect(soundingOf(row.played.bass!), `${where} row ${i}`)
          .toEqual({ pc: landing!.midi % 12, octave: octaveOf(landing!.midi) });
        rows += 1;
      });
    }
    expect(rows, 'rows with a bass under them').toBeGreaterThan(100);
  });

  it('says what the chords added, or says nothing because they added none', () => {
    for (const { q, perf, where } of asked(15)) {
      if (!q.reveal.rows) continue;
      // Whatever sounded that the symbols do not name. The tag has to agree
      // with it either way: silent because nothing was added, not silent
      // because nobody looked.
      const added = new Set(
        perf.chords.flatMap((v, i) => addedTensions(chordOf(q, i), v.all)),
      );
      if (added.size === 0) expect(q.reveal.tag, `${where} added nothing`).toBeUndefined();
      else for (const degree of added) {
        expect(q.reveal.tag, `${where} sounded a ${degree}`).toContain(degree);
      }
    }
  });

  it('shows a chord’s own extensions among its degrees', () => {
    // A V7♭9 is written with its ♭9 — nothing was "added", and the row still
    // has to show the note, or there is no way to check the thing you heard.
    let found = 0;
    for (const { q, where } of asked()) {
      for (const row of q.reveal.rows ?? []) {
        const extensions = row.played.degrees.filter((d) => Number(d.replace(/\D/g, '')) > 7);
        if (!extensions.length) continue;
        found += 1;
        // The symbol names it too, so the row head and the opened row agree.
        for (const degree of extensions) {
          expect(row.symbol, `${where}: ${row.symbol} sounded a ${degree}`).toContain(degree);
        }
      }
    }
    expect(found, 'chords with an extension in them came up').toBeGreaterThan(10);
  });
});

/** The chord in a row, from the progression the reveal names. */
function chordOf(q: { reveal: { detail: string }; keyPc: number | null }, i: number) {
  const def = PROGRESSIONS.find((p) => q.reveal.detail.startsWith(p.name))!;
  return realiseProgression(def, q.keyPc!)[i].chord;
}

function beatsOf(q: { reveal: { detail: string }; keyPc: number | null }, i: number): number {
  const def = PROGRESSIONS.find((p) => q.reveal.detail.startsWith(p.name))!;
  return realiseProgression(def, q.keyPc!)[i].beats;
}
