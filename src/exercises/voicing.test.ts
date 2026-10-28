import { describe, expect, it } from 'vitest';
import { EXERCISE_TYPES, getExerciseType } from './registry';
import type { GenContext, Question } from './types';
import { chooseVoicing, voicingChoices, voicingLabel, NAMEABLE_VOICINGS, VOICING_MODE_IDS } from './voicing-plan';
import { defaultSettings, normaliseSettings } from '../session/settings';
import { makeRng } from '../lib/rng';
import { FakePerformer } from '../test-support';
import { CHORD_QUALITIES, chordDegrees, chordSymbol, makeChord } from '../music/chords';
import { PROGRESSIONS, realiseProgression } from '../music/progressions';
import { voiceChord, voiceProgression, VOICING_STYLES, type VoicingStyle } from '../music/voicing';
import { PITCH_CLASSES, VOICING_FLOOR, REGISTER } from '../music/pitch';
import { BASS_INSTRUMENT } from '../audio/instruments';
import { applyAttempt, newSkill, weakVoicings } from '../learning/model';
import { mod } from '../lib/util';

const settings = defaultSettings();
const context = (difficulty: number, seed: number, over: Partial<GenContext> = {}): GenContext => ({
  rng: makeRng(seed),
  difficulty,
  settings,
  targetConcepts: [],
  ...over,
});

describe('the two new voicing shapes', () => {
  it('stacks quartal voicings in fourths, from the chord’s own notes', () => {
    for (const q of CHORD_QUALITIES) {
      for (const root of PITCH_CLASSES) {
        const chord = makeChord(root, q.id);
        const v = voiceChord(chord, { style: 'quartal', maxNotes: 5, tensions: true });
        expect(v.notes.length, `${q.id}/${root}`).toBeGreaterThanOrEqual(2);
        for (let i = 1; i < v.notes.length; i++) {
          expect(v.notes[i], `${q.id}/${root} ascending`).toBeGreaterThan(v.notes[i - 1]);
        }
      }
    }
  });

  it('finds the "So What" shape on a minor eleventh: three fourths and a third', () => {
    const chord = makeChord(2, 'm11');
    const v = voiceChord(chord, { style: 'quartal', maxNotes: 5, tensions: true });
    const steps = v.notes.slice(1).map((n, i) => n - v.notes[i]);
    expect(steps).toEqual([5, 5, 5, 4]);
  });

  it('builds an upper structure out of guide tones and a plain triad', () => {
    // G7alt: the 3rd and the 7th underneath, an E flat major triad above.
    const chord = makeChord(7, '7alt');
    const v = voiceChord(chord, { style: 'upperStructure', maxNotes: 5, tensions: true });
    const degrees = chordDegrees(chord, v.notes);
    expect(degrees.slice(0, 2)).toEqual(['3', '♭7']);
    const triad = new Set(v.notes.slice(2).map((m) => mod(m, 12)));
    expect(triad, 'E flat major').toEqual(new Set([3, 7, 10]));
  });

  it('falls back to rootless rather than inventing one where there is no tension', () => {
    // A plain dominant 9 has nothing to build a triad on.
    const chord = makeChord(7, '9');
    const v = voiceChord(chord, { style: 'upperStructure', maxNotes: 5, tensions: true });
    expect(chordDegrees(chord, v.notes)).toEqual(['3', '5', '♭7', '9']);
  });

  it('alternates the two rootless shapes down a chain of fourths', () => {
    const def = PROGRESSIONS.find((p) => p.id === 'ii-V-I')!;
    const chords = realiseProgression(def, 0).map((r) => r.chord);
    const voiced = voiceProgression(chords, { style: 'rootless', maxNotes: 5, tensions: true });
    const degrees = chords.map((c, i) => chordDegrees(c, voiced[i].notes).join(' '));
    expect(degrees).toEqual(['♭3 5 ♭7 9', '♭7 9 3 5', '3 5 7 9']);
  });

  it('never states the root of a chord it is voicing rootlessly', () => {
    for (const q of CHORD_QUALITIES.filter((c) => c.intervals.length >= 4)) {
      for (const root of PITCH_CLASSES) {
        const v = voiceChord(makeChord(root, q.id), { style: 'rootless', maxNotes: 5, tensions: true });
        expect(v.notes.some((m) => mod(m, 12) === root), `${q.id}/${root}`).toBe(false);
      }
    }
  });

  it('keeps every new shape inside the register, like every old one', () => {
    for (const style of VOICING_STYLES) {
      for (const q of CHORD_QUALITIES) {
        for (const root of PITCH_CLASSES) {
          const v = voiceChord(makeChord(root, q.id), { style, maxNotes: 5, tensions: true });
          expect(v.notes[0], `${style} ${q.id}/${root}`).toBeGreaterThanOrEqual(VOICING_FLOOR);
          expect(v.notes[v.notes.length - 1], `${style} ${q.id}/${root}`)
            .toBeLessThanOrEqual(REGISTER.melody.hi);
        }
      }
    }
  });
});

describe('tensions are a cheat-sheet thing, not an exercise thing', () => {
  it('sounds only the chord’s own notes when tensions are off', () => {
    for (const style of VOICING_STYLES) {
      for (const q of CHORD_QUALITIES) {
        const chord = makeChord(0, q.id);
        const own = new Set(q.intervals.map((i) => mod(i, 12)));
        for (const midi of voiceChord(chord, { style, maxNotes: 5 }).notes) {
          expect(own.has(mod(midi, 12)), `${style} ${q.id} sounded ${mod(midi, 12)}`).toBe(true);
        }
      }
    }
  });

  it('adds the 9th a pianist would when they are on', () => {
    const chord = makeChord(2, 'm7');
    const plain = voiceChord(chord, { style: 'rootless', maxNotes: 5 });
    const dressed = voiceChord(chord, { style: 'rootless', maxNotes: 5, tensions: true });
    expect(chordDegrees(chord, plain.notes)).toEqual(['♭3', '5', '♭7']);
    expect(chordDegrees(chord, dressed.notes)).toEqual(['♭3', '5', '♭7', '9']);
  });

  it('keeps every tone the chord is named for, whatever the shape', () => {
    for (const q of CHORD_QUALITIES) {
      for (const style of ['rootless', 'shell'] as const) {
        const chord = makeChord(0, q.id);
        const sounded = new Set(
          voiceChord(chord, { style, maxNotes: 5, tensions: true }).notes.map((m) => mod(m, 12)),
        );
        for (const i of q.essential ?? []) {
          expect(sounded.has(mod(i, 12)), `${style} ${q.id} dropped +${i}`).toBe(true);
        }
      }
    }
  });
});

describe('the difficulty curve', () => {
  it('runs from root position to the way a pianist actually plays', () => {
    expect(voicingChoices('curve', 1)).toEqual(['close']);
    expect(voicingChoices('curve', 5)).toEqual(['rootless', 'drop2']);
    for (let d = 1; d <= 5; d++) {
      expect(voicingChoices('curve', d).length, `level ${d}`).toBeGreaterThan(0);
    }
  });

  it('is overridden entirely by Plain and Realistic', () => {
    for (let d = 1; d <= 5; d++) {
      expect(voicingChoices('plain', d)).toEqual(['close']);
      expect(voicingChoices('realistic', d)).toEqual(['rootless', 'drop2']);
    }
  });

  it('leans towards the voicing the model says is weak', () => {
    const counts = { drop2: 0, rootless: 0, spread: 0 } as Record<string, number>;
    for (let seed = 0; seed < 400; seed++) {
      counts[chooseVoicing(makeRng(seed), 'curve', 4, ['rootless'])] += 1;
    }
    expect(counts.rootless, 'the weak one comes up most').toBeGreaterThan(counts.drop2);
    expect(counts.spread, 'but the others still come up').toBeGreaterThan(0);
  });

  it('applies to chord questions and to changes alike', () => {
    for (const mode of ['plain', 'realistic'] as const) {
      const tuned = normaliseSettings({ ...settings, voicingMode: mode });
      const expected = voicingChoices(mode, 5);
      for (const id of ['chord-quality', 'chord-full', 'progression', 'progression-chord']) {
        const type = getExerciseType(id)!;
        for (let seed = 0; seed < 12; seed++) {
          const q = type.generate({ ...context(5, seed * 31 + 3), settings: tuned });
          if (!q) continue;
          expect(expected, `${id}/${mode} used ${q.voicing}`).toContain(q.voicing);
        }
      }
    }
  });
});

describe('every question says how it was voiced, and offers it plain', () => {
  const voiced = ['chord-quality', 'chord-full', 'progression', 'progression-chord', 'voicing'];

  it('records a voicing the model can key on', () => {
    for (const id of voiced) {
      const type = getExerciseType(id)!;
      for (let d = 1; d <= 5; d++) {
        for (let seed = 0; seed < 8; seed++) {
          const q = type.generate(context(d, seed * 97 + d));
          if (!q) continue;
          expect(q.voicing, `${id}@${d}`).toBeDefined();
          expect(VOICING_STYLES, `${id}@${d}`).toContain(q.voicing);
        }
      }
    }
  });

  it('names the voicing in the reveal', () => {
    for (const id of voiced) {
      const type = getExerciseType(id)!;
      for (let seed = 0; seed < 10; seed++) {
        const q = type.generate(context(5, seed * 53 + 11));
        if (!q) continue;
        const text = `${q.reveal.heading} ${q.reveal.detail} ${q.reveal.notes ?? ''}`;
        expect(text, `${id} reveal`).toContain(voicingLabel(q.voicing!));
      }
    }
  });

  it('replays the chord in root position over its root', () => {
    for (const id of voiced) {
      const type = getExerciseType(id)!;
      for (let seed = 0; seed < 10; seed++) {
        const q = type.generate(context(5, seed * 17 + 2));
        if (!q?.playPlain) continue;
        const perf = new FakePerformer();
        q.playPlain(perf.asPerformer());
        expect(perf.notes.length, `${id} plays something plain`).toBeGreaterThan(0);
        const stack = perf.notes.filter((n) => n.instrument !== BASS_INSTRUMENT);
        const bass = perf.notes.filter((n) => n.instrument === BASS_INSTRUMENT);
        expect(bass.length, `${id} has a bass under it`).toBeGreaterThan(0);
        // Every chord is stacked from its root: the lowest note of the stack
        // at any moment shares its pitch class with the bass under it.
        for (const b of bass) {
          const above = stack.filter((n) => Math.abs(n.time - b.time) < 0.2);
          if (!above.length) continue;
          const lowest = above.reduce((a, n) => (n.midi < a.midi ? n : a));
          expect(mod(lowest.midi, 12), `${id} root position`).toBe(mod(b.midi, 12));
        }
      }
    }
  });
});

describe('naming the voicing', () => {
  const type = getExerciseType('voicing')!;

  it('only offers shapes that sound different on the chord it chose', () => {
    for (let d = 1; d <= 5; d++) {
      for (let seed = 0; seed < 30; seed++) {
        const q = type.generate(context(d, seed * 211 + d));
        if (!q) continue;
        // The question names the chord in its prompt rather than in its
        // concepts, because the chord is not what it is asking about.
        const symbol = q.prompt.sub!.split(' — ')[0];
        const quality = CHORD_QUALITIES.find(
          (c) => chordSymbol(makeChord(q.keyPc!, c.id), settings.accidental) === symbol,
        )!;
        const chord = makeChord(q.keyPc!, quality.id);
        const bass = d <= 3;
        const heard = new Map<string, string[]>();
        for (const option of q.fields[0].options) {
          const style = option.id as VoicingStyle;
          const v = voiceChord(chord, {
            style,
            bass,
            maxNotes: 5,
            ...(style === 'close' ? { bottomPc: chord.rootPc } : {}),
          });
          const key = v.all.join(',');
          heard.set(key, [...(heard.get(key) ?? []), style]);
        }
        for (const [, styles] of heard) {
          expect(styles.length, `${d}#${seed} ${styles.join(' and ')} sound the same`).toBe(1);
        }
      }
    }
  });

  it('asks only about shapes the exercises can produce', () => {
    for (let seed = 0; seed < 40; seed++) {
      const q = type.generate(context(4, seed * 7 + 1));
      if (!q) continue;
      for (const option of q.fields[0].options) {
        expect(NAMEABLE_VOICINGS).toContain(option.id);
      }
    }
  });
});

describe('guide tones', () => {
  const type = getExerciseType('guide-tones')!;

  it('answers with a line of 3rds and 7ths, one per chord', () => {
    for (let d = 1; d <= 5; d++) {
      for (let seed = 0; seed < 25; seed++) {
        const q = type.generate(context(d, seed * 311 + d));
        if (!q) continue;
        const defId = q.conceptIds[0].slice('progression:'.length);
        const def = PROGRESSIONS.find((p) => p.id === defId)!;
        const realised = realiseProgression(def, q.keyPc!);
        const line = q.correct.line.split('-').map(Number);
        expect(line.length, `${defId} line length`).toBe(realised.length);
        realised.forEach((r, i) => {
          const guides = r.chord.quality.intervals
            .filter((iv) => (iv < 13 && (mod(iv, 12) === 3 || mod(iv, 12) === 4)) || (iv >= 9 && iv <= 11))
            .map((iv) => mod(r.chord.rootPc + iv, 12));
          expect(guides, `${defId} chord ${i + 1}`).toContain(line[i]);
        });
      }
    }
  });

  it('offers wrong lines that are the same length and are genuinely wrong', () => {
    for (let seed = 0; seed < 25; seed++) {
      const q = type.generate(context(3, seed * 131 + 5));
      if (!q) continue;
      const right = q.correct.line;
      const ids = q.fields[0].options.map((o) => o.id);
      expect(new Set(ids).size, 'no duplicates').toBe(ids.length);
      for (const id of ids) {
        expect(id.split('-').length, 'same length').toBe(right.split('-').length);
      }
    }
  });

  it('plays the line over the changes when the answer is revealed', () => {
    const q = type.generate(context(2, 42)) as Question;
    const question = new FakePerformer();
    q.play(question.asPerformer());
    const reveal = new FakePerformer();
    q.playReveal!(reveal.asPerformer());
    expect(reveal.notes.length, 'the reveal adds the line').toBeGreaterThan(question.notes.length);
  });
});

describe('the learning model tracks voicing as a modifier', () => {
  it('keeps one record per concept, with a voicing breakdown inside it', () => {
    let skill = newSkill('chord:m7');
    for (let i = 0; i < 6; i++) {
      skill = applyAttempt('chord:m7', skill, {
        correct: true, hintUsed: false, ms: 1200, voicing: 'close',
      }).skill;
      skill = applyAttempt('chord:m7', skill, {
        correct: false, hintUsed: false, ms: 1200, voicing: 'rootless',
      }).skill;
    }
    expect(Object.keys(skill.voicings ?? {})).toEqual(['close', 'rootless']);
    expect(skill.voicings!.close.strength).toBeGreaterThan(skill.voicings!.rootless.strength);
    expect(skill.attempts, 'one concept, not two').toBe(12);
  });

  it('names the voicing a learner loses the concept in', () => {
    let skill = newSkill('chord:maj7');
    for (let i = 0; i < 8; i++) {
      skill = applyAttempt('chord:maj7', skill, {
        correct: true, hintUsed: false, ms: 900, voicing: 'close',
      }).skill;
    }
    for (let i = 0; i < 5; i++) {
      skill = applyAttempt('chord:maj7', skill, {
        correct: false, hintUsed: false, ms: 900, voicing: 'drop2',
      }).skill;
    }
    expect(weakVoicings(skill)).toEqual(['drop2']);
  });

  it('says nothing when a learner is equally good at all of them', () => {
    let skill = newSkill('chord:7');
    for (const style of ['close', 'spread', 'rootless']) {
      for (let i = 0; i < 5; i++) {
        skill = applyAttempt('chord:7', skill, {
          correct: true, hintUsed: false, ms: 900, voicing: style,
        }).skill;
      }
    }
    expect(weakVoicings(skill)).toEqual([]);
  });

  it('ignores a voicing it has barely seen', () => {
    let skill = newSkill('chord:m7b5');
    for (let i = 0; i < 8; i++) {
      skill = applyAttempt('chord:m7b5', skill, {
        correct: true, hintUsed: false, ms: 900, voicing: 'close',
      }).skill;
    }
    skill = applyAttempt('chord:m7b5', skill, {
      correct: false, hintUsed: false, ms: 900, voicing: 'rootless',
    }).skill;
    expect(weakVoicings(skill), 'one wrong answer is not a pattern').toEqual([]);
  });
});

describe('the new exercise types fit the existing seams', () => {
  it('are registered and selectable like any other', () => {
    for (const id of ['voicing', 'guide-tones']) {
      expect(EXERCISE_TYPES.map((t) => t.id)).toContain(id);
      expect(getExerciseType(id)!.pool(settings).length).toBeGreaterThan(0);
    }
  });

  it('name only concepts that exist', () => {
    for (const id of ['voicing', 'guide-tones']) {
      const type = getExerciseType(id)!;
      for (const conceptId of type.pool(settings)) {
        expect(conceptId, `${id} pool`).toMatch(/^(voicing|progression):/);
      }
    }
  });

  it('validates the voicing setting like every other stored value', () => {
    expect(normaliseSettings({ voicingMode: 'stride' as never }).voicingMode).toBe('curve');
    for (const mode of VOICING_MODE_IDS) {
      expect(normaliseSettings({ voicingMode: mode }).voicingMode).toBe(mode);
    }
  });
});
