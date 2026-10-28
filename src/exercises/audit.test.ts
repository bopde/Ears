import { describe, expect, it } from 'vitest';
import { EXERCISE_TYPES } from './registry';
import type { Question } from './types';
import { defaultSettings } from '../session/settings';
import { makeRng } from '../lib/rng';
import { FakePerformer } from '../test-support';
import { CONCEPTS } from '../music/catalog';
import { isSymmetrical, qualityPitchClasses, requireChordQuality, samePitchClasses } from '../music/chords';
import { requireInterval } from '../music/intervals';
import { requireScale, scalePitchClasses } from '../music/scales';
import { realiseProgression, requireProgression } from '../music/progressions';
import { requireInversion } from '../music/inversions';
import { BASS_GAP, PITCH_CLASSES, REGISTER } from '../music/pitch';
import { mod } from '../lib/util';

/**
 * A sweep across every exercise, every difficulty and a few hundred seeds,
 * cross-checking each question against the audio it actually schedules.
 *
 * The unit tests alongside this one each watch a single rule. This one asks a
 * blunter question — is any generated question unanswerable, mislabelled, or
 * answerable two ways — and it is the test that catches a change in one part
 * of the app breaking a claim made in another.
 */

const settings = defaultSettings();
const SEEDS = 250;

/** Collected rather than thrown, so one run reports every category at once. */
const findings = new Map<string, { count: number; examples: string[] }>();
function flag(category: string, example: string) {
  const f = findings.get(category) ?? { count: 0, examples: [] };
  f.count += 1;
  if (f.examples.length < 4) f.examples.push(example);
  findings.set(category, f);
}

const soundedPcs = (perf: FakePerformer) => new Set(perf.notes.map((n) => mod(n.midi, 12)));
const pcSet = (root: number, intervals: readonly number[]) =>
  new Set(intervals.map((i) => mod(root + i, 12)));

function render(play: (perf: FakePerformer) => number) {
  const perf = new FakePerformer();
  try {
    return { perf, seconds: play(perf), error: null as string | null };
  } catch (error) {
    return { perf, seconds: 0, error: error instanceof Error ? error.message : String(error) };
  }
}

function qualityOf(q: Question) {
  const id = q.conceptIds.find((c) => c.startsWith('chord:'));
  return id ? requireChordQuality(id.slice('chord:'.length)) : null;
}

// ── Checks every question has to pass ────────────────────────────────────
function structural(q: Question, where: string) {
  for (const id of q.conceptIds) {
    if (!CONCEPTS.get(id)) flag('identifier: concept id does not resolve', `${where} ${id}`);
  }
  if (!q.conceptIds.length) flag('identifier: no concepts declared', where);
  const fieldKeys = q.fields.map((f) => f.key).sort();
  const correctKeys = Object.keys(q.correct).sort();
  if (fieldKeys.join() !== correctKeys.join()) {
    flag('identifier: fields and answers disagree', `${where} ${fieldKeys} vs ${correctKeys}`);
  }
  for (const field of q.fields) {
    const ids = field.options.map((o) => o.id);
    if (new Set(ids).size !== ids.length) flag('identifier: duplicate option id', `${where} ${ids}`);
    if (!ids.includes(q.correct[field.key])) {
      flag('answer: the correct answer is not among the options', `${where} ${field.key}`);
    }
    for (const o of field.options) {
      if (!o.label.trim()) flag('identifier: blank option label', `${where} ${o.id}`);
    }
  }
  if (!q.reveal.heading.trim()) flag('answer: blank reveal heading', where);
  if (!(q.estimatedSeconds > 2 && q.estimatedSeconds < 120)) {
    flag('identifier: implausible time estimate', `${where} ${q.estimatedSeconds}`);
  }
}

/** Does the hint sound what its label promises? */
function checkHint(q: Question, where: string) {
  if (!q.hint) {
    flag('hint: missing', where);
    return;
  }
  if (!q.hint.description.trim()) flag('hint: blank description', where);
  const { perf, error } = render((p) => q.hint!.play(p.asPerformer()));
  if (error) {
    flag('hint: threw while scheduling', `${where} ${error}`);
    return;
  }
  if (!perf.notes.length) {
    flag('hint: sounds nothing', where);
    return;
  }
  const sounded = soundedPcs(perf);
  const label = q.hint.label;
  if (/^Reference/.test(label)) {
    if (!samePitchClasses(sounded, new Set([0]))) {
      flag('hint: "Reference C" does not play C', `${where} played ${[...sounded]}`);
    }
  } else if (label === 'Root' || label === 'Tonic') {
    if (q.keyPc === null) flag('hint: root/tonic hint on a question with no key', where);
    else if (!samePitchClasses(sounded, new Set([q.keyPc]))) {
      flag(`hint: "${label}" does not play the ${label.toLowerCase()}`,
        `${where} expected ${q.keyPc}, played ${[...sounded]}`);
    }
  } else if (label === 'First note') {
    const first = render((p) => q.play(p.asPerformer()));
    const earliest = [...first.perf.notes].sort((a, b) => a.time - b.time)[0];
    if (earliest && !sounded.has(mod(earliest.midi, 12))) {
      flag('hint: "First note" is not the first note', where);
    }
  } else {
    flag('hint: unrecognised label, cannot be checked', `${where} "${label}"`);
  }
}

// ── Per-type musical checks ──────────────────────────────────────────────
function checkChord(q: Question, perf: FakePerformer, where: string) {
  const quality = qualityOf(q);
  if (!quality || q.keyPc === null) return;
  const sounded = soundedPcs(perf);
  const chordPcs = pcSet(q.keyPc, quality.intervals);
  for (const pc of sounded) {
    if (!chordPcs.has(pc)) {
      flag('chord: a note sounded that is not in the chord', `${where} ${quality.id} pc ${pc}`);
    }
  }
  for (const tone of quality.essential ?? []) {
    if (!sounded.has(mod(q.keyPc + tone, 12))) {
      flag('chord: an essential tone was dropped', `${where} ${quality.id} missing +${tone}`);
    }
  }
  // Could an offered alternative account for exactly these notes?
  const field = q.fields.find((f) => f.key === 'quality');
  if (!field) return;
  for (const option of field.options) {
    if (option.id === q.correct.quality) continue;
    const other = requireChordQuality(option.id);
    const alt = PITCH_CLASSES.find((root) =>
      samePitchClasses(qualityPitchClasses(other, root), sounded));
    if (alt !== undefined) {
      flag('answer: two offered qualities fit the notes exactly',
        `${where} heard ${quality.id}/${q.keyPc}, but ${other.id}/${alt} is the same notes`);
    }
  }
}

function checkInterval(q: Question, perf: FakePerformer, where: string) {
  const interval = requireInterval(q.correct.interval);
  const events = [...perf.notes].sort((a, b) => a.time - b.time);
  if (events.length !== 2) {
    flag('interval: did not sound exactly two notes', `${where} ${events.length} notes`);
    return;
  }
  const distance = Math.abs(events[1].midi - events[0].midi);
  if (distance !== interval.semitones) {
    flag('interval: the distance played is not the answer',
      `${where} ${interval.id} wants ${interval.semitones}, played ${distance}`);
  }
  const sub = q.prompt.sub ?? '';
  const together = Math.abs(events[0].time - events[1].time) < 0.01;
  if (/together/i.test(sub) && !together) flag('interval: says harmonic but plays melodically', where);
  if (/Ascending/i.test(sub) && (together || events[1].midi < events[0].midi)) {
    flag('interval: says ascending but does not rise', where);
  }
  if (/Descending/i.test(sub) && (together || events[1].midi > events[0].midi)) {
    flag('interval: says descending but does not fall', where);
  }
}

function checkMode(q: Question, perf: FakePerformer, where: string) {
  const scale = requireScale(q.correct.mode);
  if (q.keyPc === null) return;
  const sounded = soundedPcs(perf);
  const scalePcs = new Set(scalePitchClasses(q.keyPc, scale));
  for (const pc of sounded) {
    if (!scalePcs.has(pc)) {
      flag('mode: a note sounded that is not in the mode', `${where} ${scale.id} pc ${pc}`);
    }
  }
  for (const option of q.fields[0].options) {
    if (option.id === q.correct.mode) continue;
    const other = new Set(scalePitchClasses(q.keyPc, requireScale(option.id)));
    if ([...sounded].every((pc) => other.has(pc))) {
      flag('answer: everything heard also fits another offered mode',
        `${scale.id} is indistinguishable from ${option.id}`);
    }
  }
}

function checkProgression(q: Question, perf: FakePerformer, where: string) {
  const def = requireProgression(q.correct.progression);
  if (q.keyPc === null) return;
  const realised = realiseProgression(def, q.keyPc);
  if (perf.chords.length !== realised.length) {
    flag('progression: played a different number of chords than the answer has',
      `${where} ${perf.chords.length} vs ${realised.length}`);
    return;
  }
  let beat = 0;
  realised.forEach((r, i) => {
    const chordPcs = pcSet(r.chord.rootPc, r.chord.quality.intervals);
    for (const midi of perf.chords[i].notes) {
      if (!chordPcs.has(mod(midi, 12))) {
        flag('progression: a chord sounded a note it does not contain',
          `${where} ${def.id} chord ${i + 1}`);
      }
    }
    const under = perf.bass.filter((b) => b.beat >= beat && b.beat < beat + r.beats);
    for (const b of under) {
      if (b.midi < REGISTER.bass.lo || b.midi > REGISTER.bass.hi) {
        flag('progression: a bass note fell outside the bass register',
          `${where} ${def.id} chord ${i + 1}: ${b.midi}`);
      }
      // In unison with the bottom of the right hand, the more recently struck
      // of the two becomes the apparent bass, and a root-position chord starts
      // to sound like an inversion.
      if (perf.chords[i].notes[0] - b.midi < BASS_GAP.min) {
        flag('progression: the bass crowded the bottom of the voicing',
          `${where} ${def.id} chord ${i + 1}: ${b.midi} under ${perf.chords[i].notes[0]}`);
      }
    }
    const downbeat = under.find((b) => b.beat === beat);
    if (!downbeat) {
      flag('progression: no bass note on a chord downbeat', `${where} ${def.id} chord ${i + 1}`);
    } else if (mod(downbeat.midi, 12) !== r.chord.rootPc) {
      flag('progression: the bass does not state the chord root',
        `${where} ${def.id} chord ${i + 1}: bass ${mod(downbeat.midi, 12)}, root ${r.chord.rootPc}`);
    }
    // Only the last beat of a walking bar is an approach note into the next
    // chord. Everything before it belongs to the chord it is under — a bass
    // playing a perfect fifth below a half-diminished chord is a semitone from
    // the ♭5 the chord is named for, and the bass is where that hurts most.
    const lastBeat = beat + r.beats - 1;
    for (const b of under) {
      if (b.beat >= lastBeat && under.length > 1) continue;
      if (!chordPcs.has(mod(b.midi, 12))) {
        flag('progression: the bass sounded a note the chord does not contain',
          `${where} ${def.id} chord ${i + 1} (${r.chord.quality.id}): bass pc ${mod(b.midi, 12)}`);
      }
    }
    beat += r.beats;
  });
  for (const option of q.fields[0].options) {
    if (option.id === q.correct.progression) continue;
    const other = realiseProgression(requireProgression(option.id), q.keyPc);
    const same = other.length === realised.length &&
      other.every((o, i) => o.chord.rootPc === realised[i].chord.rootPc &&
        o.chord.quality.id === realised[i].chord.quality.id);
    if (same) flag('answer: two offered progressions are the same changes', `${where} ${option.id}`);
  }
}

function checkProgressionChord(q: Question, where: string) {
  const id = q.conceptIds.find((c) => c.startsWith('progression:'));
  if (!id || q.keyPc === null) return;
  const realised = realiseProgression(requireProgression(id.slice('progression:'.length)), q.keyPc);
  const [rootPc, qualityId] = q.correct.chord.split(':');
  if (!realised.some((r) => r.chord.rootPc === Number(rootPc) && r.chord.quality.id === qualityId)) {
    flag('answer: the correct chord is not in the progression that played', `${where} ${q.correct.chord}`);
  }
  const sets = q.fields[0].options.map((o) => {
    const [r, qid] = o.id.split(':');
    return { id: o.id, pcs: pcSet(Number(r), requireChordQuality(qid).intervals) };
  });
  for (let i = 0; i < sets.length; i += 1) {
    for (let j = i + 1; j < sets.length; j += 1) {
      if (samePitchClasses(sets[i].pcs, sets[j].pcs)) {
        flag('answer: two offered chords are the same notes',
          `${where} ${sets[i].id} and ${sets[j].id}`);
      }
    }
  }
}

function checkInversion(q: Question, perf: FakePerformer, where: string) {
  const quality = qualityOf(q);
  if (!quality || q.keyPc === null) return;
  const inversion = requireInversion(q.correct.inversion);
  const lowest = Math.min(...perf.notes.map((n) => n.midi));
  if (mod(lowest, 12) !== mod(q.keyPc + quality.intervals[inversion.index], 12)) {
    flag('inversion: the bass note is not the one named', `${where} ${quality.id}`);
  }
  if (isSymmetrical(quality)) {
    flag('answer: the inversion of a symmetrical chord cannot be heard',
      `${where} ${quality.id} ${inversion.id}`);
  }
}

/** The sweep itself, run once and read by both assertions below. */
let swept: { generated: number } | null = null;
function sweep(): { generated: number } {
  if (swept) return swept;
  let generated = 0;
  for (const type of EXERCISE_TYPES) {
    for (let difficulty = 1; difficulty <= 5; difficulty += 1) {
      for (let seed = 0; seed < SEEDS; seed += 1) {
        const where = `${type.id}@d${difficulty}#${seed}`;
        let q: Question | null = null;
        try {
          q = type.generate({
            rng: makeRng(seed * 7919 + difficulty * 101),
            difficulty,
            settings,
            targetConcepts: [],
          });
        } catch (error) {
          flag('generation: threw', `${where} ${error instanceof Error ? error.message : error}`);
          continue;
        }
        if (!q) {
          flag('generation: returned nothing', where);
          continue;
        }
        generated += 1;
        structural(q, where);
        checkHint(q, where);

        const { perf, seconds, error } = render((p) => q!.play(p.asPerformer()));
        if (error) {
          flag('audio: threw while scheduling the question', `${where} ${error}`);
          continue;
        }
        if (!perf.notes.length) flag('audio: the question sounds nothing', where);
        if (!(seconds > 0 && seconds < 90)) {
          flag('audio: implausible reported length', `${where} ${seconds.toFixed(1)}s`);
        }
        const reveal = render((p) => q!.playReveal?.(p.asPerformer()) ?? 1);
        if (reveal.error) flag('audio: the reveal threw', `${where} ${reveal.error}`);

        switch (type.id) {
          case 'chord-quality':
          case 'chord-full': checkChord(q, perf, where); break;
          case 'chord-inversion': checkInversion(q, perf, where); break;
          case 'interval': checkInterval(q, perf, where); break;
          case 'mode': checkMode(q, perf, where); break;
          case 'progression': checkProgression(q, perf, where); break;
          case 'progression-chord': checkProgressionChord(q, where); break;
          default: break;
        }
      }
    }
  }

  swept = { generated };
  return swept;
}

describe('accuracy audit', () => {
  it('cross-checks every generated question against the audio it schedules', () => {
    const { generated } = sweep();
    expect(generated).toBeGreaterThan(EXERCISE_TYPES.length * 5 * SEEDS * 0.9);

    // One category is expected and documented: see the mode test below.
    const MODE_AMBIGUITY = 'answer: everything heard also fits another offered mode';
    const report = [...findings.entries()]
      .filter(([category]) => category !== MODE_AMBIGUITY)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([category, f]) =>
        `\n  [${f.count}/${generated}] ${category}\n      ${f.examples.join('\n      ')}`)
      .join('');
    expect(report, `findings across ${generated} generated questions:${report}`).toBe('');
  }, 600_000);

  /**
   * The one ambiguity left in the app, kept deliberately.
   *
   * Aeolian and Phrygian differ in one note — the second degree — and a phrase
   * that happens not to touch it fits both. Narrowing the melody until it
   * always does would make every modal phrase sound alike, so the pairing
   * stays and this test holds the line at it: any *other* pair of modes
   * becoming indistinguishable is a bug, not a judgement call.
   */
  it('leaves Aeolian and Phrygian as the only pair a phrase can fail to separate', () => {
    sweep();
    const pairs = new Set(
      (findings.get('answer: everything heard also fits another offered mode')?.examples ?? [])
        .map((e) => e.replace(' is indistinguishable from ', '|')),
    );
    for (const pair of pairs) {
      expect(pair.split('|').sort()).toEqual(['aeolian', 'phrygian']);
    }
  });
});
