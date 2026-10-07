import { describe, expect, it } from 'vitest';
import { CHORD_QUALITIES, makeChord, nearestQualities } from './chords';
import { INTERVALS, nearestIntervals } from './intervals';
import { SCALES, scalePitchClasses } from './scales';
import { PROGRESSIONS, progressionBeats, realiseProgression } from './progressions';
import { arpeggiate, voiceChord, voiceProgression } from './voicing';
import { generatePhrase, phraseDurationBeats, scaleRun } from './phrase';
import { REGISTER, foldInto, pcAtOrAbove } from './pitch';
import { makeRng } from '../lib/rng';
import { CONCEPTS } from './catalog';
import { mod } from '../lib/util';

describe('chord definitions', () => {
  it('are well formed', () => {
    for (const q of CHORD_QUALITIES) {
      expect(q.intervals[0], `${q.id} starts on the root`).toBe(0);
      expect([...q.intervals], `${q.id} is ascending`).toEqual([...q.intervals].sort((a, b) => a - b));
      expect(new Set(q.intervals).size, `${q.id} has no duplicate tones`).toBe(q.intervals.length);
      expect(q.intervals.length, `${q.id} has at least a triad`).toBeGreaterThanOrEqual(3);
      expect(q.tier).toBeGreaterThanOrEqual(1);
      expect(q.tier).toBeLessThanOrEqual(5);
    }
  });

  it('have unique ids and distinct pitch-class sets within a root', () => {
    const ids = CHORD_QUALITIES.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    const sets = new Map<string, string>();
    for (const q of CHORD_QUALITIES) {
      const key = [...new Set(q.intervals.map((i) => mod(i, 12)))].sort((a, b) => a - b).join(',');
      const existing = sets.get(key);
      // Two qualities sharing every pitch class would be indistinguishable by ear.
      if (existing) throw new Error(`${q.id} is enharmonically identical to ${existing}`);
      sets.set(key, q.id);
    }
  });

  it('name essential tones that the chord actually contains', () => {
    for (const q of CHORD_QUALITIES) {
      for (const tone of q.essential ?? []) {
        expect(q.intervals, `${q.id} essential ${tone}`).toContain(tone);
      }
    }
  });

  it('ranks genuinely similar qualities as near misses', () => {
    const maj7 = CHORD_QUALITIES.find((q) => q.id === 'maj7')!;
    const near = nearestQualities(maj7, CHORD_QUALITIES, 5).map((q) => q.id);
    expect(near).toContain('maj9');
    expect(near).not.toContain('7alt');
  });
});

describe('intervals', () => {
  it('cover every simple interval exactly once', () => {
    for (let s = 0; s <= 12; s++) {
      expect(INTERVALS.filter((i) => i.semitones === s).length, `semitone ${s}`).toBe(1);
    }
  });

  it('treats a 4th and a 5th as confusable', () => {
    const p4 = INTERVALS.find((i) => i.id === 'P4')!;
    const near = nearestIntervals(p4, INTERVALS.filter((i) => i.semitones <= 12), 4).map((i) => i.id);
    expect(near).toContain('P5');
  });
});

describe('scales', () => {
  it('are ascending, start on the tonic and name real characteristic degrees', () => {
    for (const s of SCALES) {
      expect(s.degrees[0], s.id).toBe(0);
      expect([...s.degrees], s.id).toEqual([...s.degrees].sort((a, b) => a - b));
      expect(s.spelling.split(' ').length, `${s.id} spelling matches degree count`).toBe(
        s.degrees.length,
      );
      for (const c of s.characteristic) expect(s.degrees, `${s.id} characteristic`).toContain(c);
      expect(s.vamp.length, `${s.id} has a vamp`).toBeGreaterThan(0);
    }
  });

  it('places the seven church modes at distinct brightness levels', () => {
    const core = SCALES.filter((s) => s.core).map((s) => s.brightness);
    expect(new Set(core).size).toBe(core.length);
  });

  it('transposes to a tonic', () => {
    expect(scalePitchClasses(2, SCALES.find((s) => s.id === 'dorian')!)).toEqual([
      2, 4, 5, 7, 9, 11, 0,
    ]);
  });
});

describe('progressions', () => {
  it('reference known chord qualities and have sensible lengths', () => {
    for (const p of PROGRESSIONS) {
      expect(p.chords.length, p.id).toBeGreaterThanOrEqual(2);
      expect(progressionBeats(p), `${p.id} is not absurdly long`).toBeLessThanOrEqual(32);
      for (const c of p.chords) {
        expect(CHORD_QUALITIES.some((q) => q.id === c.quality), `${p.id}: ${c.quality}`).toBe(true);
        expect(c.roman.length, `${p.id} roman label`).toBeGreaterThan(0);
      }
    }
  });

  it('realises a ii-V-I in the right key', () => {
    const iiVI = PROGRESSIONS.find((p) => p.id === 'ii-V-I')!;
    const inF = realiseProgression(iiVI, 5);
    expect(inF.map((r) => r.chord.rootPc)).toEqual([7, 0, 5]); // Gm7, C9, Fmaj7
    expect(inF.map((r) => r.chord.quality.id)).toEqual(['m7', '9', 'maj7']);
  });
});

describe('voicing', () => {
  it('produces ascending notes inside the playable register', () => {
    for (const q of CHORD_QUALITIES) {
      for (const root of [0, 3, 7, 10]) {
        for (const style of ['close', 'spread', 'drop2', 'rootless', 'shell'] as const) {
          const v = voiceChord(makeChord(root, q.id), { style, bass: true });
          expect(v.notes.length, `${q.id}/${style}`).toBeGreaterThanOrEqual(2);
          for (let i = 1; i < v.notes.length; i++) {
            expect(v.notes[i], `${q.id}/${style} ascending`).toBeGreaterThan(v.notes[i - 1]);
          }
          expect(v.notes[0], `${q.id}/${style} low bound`).toBeGreaterThanOrEqual(REGISTER.voicing.lo - 12);
          expect(v.notes[v.notes.length - 1], `${q.id}/${style} high bound`).toBeLessThanOrEqual(
            REGISTER.voicing.hi,
          );
          if (v.bass !== undefined) {
            expect(v.bass, `${q.id}/${style} bass below voicing`).toBeLessThan(v.notes[0]);
            expect(mod(v.bass, 12)).toBe(root);
          }
        }
      }
    }
  });

  it('keeps the tones that give a chord its identity', () => {
    for (const q of CHORD_QUALITIES) {
      const chord = makeChord(0, q.id);
      const v = voiceChord(chord, { style: 'close' });
      const sounded = new Set(v.notes.map((n) => mod(n, 12)));
      for (const tone of q.essential ?? []) {
        expect(sounded, `${q.id} keeps ${tone}`).toContain(mod(tone, 12));
      }
    }
  });

  it('puts ninths and above over the top of the chord, not inside it', () => {
    const v = voiceChord(makeChord(0, 'maj9'), { style: 'close' });
    const ninth = v.notes.find((n) => mod(n, 12) === 2);
    expect(ninth).toBeDefined();
    expect(ninth!).toBeGreaterThan(v.notes[0] + 10);
  });

  it('voice-leads a progression rather than jumping around', () => {
    const iiVI = PROGRESSIONS.find((p) => p.id === 'ii-V-I')!;
    const chords = realiseProgression(iiVI, 0).map((r) => r.chord);
    const voicings = voiceProgression(chords, { style: 'rootless' });
    for (let i = 1; i < voicings.length; i++) {
      const prev = voicings[i - 1].notes;
      const curr = voicings[i].notes;
      const movement =
        curr.reduce((acc, n) => acc + Math.min(...prev.map((p) => Math.abs(n - p))), 0) / curr.length;
      expect(movement, `chord ${i} moves smoothly`).toBeLessThanOrEqual(4);
    }
  });

  it('arpeggiates upward', () => {
    const notes = arpeggiate(makeChord(4, '13'));
    expect(notes.length).toBeGreaterThan(3);
    for (let i = 1; i < notes.length; i++) expect(notes[i]).toBeGreaterThan(notes[i - 1]);
  });
});

describe('phrases', () => {
  it('stay in the scale, stay in range, and sound the modal colour', () => {
    const rng = makeRng(99);
    for (const scale of SCALES) {
      for (let trial = 0; trial < 30; trial++) {
        const tonic = 60;
        const phrase = generatePhrase({ tonicMidi: tonic, scale, rng, colour: 0.8 });
        expect(phrase.length).toBeGreaterThan(3);
        const pcs = new Set(scalePitchClasses(0, scale));
        for (const n of phrase) {
          expect(pcs, `${scale.id} note in scale`).toContain(mod(n.midi, 12));
          expect(n.midi).toBeGreaterThanOrEqual(tonic - 12);
          expect(n.midi).toBeLessThanOrEqual(tonic + 20);
        }
        if (scale.characteristic.length) {
          const sounded = phrase.map((n) => mod(n.midi - tonic, 12));
          const hasColour = scale.characteristic.some((d) => sounded.includes(mod(d, 12)));
          expect(hasColour, `${scale.id} sounds its characteristic degree`).toBe(true);
        }
        expect(phraseDurationBeats(phrase)).toBeGreaterThan(0);
      }
    }
  });

  it('runs a scale up and back down', () => {
    const dorian = SCALES.find((s) => s.id === 'dorian')!;
    const run = scaleRun(62, dorian);
    expect(run[0].midi).toBe(62);
    expect(Math.max(...run.map((n) => n.midi))).toBe(74);
    expect(run[run.length - 1].midi).toBe(62);
  });
});

describe('pitch helpers', () => {
  it('folds into a register', () => {
    expect(foldInto(90, 48, 60)).toBeLessThanOrEqual(60);
    expect(foldInto(20, 48, 60)).toBeGreaterThanOrEqual(48);
  });

  it('finds the next pitch class at or above a floor', () => {
    expect(pcAtOrAbove(4, 60)).toBe(64);
    expect(pcAtOrAbove(0, 61)).toBe(72);
  });
});

describe('concept catalog', () => {
  it('covers every chord, interval, mode, progression and key', () => {
    expect(CONCEPTS.byKind('chord').length).toBe(CHORD_QUALITIES.length);
    expect(CONCEPTS.byKind('interval').length).toBe(INTERVALS.length);
    expect(CONCEPTS.byKind('mode').length).toBe(SCALES.length);
    expect(CONCEPTS.byKind('progression').length).toBe(PROGRESSIONS.length);
    expect(CONCEPTS.byKind('key').length).toBe(12);
  });

  it('gives every concept a unique id, a short label and a tier', () => {
    const all = CONCEPTS.all();
    expect(new Set(all.map((c) => c.id)).size).toBe(all.length);
    for (const c of all) {
      expect(c.short.length, c.id).toBeGreaterThan(0);
      expect(c.tier).toBeGreaterThanOrEqual(1);
      expect(c.tier).toBeLessThanOrEqual(5);
    }
  });
});
