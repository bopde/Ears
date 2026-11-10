import { describe, expect, it } from 'vitest';
import { getExerciseType } from './registry';
import type { GenContext } from './types';
import { defaultSettings } from '../session/settings';
import { makeRng } from '../lib/rng';
import { FakePerformer } from '../test-support';
import {
  CHORD_QUALITIES, basicChord, chordSymbol, colourSounded, makeChord,
} from '../music/chords';
import { BASIC_OF, BASIC_QUALITIES, isBasicQuality } from '../music/degrees';
import { couldSound, voiceChord } from '../music/voicing';
import { PROGRESSIONS, realiseProgression } from '../music/progressions';
import { mod } from '../lib/util';

// Every chord type enabled, which is the hardest case: the more names there
// are for a set of notes, the more of them a voicing can land on.
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

/** Every question of the three types that offer chords as answers. */
function* asked(runs = 60) {
  for (const id of ['chord-quality', 'progression-chord']) {
    const type = getExerciseType(id)!;
    for (let d = 1; d <= 5; d++) {
      for (let seed = 0; seed < runs; seed++) {
        const q = type.generate(context(d, seed * 41 + d));
        if (!q) continue;
        const perf = new FakePerformer();
        q.play(perf.asPerformer());
        const field = q.fields[q.fields.length - 1];
        const answers = field.options.map((o) => o.id.includes(':') ? o.id.split(':')[1] : o.id);
        yield { id, d, seed, q, perf, field, answers, where: `${id}@${d}#${seed}` };
      }
    }
  }
}

describe('a chord question asks for a basic chord', () => {
  it('offers nothing but basic chords, whatever is enabled', () => {
    let offered = 0;
    for (const { answers, where } of asked()) {
      for (const id of answers) {
        expect(isBasicQuality(id), `${where}: ${id}`).toBe(true);
        offered += 1;
      }
    }
    expect(offered, 'answers checked').toBeGreaterThan(2000);
  });

  it('answers a chord played with its colour by the chord', () => {
    // A G7 voiced with a 9 and a 13 is a G7. Not a 9, not a 13: those are
    // one sound under three names, and the listener cannot tell which the
    // app had in mind.
    const g7 = makeChord(7, '7');
    const voiced = voiceChord(g7, { style: 'spread', maxNotes: 5, tensions: true });
    expect(colourSounded(g7, voiced.notes).length, 'really was coloured')
      .toBeGreaterThan(0);
    for (const retired of ['9', '13', 'm9', 'maj9', '7b9', '7alt', 'add9', '69']) {
      expect(BASIC_QUALITIES, retired).not.toContain(retired);
      expect(BASIC_OF[retired], retired).toBeTruthy();
    }
    // And none of them reaches an answer button.
    for (const { answers, where } of asked(30)) {
      for (const retired of ['9', '13', 'maj9', 'm9', '7alt', 'maj13']) {
        expect(answers, `${where}`).not.toContain(retired);
      }
    }
  });

  it('still has the right answer among them', () => {
    for (const { id, q, field, where } of asked(40)) {
      const key = id === 'chord-quality' ? 'quality' : 'chord';
      expect(field.key, where).toBe(key);
      expect(field.options.map((o) => o.id), where).toContain(q.correct[key]);
      expect(field.options.length, where).toBeGreaterThanOrEqual(2);
    }
  });

  it('names the colour it was played with, in the reveal', () => {
    let tagged = 0;
    let plain = 0;
    for (const { id, q, perf, where } of asked(30)) {
      // The chord the question asked about, and the notes it was played
      // with — not the whole progression's, which is a different claim.
      const index = id === 'chord-quality'
        ? 0
        : (q.reveal.rows ?? []).findIndex((r) => r.target);
      const written = id === 'chord-quality' ? makeChord(q.keyPc!, q.correct.quality) : chordAsked(q);
      const sounded = id === 'chord-quality'
        ? perf.struck.filter((n) => n.instrument !== 'bass').map((n) => n.midi)
        : perf.chords[index].all;
      const colour = colourSounded(written, sounded);
      if (!colour.length) {
        plain += 1;
        expect(q.reveal.tag, `${where} added nothing`).toBeUndefined();
        continue;
      }
      tagged += 1;
      for (const degree of colour) {
        expect(q.reveal.tag, `${where} sounded a ${degree}`).toContain(degree);
      }
    }
    expect(tagged, 'questions that add colour').toBeGreaterThan(20);
    expect(plain, 'and questions that do not').toBeGreaterThan(5);
  });
});

describe('an altered fifth is decided by whether a natural one sounds', () => {
  const fits = (sounding: Set<number>) =>
    BASIC_QUALITIES.filter((id) => couldSound(makeChord(0, id), sounding, true));

  it('reads C E G♯ B♭ as a 7♯5, and C E G A♭ B♭ as a 7 with a ♭13', () => {
    expect(fits(new Set([0, 4, 8, 10]))).toEqual(['7#5']);
    expect(fits(new Set([0, 4, 7, 8, 10]))).toEqual(['7']);
  });

  it('reads C E G♭ B♭ as a 7♭5, and the same notes over a G as a ♯11', () => {
    expect(fits(new Set([0, 4, 6, 10]))).toEqual(['7b5']);
    expect(fits(new Set([0, 4, 6, 7, 10]))).toEqual(['7']);
  });

  it('is why no question offers both readings of one sound', () => {
    for (const { q, perf, answers, where } of asked(40)) {
      const sounding = new Set(
        perf.struck.filter((n) => n.instrument !== 'bass').map((n) => mod(n.midi, 12)),
      );
      const root = q.keyPc!;
      for (const id of answers) {
        const chord = makeChord(
          q.fields[q.fields.length - 1].options.length && q.correct.chord
            ? Number(q.correct.chord.split(':')[0])
            : root,
          id,
        );
        const correct = (q.correct.quality ?? q.correct.chord?.split(':')[1]) === id;
        if (correct) continue;
        expect(couldSound(chord, sounding, true), `${where}: ${chordSymbol(chord)}`).toBe(false);
      }
    }
  });
});

/** The chord a chords-in-context question asked about, as it was written. */
function chordAsked(q: { conceptIds: string[]; keyPc: number | null; reveal: { rows?: unknown[] } }) {
  const def = PROGRESSIONS.find((p) => `progression:${p.id}` === q.conceptIds[0])!;
  const realised = realiseProgression(def, q.keyPc!);
  const rows = q.reveal.rows as Array<{ target?: boolean }>;
  return realised[rows.findIndex((r) => r.target)].chord;
}

describe('a retired quality is still a chord, just not an answer', () => {
  it('keeps every one of them in the catalogue', () => {
    expect(CHORD_QUALITIES).toHaveLength(36);
    expect(BASIC_QUALITIES).toHaveLength(18);
    for (const quality of CHORD_QUALITIES) {
      // Still voiceable, still on the cheat sheet, still where a learner's
      // history lives — only no longer something to pick off a button.
      expect(BASIC_OF[quality.id], quality.id).toBeTruthy();
      const chord = makeChord(0, quality.id);
      expect(voiceChord(chord, { style: 'close' }).notes.length, quality.id).toBeGreaterThan(2);
      expect(basicChord(chord).quality.id, quality.id).toBe(BASIC_OF[quality.id]);
    }
  });
});
