import { describe, expect, it } from 'vitest';
import { VOICING_NAMES, VOICING_SHORT } from './catalog';
import { VOICING_STYLES } from './voicing';
import { CHORD_QUALITIES, makeChord } from './chords';
import { coloursFor } from './degrees';
import { VOICING_MODES, voicingAnswerLabel } from '../exercises/voicing-plan';
import { INVERSIONS } from './inversions';
// The glossary, as the file a person reads. A name is a claim, and a
// glossary that drifts from the app is worse than none: a learner who
// checks a label against it and finds the two disagree has lost the one
// thing it was written for. So the strings on screen are asserted against
// the words in docs/naming.md, not against a copy of them.
import GLOSSARY from '../../docs/naming.md?raw';

/** Says a phrase appears in the glossary, however it is marked up there. */
const states = (phrase: string) =>
  GLOSSARY.replace(/\*\*?/g, '').replace(/\s+/g, ' ').includes(phrase);

describe('the glossary and the app say the same things', () => {
  it('names every voicing the way the glossary does', () => {
    for (const style of VOICING_STYLES) {
      expect(states(VOICING_NAMES[style]), `${style}: ${VOICING_NAMES[style]}`).toBe(true);
    }
    expect(states(VOICING_SHORT.close)).toBe(true);
    expect(states(VOICING_SHORT.spread)).toBe(true);
    expect(states(voicingAnswerLabel('spread'))).toBe(true);
  });

  it('calls the plain version a basic chord, there and on screen', () => {
    expect(states('Basic chords only')).toBe(true);
    expect(states('Hear the basic chord')).toBe(true);
    expect(states('Compare with the basic chords')).toBe(true);
    expect(VOICING_MODES.find((m) => m.value === 'plain')?.label).toBe('Basic chords only');
    // And the glossary says why, so the next rename has the reason to hand.
    expect(states('is not called "root position"')).toBe(true);
  });

  it('keeps root position and inversion for the bass, in both', () => {
    expect(INVERSIONS.find((i) => i.id === 'root')?.name).toBe('Root position');
    expect(states('Those describe the bass and nothing else')).toBe(true);
    expect(states('An inversion appears as a slash chord')).toBe(true);
    // The hands are described the other way, and the glossary shows how.
    expect(states('Close · 3rd on the bottom')).toBe(true);
  });

  it('writes down the colour table the code reads from', () => {
    // Read out of the document rather than matched against it, so a table
    // that quietly loses its last colour cannot pass by being a prefix of
    // what the glossary still claims.
    const written = new Map<string, string>();
    for (const line of GLOSSARY.split('\n')) {
      // Up to the first full stop or dash, so a line that goes on to
              // explain itself still yields its list.
              const row = /^\s+[a-z]\. ([^:]+): ([0-9♭♯, ]+)[.\u2014]/.exec(line);
      if (!row) continue;
      for (const name of row[1].split(/,| and /).map((n) => n.trim())) {
        if (name) written.set(name, row[2].trim());
      }
    }
    expect(written.size, [...written].map(([k, v]) => `${k}=${v}`).join(' | '))
      .toBeGreaterThan(9);
    const colour = (id: string) => coloursFor(makeChord(0, id).quality).join(', ');
    for (const [symbol, id] of [
      ['∆7', 'maj7'], ['m7', 'm7'], ['m∆7', 'mMaj7'], ['7', '7'], ['7sus4', '7sus4'],
      ['ø7', 'm7b5'], ['°7', 'dim7'], ['7♯5', '7#5'], ['∆7♯5', 'maj7#5'],
    ] as const) {
      expect(written.get(symbol), `${symbol} is in the glossary`).toBeDefined();
      expect(written.get(symbol), symbol).toBe(colour(id));
    }
  });

  it('states the rules the degree names follow', () => {
    expect(states('a sus2 is 1 2 5, not 1 9 5')).toBe(true);
    expect(states('whose top note is a 𝄫7')).toBe(true);
    expect(states('Not "♭5" beside a natural 5; it is a ♯11')).toBe(true);
    expect(states('Not "♭3" beside a major 3rd; it is a ♯9')).toBe(true);
    expect(states('Four names are never printed: F♭, C♭, E♯, B♯')).toBe(true);
  });

  it('is a glossary of what the app actually has', () => {
    // Every quality named in it is one the catalogue holds, so a chord
    // cannot be documented out of existence or renamed in only one place.
    const symbols = new Set(CHORD_QUALITIES.map((q) => q.symbol).filter(Boolean));
    for (const symbol of ['∆7', 'm7', '7sus4', 'ø7', '°7', '7♯5', '∆7♯5', '7♭5', 'm∆7', 'm6']) {
      expect(symbols, symbol).toContain(symbol);
      expect(states(symbol), symbol).toBe(true);
    }
  });
});
