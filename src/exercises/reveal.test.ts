import { describe, expect, it } from 'vitest';
import { getExerciseType } from './registry';
import type { GenContext, SoundedChord } from './types';
import { defaultSettings } from '../session/settings';
import { makeRng } from '../lib/rng';
import { FakePerformer } from '../test-support';
import {
  CHORD_QUALITIES, addedTensions, chordDegrees, chordSymbol, makeChord, spellInChord,
} from '../music/chords';
import { PROGRESSIONS, realiseProgression } from '../music/progressions';
import { BASS_INSTRUMENT } from '../audio/instruments';
import { mod } from '../lib/util';

const settings = defaultSettings();
const context = (difficulty: number, seed: number): GenContext => ({
  rng: makeRng(seed),
  difficulty,
  settings,
  targetConcepts: [],
});

/** Every note the question scheduled, bass apart from the rest. */
function heard(perf: FakePerformer) {
  const bass = perf.struck.filter((n) => n.instrument === BASS_INSTRUMENT).map((n) => n.midi);
  const stack = perf.struck.filter((n) => n.instrument !== BASS_INSTRUMENT).map((n) => n.midi);
  return { bass, stack: [...new Set(stack)].sort((a, b) => a - b) };
}

describe('a reveal describes what was played', () => {
  it('lists one degree per note, and never one more name than degree', () => {
    // The old reveal printed names from everything that sounded and degrees
    // from the right hand alone, so a chord with a bass under it had an extra
    // name and the reader had to work out which one had no degree.
    let withBass = 0;
    for (const id of ['chord-quality', 'chord-full', 'voicing']) {
      const type = getExerciseType(id)!;
      for (let d = 1; d <= 5; d++) {
        for (let seed = 0; seed < 30; seed++) {
          const q = type.generate(context(d, seed * 41 + d));
          if (!q) continue;
          const played = q.reveal.played as SoundedChord;
          expect(played, `${id}@${d}#${seed} has no notes`).toBeDefined();
          expect(played.notes.length, `${id}@${d}#${seed}`).toBe(played.degrees.length);
          expect(played.notes.length).toBeGreaterThan(1);

          const perf = new FakePerformer();
          q.play(perf.asPerformer());
          const sounded = heard(perf);
          expect(played.notes.length, `${id}@${d}#${seed}: stack size`).toBe(sounded.stack.length);
          if (sounded.bass.length) {
            withBass += 1;
            expect(played.bass, `${id}@${d}#${seed}: a bass sounded`).toBeDefined();
          } else {
            expect(played.bass, `${id}@${d}#${seed}: no bass sounded`).toBeUndefined();
          }
        }
      }
    }
    expect(withBass, 'questions with a bass really come up').toBeGreaterThan(50);
  });

  it('names the notes it played, spelled against the chord', () => {
    const type = getExerciseType('chord-quality')!;
    for (let d = 1; d <= 5; d++) {
      for (let seed = 0; seed < 25; seed++) {
        const q = type.generate(context(d, seed * 17 + d));
        if (!q) continue;
        const chord = makeChord(q.keyPc!, q.correct.quality);
        const perf = new FakePerformer();
        q.play(perf.asPerformer());
        const voicing = perf.chords[0];
        const played = q.reveal.played!;
        expect(played.notes).toEqual(
          voicing.notes.map((m) => spellInChord(chord, m, settings.accidental)),
        );
        expect(played.degrees).toEqual(chordDegrees(chord, voicing.notes));
        expect(played.bass).toBe(
          voicing.bass === undefined
            ? undefined
            : spellInChord(chord, voicing.bass, settings.accidental),
        );
      }
    }
  });

  it('tags exactly the tensions that sounded, and says nothing otherwise', () => {
    let tagged = 0;
    let untagged = 0;
    for (const id of ['chord-quality', 'chord-full', 'voicing']) {
      const type = getExerciseType(id)!;
      for (let d = 1; d <= 5; d++) {
        for (let seed = 0; seed < 30; seed++) {
          const q = type.generate(context(d, seed * 23 + d));
          if (!q) continue;
          const qualityId = q.correct.quality ?? qualityFromPrompt(q.prompt.sub!, q.keyPc!);
          const chord = makeChord(q.keyPc!, qualityId);
          const perf = new FakePerformer();
          q.play(perf.asPerformer());
          const added = addedTensions(chord, perf.struck.map((n) => n.midi));
          if (!added.length) {
            untagged += 1;
            expect(q.reveal.tag, `${id}@${d}#${seed}: nothing was added`).toBeUndefined();
            continue;
          }
          tagged += 1;
          const tag = q.reveal.tag;
          expect(tag, `${id}@${d}#${seed}: ${added.join(',')} sounded`).toBeDefined();
          for (const degree of added) {
            expect(tag, `${id}@${d}#${seed}`).toContain(degree);
          }
          // And nothing it did not play: count the degrees named in the tag.
          const named = tag!.replace('played with ', '').split(/,| and /).map((s) => s.trim());
          expect(named.sort()).toEqual([...added].sort());
        }
      }
    }
    expect(tagged, 'tensions really do sound').toBeGreaterThan(20);
    expect(untagged, 'and plain chords really do too').toBeGreaterThan(20);
  });

  it('gives a progression one row per chord, matching what was scheduled', () => {
    for (const id of ['progression', 'progression-chord']) {
      const type = getExerciseType(id)!;
      for (let d = 1; d <= 5; d++) {
        for (let seed = 0; seed < 20; seed++) {
          const q = type.generate(context(d, seed * 29 + d));
          if (!q) continue;
          const rows = q.reveal.rows;
          expect(rows, `${id}@${d}#${seed} has no rows`).toBeDefined();
          // The whole-progression question records the answer; the
          // name-one-chord question records the progression as a concept.
          const def = PROGRESSIONS.find(
            (p) => p.id === q.correct.progression || `progression:${p.id}` === q.conceptIds[0],
          )!;
          const realised = realiseProgression(def, q.keyPc!);
          expect(rows!.length, `${id}@${d}#${seed}`).toBe(realised.length);

          const perf = new FakePerformer();
          q.play(perf.asPerformer());
          rows!.forEach((row, i) => {
            const chord = realised[i].chord;
            expect(row.roman, `${id}@${d}#${seed} row ${i}`).toBe(realised[i].roman);
            expect(row.played.notes.length).toBe(row.played.degrees.length);
            // The notes are the ones that were scheduled for that chord.
            expect(row.played.notes).toEqual(
              perf.chords[i].notes.map((m) => spellInChord(chord, m, settings.accidental)),
            );
            expect(row.played.degrees).toEqual(chordDegrees(chord, perf.chords[i].notes));
            // And the bass under it states that chord's root.
            expect(row.played.bass, `${id}@${d}#${seed} row ${i} bass`).toBeDefined();
          });
          // Exactly one row is marked, and only in the question that asks
          // about one chord.
          const marked = rows!.filter((r) => r.target);
          expect(marked.length, `${id}@${d}#${seed}`).toBe(id === 'progression-chord' ? 1 : 0);
          if (id === 'progression-chord') {
            expect(marked[0].symbol).toBe(q.reveal.heading);
          }
        }
      }
    }
  });

  it('matches each row’s bass to the chord it plays under', () => {
    // By beat, not by index: a walking line plays four notes to a chord, and
    // the first of them is the one that states the root.
    const type = getExerciseType('progression')!;
    for (let d = 4; d <= 5; d++) {
      for (let seed = 0; seed < 25; seed++) {
        const q = type.generate(context(d, seed * 37 + d));
        if (!q) continue;
        const def = PROGRESSIONS.find((p) => p.id === q.correct.progression)!;
        const realised = realiseProgression(def, q.keyPc!);
        q.reveal.rows!.forEach((row, i) => {
          const rootPc = realised[i].chord.rootPc;
          const name = row.played.bass!.replace(/-?\d+$/, '');
          const expected = spellInChord(realised[i].chord, 60 + mod(rootPc, 12), settings.accidental)
            .replace(/-?\d+$/, '');
          expect(name, `${d}#${seed} row ${i}`).toBe(expected);
        });
      }
    }
  });
});

/** The voicing question prints its chord rather than recording it. */
function qualityFromPrompt(sub: string, rootPc: number): string {
  const symbol = sub.split(' — ')[0];
  const match = CHORD_QUALITIES.find(
    (q) => chordSymbol(makeChord(rootPc, q.id), settings.accidental) === symbol,
  );
  if (!match) throw new Error(`Cannot read a quality out of "${sub}"`);
  return match.id;
}
