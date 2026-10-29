import { describe, expect, it } from 'vitest';
import {
  REFERENCE_VOICINGS, REFERENCE_VOICING_IDS, playReference, playReferenceChord,
  referenceNoteNames, referenceVoicings, type ReferenceVoicing,
} from './reference';
import { bassLine } from './performer';
import { FakePerformer } from '../test-support';
import { PROGRESSIONS, realiseProgression } from '../music/progressions';
import { BASS_GAP, PITCH_CLASSES, REGISTER, VOICING_FLOOR, midiName } from '../music/pitch';
import { CHORD_QUALITIES, chordDegrees, makeChord } from '../music/chords';
import { voiceChord } from '../music/voicing';
import { mod } from '../lib/util';

const MODES = REFERENCE_VOICING_IDS;

/** Every chord of every progression, in every key and every voicing mode. */
function sweep(fn: (chord: ReturnType<typeof referenceVoicings>[number], where: string) => void) {
  for (const def of PROGRESSIONS) {
    for (const tonic of PITCH_CLASSES) {
      for (const mode of MODES) {
        for (const chord of referenceVoicings(def, tonic, mode)) {
          fn(chord, `${def.id}/${tonic}/${mode}`);
        }
      }
    }
  }
}

describe('the bass stays where a bass belongs', () => {
  it('keeps every note inside the bass register, in every mode', () => {
    const strays: string[] = [];
    sweep((chord, where) => {
      for (const b of chord.bass) {
        if (b.midi < REGISTER.bass.lo || b.midi > REGISTER.bass.hi) {
          strays.push(`${where} ${chord.symbol}: ${midiName(b.midi, 'both')} (${b.midi})`);
        }
      }
    });
    expect(strays.slice(0, 8), `${strays.length} bass notes outside the register`).toEqual([]);
  });

  it('never puts the bass within a whole step of the lowest right-hand note', () => {
    // The count this replaces was 33 of 1,872 chords in the sustained sweep,
    // which is how a root-position chord came to sound inverted: the fifth
    // landed on the bottom of the right hand and the ear took it as the bass.
    const clashes: string[] = [];
    sweep((chord, where) => {
      for (const b of chord.bass) {
        if (chord.notes[0] - b.midi < BASS_GAP.min) {
          clashes.push(`${where} ${chord.symbol}: bass ${b.midi} under ${chord.notes[0]}`);
        }
      }
    });
    expect(clashes.slice(0, 8), `${clashes.length} bass/right-hand collisions`).toEqual([]);
  });

  it('applies the same two rules to a walking bass, approach notes included', () => {
    const problems: string[] = [];
    for (const def of PROGRESSIONS) {
      for (const tonic of PITCH_CLASSES) {
        const realised = realiseProgression(def, tonic);
        let beat = 0;
        realised.forEach((r, i) => {
          const low = voiceChord(r.chord, { style: 'spread', maxNotes: 5 }).notes[0];
          const chord = {
            beats: r.beats,
            rootPc: r.chord.rootPc,
            pcs: r.chord.quality.intervals.map((iv) => mod(r.chord.rootPc + iv, 12)),
            low,
          };
          for (const b of bassLine(chord, realised[i + 1]?.chord, 'walking', beat)) {
            if (b.midi < REGISTER.bass.lo || b.midi > REGISTER.bass.hi) {
              problems.push(`${def.id}/${tonic} walk out of register: ${b.midi}`);
            }
            if (low - b.midi < BASS_GAP.min) {
              problems.push(`${def.id}/${tonic} walk collision: ${b.midi} under ${low}`);
            }
          }
          beat += r.beats;
        });
      }
    }
    expect(problems.slice(0, 8), `${problems.length} walking-bass problems`).toEqual([]);
  });

  it('puts the bass in the closest octave the register allows', () => {
    // "At most an octave and a fifth" is a preference, not a law: a voicing
    // whose bottom note is E flat 4 has only one E flat in the bass register
    // below it, two octaves down. The rule that can always be kept is that no
    // octave closer than the one chosen was available.
    const avoidable: string[] = [];
    let far = 0;
    let total = 0;
    sweep((chord, where) => {
      for (const b of chord.bass) {
        total += 1;
        const gap = chord.notes[0] - b.midi;
        if (gap <= BASS_GAP.max) continue;
        far += 1;
        for (let m = b.midi + 12; m <= REGISTER.bass.hi; m += 12) {
          if (chord.notes[0] - m >= BASS_GAP.min) {
            avoidable.push(`${where} ${chord.symbol}: gap ${gap}, but ${m} was free`);
          }
        }
      }
    });
    expect(avoidable.slice(0, 8), `${avoidable.length} bass notes further down than they needed to be`)
      .toEqual([]);
    // Only the one pitch class whose octave above sits over the register.
    expect(far / total, 'how often the register forces the extra octave').toBeLessThan(0.1);
  });
});

describe('root position means root position', () => {
  it('puts the root at the bottom of the right hand and in the bass', () => {
    const wrong: string[] = [];
    for (const def of PROGRESSIONS) {
      for (const tonic of PITCH_CLASSES) {
        for (const chord of referenceVoicings(def, tonic, 'root')) {
          if (mod(chord.notes[0], 12) !== chord.chord.rootPc) {
            wrong.push(`${def.id}/${tonic} ${chord.symbol}: lowest right hand is not the root`);
          }
          for (const b of chord.bass) {
            if (mod(b.midi, 12) !== chord.chord.rootPc) {
              wrong.push(`${def.id}/${tonic} ${chord.symbol}: bass is not the root`);
            }
          }
        }
      }
    }
    expect(wrong.slice(0, 8), `${wrong.length} chords not in root position`).toEqual([]);
  });

  it('holds one bass note per chord, with no walk to the fifth', () => {
    for (const def of PROGRESSIONS) {
      for (const chord of referenceVoicings(def, 0, 'root')) {
        expect(chord.bass.length, `${def.id} ${chord.symbol}`).toBe(1);
        expect(chord.bass[0].beats, `${def.id} ${chord.symbol} is held`).toBe(chord.beats);
      }
    }
  });

  it('doubles the root an octave below the right hand where the register allows', () => {
    const wrong: string[] = [];
    for (const def of PROGRESSIONS) {
      for (const tonic of PITCH_CLASSES) {
        for (const chord of referenceVoicings(def, tonic, 'root')) {
          const gap = chord.notes[0] - chord.bass[0].midi;
          // An octave, or two when one octave down would be above the bass
          // register — never anything in between.
          const octaveFits = chord.notes[0] - 12 <= REGISTER.bass.hi;
          if (gap !== (octaveFits ? 12 : 24)) {
            wrong.push(`${def.id}/${tonic} ${chord.symbol}: gap ${gap}, octave fits ${octaveFits}`);
          }
        }
      }
    }
    expect(wrong.slice(0, 8), `${wrong.length} roots not doubled at the octave`).toEqual([]);
  });

  it('never writes a root-position chord as a slash chord', () => {
    for (const def of PROGRESSIONS) {
      for (const tonic of PITCH_CLASSES) {
        for (const chord of referenceVoicings(def, tonic, 'root')) {
          expect(chord.symbol, `${def.id}/${tonic}`).not.toContain('/');
        }
      }
    }
  });
});

describe('what is shown is what is played', () => {
  it('schedules exactly the notes the page displays, for every progression', () => {
    for (const def of PROGRESSIONS) {
      for (const mode of MODES) {
        const chords = referenceVoicings(def, 0, mode);
        const perf = new FakePerformer();
        playReference(perf.asPerformer(), chords);
        const scheduled = [...perf.notes].map((n) => n.midi).sort((a, b) => a - b);
        const shown = chords
          .flatMap((c) => [...c.notes, ...c.bass.map((b) => b.midi)])
          .sort((a, b) => a - b);
        expect(scheduled, `${def.id}/${mode}`).toEqual(shown);
      }
    }
  });

  it('plays one chord alone from the same description, rolled or struck', () => {
    // A single chord states its root and holds it. The walk to the fifth is a
    // progression's way of keeping a long bar moving; on its own it would be
    // one more thing to listen past.
    const def = PROGRESSIONS.find((p) => p.id === 'ii-V-I')!;
    for (const mode of MODES) {
      for (const roll of [false, true]) {
        for (const chord of referenceVoicings(def, 0, mode)) {
          const perf = new FakePerformer();
          playReferenceChord(perf.asPerformer(), chord, { roll });
          const played = [...new Set(perf.notes.map((n) => n.midi))].sort((a, b) => a - b);
          const expected = [...new Set([...chord.notes, chord.bass[0].midi])].sort((a, b) => a - b);
          expect(played, `${mode} roll=${roll} ${chord.symbol}`).toEqual(expected);
        }
      }
    }
  });

  it('rolls from the bass upward, lowest note first', () => {
    const def = PROGRESSIONS.find((p) => p.id === 'ii-V-I')!;
    for (const chord of referenceVoicings(def, 0, 'root')) {
      const perf = new FakePerformer();
      playReferenceChord(perf.asPerformer(), chord, { roll: true });
      const firstHeard = [...perf.notes].sort((a, b) => a.time - b.time);
      expect(firstHeard[0].midi, chord.symbol).toBe(chord.bass[0].midi);
      // The arpeggio before the block chord climbs.
      const arp = firstHeard.slice(0, chord.notes.length + 1).map((n) => n.midi);
      expect(arp, `${chord.symbol} climbs`).toEqual([...arp].sort((a, b) => a - b));
    }
  });

  it('names the notes it shows in the order the stack is read', () => {
    const def = PROGRESSIONS.find((p) => p.id === 'ii-V-I')!;
    const [first] = referenceVoicings(def, 0, 'root');
    const names = referenceNoteNames(first, 'flat');
    expect(names.notes.map((n) => n.name)).toEqual(first.notes.map((m) => midiName(m, 'flat')));
    expect(names.bass.map((b) => b.name)).toEqual(first.bass.map((b) => midiName(b.midi, 'flat')));
    // Every bass note carries what it is doing, so the display can say so.
    expect(names.bass.map((b) => b.role)).toEqual(first.bass.map((b) => b.role));
    // And every note carries the degree it is playing, read off the same
    // voicing that is about to be scheduled.
    expect(names.notes.map((n) => n.degree)).toEqual(chordDegrees(first.chord, first.notes));
    expect(names.bass[0].degree, 'the bass states the root').toBe('1');
  });

  /**
   * What each degree label means, written out independently of the code that
   * produces them, so the two have to agree rather than agreeing by
   * construction. A label is a claim about the note beside it; this is the
   * only place that claim is checked against the note.
   */
  const DEGREE_SEMITONES: Record<string, number> = {
    '1': 0, '\u266d9': 1, '9': 2, '\u266f9': 3, '\u266d3': 3, '3': 4,
    '4': 5, '11': 5, '\u266d5': 6, '\u266f11': 6, '5': 7, '\u266f5': 8,
    '\u266d13': 8, '6': 9, '13': 9, '\u266d7': 10, '7': 11,
  };

  it('puts a degree beside every note, and the degree names the note', () => {
    const wrong: string[] = [];
    const seen = new Set<string>();
    let notes = 0;
    sweep((chord, where) => {
      const names = referenceNoteNames(chord);
      expect(names.notes.length, `${where} ${chord.symbol}`).toBe(chord.notes.length);
      expect(names.bass.length, `${where} ${chord.symbol}`).toBe(chord.bass.length);
      const check = (midi: number, degree: string, what: string) => {
        notes += 1;
        seen.add(degree);
        const semitones = DEGREE_SEMITONES[degree];
        if (semitones === undefined || semitones !== mod(midi - chord.chord.rootPc, 12)) {
          wrong.push(`${where} ${chord.symbol}: ${what} ${midiName(midi, 'both')} labelled ${degree}`);
        }
      };
      chord.notes.forEach((midi, i) => check(midi, names.notes[i].degree, 'note'));
      chord.bass.forEach((b, i) => check(b.midi, names.bass[i].degree, 'bass'));
    });
    expect(wrong.slice(0, 8), `${wrong.length} of ${notes} notes mislabelled`).toEqual([]);
    // Non-vacuous twice over: the sweep has to reach a real catalogue, and it
    // has to meet degrees a plain triad would never produce — a display that
    // printed "1 3 5 7" for everything would pass the check above.
    expect(notes).toBeGreaterThan(5000);
    for (const tension of ['9', '\u266f11', '\u266d13', '\u266d9']) {
      expect(seen, `no ${tension} anywhere in the sweep`).toContain(tension);
    }
  });

  it('writes a slash chord whenever the lowest note is not the root', () => {
    let slashes = 0;
    sweep((chord) => {
      const bassPc = mod(chord.bass[0].midi, 12);
      if (bassPc !== chord.chord.rootPc) {
        slashes += 1;
        expect(chord.symbol).toContain('/');
      }
    });
    // The bass always plays the root today, so this is a guard rather than a
    // count: if a mode ever puts another note underneath, it must be labelled.
    expect(slashes).toBe(0);
  });
});

describe('voicings reach only where they should', () => {
  it('keeps every voicing above the bass register', () => {
    const low: string[] = [];
    sweep((chord, where) => {
      if (chord.notes[0] < VOICING_FLOOR) low.push(`${where} ${chord.symbol}: ${chord.notes[0]}`);
    });
    expect(low.slice(0, 8), `${low.length} voicings reaching into the bass`).toEqual([]);
  });

  it('keeps a dropped voice out of the bass register too', () => {
    for (const q of CHORD_QUALITIES) {
      for (const root of PITCH_CLASSES) {
        const v = voiceChord(makeChord(root, q.id), { style: 'drop2', maxNotes: 5 });
        expect(v.notes[0], `${q.id}/${root}`).toBeGreaterThanOrEqual(VOICING_FLOOR);
      }
    }
  });

  it('describes every mode it offers', () => {
    expect(REFERENCE_VOICINGS.map((v) => v.id)).toEqual(MODES);
    for (const v of REFERENCE_VOICINGS) {
      expect(v.label.length, v.id).toBeGreaterThan(0);
      expect(v.blurb.length, v.id).toBeGreaterThan(20);
    }
  });

  it('gives each mode its own sound rather than quietly falling back', () => {
    const def = PROGRESSIONS.find((p) => p.id === 'ii-V-I')!;
    const shapes = new Map<ReferenceVoicing, string>();
    for (const mode of MODES) {
      shapes.set(mode, referenceVoicings(def, 0, mode)
        .map((c) => `${c.notes.join(',')}/${c.bass.map((b) => b.midi).join(',')}`)
        .join('|'));
    }
    expect(new Set(shapes.values()).size, 'five distinct voicings').toBe(MODES.length);
  });
});
