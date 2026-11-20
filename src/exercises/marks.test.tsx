// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { RevealRows } from '../ui/components/AnalysisRows';
import { revealRows } from './rows';
import { PROGRESSIONS, realiseProgression, requireProgression } from '../music/progressions';
import { referenceVoicings } from '../audio/reference';
import { voiceProgression } from '../music/voicing';
import { Performer } from '../audio/performer';
import { FakePerformer } from '../test-support';
import { defaultSettings } from '../session/settings';
import type { PitchClass } from '../music/pitch';

const settings = defaultSettings();

/** The rows an exercise reveal would show for this progression in this key. */
function rowsFor(id: string, tonic: PitchClass) {
  const def = requireProgression(id);
  const realised = realiseProgression(def, tonic);
  const voicings = voiceProgression(realised.map((r) => r.chord), {
    style: def.voicing ?? 'close',
    maxNotes: 4,
  });
  const perf = new FakePerformer();
  perf.progression(Performer.changes(realised, voicings), perf.origin(), { style: 'root' });
  const bass = perf.bass.map((b) => ({ ...b, beats: 1, velocity: 0.7 }));
  return revealRows(realised, voicings, bass, settings);
}

describe('the marks reach the screen', () => {
  it('puts the bracket, arrow, key and note on the rows that carry them', () => {
    const rows = rowsFor('rapid-ii-V', 0);
    expect(rows.map((r) => r.key)).toEqual(['C', undefined, 'B♭', undefined, 'A♭', undefined]);
    expect(rows.map((r) => r.pair)).toEqual([true, undefined, true, undefined, true, undefined]);
    expect(rows.map((r) => r.arrow))
      .toEqual([undefined, 'fifth', undefined, 'fifth', undefined, undefined]);
    expect(rows.map((r) => r.roman)).toEqual(['ii7', 'V7', 'ii7', 'V7', 'ii7', 'V7']);

    const backdoor = rowsFor('backdoor', 0);
    expect(backdoor.map((r) => r.note)).toEqual([undefined, undefined, 'backdoor']);
    expect(backdoor.map((r) => r.pair)).toEqual([true, undefined, undefined]);
    const tritone = rowsFor('tritone-sub', 0);
    expect(tritone.map((r) => r.arrow)).toEqual([undefined, 'half', undefined]);
  });

  it('names the tensions on the row, since the numeral no longer does', () => {
    // The tritone sub is written ♭II7 and comped as a D♭9♯11. The numeral
    // says what it is doing and the tag says what it played.
    const rows = rowsFor('tritone-sub', 0);
    expect(rows[1].roman).toBe('♭II7');
    expect(rows[1].symbol).toBe('D♭9♯11');
    expect(rows[1].tag, 'the colour it was comped with').toBe('9, ♯11');
    // Up the stack rather than up the keyboard, whatever order they played in.
    for (const def of PROGRESSIONS) {
      for (const row of rowsFor(def.id, 3)) {
        if (!row.tag) continue;
        const order = row.tag.split(', ').map((d) => Number(d.replace(/\D/g, '')));
        expect([...order].sort((a, b) => a - b), `${def.id}: ${row.tag}`).toEqual(order);
      }
    }
  });

  it('never puts a bass figure in a numeral, in any key', () => {
    for (const def of PROGRESSIONS) {
      for (const tonic of [0, 4, 10] as PitchClass[]) {
        for (const row of rowsFor(def.id, tonic)) {
          expect(row.roman, `${def.id}: ${row.roman}`).not.toMatch(/\/\d/);
          expect(row.roman, `${def.id}: ${row.roman}`).not.toMatch(/9|11|13|alt/);
        }
      }
    }
  });
});

describe('the cheat sheet and the exercises say the same thing', () => {
  it('shows the same numerals and the same marks for the same changes', () => {
    for (const def of PROGRESSIONS) {
      for (const tonic of [0, 6, 10] as PitchClass[]) {
        const sheet = referenceVoicings(def, tonic, 'root', 'both');
        const rows = rowsFor(def.id, tonic);
        expect(sheet.length, def.id).toBe(rows.length);
        sheet.forEach((item, i) => {
          const where = `${def.id} in ${tonic} #${i}`;
          expect(item.roman, where).toBe(rows[i].roman);
          expect(item.keyLabel, where).toBe(rows[i].key);
          expect(item.marks.pair || undefined, where).toBe(rows[i].pair);
          expect(item.marks.arrow, where).toBe(rows[i].arrow);
          expect(item.marks.note, where).toBe(rows[i].note);
        });
      }
    }
  });
});

describe('a row stays on its line', () => {
  /**
   * A numeral that falls onto a second line stops labelling the symbol
   * beside it, so the head is one line that clips rather than wraps. What
   * that needs from the markup is that every mark on a row is a sibling
   * inside that one head — and that the key label is not, because it is a
   * heading over the rows below it rather than part of any of them.
   *
   * The width itself was measured in a browser at 380 px, where the whole
   * library renders without a row overflowing; jsdom lays nothing out, so
   * this holds the structure that makes the stylesheet's rule enough.
   */
  it('keeps every mark inside the one head, and the key label outside it', () => {
    const rows = rowsFor('rapid-ii-V', 0);
    const html = renderToStaticMarkup(<RevealRows rows={rows} />);
    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');

    const heads = [...doc.querySelectorAll('.revrow__head')];
    expect(heads.length, 'one head per chord').toBe(rows.length);
    for (const head of heads) {
      // Nothing nested: every part of a row is a direct child of its head,
      // so the line is a single flex row the stylesheet can hold together.
      for (const part of ['revrow__roman', 'revrow__symbol', 'revrow__arrow', 'revrow__more']) {
        const found = head.querySelector(`.${part}`);
        expect(found, part).not.toBeNull();
        expect(found!.parentElement, `${part} is a child of the head`).toBe(head);
      }
      expect(head.querySelector('.revkey'), 'the key label is not in a row').toBeNull();
    }
    // It is a row of its own, above the chord it starts on.
    const keys = [...doc.querySelectorAll('.revkey')].map((el) => el.textContent);
    expect(keys).toEqual(['C:', 'B♭:', 'A♭:']);
    const first = doc.querySelector('.revkey')!;
    expect(first.nextElementSibling?.className).toContain('revrow');
  });

  it('draws the bracket on both rows of a pair, and on no others', () => {
    const html = renderToStaticMarkup(<RevealRows rows={rowsFor('rhythm-changes-a', 0)} />);
    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
    const classes = [...doc.querySelectorAll('.revrow')].map((el) => el.className);
    // I∆7, V7/ii, ⌊ii7, V7⌋, I∆7, V7/IV, IV∆7, ♯iv°7
    expect(classes.map((c) => c.includes('revrow--pairTop')))
      .toEqual([false, false, true, false, false, false, false, false]);
    expect(classes.map((c) => c.includes('revrow--pairEnd')))
      .toEqual([false, false, false, true, false, false, false, false]);
  });
});
