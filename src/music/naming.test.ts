import { describe, expect, it } from 'vitest';
import { VOICING_NAMES, VOICING_SHORT, voicingConcept } from './catalog';
import { VOICING_STYLES, voiceChord, type VoicingStyle } from './voicing';
import { makeChord } from './chords';
import { namedInversion } from './inversions';
import { REFERENCE_VOICINGS, styleForMode } from '../audio/reference';
import { VOICING_MODES } from '../exercises/voicing-plan';
import { voicingLabel, voicingLabelFor } from '../exercises/voicing-plan';
import { ACCIDENTALS } from '../session/settings';

/**
 * One name per voicing, everywhere.
 *
 * A name says which notes are in the voicing, how they are spaced, and only
 * where that is the difference, what is at the bottom. It says nothing about
 * voice leading or the bass, because every style does both.
 */
describe('a voicing is called one thing', () => {
  it('names every style, once', () => {
    for (const style of VOICING_STYLES) {
      expect(VOICING_NAMES[style], style).toBeTruthy();
      expect(VOICING_SHORT[style], style).toBeTruthy();
    }
    const names = VOICING_STYLES.map((s) => VOICING_NAMES[s]);
    expect(new Set(names).size, 'no two styles share a name').toBe(names.length);
  });

  it('calls the inverted close voicing what it is', () => {
    // It was "Spread", and the engine has never spread it: `stack` packs these
    // exactly as it packs `close`, and the inversion is the whole difference.
    expect(VOICING_NAMES.spread).toBe('Close, inversion');
    expect(VOICING_NAMES.close).toBe('Close, root position');
    const spread = voiceChord(makeChord(0, 'maj7'), { style: 'spread' });
    const close = voiceChord(makeChord(0, 'maj7'), { style: 'close', rootPosition: true });
    const span = (n: readonly number[]) => n[n.length - 1] - n[0];
    expect(span(spread.notes), 'no wider than the close voicing it inverts')
      .toBeLessThanOrEqual(span(close.notes) + 2);
  });

  it('says nothing about voice leading or the bass', () => {
    for (const style of VOICING_STYLES) {
      const name = `${VOICING_NAMES[style]} ${VOICING_SHORT[style]}`.toLowerCase();
      for (const word of ['voice led', 'voice-led', 'voiceled', 'bass']) {
        expect(name, `${style} mentions ${word}`).not.toContain(word);
      }
    }
  });

  it('is the same name on the cheat sheet as in a question', () => {
    for (const lesson of REFERENCE_VOICINGS) {
      const style = styleForMode(lesson.id);
      expect(lesson.label, lesson.id).toBe(VOICING_NAMES[style]);
      expect(lesson.short, lesson.id).toBe(VOICING_SHORT[style]);
      expect(voicingLabel(style), lesson.id).toBe(lesson.label);
    }
  });

  it('keeps the ids, because settings and stats are keyed by them', () => {
    expect(VOICING_STYLES).toEqual(
      ['close', 'spread', 'drop2', 'rootless', 'shell', 'quartal', 'upperStructure'],
    );
    expect(REFERENCE_VOICINGS.map((v) => v.id)).toEqual(
      ['root', 'voice-led', 'shell', 'rootless', 'drop2', 'quartal', 'upperStructure'],
    );
    for (const style of VOICING_STYLES) {
      expect(voicingConcept(style).id, style).toBe(`voicing:${style}`);
    }
  });

  it('does not call two different settings the same thing', () => {
    const labels = [
      ...VOICING_MODES.map((m) => m.label),
      // The note-name setting, whose "Mixed" the voicing curve used to share.
      'Sharps and flats', 'Sharps', 'Flats',
    ];
    expect(new Set(labels).size, labels.join(' / ')).toBe(labels.length);
    expect(VOICING_MODES.find((m) => m.value === 'curve')?.label).toBe('By level');
    expect(VOICING_MODES.find((m) => m.value === 'plain')?.label).toBe('Root position only');
    expect(ACCIDENTALS).toContain('both');
  });

  it('calls nothing an inversion that has no root to turn over', () => {
    const dm7 = makeChord(2, 'm7');
    // A rootless stack with nothing underneath: the 3rd is at the bottom, and
    // that used to read as "first inversion". There is no root in it to invert.
    const bare = voiceChord(dm7, { style: 'rootless' });
    expect(bare.notes.some((m) => m % 12 === 2), 'really has no root').toBe(false);
    expect(namedInversion(dm7, bare)).toBeUndefined();
    // The same stack over a root bass is in root position, however the notes
    // above it are arranged.
    const over = voiceChord(dm7, { style: 'rootless', bass: true });
    expect(namedInversion(dm7, over)).toBeUndefined();
    // A chord that does hold its root, turned over, still gets named.
    const inverted = voiceChord(dm7, { style: 'spread', bottomPc: 5 });
    expect(inverted.notes.some((m) => m % 12 === 2), 'holds its root').toBe(true);
    expect(namedInversion(dm7, inverted)?.index).toBe(1);
    expect(namedInversion(dm7, voiceChord(dm7, { style: 'close', rootPosition: true })))
      .toBeUndefined();
  });

  it('adds the rootless form only where a rootless shape actually played', () => {
    const seventh = voiceChord(makeChord(2, 'm7'), { style: 'rootless', rootlessForm: 'B' });
    expect(seventh.form).toBe('B');
    expect(voicingLabelFor('rootless', seventh.form)).toBe('Rootless B');
    // A triad has nothing to leave out, so it comes back as an ordinary stack
    // and must not claim to be a form of a voicing it could not take.
    const triad = voiceChord(makeChord(0, 'maj'), { style: 'rootless', rootlessForm: 'A' });
    expect(triad.form).toBeUndefined();
    expect(voicingLabelFor('rootless', triad.form)).toBe('Rootless');
    for (const style of VOICING_STYLES.filter((s): s is VoicingStyle => s !== 'rootless')) {
      expect(voiceChord(makeChord(0, '13'), { style }).form, style).toBeUndefined();
    }
  });
});
