import { Performer, polyphonyGain } from './performer';
import { realiseProgression, type ProgressionDef } from '../music/progressions';
import { arpeggiate, voiceChord, voiceProgression } from '../music/voicing';
import { makeChord, type ChordQuality } from '../music/chords';
import { phraseDurationBeats, scaleRun } from '../music/phrase';
import type { ScaleDef } from '../music/scales';
import type { IntervalDef } from '../music/intervals';
import { foldInto, type Midi, type PitchClass } from '../music/pitch';
import { mod } from '../lib/util';

/**
 * Plain demonstrations of the musical material, for the reference screen.
 *
 * These are not questions: nothing is hidden, nothing is randomised, and the
 * point is to hear a thing clearly in a chosen key — to check what a backdoor
 * dominant actually sounds like, or to play along with one. Every one is
 * deterministic, so the same item in the same key sounds the same each time.
 */

/** Sustained block chords with the root underneath: the clearest reading. */
export function playProgression(
  perf: Performer,
  def: ProgressionDef,
  tonic: PitchClass,
): number {
  const realised = realiseProgression(def, tonic);
  const voicings = voiceProgression(
    realised.map((r) => r.chord),
    { style: 'spread', maxNotes: 5 },
  );
  const changes = Performer.changes(realised, voicings);
  return perf.progression(changes, perf.origin(), { style: 'sustained' }) + 0.4;
}

/** Arpeggiated so each tone is audible, then struck as a block. */
export function playChordQuality(
  perf: Performer,
  quality: ChordQuality,
  root: PitchClass,
): number {
  const chord = makeChord(root, quality.id);
  const voicing = voiceChord(chord, { style: 'close', bass: true, maxNotes: 5 });
  const origin = perf.origin();
  const notes = arpeggiate(chord, 55);
  notes.forEach((midi, i) => perf.note(midi, origin + i * 0.26, 0.55, 0.62));

  const after = origin + notes.length * 0.26 + 0.2;
  const gain = polyphonyGain(voicing.all.length);
  voicing.notes.forEach((midi) => perf.note(midi, after, 2.6, 0.66, { gain }));
  if (voicing.bass !== undefined) {
    perf.note(voicing.bass, after, 2.6, 0.7, { instrument: 'bass', gain });
  }
  return after - origin + 2.8;
}

/** Where the lower note of an interval sits, keeping both notes singable. */
export function intervalNotes(interval: IntervalDef, root: PitchClass): [Midi, Midi] {
  const lo = foldInto(60 + root, 55, Math.max(55, Math.min(72, 84 - interval.semitones)));
  return [lo, lo + interval.semitones];
}

/** Up, then both together — the two ways it turns up in music. */
export function playInterval(perf: Performer, interval: IntervalDef, root: PitchClass): number {
  const [lo, hi] = intervalNotes(interval, root);
  const origin = perf.origin();
  perf.note(lo, origin, 1, 0.68);
  perf.note(hi, origin + 1.05, 1.3, 0.68);
  const together = origin + 2.5;
  perf.note(lo, together, 2.2, 0.62, { gain: polyphonyGain(2) });
  perf.note(hi, together, 2.2, 0.62, { gain: polyphonyGain(2) });
  return 4.9;
}

/** The scale up and back down over a quiet chord that fixes the tonic. */
export function playScale(perf: Performer, scale: ScaleDef, tonic: PitchClass): number {
  const tonicMidi = 60 + (tonic > 6 ? tonic - 12 : tonic);
  const vamp = scale.vamp[0];
  const voicing = voiceChord(makeChord(mod(tonic + vamp.degree, 12), vamp.quality), {
    style: 'spread',
    bass: true,
    maxNotes: 4,
  });
  const origin = perf.origin();
  const run = scaleRun(tonicMidi, scale);
  const beats = phraseDurationBeats(run);
  perf.chord(voicing, origin, 0, { beats: beats + 1, velocity: 0.4, roll: 0.02 });
  perf.melody(run, origin, 0.5);
  return ((beats + 1.5) * 60) / perf.tempo;
}
