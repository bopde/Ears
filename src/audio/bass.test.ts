import { describe, expect, it } from 'vitest';
import {
  BASS_STYLES, BASS_STYLE_CAPTION, bassLine, progressionBass, type BassChord, type BassStyle,
} from './performer';
import {
  REFERENCE_VOICING_IDS, referenceBassCaption, referenceBassStyle, referenceNoteNames,
  referenceVoicings, rootMotion, rootMotionLine,
} from './reference';
import { approachFromAbove, bassStyleFor } from '../exercises/voicing-plan';
import { getExerciseType } from '../exercises/registry';
import { defaultSettings, normaliseSettings, type PracticeSettings } from '../session/settings';
import { PROGRESSIONS, realiseProgression } from '../music/progressions';
import { voiceProgression } from '../music/voicing';
import { PITCH_CLASSES, REGISTER } from '../music/pitch';
import { FakePerformer } from '../test-support';
import { makeRng } from '../lib/rng';
import { mod } from '../lib/util';

const settings = defaultSettings();

/** The changes a progression makes, voiced the way the exercises voice them. */
function changesFor(def: (typeof PROGRESSIONS)[number], tonic: number): BassChord[] {
  const realised = realiseProgression(def, tonic);
  const voicings = voiceProgression(realised.map((r) => r.chord), { style: 'spread', maxNotes: 5 });
  return realised.map((r, i) => ({
    beats: r.beats,
    rootPc: r.chord.rootPc,
    pcs: r.chord.quality.intervals.map((iv) => mod(r.chord.rootPc + iv, 12)),
    low: voicings[i].notes[0],
  }));
}

function sweep(fn: (def: (typeof PROGRESSIONS)[number], tonic: number, style: BassStyle) => void) {
  for (const def of PROGRESSIONS) {
    for (const tonic of PITCH_CLASSES) {
      for (const style of BASS_STYLES) fn(def, tonic, style);
    }
  }
}

describe('three bass styles, and no setting for them', () => {
  it('offers exactly three, each with a caption of its own', () => {
    expect(BASS_STYLES).toEqual(['root', 'root-fifth', 'walking']);
    for (const style of BASS_STYLES) {
      expect(BASS_STYLE_CAPTION[style].length, style).toBeGreaterThan(10);
    }
  });

  it('adds nothing to the settings schema', () => {
    // The bass follows the voicing on the cheat sheet and the level in a
    // session. A toggle would be one more thing to understand before you can
    // practise, and the right answer at each point is not a matter of taste.
    const keys = Object.keys(defaultSettings()) as Array<keyof PracticeSettings>;
    expect(keys.filter((k) => /bass/i.test(k))).toEqual([]);
    // Nor is one quietly honoured if it turns up in stored settings.
    const planted = normaliseSettings({ bassStyle: 'walking' } as never);
    for (const key of keys) {
      expect(planted[key], key).toEqual(defaultSettings()[key]);
    }
  });

  it('plays one held root per chord in root style, and nothing else', () => {
    sweep((def, tonic) => {
      const chords = changesFor(def, tonic);
      const line = progressionBass(chords, 'root');
      expect(line.length, `${def.id}/${tonic}`).toBe(chords.length);
      line.forEach((b, i) => {
        expect(b.role, `${def.id}/${tonic}`).toBe('root');
        expect(mod(b.midi, 12), `${def.id}/${tonic}`).toBe(chords[i].rootPc);
        expect(b.beats, `${def.id}/${tonic} is held`).toBe(chords[i].beats);
      });
    });
  });

  it('adds the fifth, and only the fifth, in root-and-fifth style', () => {
    sweep((def, tonic) => {
      for (const b of progressionBass(changesFor(def, tonic), 'root-fifth')) {
        expect(['root', 'fifth'], `${def.id}/${tonic}`).toContain(b.role);
      }
    });
  });

  it('keeps every note in the register and clear of the voicing, in all three', () => {
    sweep((def, tonic, style) => {
      const chords = changesFor(def, tonic);
      let beat = 0;
      for (const chord of chords) {
        for (const b of bassLine(chord, undefined, style, beat)) {
          expect(b.midi, `${def.id}/${tonic}/${style}`).toBeGreaterThanOrEqual(REGISTER.bass.lo);
          expect(b.midi, `${def.id}/${tonic}/${style}`).toBeLessThanOrEqual(REGISTER.bass.hi);
          expect(chord.low - b.midi, `${def.id}/${tonic}/${style}`).toBeGreaterThanOrEqual(3);
        }
        beat += chord.beats;
      }
    });
  });

  it('states every chord root exactly once, whatever the style', () => {
    sweep((def, tonic, style) => {
      const chords = changesFor(def, tonic);
      const roots = progressionBass(chords, style).filter((b) => b.role === 'root');
      expect(roots.length, `${def.id}/${tonic}/${style}`).toBe(chords.length);
      roots.forEach((b, i) => {
        expect(mod(b.midi, 12), `${def.id}/${tonic}/${style} root ${i + 1}`).toBe(chords[i].rootPc);
      });
    });
  });
});

describe('the cheat sheet picks the bass from the voicing', () => {
  it('plays roots alone in root position and root-and-fifth elsewhere', () => {
    for (const mode of REFERENCE_VOICING_IDS) {
      expect(referenceBassStyle(mode), mode).toBe(mode === 'root' ? 'root' : 'root-fifth');
      expect(referenceBassCaption(mode), mode).toBe(BASS_STYLE_CAPTION[referenceBassStyle(mode)]);
    }
  });

  it('never walks', () => {
    for (const mode of REFERENCE_VOICING_IDS) {
      expect(referenceBassStyle(mode), mode).not.toBe('walking');
    }
    for (const def of PROGRESSIONS) {
      for (const mode of REFERENCE_VOICING_IDS) {
        for (const chord of referenceVoicings(def, 0, mode)) {
          for (const b of chord.bass) {
            expect(['root', 'fifth'], `${def.id}/${mode}`).toContain(b.role);
          }
        }
      }
    }
  });

  it('schedules exactly one bass note per chord in root position, and it is the root', () => {
    for (const def of PROGRESSIONS) {
      for (const tonic of PITCH_CLASSES) {
        for (const chord of referenceVoicings(def, tonic, 'root')) {
          expect(chord.bass.length, `${def.id}/${tonic}`).toBe(1);
          expect(chord.bass[0].role).toBe('root');
          expect(mod(chord.bass[0].midi, 12), `${def.id}/${tonic}`).toBe(chord.chord.rootPc);
        }
      }
    }
  });

  it('marks a note as a root exactly when it is the chord’s root', () => {
    for (const def of PROGRESSIONS) {
      for (const tonic of PITCH_CLASSES) {
        for (const mode of REFERENCE_VOICING_IDS) {
          for (const chord of referenceVoicings(def, tonic, mode)) {
            const shown = referenceNoteNames(chord);
            expect(shown.bass.length, 'every bass note is shown').toBe(chord.bass.length);
            chord.bass.forEach((b, i) => {
              const isRoot = mod(b.midi, 12) === chord.chord.rootPc;
              expect(b.role === 'root', `${def.id}/${tonic}/${mode} ${chord.symbol}`).toBe(isRoot);
              expect(shown.bass[i].tag === '', 'only roots are untagged').toBe(isRoot);
            });
          }
        }
      }
    }
  });
});

describe('the exercises pick the bass from the level', () => {
  it('runs root only, then root and fifth, then walking', () => {
    expect([1, 2, 3, 4, 5].map(bassStyleFor))
      .toEqual(['root', 'root', 'root-fifth', 'walking', 'walking']);
  });

  it('plays what the curve says, at every level', () => {
    for (const id of ['progression', 'progression-chord']) {
      const type = getExerciseType(id)!;
      for (let d = 1; d <= 5; d++) {
        const wanted = bassStyleFor(d);
        for (let seed = 0; seed < 10; seed++) {
          const q = type.generate({
            rng: makeRng(seed * 71 + d), difficulty: d, settings, targetConcepts: [],
          });
          if (!q) continue;
          const perf = new FakePerformer();
          q.play(perf.asPerformer());
          const roles = new Set(perf.bass.map((b) => b.role));
          if (wanted === 'root') expect([...roles], `${id}@${d}`).toEqual(['root']);
          else if (wanted === 'root-fifth') {
            expect([...roles].every((r) => r === 'root' || r === 'fifth'), `${id}@${d}`).toBe(true);
          } else {
            // A walking line fills whatever beats the chord has; a two-beat
            // chord has room for the root and its fifth and no more.
            expect(roles.has('root'), `${id}@${d}`).toBe(true);
          }
        }
      }
    }
  });

  it('actually walks through a four-beat bar at the top of the curve', () => {
    for (const def of PROGRESSIONS.filter((p) => p.beatsPerChord >= 4)) {
      const roles = new Set(progressionBass(changesFor(def, 0), 'walking').map((b) => b.role));
      expect(roles.has('passing'), `${def.id}`).toBe(true);
      expect(roles.has('approach'), `${def.id}`).toBe(true);
    }
  });

  it('leaves root motion unambiguous at the levels that teach it', () => {
    // Nothing between the roots at all: every bass note is a root.
    for (let d = 1; d <= 2; d++) {
      for (const def of PROGRESSIONS) {
        const line = progressionBass(changesFor(def, 0), bassStyleFor(d));
        expect(line.every((b) => b.role === 'root'), `${def.id}@${d}`).toBe(true);
      }
    }
  });
});

describe('the walking line never fakes a tritone substitution', () => {
  it('approaches no root from a half step above while those questions are asked', () => {
    // The bass of a tritone substitution is a root approached from a half step
    // above. A passing note that does the same thing is a question with a
    // misleading answer in it.
    const bad: string[] = [];
    for (const def of PROGRESSIONS) {
      for (const tonic of PITCH_CLASSES) {
        const chords = changesFor(def, tonic);
        const line = progressionBass(chords, 'walking', { approachFromAbove: false });
        for (let i = 0; i < line.length - 1; i++) {
          if (line[i].role !== 'approach') continue;
          const next = line[i + 1];
          if (next.role !== 'root') continue;
          if (line[i].midi - next.midi === 1) {
            bad.push(`${def.id}/${tonic}: ${line[i].midi} → ${next.midi}`);
          }
        }
      }
    }
    expect(bad.slice(0, 8), `${bad.length} approaches from a half step above`).toEqual([]);
  });

  it('allows them once the learner is past the progressions that teach it', () => {
    // Read from the library rather than named: the highest tier among enabled
    // progressions whose roots slide down a half step.
    expect(approachFromAbove(settings, 4)).toBe(false);
    expect(approachFromAbove(settings, 5)).toBe(true);
    // Turn those progressions off and the rule relaxes with them.
    const without = normaliseSettings({
      progressions: PROGRESSIONS
        .filter((p) => !['tritone-sub', 'descending-turnaround', 'so-what'].includes(p.id))
        .map((p) => p.id),
    });
    expect(approachFromAbove(without, 2)).toBe(true);
  });

  it('still lands on the root it was approaching', () => {
    for (const def of PROGRESSIONS) {
      const chords = changesFor(def, 0);
      for (const fromAbove of [false, true]) {
        const line = progressionBass(chords, 'walking', { approachFromAbove: fromAbove });
        for (let i = 0; i < line.length - 1; i++) {
          if (line[i].role !== 'approach' || line[i + 1].role !== 'root') continue;
          expect(Math.abs(line[i].midi - line[i + 1].midi), `${def.id} approach distance`)
            .toBeLessThanOrEqual(2);
        }
      }
    }
  });
});

describe('the root-motion line describes what played', () => {
  it('matches the intervals and directions of the scheduled roots', () => {
    for (const def of PROGRESSIONS) {
      for (const tonic of PITCH_CLASSES) {
        for (const style of BASS_STYLES) {
          const line = progressionBass(changesFor(def, tonic), style);
          const roots = line.filter((b) => b.role === 'root').map((b) => b.midi);
          const described = rootMotion(line);
          expect(described.length, `${def.id}/${tonic}/${style}`).toBe(roots.length - 1);
          described.forEach((text, i) => {
            const delta = roots[i + 1] - roots[i];
            const where = `${def.id}/${tonic}/${style} move ${i + 1} (${delta})`;
            if (delta === 0) expect(text, where).toBe('stays');
            else expect(text.startsWith(delta > 0 ? 'rises' : 'falls'), `${where}: ${text}`).toBe(true);
            const names: Record<number, string> = {
              1: 'a half step', 2: 'a tone', 3: 'a minor third', 4: 'a major third',
              5: 'a fourth', 6: 'a tritone', 7: 'a fifth', 8: 'a minor sixth',
              9: 'a major sixth', 10: 'a minor seventh', 11: 'a major seventh', 12: 'an octave',
            };
            if (delta !== 0) expect(text, where).toContain(names[Math.min(Math.abs(delta), 12)]);
          });
        }
      }
    }
  });

  it('reads as one line, not a list', () => {
    const line = (id: string) =>
      rootMotionLine(referenceVoicings(PROGRESSIONS.find((p) => p.id === id)!, 0, 'root')
        .flatMap((c) => c.bass));
    expect(line('ii-V-I')).toBe('Bass falls a fifth, then rises a fourth.');
    expect(line('tritone-sub')).toBe('Bass falls a half step twice.');
    expect(line('line-cliche')).toBe('Bass stays on one note throughout.');
  });

  it('is in the reveal of every changes question', () => {
    for (const id of ['progression']) {
      const type = getExerciseType(id)!;
      for (let d = 1; d <= 5; d++) {
        for (let seed = 0; seed < 6; seed++) {
          const q = type.generate({
            rng: makeRng(seed * 13 + d * 3), difficulty: d, settings, targetConcepts: [],
          });
          if (!q) continue;
          expect(q.reveal.detail, `${id}@${d}`).toMatch(/Bass (falls|rises|stays)/);
        }
      }
    }
  });

  it('describes the line the audio actually schedules', () => {
    for (let d = 1; d <= 5; d++) {
      for (let seed = 0; seed < 10; seed++) {
        const q = getExerciseType('progression')!.generate({
          rng: makeRng(seed * 29 + d), difficulty: d, settings, targetConcepts: [],
        });
        if (!q) continue;
        const perf = new FakePerformer();
        q.play(perf.asPerformer());
        const scheduled = rootMotionLine(
          perf.bass.map((b) => ({ ...b, beats: 1, velocity: 0.7 })),
        );
        expect(q.reveal.detail, `@${d}#${seed}`).toContain(scheduled);
      }
    }
  });
});
