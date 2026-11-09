import { describe, expect, it } from 'vitest';
import { getExerciseType } from './registry';
import { chordToneNames, makeChord } from '../music/chords';
import type { GenContext, Question } from './types';
import { defaultSettings, normaliseSettings } from '../session/settings';
import { makeRng } from '../lib/rng';
import { PROGRESSIONS, progressionConceptId } from '../music/progressions';
import { SHARP_NAMES, FLAT_NAMES, PITCH_CLASSES } from '../music/pitch';
import type { Accidental } from '../music/pitch';

const settings = defaultSettings();
const context = (
  difficulty: number,
  seed: number,
  over: Partial<GenContext> = {},
): GenContext => ({ rng: makeRng(seed), difficulty, settings, targetConcepts: [], ...over });

/** A dual name, as the answer buttons still write one. */
const dual = (pc: number) =>
  (SHARP_NAMES[pc] === FLAT_NAMES[pc] ? SHARP_NAMES[pc] : `${SHARP_NAMES[pc]}/${FLAT_NAMES[pc]}`);

/** Generates questions of one type until `want` of them match. */
function sample(
  id: string,
  want: number,
  match: (q: Question) => boolean,
  over: Partial<GenContext> = {},
  difficulty = 3,
): Question[] {
  const type = getExerciseType(id)!;
  const out: Question[] = [];
  for (let seed = 0; seed < 400 && out.length < want; seed++) {
    const q = type.generate(context(difficulty, seed * 11 + 3, over));
    if (q && match(q)) out.push(q);
  }
  return out;
}

describe('questions say which key they are in, the way a musician would', () => {
  it('names the key in prose rather than offering both spellings', () => {
    const prose: string[] = [];
    for (const id of ['progression', 'progression-chord', 'guide-tones', 'mode', 'key']) {
      for (let d = 1; d <= 5; d++) {
        for (let seed = 0; seed < 25; seed++) {
          const q = getExerciseType(id)!.generate(context(d, seed * 7 + d));
          if (!q) continue;
          prose.push(q.prompt.sub ?? '', q.reveal.heading, q.reveal.detail, q.hint?.description ?? '');
        }
      }
    }
    expect(prose.length).toBeGreaterThan(100);
    // A dual name is two spellings with a slash between them, which is what
    // the prose used to carry: "in C♯/D♭", "V7 of C♯/D♭".
    const duals = PITCH_CLASSES.map(dual).filter((n) => n.includes('/'));
    for (const line of prose) {
      for (const name of duals) {
        expect(line, `"${line}" still offers both spellings`).not.toContain(name);
      }
    }
  });

  it('keeps the dual form on the buttons that ask which key or pitch', () => {
    // There the reader is choosing rather than reading, and either spelling
    // has to be recognisable.
    const [q] = sample('key', 1, () => true);
    const field = q.fields.find((f) => f.key === 'key')!;
    expect(field.options.map((o) => o.label)).toEqual(PITCH_CLASSES.map(dual));
  });

  it('writes the ii of B as C♯m7 in a progression question', () => {
    const inB = sample(
      'progression',
      1,
      (q) => q.keyPc === 11 && q.correct.progression === 'ii-V-I',
      { targetConcepts: [progressionConceptId('ii-V-I')] },
    );
    expect(inB.length, 'a ii–V–I in B came up').toBe(1);
    const rows = inB[0].reveal.rows!;
    expect(rows.map((r) => r.symbol)).toEqual(['C♯m7', 'F♯7', 'B∆7']);
    // And its notes agree with its name.
    expect(rows[0].played.notes.every((n) => !n.startsWith('D♭'))).toBe(true);
  });

  it('follows the accidental setting when one is set', () => {
    for (const [accidental, wanted] of [['flat', 'D♭m7'], ['sharp', 'C♯m7']] as const) {
      const tuned = normaliseSettings({ ...settings, accidental: accidental as Accidental });
      const [q] = sample(
        'progression',
        1,
        (x) => x.keyPc === 11 && x.correct.progression === 'ii-V-I',
        { settings: tuned, targetConcepts: [progressionConceptId('ii-V-I')] },
      );
      expect(q.reveal.rows![0].symbol, accidental).toBe(wanted);
    }
  });

  it('spells the guide-tone line against the chord each tone belongs to', () => {
    // In B the ii–V–I guide tones are E → E → D♯: the ♭3 of C♯m7, the ♭7 of
    // F♯7 and the 3rd of B∆7. The options still show both spellings.
    const [q] = sample(
      'guide-tones',
      1,
      (x) => x.keyPc === 11 && x.conceptIds.includes(progressionConceptId('ii-V-I')),
      { targetConcepts: [progressionConceptId('ii-V-I')] },
    );
    expect(q.reveal.heading).toBe('E  →  E  →  D♯');
    expect(q.fields[0].options.some((o) => o.label.includes('/'))).toBe(true);
  });

  it('leaves a chord-quality question on one of the two names for its root', () => {
    // There is no key, so there is nothing to spell it against: the root is
    // the conventional name, or the other side of it where the chord cannot
    // be written from the conventional one — D♭m7 is C♯m7, because D♭ F♭
    // A♭ C♭ is two names this app will not print.
    for (let d = 1; d <= 5; d++) {
      for (let seed = 0; seed < 20; seed++) {
        const q = getExerciseType('chord-quality')!.generate(context(d, seed * 13 + d));
        if (!q) continue;
        const root = q.reveal.heading.match(/^[A-G][♯♭]?/)?.[0];
        expect([SHARP_NAMES[q.keyPc!], FLAT_NAMES[q.keyPc!]], q.reveal.heading).toContain(root);
        // Which of the two, and why, is the root speller's own rule and is
        // tested against it in music/keyspelling.test.ts. What matters here
        // is that a question never prints a third name for the note.
        expect(chordToneNames(chordOf(q))[0], q.reveal.heading).toBe(root);
      }
    }
  });

  it('spells a descending interval’s upper note by the interval’s number', () => {
    const [q] = sample('interval', 1, (x) => x.reveal.notes !== undefined, {}, 2);
    expect(q.reveal.notes).toMatch(/^[A-G][♯♭]?-?\d+ → [A-G][♯♭]?-?\d+$/);
  });

  it('keeps every progression’s roman line and symbols in step', () => {
    for (const def of PROGRESSIONS) {
      for (const tonic of PITCH_CLASSES) {
        const q = getExerciseType('progression')!.generate(context(3, tonic * 31 + 1, {
          targetConcepts: [progressionConceptId(def.id)],
        }));
        if (!q || q.correct.progression !== def.id) continue;
        const rows = q.reveal.rows!;
        expect(rows.length).toBe(def.chords.length);
        for (const row of rows) {
          expect(row.symbol, `${def.id}/${tonic}`).toMatch(/^[A-G][♯♭]?/);
        }
      }
    }
  });
});

/** The chord a chord-quality question asked about, from its own answer. */
function chordOf(q: Question) {
  return makeChord(q.keyPc!, q.correct.quality);
}
