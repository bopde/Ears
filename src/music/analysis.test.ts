import { describe, expect, it } from 'vitest';
import {
  PROGRESSIONS, derivedMarks, numeralDegree, numeralIn, progressionMarks,
  realiseProgression, requireProgression, romanLine, type ChordMarks,
} from './progressions';
import { BASIC_OF } from './degrees';
import { mod } from '../lib/util';

/**
 * What every progression in the library analyses to, in C.
 *
 * Written down rather than generated, because this is the thing being
 * checked: the marks come out of a derivation and a handful of judgement
 * calls, and the only way to know the two together say what a jazz book
 * says is to have written down what a jazz book says.
 */
const TABLE: Record<string, string> = {
  'ii-V-I': '⌊ii7 – V7⌋ → I∆7',
  'I-IV-V-I': 'I∆7 – IV∆7 – V7 → I∆7',
  'I-vi-ii-V': 'I∆7 – vi7 – ⌊ii7 – V7⌋',
  'I-VI7-ii-V': 'I∆7 – V7/ii → ⌊ii7 – V7⌋',
  'iii-VI-ii-V': 'iii7 – V7/ii → ⌊ii7 – V7⌋',
  deceptive: '⌊ii7 – V7⌋ – vi7 (deceptive)',
  'ii-V-i-minor': '⌊iiø7 – V7⌋ → i7',
  'minor-ii-V-i-alt': '⌊iiø7 – V7⌋ → i∆7',
  'line-cliche': 'i – i∆7 – i7 – i6',
  'minor-plagal': 'IV∆7 – iv7 – I∆7',
  'tritone-sub': '⌊ii7 – ♭II7⌋ ⇢ I∆7',
  backdoor: '⌊iv7 – ♭VII7⌋ – I∆7 (backdoor)',
  'dim-passing': 'I∆7 – ♯i°7 (passing) – ⌊ii7 – V7⌋',
  'V-of-V': 'I∆7 – V7/V → V7 → I∆7',
  'V-of-IV': 'I∆7 – V7/IV → IV∆7 – iv6',
  'bVI-bVII-I': '♭VI∆7 – ♭VII∆7 – I∆7',
  'descending-turnaround': 'iii7 – ♭iii°7 (passing) – ⌊ii7 – ♭II7⌋ ⇢ I∆7',
  'diatonic-cycle': '⌊ii7 – V7⌋ → I∆7 – IV∆7 – viiø7',
  'rhythm-changes-a':
    'I∆7 – V7/ii → ⌊ii7 – V7⌋ → I∆7 – V7/IV → IV∆7 – ♯iv°7 (passing)',
  'blues-opening': 'I7 – IV7 – I7 – v7',
  'blues-turnaround': 'IV7 – ♯iv°7 (passing) – I7 – V7/ii → ⌊ii7 – V7⌋',
  'minor-blues': 'i7 – iv7 – i7 – V7',
  'so-what': 'i7 – ♭ii7 – i7',
  'constant-structure': 'I∆7 – ♭III∆7 – ♯IV∆7 – VI∆7 – I∆7',
  'coltrane-cell': 'I∆7 – V7/♭VI → ♭VI∆7 – V7/III → III∆7',
  'coltrane-substitution': 'ii7 – V7/♭VI → ♭VI∆7 – V7/III → III∆7 – V7 → I∆7',
  'giant-steps-head':
    'I∆7 – V7/♭VI → ♭VI∆7 – V7/III → III∆7 – ⌊ii7/♭VI – V7/♭VI⌋',
  'dominant-cycle': '♯IV7 → VII7 → III7 → VI7 → II7 → V7 → I∆7',
  'rhythm-changes-b': 'III7 → VI7 → II7 → V7 → I∆7 – vi7 – ⌊ii7 – V7⌋',
  'stella-opening':
    '⌊iiø7/iii – V7/iii⌋ – ⌊ii7 – V7⌋ – ⌊ii7/IV – V7/IV⌋ → IV∆7 – ♭VII7',
  'modulation-up-tone': '⌊ii7 – V7⌋ → I∆7 – ⌊ii7/II – V7/II⌋ → II∆7',
  'modulation-to-IV': '⌊ii7 – V7⌋ → I∆7 – ⌊ii7/IV – V7/IV⌋ → IV∆7',
  'rapid-ii-V': '⌊ii7 – V7⌋ → ⌊ii7/♭VII – V7/♭VII⌋ → ⌊ii7/♭VI – V7/♭VI⌋',
};

describe('the library reads as functional analysis', () => {
  it('analyses every progression the way the books do', () => {
    for (const def of PROGRESSIONS) {
      expect(TABLE[def.id], `${def.id} has no analysis written down`).toBeDefined();
      expect(romanLine(def, { brackets: true }), def.id).toBe(TABLE[def.id]);
    }
    expect(Object.keys(TABLE).length, 'the table covers the library')
      .toBe(PROGRESSIONS.length);
  });

  it('writes the marks it can work out, and declares the rest', () => {
    // The point of the split: a reader of the library can see at a glance
    // which marks are a rule and which are a judgement, because only the
    // judgements are written down.
    let declared = 0;
    for (const def of PROGRESSIONS) {
      const derived = derivedMarks(def);
      const marks = progressionMarks(def);
      def.chords.forEach((c, i) => {
        const where = `${def.id} #${i}`;
        const arrow = c.arrow ?? derived[i].arrow;
        const expected: ChordMarks = {
          pair: c.pair ?? derived[i].pair,
          ...(arrow && arrow !== 'none' ? { arrow } : {}),
          ...(c.key ? { key: c.key } : {}),
          ...(c.note ? { note: c.note } : {}),
        };
        expect(marks[i], where).toEqual(expected);
        if (c.pair !== undefined || c.arrow !== undefined || c.note || c.key) declared += 1;
      });
    }
    expect(declared, 'there are judgement calls to declare').toBeGreaterThan(10);
  });

  it('draws an arrow only where a dominant moves down a fifth or a half step', () => {
    for (const def of PROGRESSIONS) {
      const marks = progressionMarks(def);
      def.chords.forEach((c, i) => {
        if (!marks[i].arrow) return;
        const next = def.chords[i + 1];
        const where = `${def.id} #${i} ${c.numeral}`;
        expect(next, `${where} has nothing to resolve to`).toBeDefined();
        expect(BASIC_OF[c.quality] ?? c.quality, `${where} is not a dominant`).toBe('7');
        const step = mod(next.degree - c.degree, 12);
        expect(step, where).toBe(marks[i].arrow === 'fifth' ? 5 : 11);
      });
    }
  });

  it('brackets a ii only with the V or ♭II7 of the same thing', () => {
    for (const def of PROGRESSIONS) {
      const marks = progressionMarks(def);
      def.chords.forEach((c, i) => {
        if (!marks[i].pair) return;
        const next = def.chords[i + 1];
        const where = `${def.id} #${i} ${c.numeral}`;
        expect(next, `${where} has nothing to pair with`).toBeDefined();
        expect(BASIC_OF[next.quality] ?? next.quality, `${where}: the V of a pair`).toBe('7');
        // The two halves point at the same place — "/IV" on both, or on
        // neither. A ii of the home key and a V of somewhere else are two
        // chords, not a pair.
        const of = (n: string) => (n.includes('/') ? n.slice(n.indexOf('/') + 1) : '');
        expect(of(c.numeral), `${where} and ${next.numeral} point apart`)
          .toBe(of(next.numeral));
      });
    }
  });

  it('never writes an extension above a seventh, or a bass, in a numeral', () => {
    for (const def of PROGRESSIONS) {
      for (const tonic of [0, 5, 11]) {
        for (const r of realiseProgression(def, tonic as 0)) {
          for (const numeral of [r.roman, r.localRoman]) {
            expect(numeral, `${def.id}: ${numeral}`).not.toMatch(/9|11|13|alt/);
            // A slash in a numeral means "of" and is followed by another
            // numeral; a digit after it would be a bass figure.
            expect(numeral, `${def.id}: ${numeral}`).not.toMatch(/\/\d/);
          }
        }
      }
    }
  });
});

describe('a modulation is counted from where it lands', () => {
  it('labels the key once and reads the numerals against it', () => {
    const rows = (id: string, tonic: number) =>
      realiseProgression(requireProgression(id), tonic as 0)
        .map((r) => `${r.keyLabel ? `${r.keyLabel}: ` : ''}${r.localRoman}`)
        .join(' · ');
    expect(rows('coltrane-cell', 0)).toBe('C: I∆7 · A♭: V7 · I∆7 · E: V7 · I∆7');
    expect(rows('coltrane-substitution', 0))
      .toBe('C: ii7 · A♭: V7 · I∆7 · E: V7 · I∆7 · C: V7 · I∆7');
    expect(rows('giant-steps-head', 0))
      .toBe('C: I∆7 · A♭: V7 · I∆7 · E: V7 · I∆7 · A♭: ii7 · V7');
    expect(rows('modulation-up-tone', 0)).toBe('C: ii7 · V7 · I∆7 · D: ii7 · V7 · I∆7');
    expect(rows('modulation-to-IV', 0)).toBe('C: ii7 · V7 · I∆7 · F: ii7 · V7 · I∆7');
    expect(rows('rapid-ii-V', 0)).toBe('C: ii7 · V7 · B♭: ii7 · V7 · A♭: ii7 · V7');
    // And the labels move with the key: Coltrane's three centres are a
    // major third apart wherever it starts.
    expect(rows('coltrane-cell', 10)).toBe('B♭: I∆7 · G♭: V7 · I∆7 · D: V7 · I∆7');
  });

  it('leaves every other progression counting from the tonic', () => {
    for (const def of PROGRESSIONS) {
      if (def.chords.some((c) => c.key)) continue;
      for (const r of realiseProgression(def, 7)) {
        expect(r.localRoman, def.id).toBe(r.roman);
        expect(r.keyLabel, def.id).toBeUndefined();
      }
    }
  });

  it('reads a numeral against another key by letter and by pitch', () => {
    // V7/♭VI under A♭ is a V7; ♭VI∆7 under A♭ is the I∆7.
    expect(numeralIn('V/♭VI', 3, '♭VI')).toBe('V');
    expect(numeralIn('♭VI', 8, '♭VI')).toBe('I');
    expect(numeralIn('ii/♭VII', 0, '♭VII')).toBe('ii');
    expect(numeralIn('II', 2, 'II')).toBe('I');
    expect(numeralIn('V', 7, 'I')).toBe('V');
    expect(numeralDegree('♭VI')).toBe(8);
    expect(numeralDegree('V/♭VI')).toBe(3);
    expect(numeralDegree('♯IV')).toBe(6);
  });
});
