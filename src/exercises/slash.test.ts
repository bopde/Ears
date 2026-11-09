import { describe, expect, it } from 'vitest';
import { getExerciseType } from './registry';
import type { GenContext } from './types';
import { defaultSettings } from '../session/settings';
import { makeRng } from '../lib/rng';
import { soundingOf } from '../test-support';
import {
  CHORD_QUALITIES, chordSymbol, makeChord, slashSymbol, spellInChord,
} from '../music/chords';
import { INVERSIONS, bassToneOf, inversionsFor, requireInversion } from '../music/inversions';
import { mod } from '../lib/util';

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

const type = getExerciseType('chord-inversion')!;

function* asked(difficulty: number, runs = 150) {
  for (let seed = 0; seed < runs; seed++) {
    const q = type.generate(context(difficulty, seed * 53 + difficulty));
    if (q) yield { q, where: `inversion@${difficulty}#${seed}` };
  }
}

describe('the top levels ask for the slash chord', () => {
  it('offers the chord over each bass note it holds', () => {
    let seen = 0;
    for (const difficulty of [4, 5]) {
      for (const { q, where } of asked(difficulty)) {
        expect(q.prompt.title, where).toBe('Which slash chord is this?');
        const [rootPc, qualityId] = [q.keyPc!, q.conceptIds[1].split(':')[1]];
        const chord = makeChord(rootPc, qualityId);
        const inversions = inversionsFor(chord.quality.intervals.length);
        // Exactly the chord over each of its own tones, nothing else.
        expect(q.fields[0].options.map((o) => o.label).sort(), where).toEqual(
          inversions
            .map((i) => slashSymbol(
              chord, mod(rootPc + chord.quality.intervals[i.index], 12), settings.accidental,
            ))
            .sort(),
        );
        // Root position is the plain symbol: a slash onto the root would be
        // saying the same thing twice.
        expect(q.fields[0].options.map((o) => o.label), where)
          .toContain(chordSymbol(chord, settings.accidental));
        seen += q.fields[0].options.length;
      }
    }
    expect(seen, 'options checked').toBeGreaterThan(500);
  });

  it('puts nothing under the chord that the chord does not contain', () => {
    for (const difficulty of [4, 5]) {
      for (const { q, where } of asked(difficulty, 60)) {
        const chord = makeChord(q.keyPc!, q.conceptIds[1].split(':')[1]);
        const tones = new Set(chord.quality.intervals.map((i) => mod(chord.rootPc + i, 12)));
        for (const option of q.fields[0].options) {
          const slash = option.label.split('/')[1];
          if (!slash) continue;
          // The letter has to be one of the chord's own notes, read as sound
          // rather than as spelling: a bass the chord cannot play is not an
          // inversion of it.
          expect(tones.has(soundingOf(`${slash}4`).pc), `${where}: ${option.label}`).toBe(true);
        }
      }
    }
  });

  it('spells the bass against the chord, not off a neutral table', () => {
    // C♯m7's third is an E, because the chord is spelled from C♯. Writing it
    // F♭ would name a note the chord does not contain, and respelling the
    // root as D♭ would move the chord.
    const cSharpMin7 = makeChord(1, 'm7');
    expect(slashSymbol(cSharpMin7, 4, 'sharp')).toBe('C♯m7/E');
    expect(slashSymbol(cSharpMin7, 4, 'both')).not.toContain('F♭');
    expect(slashSymbol(cSharpMin7, 4, 'both')).not.toContain('D♭m7');
    // Every quality on every root, through the exercise's own speller.
    for (const quality of CHORD_QUALITIES) {
      for (let root = 0; root < 12; root++) {
        const chord = makeChord(root, quality.id);
        for (const interval of quality.intervals) {
          const name = spellInChord(chord, 60 + root + interval, settings.accidental)
            .replace(/-?\d+$/, '');
          expect(['F♭', 'C♭', 'E♯', 'B♯'], `${quality.id} on ${root}`).not.toContain(name);
          expect(name.length, `${quality.id} on ${root}`).toBeLessThanOrEqual(2);
        }
      }
    }
  });

  it('leaves the lower levels asking for the name', () => {
    for (const difficulty of [1, 2, 3]) {
      for (const { q, where } of asked(difficulty, 60)) {
        expect(q.prompt.title, where).toBe('Which inversion is this?');
        expect(q.fields[0].label, where).toBe('Inversion');
        for (const option of q.fields[0].options) {
          expect(option.label, where).toBe(requireInversion(option.id).name);
          expect(option.label, where).not.toContain('/');
        }
      }
    }
  });

  it('grades the same answer either way, so a history carries across', () => {
    for (const difficulty of [1, 3, 4, 5]) {
      for (const { q, where } of asked(difficulty, 40)) {
        // The field, the ids and the concepts are the inversion's whichever
        // form the question took; only the words on the buttons change.
        expect(q.fields[0].key, where).toBe('inversion');
        expect(Object.keys(q.correct), where).toEqual(['inversion']);
        expect(INVERSIONS.map((i) => i.id), where).toContain(q.correct.inversion);
        expect(q.conceptIds[0], where).toBe(`inversion:${q.correct.inversion}`);
        expect(q.fields[0].options.map((o) => o.id).sort(), where)
          .toEqual(inversionsFor(makeChord(q.keyPc!, q.conceptIds[1].split(':')[1])
            .quality.intervals.length).map((i) => i.id).sort());
      }
    }
  });
});

describe('an inversion names the tone that is really underneath', () => {
  it('reads it off the chord rather than off a stack of thirds', () => {
    // The generic is true of most chords and false of five this app inverts.
    expect(bassToneOf(makeChord(0, '6'), requireInversion('3rd'))).toBe('the 6th');
    expect(bassToneOf(makeChord(0, 'm6'), requireInversion('3rd'))).toBe('the 6th');
    expect(bassToneOf(makeChord(0, 'sus4'), requireInversion('1st'))).toBe('the 4th');
    expect(bassToneOf(makeChord(0, '7sus4'), requireInversion('1st'))).toBe('the 4th');
    expect(bassToneOf(makeChord(0, 'sus2'), requireInversion('1st'))).toBe('the 9th');
    // And unchanged where the generic was right, which is everywhere else.
    expect(bassToneOf(makeChord(0, 'maj7'), requireInversion('1st'))).toBe('the 3rd');
    expect(bassToneOf(makeChord(0, 'm7'), requireInversion('3rd'))).toBe('the 7th');
    expect(bassToneOf(makeChord(0, 'maj7'), requireInversion('root'))).toBe('the root');
  });

  it('agrees with the slash chord beside it, on every reveal', () => {
    let checked = 0;
    for (const difficulty of [1, 2, 3, 4, 5]) {
      for (const { q, where } of asked(difficulty, 50)) {
        const chord = makeChord(q.keyPc!, q.conceptIds[1].split(':')[1]);
        const inversion = requireInversion(q.correct.inversion);
        const bassPc = mod(chord.rootPc + chord.quality.intervals[inversion.index], 12);
        // The heading is the slash chord; the detail names the same tone.
        expect(q.reveal.heading, where)
          .toBe(slashSymbol(chord, bassPc, settings.accidental));
        expect(q.reveal.detail, where).toContain(inversion.name);
        expect(q.reveal.detail, where).toContain(bassToneOf(chord, inversion));
        checked += 1;
      }
    }
    expect(checked, 'reveals checked').toBeGreaterThan(150);
  });
});
