import { describe, expect, it } from 'vitest';
import {
  ALT_SET, COLOUR_IDS, COLOUR_NAMES, colourInterval, coloursFor, isBasicQuality, memberName,
} from '../music/degrees';
import { EXERCISE_TYPES } from './registry';
import type { AnswerField, AnswerOption, Question } from './types';
import { defaultSettings } from '../session/settings';
import { makeRng } from '../lib/rng';
import { FakePerformer } from '../test-support';
import { CONCEPTS } from '../music/catalog';
import {
  CHORD_QUALITIES, basicChord, chordSymbol, isSymmetrical, makeChord, requireChordQuality,
  samePitchClasses, type Chord, type ChordQuality,
} from '../music/chords';
import { availablePcs, couldSound } from '../music/voicing';
import { requireInterval } from '../music/intervals';
import { requireScale, scalePitchClasses } from '../music/scales';
import { realiseProgression, requireProgression } from '../music/progressions';
import { requireInversion } from '../music/inversions';
import { BASS_GAP, PITCH_CLASSES, REGISTER } from '../music/pitch';
import { BASS_INSTRUMENT } from '../audio/instruments';
import { approachFromAbove } from './voicing-plan';
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

const SEEDS = 300;

/**
 * Two ways the app can be set up, because a setting changes the questions.
 *
 * The default is what most people practise under. The second turns on every
 * chord type and every colour, which is where the awkward chords live: a
 * ♯11 over a sixth chord, an altered dominant comped with everything it
 * owns. Running one and not the other audits half the app.
 */
const PROFILES = [
  { tag: '', settings: defaultSettings() },
  {
    tag: 'all:',
    settings: {
      ...defaultSettings(),
      chordQualities: CHORD_QUALITIES.map((q) => q.id),
      colours: [...COLOUR_IDS],
    },
  },
];
const settings = PROFILES[0].settings;

/** Collected rather than thrown, so one run reports every category at once. */
const findings = new Map<string, {
  count: number;
  examples: Map<string, string>;
  byType: Map<string, number>;
}>();
function flag(category: string, example: string) {
  const f = findings.get(category)
    ?? { count: 0, examples: new Map<string, string>(), byType: new Map<string, number>() };
  f.count += 1;
  // Kept by the shape of the example, two to an exercise, rather than in
  // arrival order. Four findings in a row off one seed used to fill the
  // list and hide a second cause behind them: a mode pair the generator
  // could not separate sat unseen under a different pair that came up
  // first. A tally by exercise goes with them, so a category nobody has
  // room to illustrate still says where it is.
  const id = example.split('@')[0];
  f.byType.set(id, (f.byType.get(id) ?? 0) + 1);
  const shape = `${id}|${example.replace(/@\w*:?d\d+#\d+/, '').replace(/\d+/g, 'n')}`;
  const forType = [...f.examples.keys()].filter((k) => k.startsWith(`${id}|`)).length;
  if (!f.examples.has(shape) && forType < 2) f.examples.set(shape, example);
  findings.set(category, f);
}

// `struck` rather than every note: an approach walking into a chord is a
// line arriving, and its notes are outside the chord on purpose.
const soundedPcs = (perf: FakePerformer) => new Set(perf.struck.map((n) => mod(n.midi, 12)));
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
  } else if (label === 'Bottom of the chord') {
    // The bass note is lower still, but it is always the root and so says
    // nothing about the shape; the bottom of the stack is the whole clue.
    const first = render((p) => q.play(p.asPerformer()));
    const stack = first.perf.notes.filter((n) => n.instrument !== BASS_INSTRUMENT);
    const lowest = Math.min(...stack.map((n) => n.midi));
    if (!sounded.has(mod(lowest, 12))) {
      flag('hint: "Bottom of the chord" is not the bottom of the chord', where);
    }
  } else if (label === 'Chord alone') {
    // The chord as it is written, which is not the same as the question
    // minus a note: where the answer moves the chord's own fifth, the
    // hint is the only place the natural one is heard. So it is held to
    // the chord rather than to what the question played — all of it, none
    // of the answer, and nothing else.
    const chord = promptChord(q);
    if (chord) {
      const answer = String(q.correct.colour ?? '');
      const named = new Set(
        (answer === 'alt' ? [...ALT_SET] : answer.split('+').map((id) => COLOUR_NAMES[id]))
          .map((name) => colourInterval(name))
          .filter((i): i is number => i !== undefined)
          .map((i) => mod(chord.rootPc + i, 12)),
      );
      for (const pc of sounded) {
        if (named.has(pc)) flag('hint: "Chord alone" gives the answer away', where);
      }
      const own = new Set(chord.quality.intervals.map((i) => mod(chord.rootPc + i, 12)));
      if (!samePitchClasses(sounded, own)) {
        flag('hint: "Chord alone" is not the chord as it is written',
          `${where} played ${[...sounded]}, chord ${[...own]}`);
      }
    }
  } else if (label === 'First guide tone') {
    // It has to be the 3rd or the 7th of the chord the progression opens on,
    // or the hint is pointing at a note the answer never passes through.
    const id = q.conceptIds.find((c) => c.startsWith('progression:'));
    if (!id || q.keyPc === null) return;
    const opening = realiseProgression(
      requireProgression(id.slice('progression:'.length)),
      q.keyPc,
    )[0].chord;
    const guides = opening.quality.intervals
      .filter((i) => (i < 13 && (mod(i, 12) === 3 || mod(i, 12) === 4)) || (i >= 9 && i <= 11))
      .map((i) => mod(opening.rootPc + i, 12));
    if (![...sounded].every((pc) => guides.includes(pc))) {
      flag('hint: "First guide tone" is not a guide tone of the first chord',
        `${where} played ${[...sounded]}, guides ${guides}`);
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
  // The chord's own tones plus the tensions a voicing of it may add. Exact
  // membership was the old test, and it was right while the exercises voiced
  // everything plainly: now a rootless chord sounds its 9th, as a pianist
  // plays it, so the question is whether a note *belongs* to the chord rather
  // than whether the symbol lists it.
  const playable = availablePcs(makeChord(q.keyPc, quality.id), true);
  for (const pc of sounded) {
    if (!playable.has(pc)) {
      flag('chord: a note sounded that the chord could not be voiced with',
        `${where} ${quality.id} pc ${pc}`);
    }
  }
  for (const tone of quality.essential ?? []) {
    if (!sounded.has(mod(q.keyPc + tone, 12))) {
      flag('chord: an essential tone was dropped', `${where} ${quality.id} missing +${tone}`);
    }
  }
  // Could an offered alternative account for these notes? Same rule the
  // exercise's own filter uses, so this is a cross-check of that filter
  // rather than a second, weaker opinion beside it.
  const field = q.fields.find((f) => f.key === 'quality');
  if (!field) return;
  for (const option of field.options) {
    if (option.id === q.correct.quality) continue;
    const other = requireChordQuality(option.id);
    const alt = PITCH_CLASSES.find((root) =>
      couldSound(makeChord(root, other.id), sounded, true));
    if (alt !== undefined) {
      flag('answer: two offered qualities fit the notes',
        `${where} heard ${quality.id}/${q.keyPc}, but ${other.id}/${alt} fits them too`);
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
    // As in checkChord: the chord's own tones plus the tensions a voicing of
    // it may add, because outside close position the exercises now voice
    // these chords the way the cheat sheet teaches them.
    const chordPcs = availablePcs(r.chord, true);
    for (const midi of perf.chords[i].notes) {
      if (!chordPcs.has(mod(midi, 12))) {
        flag('progression: a chord sounded a note it could not be voiced with',
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
    // A root approached from a half step above is, note for note, the bass of
    // a tritone substitution. While those questions are still being asked, a
    // passing note that imitates one puts a second plausible answer in the
    // audio, and the learner has no way to tell them apart.
    if (!approachFromAbove(settings, q.difficulty)) {
      const next = perf.bass.find((b) => b.beat === beat + r.beats && b.role === 'root');
      const lead = under.find((b) => b.role === 'approach');
      if (next && lead && lead.midi - next.midi === 1) {
        flag('progression: the bass approached a root from a half step above',
          `${where} ${def.id} into chord ${i + 2}: ${lead.midi} → ${next.midi}`);
      }
    }
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
  // The answer is the basic chord of one that played: a chart's G7♭9 is
  // answered "G7", with the ♭9 named in the reveal as colour.
  if (!realised.some((r) => {
    const basic = basicChord(r.chord);
    return basic.rootPc === Number(rootPc) && basic.quality.id === qualityId;
  })) {
    flag('answer: the correct chord is not in the progression that played', `${where} ${q.correct.chord}`);
  }
  if (!isBasicQuality(qualityId)) {
    flag('answer: the correct chord is not a basic chord', `${where} ${q.correct.chord}`);
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

// ── Is an offered answer true of what sounded? ───────────────────────────
//
// The audit used to ask only whether a wrong option could be mistaken for
// the right one. It never asked whether the right one was right, so every
// defect of the last month — a shell with the whole chord in it, a "Close"
// label over an open voicing, an alt question offering its own tones —
// went past it. These predicates judge each option against the notes that
// were struck, and the question passes only when exactly one is true.
//
// Written from the sound rather than from the generator: the colour table
// and the chord intervals are musical facts and are read from the music
// layer, but none of the matching logic here is the logic that chose the
// options.

/** Everything the question struck, split the way a listener hears it. */
interface Heard {
  notes: number[];
  hands: number[];
  bass: number[];
  pcs: Set<number>;
  handPcs: Set<number>;
}

function heard(perf: FakePerformer): Heard {
  const struck = [...perf.struck].sort((a, b) => a.midi - b.midi);
  const hands = struck.filter((n) => n.instrument !== BASS_INSTRUMENT).map((n) => n.midi);
  const bass = struck.filter((n) => n.instrument === BASS_INSTRUMENT).map((n) => n.midi);
  return {
    notes: struck.map((n) => n.midi),
    hands,
    bass,
    pcs: new Set(struck.map((n) => mod(n.midi, 12))),
    handPcs: new Set(hands.map((m) => mod(m, 12))),
  };
}

/**
 * Whether this chord could have produced these pitch classes.
 *
 * Every tone that makes it the chord it is has to sound, and nothing that
 * sounded may be a note it could not play — its own tones, plus the
 * colours its scale offers. A ♯11 or a ♭13 is colour *above* a fifth, so
 * over a chord whose own fifth is natural it only counts where that fifth
 * sounded too; without it the same pitch is an altered fifth and the chord
 * that owns one is a different chord.
 */
function chordFits(
  root: number,
  qualityId: string,
  pcs: ReadonlySet<number>,
  statesItself = true,
): boolean {
  const quality = requireChordQuality(qualityId);
  const own = new Set(quality.intervals.map((i) => mod(root + i, 12)));
  const defining = statesItself
    ? quality.essential ?? quality.intervals.filter((i) => i !== 0 && i !== 7)
    : [];
  for (const interval of defining) {
    if (pcs.has(mod(root + interval, 12))) continue;
    // An altered chord names one alteration of a degree and a voicing
    // sounds whichever of them it chose: a 7alt with a ♯9 and a ♭13 is as
    // altered as one with a ♭9, and a listener cannot be told which to
    // expect. Any sibling alteration of the same degree will do; an
    // unaltered tone has no sibling and has to be there.
    const name = memberName(quality, interval);
    if (!/[♭♯𝄫𝄪]/.test(name)) return false;
    const degree = name.replace(/\D/g, '');
    const siblings = quality.intervals
      .filter((i) => memberName(quality, i).replace(/\D/g, '') === degree);
    if (!siblings.some((i) => pcs.has(mod(root + i, 12)))) return false;
  }
  const colour = new Set(
    coloursFor(quality, { altered: true })
      .map((name) => colourInterval(name))
      .filter((i): i is number => i !== undefined)
      .map((i) => mod(root + i, 12)),
  );
  const outside = [...pcs].filter((pc) => !own.has(pc));
  const fifthless = !pcs.has(mod(root + 7, 12));
  for (const pc of outside) {
    if (!colour.has(pc)) return false;
    // A chord that sounds one note outside itself, where its 5th should
    // be, has had its 5th altered rather than been given a tension: 3 ♭7
    // 1 ♭13 is a 7♯5 and nothing else. A chord sounding a 9 and a ♯11
    // over a ♭7 is a tension stack, and the ♯11 is the colour it was
    // played as.
    if (fifthless && outside.length === 1 && readsAsAlteredFifth(quality, mod(pc - root, 12))) {
      return false;
    }
  }
  return true;
}

/**
 * Whether a note this far above the root, with no natural 5th under it,
 * is heard as this chord's fifth rather than as colour.
 *
 * It is heard that way only when that reading names a chord: a dominant
 * with a ♯11 and no 5th is a 7♭5, which is a chord anyone can be asked
 * to name, so the ♯11 reading is not the only one. A sixth chord with a
 * ♯11 and no 5th is not a "6♭5" — no such chord — so there the ♯11 is
 * just the colour it was played as. C E A D F♯ is a C6/9♯11 and nothing
 * else, and the rule used to call it unnameable.
 */
function readsAsAlteredFifth(quality: ChordQuality, semitones: number): boolean {
  if (semitones !== 6 && semitones !== 8) return false;
  if (!quality.intervals.some((i) => mod(i, 12) === 7)) return false;
  const swapped = new Set(
    quality.intervals.filter((i) => i < 12).map((i) => (i === 7 ? semitones : i)),
  );
  return CHORD_QUALITIES.some((other) => {
    const theirs = new Set(other.intervals.filter((i) => i < 12));
    return theirs.size === swapped.size && [...swapped].every((i) => theirs.has(i));
  });
}

/**
 * Whether these notes are a stack of fourths.
 *
 * Read off the spacing rather than asked of the generator, because that is
 * all a listener has. A quartal voicing is the one shape that may leave
 * out what makes its chord itself — So What is a minor eleventh voiced
 * 1 5 ♭7 9 11, with no third anywhere in it.
 */
const isQuartalStack = (notes: readonly number[]): boolean => {
  const sorted = [...new Set(notes)].sort((a, b) => a - b);
  if (sorted.length < 3) return false;
  const steps = sorted.slice(1).map((m, i) => m - sorted[i]);
  return steps.filter((n) => n === 5).length * 2 >= steps.length
    && steps.every((n) => n >= 3 && n <= 7);
};

/**
 * How the chord's own tones sit in these hands.
 *
 * Null where they are not a stack at all — fewer than three of them, or
 * out of the chord's own order. `skipped` counts the ones stepped over,
 * which is what separates a close voicing from a shell: root, 3rd and 7th
 * in a row have stepped over the 5th. The chord's own tones means the
 * chord's: an eleventh chord has no 3rd to step over, and a 13th is above
 * the octave by definition, so a close voicing with one on top is close.
 */
function closeShape(chord: Chord, hands: readonly number[]) {
  const stack = [...new Set(chord.quality.intervals.filter((i) => i < 12))]
    .sort((a, b) => a - b)
    .map((i) => mod(chord.rootPc + i, 12));
  const own = new Set(stack);
  const tones = hands.filter((m) => own.has(mod(m, 12)));
  if (tones.length < 3) return null;
  const start = stack.indexOf(mod(tones[0], 12));
  if (start < 0) return null;
  const rotated = [...stack.slice(start), ...stack.slice(0, start)];
  let at = 0;
  let skipped = 0;
  for (const midi of tones) {
    while (at < rotated.length && rotated[at] !== mod(midi, 12)) {
      skipped += 1;
      at += 1;
    }
    if (at >= rotated.length) return null;
    at += 1;
  }
  return {
    span: tones[tones.length - 1] - tones[0],
    skipped,
    onRoot: mod(hands[0] - chord.rootPc, 12) === 0,
    hasRoot: hands.some((m) => mod(m - chord.rootPc, 12) === 0),
  };
}

const isCloseStack = (chord: Chord, hands: readonly number[]) => {
  const shape = closeShape(chord, hands);
  return shape !== null && shape.span <= 12 && shape.skipped === 0 && shape.hasRoot;
};

/** Which voicing shapes these hands really are. */
function voicingFits(chord: Chord, style: string, hands: readonly number[]): boolean {
  if (!hands.length) return false;
  const rootPc = mod(chord.rootPc, 12);
  const pcs = hands.map((m) => mod(m, 12));
  const degreeAt = (midi: number) => mod(midi - chord.rootPc, 12);
  const has = (test: (semitones: number) => boolean) => pcs.some((pc) => test(mod(pc - rootPc, 12)));
  const third = (s: number) => s === 3 || s === 4 || s === 2 || s === 5;
  const seventh = (s: number) => s === 10 || s === 11 || s === 9;
  const shape = closeShape(chord, hands);

  switch (style) {
    case 'close':
      return isCloseStack(chord, hands) && shape!.onRoot;
    case 'spread':
      return isCloseStack(chord, hands) && !shape!.onRoot;
    case 'drop2': {
      // Any one voice, not the one second from the bottom: a dropped
      // voice usually lands at the bottom, but not always, so the test is
      // whether putting some voice back an octave up gives a close
      // voicing with that voice second from its top.
      if (hands.length < 3 || isCloseStack(chord, hands)) return false;
      return hands.some((midi, i) => {
        const lifted = hands.map((m, k) => (k === i ? m + 12 : m)).sort((a, b) => a - b);
        return isCloseStack(chord, lifted) && lifted[lifted.length - 2] === midi + 12;
      });
    }
    case 'rootless':
      return !pcs.includes(rootPc) && has(third) && has(seventh);
    case 'shell': {
      const basic = basicChord(chord).quality;
      const own = new Set(basic.intervals.map((i) => mod(chord.rootPc + i, 12)));
      const tones = hands.filter((m) => own.has(mod(m, 12)));
      const wanted = tones.every((m) => {
        const s = degreeAt(m);
        return s === 0 || third(s) || seventh(s);
      });
      return wanted && pcs.includes(rootPc) && has(third) && has(seventh)
        && tones.length <= 3 && hands.length - tones.length <= 1;
    }
    case 'quartal':
      return isQuartalStack(hands);
    case 'upperStructure': {
      if (hands.length < 5) return false;
      const guides = hands.slice(0, 2).map(degreeAt);
      const triad = hands.slice(2).map((m) => mod(m, 12));
      if (!guides.some(third) || !guides.some(seventh)) return false;
      const steps = [...triad].sort((a, b) => a - b);
      const gaps = [mod(steps[1] - steps[0], 12), mod(steps[2] - steps[1], 12)];
      return triad.length === 3 && gaps.every((n) => n === 3 || n === 4);
    }
    default:
      return false;
  }
}

/** The chord a question printed in its prompt, read back off the symbol. */
function promptChord(q: Question): Chord | null {
  if (q.keyPc === null) return null;
  // Either line may carry it: the voicing quiz names the chord in its
  // sub-line, the colour question in its title.
  for (const line of [q.prompt.sub ?? '', q.prompt.title]) {
    for (const symbol of line.match(/[A-G][♯♭]?[^\s—?]*/g) ?? []) {
      // By the pitch the root names and the suffix after it, rather than
      // by rebuilding the symbol: a chord whose altered form has to be
      // spelled one way prints its plain form the same way, so a G♭7 and
      // an F♯7 are both this question's chord.
      const m = /^([A-G][♯♭]?)(.*)$/.exec(symbol);
      if (!m || namePc(m[1]) !== mod(q.keyPc, 12)) continue;
      const quality = CHORD_QUALITIES.find((x) => x.symbol === m[2]);
      if (quality) return makeChord(q.keyPc, quality.id);
    }
  }
  return null;
}

/** The tones a colour answer stands for, as degree names. */
/**
 * The note the bass arrived on under the chord in this bar.
 *
 * A walking line passes through notes that are not the chord's, so the
 * one that says what the chord is sitting on is the one the performer
 * marked as its root — read off the recorded line, not worked out again.
 */
function landing(perf: FakePerformer, index: number): number | undefined {
  const bar = perf.bars[index];
  if (!bar) return undefined;
  const within = perf.bass.filter((b) => b.beat >= bar.beat && b.beat < bar.beat + bar.beats);
  return (within.find((b) => b.role === 'root') ?? within[0])?.midi;
}

const colourTones = (id: string): string[] =>
  (id === 'alt' ? [...ALT_SET] : id.split('+').map((part) => COLOUR_NAMES[part]));

/**
 * Whether this option is true of what was struck.
 *
 * `null` where the question's own subject cannot be read back from the
 * sound — which is reported as a gap rather than passed over.
 */
function optionIsTrue(
  type: string,
  q: Question,
  option: AnswerOption,
  field: AnswerField,
  sound: Heard,
  perf: FakePerformer,
): boolean | null {
  switch (type) {
    case 'chord-quality':
      return q.keyPc === null ? null : chordFits(q.keyPc, option.id, sound.pcs);
    case 'chord-full':
      // Two fields: the root is the lowest note struck, the quality is
      // judged against that root.
      if (q.keyPc === null) return null;
      if (field.key === 'root') return Number(option.id) === mod(Math.min(...sound.notes), 12);
      return chordFits(q.keyPc, option.id, sound.pcs);
    case 'progression-chord': {
      const [root, quality] = option.id.split(':');
      const index = (q.reveal.rows ?? []).findIndex((r) => r.target);
      if (index < 0 || !perf.chords[index]) return null;
      // The hands of that chord, with the note the bass landed on under
      // them: the chord the question asked about is what sounded in its
      // own bar. The landing note, not the first note in the bar — a
      // walking bass arrives on the root and leaves by whatever gets it
      // to the next one.
      const landed = landing(perf, index);
      // What the bass landed on is the chord's root. Without it B13 and
      // A∆9♯11 are the same five notes, and both answers are true.
      if (landed !== undefined && mod(landed, 12) !== Number(root)) return false;
      const pcs = new Set([
        ...perf.chords[index].all,
        ...(landed === undefined ? [] : [landed]),
      ].map((m) => mod(m, 12)));
      return chordFits(Number(root), quality, pcs);
    }
    case 'colour': {
      const chord = promptChord(q);
      if (!chord) return null;
      const names = colourTones(option.id);
      const degree = (pc: number) => mod(pc - chord.rootPc, 12);
      const sounds = (semitones: number) =>
        [...sound.handPcs].some((pc) => degree(pc) === mod(semitones, 12));
      const moves = names.includes('♯5') || names.includes('♭5');
      // The two that move the chord's own fifth take its place, so the
      // natural 5th has to be gone; the two that are the same pitches
      // added over it need it there. That one note is the whole of the
      // difference between them, and judging by pitch class alone called
      // a ♯5 question a ♭13 question as well.
      const fifth = chord.quality.intervals.some((i) => mod(i, 12) === 7);
      for (const name of names) {
        if (name === '♯5' || name === '♭5') {
          if (sounds(7)) return false;
        } else if (fifth && !moves && (name === '♭13' || name === '♯11')) {
          if (!sounds(7)) return false;
        }
      }
      const own = new Set(chord.quality.intervals.map((i) => mod(chord.rootPc + i, 12)));
      // A moved fifth is not in what the chord adds, because it is not an
      // addition: what sounded is the chord's own tones with one of them
      // somewhere else.
      const changed = new Set(
        names.map((name) => colourInterval(name))
          .filter((i): i is number => i !== undefined)
          .map((i) => mod(chord.rootPc + i, 12)),
      );
      const added = new Set(
        [...sound.handPcs].filter((pc) => !own.has(pc) || changed.has(pc)),
      );
      return added.size === changed.size && [...changed].every((pc) => added.has(pc));
    }
    case 'voicing': {
      const chord = promptChord(q);
      return chord ? voicingFits(chord, option.id, sound.hands) : null;
    }
    case 'chord-inversion': {
      const quality = q.conceptIds.find((c) => c.startsWith('chord:'))?.slice('chord:'.length);
      if (!quality || q.keyPc === null) return null;
      const inversion = requireInversion(option.id);
      const interval = requireChordQuality(quality).intervals[inversion.index];
      if (interval === undefined) return null;
      return mod(Math.min(...sound.notes), 12) === mod(q.keyPc + interval, 12);
    }
    case 'interval': {
      const events = [...perf.notes].sort((a, b) => a.time - b.time);
      if (events.length !== 2) return null;
      return Math.abs(events[1].midi - events[0].midi) === requireInterval(option.id).semitones;
    }
    case 'mode': {
      if (q.keyPc === null) return null;
      const scale = new Set(scalePitchClasses(q.keyPc, requireScale(option.id)));
      return [...sound.pcs].every((pc) => scale.has(pc));
    }
    case 'key': {
      // The tonic is what the music settles on, which no predicate can
      // read off a pitch-class set — the existing checks cover it.
      return null;
    }
    case 'progression': {
      if (q.keyPc === null) return null;
      const realised = realiseProgression(requireProgression(option.id), q.keyPc);
      if (realised.length !== perf.chords.length) return false;
      return realised.every((r, i) => {
        // The note under the change, which is what tells two progressions
        // apart when their chords share notes: a deceptive cadence and a
        // ii–V–I differ only in the last chord, and C∆7 and Am7 are the
        // same four notes with a 9th on one of them. The bass is not.
        const landed = landing(perf, i);
        if (landed !== undefined && mod(landed, 12) !== mod(r.chord.rootPc, 12)) return false;
        const pcs = new Set(
          [...perf.chords[i].all, ...(landed === undefined ? [] : [landed])].map((m) => mod(m, 12)),
        );
        // Against the chord the progression asks for, alterations and all:
        // a minor ii–V–i wants an altered dominant, and judging it as a
        // plain seventh would call its own ♭13 a wrong note. A quartal
        // voicing is asked only what it sounds, not for the third it
        // leaves out — which is the whole sound of So What.
        const quartal = isQuartalStack(perf.chords[i].all);
        return chordFits(r.chord.rootPc, r.chord.quality.id, pcs, !quartal);
      });
    }
    case 'guide-tones': {
      const line = option.id.split('-').map(Number);
      if (line.length !== perf.chords.length) return false;
      return line.every((pc, i) => perf.chords[i].all.some((m) => mod(m, 12) === pc));
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// What the reveal says, against what sounded.
// ---------------------------------------------------------------------------

const LETTER_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** A printed note name as a pitch class, or null where it is not one. */
function namePc(name: string): number | null {
  const m = /^([A-G])([♯♭𝄪𝄫]*)(-?\d+)?$/.exec(name.trim());
  if (!m) return null;
  let pc = LETTER_PC[m[1]];
  for (const ch of m[2]) pc += ch === '♯' ? 1 : ch === '♭' ? -1 : ch === '𝄪' ? 2 : -2;
  return mod(pc, 12);
}

/**
 * A degree as a number of semitones above the root.
 *
 * Written out rather than asked of the naming module: the point of the
 * check is that the two agree, and asking the same code both questions
 * would make it agree with itself.
 */
const DEGREE_SEMITONES: Record<string, number> = {
  '1': 0, '♭2': 1, '2': 2, '♯2': 3, '♭3': 3, '3': 4, '4': 5, '♯4': 6, '♭5': 6, '5': 7,
  '♯5': 8, '♭6': 8, '6': 9, '𝄫7': 9, '♭7': 10, '7': 11,
  '♭9': 1, '9': 2, '♯9': 3, '11': 5, '♯11': 6, '♭13': 8, '13': 9,
};

/**
 * The chord a line of the reveal names, read off its printed symbol.
 *
 * Whole words only. Reading a letter out of the middle of one had "Close"
 * answering as a C major triad and every degree beside it wrong.
 */
function symbolChord(...lines: Array<string | undefined>): Chord | null {
  const found: Chord[] = [];
  for (const line of lines) {
    for (const word of (line ?? '').split(/[\s,·—]+/)) {
      // A slash chord names its bass after the symbol: D7♯5/F♯ is a D7♯5.
      const token = word.replace(/\/[A-G][♯♭]?$/, '');
      const m = /^([A-G][♯♭]?)(.*)$/.exec(token);
      if (!m) continue;
      const root = namePc(m[1]);
      const quality = CHORD_QUALITIES.find((q) => q.symbol === m[2]);
      // A symbol that says something beats a bare letter, wherever it is:
      // a rootless voicing comes in two forms, and the heading naming the
      // second of them reads "Rootless B".
      if (root !== null && quality) {
        if (m[2]) return makeChord(root, quality.id);
        found.push(makeChord(root, quality.id));
      }
    }
  }
  return found[0] ?? null;
}

/**
 * Whether a label calling the bottom note this is telling the truth.
 *
 * The label drops the accidental on the third and the seventh, where the
 * chord symbol has said it already — a minor chord's 3rd is its ♭3 — and
 * keeps it everywhere else, because a ♭13 underneath is not a 13th.
 */
function bottomReads(label: string, degree: string): boolean {
  const claimed = label === 'root' ? '1' : label.replace(/\D/g, '');
  const played = degree.replace(/\D/g, '');
  if (claimed !== played) return false;
  const accidental = (text: string) => (/[♭♯𝄫𝄪]/.exec(text) ?? [''])[0];
  if (accidental(label) === accidental(degree)) return true;
  return accidental(label) === '' && (played === '3' || played === '7');
}

/** The degrees a chord of this quality holds, as printed names. */
const ownDegrees = (chord: Chord): Set<string> =>
  new Set(chord.quality.intervals.map((i) => memberName(chord.quality, i)));

/**
 * One sounded chord as the reveal prints it, checked against the notes.
 *
 * Four things have to hold at once, and each has gone wrong on its own:
 * a name for every degree, a degree that is the interval its name claims,
 * a printed note for every note struck and no others, and a spelling that
 * is a note name rather than a pair of them.
 */
function checkSounded(
  played: { bass?: string; notes: string[]; degrees: string[] },
  chord: Chord | null,
  struck: ReadonlySet<number>,
  where: string,
) {
  if (played.notes.length !== played.degrees.length) {
    flag('reveal: a note without a degree, or a degree without a note',
      `${where} ${played.notes.length} notes, ${played.degrees.length} degrees`);
    return;
  }
  const printed = new Set<number>();
  for (const name of [...played.notes, ...(played.bass ? [played.bass] : [])]) {
    const pc = namePc(name);
    if (pc === null) {
      flag('reveal: a note name that is not one', `${where} "${name}"`);
      return;
    }
    printed.add(pc);
  }
  if (chord) {
    played.notes.forEach((name, i) => {
      const degree = played.degrees[i];
      const semitones = DEGREE_SEMITONES[degree];
      if (semitones === undefined) {
        flag('reveal: a degree nothing can read', `${where} "${degree}"`);
        return;
      }
      const pc = namePc(name)!;
      if (mod(pc - chord.rootPc, 12) !== semitones) {
        flag('reveal: the degree is not the interval it names',
          `${where} ${chordSymbol(chord)} calls ${name} a ${degree}`);
      }
    });
  }
  if (struck.size && !samePitchClasses(printed, new Set(struck))) {
    flag('reveal: names notes that did not sound, or misses ones that did',
      `${where} printed ${[...printed].sort((a, b) => a - b)} struck ${
        [...struck].sort((a, b) => a - b)}`);
  }
}

/** The degree tokens in a "played with 9 and 11" tag. */
const tagDegrees = (tag: string): string[] =>
  tag.replace(/^played with\s*/, '').split(/\s*(?:,|and)\s*/).map((t) => t.trim()).filter(Boolean);

/**
 * The whole reveal, against the sound it describes.
 *
 * The labels are the part a learner takes away, so a label that is not
 * true of what played is worse than no label: "root on the bottom" over a
 * voicing starting on the 5th was reported from use, and so was a shell
 * tag on a chord with all its notes present.
 */
function checkReveal(q: Question, perf: FakePerformer, where: string) {
  const sound = heard(perf);
  const named = q.reveal.played ? symbolChord(q.reveal.heading, q.reveal.detail) : null;

  if (q.reveal.played) {
    checkSounded(q.reveal.played, named, sound.pcs, where);
    // "9th on the bottom" and "root on the bottom" are claims about the
    // lowest note the hands played, and the hands are what the reveal
    // lists: the bass is printed separately.
    const bottom = /(?:^|[\s·])(root|[♭♯𝄫]?\d+(?:st|nd|rd|th)?) on the bottom/
      .exec(`${q.reveal.heading} ${q.reveal.detail}`);
    const lowest = q.reveal.played.degrees[0];
    if (bottom && lowest !== undefined && !bottomReads(bottom[1], lowest)) {
      flag('reveal: the note on the bottom is not the one named',
        `${where} says ${bottom[1]}, played ${lowest}`);
    }
  }

  if (q.reveal.tag && q.reveal.played && named) {
    // "played with" names what sounded above the chord, so it is the
    // degrees that are not the chord's own — no more, and no fewer.
    const own = ownDegrees(basicChord(named));
    const added = [...new Set(q.reveal.played.degrees.filter((d) => !own.has(d)))];
    const told = tagDegrees(q.reveal.tag);
    if ([...added].sort().join() !== [...told].sort().join()) {
      flag('reveal: the tag does not list what sounded above the chord',
        `${where} "${q.reveal.tag}" over ${chordSymbol(named)} ${
          q.reveal.played.degrees.join(' ')}`);
    }
  }

  (q.reveal.rows ?? []).forEach((row, i) => {
    const chord = symbolChord(row.symbol);
    const voicing = perf.chords[i];
    const landed = landing(perf, i);
    const struck = new Set([
      ...(voicing?.all ?? []),
      ...(landed === undefined ? [] : [landed]),
    ].map((m) => mod(m, 12)));
    checkSounded(row.played, chord, struck, `${where} row ${i}`);
    if (row.bottom && !bottomReads(row.bottom, row.played.degrees[0] ?? '')) {
      flag('reveal: a row names a bottom note it did not play',
        `${where} row ${i} says ${row.bottom}, played ${row.played.degrees[0]}`);
    }
    // And the row sounds the chord its symbol names. A quartal voicing is
    // the documented exception: it takes the fourths that fit, and leaves
    // out whatever does not.
    if (chord && voicing && !isQuartalStack(voicing.all)
      && !chordFits(chord.rootPc, chord.quality.id, struck)) {
      flag('reveal: a row does not sound the chord its symbol names',
        `${where} row ${i} ${row.symbol}: ${row.played.degrees.join(' ')}`);
    }
  });
}

/**
 * Exactly one offered answer, and it is the one marked right.
 *
 * Reported as three different findings because they are three different
 * faults: a question with no true answer is unanswerable, one with two is
 * unfair, and one whose true answer is not the marked one is wrong.
 */
function checkAnswers(type: string, q: Question, perf: FakePerformer, where: string) {
  const sound = heard(perf);
  if (!sound.notes.length) return;
  for (const field of q.fields) {
    const judged = field.options.map((option) => ({
      option,
      truth: optionIsTrue(type, q, option, field, sound, perf),
    }));
    if (judged.some((j) => j.truth === null)) {
      if (!UNJUDGED.has(`${type}:${field.key}`)) {
        flag('answer: no predicate could judge this option', `${where} field ${field.key}`);
      }
      continue;
    }
    const names = (list: typeof judged) => list.map((j) => j.option.label).join(', ');
    const trueOnes = judged.filter((j) => j.truth);
    const marked = q.correct[field.key];
    if (!trueOnes.length) {
      flag('answer: nothing offered is true of what sounded',
        `${where} ${field.key}: marked ${marked}, offered ${names(judged)}`);
    } else if (trueOnes.length > 1) {
      flag('answer: more than one offered answer is true',
        `${where} ${field.key}: ${names(trueOnes)}`);
    } else if (trueOnes[0].option.id !== marked) {
      flag('answer: the true one is not the one marked right',
        `${where} ${field.key}: marked ${marked}, true ${trueOnes[0].option.id}`);
    }
  }
}

/**
 * Fields whose subject no predicate can read off the notes.
 *
 * A tonal centre is what the music settles on, which is a matter of
 * function rather than of which pitch classes sounded — the existing
 * checks cover that exercise. Everything else has to be judgeable.
 */
const UNJUDGED = new Set(['key:key', 'chord-full:root']);

function sweep(): { generated: number } {
  if (swept) return swept;
  let generated = 0;
  for (const profile of PROFILES) {
   for (const type of EXERCISE_TYPES) {
    for (let difficulty = 1; difficulty <= 5; difficulty += 1) {
      for (let seed = 0; seed < SEEDS; seed += 1) {
        const where = `${type.id}@${profile.tag}d${difficulty}#${seed}`;
        let q: Question | null = null;
        try {
          q = type.generate({
            rng: makeRng(seed * 7919 + difficulty * 101),
            difficulty,
            settings: profile.settings,
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

        checkAnswers(type.id, q, perf, where);
        checkReveal(q, perf, where);

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
  }

  swept = { generated };
  return swept;
}

describe('accuracy audit', () => {
  it('cross-checks every generated question against the audio it schedules', () => {
    const { generated } = sweep();
    expect(generated).toBeGreaterThan(EXERCISE_TYPES.length * 5 * SEEDS * PROFILES.length * 0.9);

    const report = [...findings.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .map(([category, f]) =>
        `\n  [${f.count}/${generated}] ${category}  (${
      [...f.byType].sort((a, b) => b[1] - a[1]).map(([id, n]) => `${id} ${n}`).join(', ')
    })\n      ${[...f.examples.values()].join('\n      ')}`)
      .join('');
    expect(report, `findings across ${generated} generated questions:${report}`).toBe('');
  }, 600_000);

  /**
   * The ambiguity the mode question used to be allowed.
   *
   * Aeolian and Phrygian differ in one note — the second degree — and a
   * phrase that happens not to touch it fits both. That was accepted for a
   * while, on the grounds that narrowing every melody until it reached the
   * telling degree would make them all sound alike. It turned out not to
   * be the only pair, and a count of nothing is a line that can be held;
   * a count of "the ones we know about" is not.
   */
  it('leaves no pair of modes a phrase fails to separate', () => {
    // This used to allow one: a line that touches neither the ♭2 nor the
    // ♮2 is Aeolian and Phrygian at once. It allowed a second without
    // saying so, because the finding kept only its first four examples and
    // all four happened to be that pair — a line in G touching neither C
    // nor C♯ is Ionian and Lydian at once, in 6 of 1,250 questions.
    //
    // The line is now generated until it reaches a degree that separates
    // the answer from every mode it is offered against, so the count is
    // what this asserts rather than the shape of a sample of it.
    sweep();
    const ambiguous = findings.get('answer: everything heard also fits another offered mode');
    expect(ambiguous?.count ?? 0, [...(ambiguous?.examples.values() ?? [])].join(' | ')).toBe(0);
  });
});
