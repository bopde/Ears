import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../state';
import { Button, Chip, Segmented, TopBar, clsx } from '../components/ui';
import { PlayIcon } from '../components/Icons';
import type { Performer } from '../../audio/performer';
import {
  intervalNotes, playChordQuality, playInterval, playProgression, playScale,
} from '../../audio/demo';
import {
  REFERENCE_VOICINGS, VOICING_LESSONS, modeForStyle, playComparison, playReference,
  playReferenceChord, referenceBassCaption, referenceDegrees, referenceNoteNames,
  referenceVoicings, rootMotionLine,
  type ReferenceChord, type ReferenceVoicing, type VoicingLesson,
} from '../../audio/reference';
import {
  CHORD_GROUP_ORDER, CHORD_QUALITIES, chordPitchClasses, chordSymbol, makeChord,
} from '../../music/chords';
import { INTERVALS } from '../../music/intervals';
import { SCALES, scalePitchClasses } from '../../music/scales';
import { PROGRESSIONS, romanLine } from '../../music/progressions';
import { PITCH_CLASSES, midiName, pcName, pcNameDual } from '../../music/pitch';
import { groupBy } from '../../lib/util';

type Tab = 'progressions' | 'voicings' | 'chords' | 'intervals' | 'modes';

const TABS: Array<{ value: Tab; label: string }> = [
  { value: 'progressions', label: 'Changes' },
  { value: 'voicings', label: 'Voicings' },
  { value: 'chords', label: 'Chords' },
  { value: 'intervals', label: 'Intervals' },
  { value: 'modes', label: 'Modes' },
];

/** The progression a voicing is heard over, when the plain ii–V–I will not do. */
const DEMO_FALLBACK = 'ii-V-I';

const TONALITY_LABEL: Record<string, string> = {
  major: 'Major key',
  minor: 'Minor key',
  modal: 'Modal',
};

const PARENT_LABEL: Record<string, string> = {
  major: 'Church modes',
  'melodic minor': 'Melodic minor',
  'harmonic minor': 'Harmonic minor',
  symmetric: 'Symmetrical',
  other: 'Other',
};

/** One playable entry. The whole row is the button; nothing else is clickable. */
function Row({
  title,
  concrete,
  detail,
  blurb,
  active,
  onPlay,
}: {
  title: string;
  concrete: string;
  detail?: string;
  blurb?: string;
  active: boolean;
  onPlay: () => void;
}) {
  return (
    <button
      type="button"
      className={clsx('refrow', active && 'refrow--on')}
      onClick={onPlay}
      aria-label={`Play ${title}`}
    >
      <span className="refrow__body">
        <span className="refrow__title">{title}</span>
        <span className="refrow__concrete">{concrete}</span>
        {detail && <span className="refrow__detail">{detail}</span>}
        {blurb && <span className="refrow__blurb">{blurb}</span>}
      </span>
      <span className="refrow__play">
        <PlayIcon size={16} />
      </span>
    </button>
  );
}

/**
 * One chord of a progression, with the notes that will sound.
 *
 * The notes come from the same call that schedules the audio, so what is read
 * here is what is heard — the bass marked separately, because which note is
 * underneath is the thing the display exists to settle.
 */
function ChordCard({
  item,
  accidental,
  active,
  onPlay,
}: {
  item: ReferenceChord;
  accidental: 'sharp' | 'flat' | 'both';
  active: boolean;
  onPlay: () => void;
}) {
  const names = referenceNoteNames(item, accidental);
  return (
    <button
      type="button"
      className={clsx('refchord', active && 'refchord--on')}
      onClick={onPlay}
      aria-label={`Play ${item.symbol} alone`}
    >
      <span className="refchord__symbol">{item.symbol}</span>
      <span className="refchord__roman">{item.roman}</span>
      {/* Highest first, the way the stack is read off a keyboard, with the
          degree each note is playing beside it. */}
      <span className="refchord__notes">
        {[...names.notes].reverse().map((n, i) => (
          <span key={`${n.name}-${i}`} className="refchord__note">
            <span className="refchord__noteName">{n.name}</span>
            <span className="refchord__degree">{n.degree}</span>
          </span>
        ))}
      </span>
      <span className="refchord__bass">
        {names.bass.length === 0 && '—'}
        {names.bass.map((b, i) => (
          <span key={i} className={clsx('refbass', b.role !== 'root' && 'refbass--passing')}>
            <span className="refchord__noteName">{b.name}</span>
            {/* A chord tone says which degree it is; a note that is only
                passing through says what it is doing instead. */}
            <span className="refchord__degree">
              {b.role === 'root' || b.role === 'fifth' ? b.degree : b.tag}
            </span>
          </span>
        ))}
      </span>
    </button>
  );
}

/**
 * One voicing, taught.
 *
 * What it is, where a player reaches for it, and the degrees it actually
 * sounds over a set of changes — then the same changes in root position and
 * in the voicing, back to back, which is the part that does the teaching.
 */
function VoicingCard({
  lesson,
  chords,
  demo,
  playing,
  onPlay,
  onCompare,
}: {
  lesson: VoicingLesson;
  chords: ReferenceChord[];
  demo: string;
  playing: string | null;
  onPlay: () => void;
  onCompare: () => void;
}) {
  return (
    <section className="card stack stack--tight">
      <div className="row row--between">
        <span className="refvoice__title">{lesson.label}</span>
        <span className="small faint">{demo}</span>
      </div>
      <dl className="refvoice__facts">
        <dt>What it is</dt>
        <dd>{lesson.blurb}</dd>
        {lesson.use && (
          <>
            <dt>When to use it</dt>
            <dd>{lesson.use}</dd>
          </>
        )}
        {lesson.detail && (
          <>
            <dt>Worth knowing</dt>
            <dd>{lesson.detail}</dd>
          </>
        )}
      </dl>
      <div className="refdegrees">
        {chords.map((c, i) => (
          <span key={i} className="refdegrees__item">
            <span className="refdegrees__chord">{c.symbol}</span>
            <span className="refdegrees__line">{referenceDegrees(c).join('  ')}</span>
          </span>
        ))}
      </div>
      <div className="row" style={{ gap: '0.4rem' }}>
        <Button size="sm" onClick={onPlay}>
          <PlayIcon size={14} />
          {playing === `voicing-${lesson.id}` ? 'Playing' : 'Play'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCompare}>
          {playing === `compare-${lesson.id}` ? 'Comparing' : 'Compare with root position'}
        </Button>
      </div>
    </section>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card stack stack--tight">
      <div className="eyebrow">{title}</div>
      <div>{children}</div>
    </section>
  );
}

/**
 * The cheat sheet: everything the exercises draw on, in any key, with a play
 * button on each. It is the other half of an ear trainer — somewhere to go and
 * check what a thing actually sounds like, or to play along with it.
 */
export function Reference({ onBack }: { onBack: () => void }) {
  const { settings, updateSettings, performer, unlockAudio } = useApp();
  const [tab, setTab] = useState<Tab>('progressions');
  const [playing, setPlaying] = useState<string | null>(null);
  const [roll, setRoll] = useState(false);
  const key = settings.referenceKey;
  const accidental = settings.accidental;
  const voicing: ReferenceVoicing = settings.referenceVoicing;

  // One pending timer at a time, cancelled on the way out so a demo started
  // just before leaving the cheat sheet cannot set state on a gone screen.
  const clearTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      performer.stop();
      if (clearTimer.current !== null) window.clearTimeout(clearTimer.current);
    },
    [performer],
  );

  const play = async (id: string, run: (perf: Performer) => number) => {
    // Safari will not start audio outside a gesture, and this is the gesture.
    await unlockAudio();
    performer.stop();
    performer.configure({
      instrument: settings.instrument,
      tempo: settings.tempo,
      swing: settings.swing,
    });
    const seconds = run(performer);
    setPlaying(id);
    if (clearTimer.current !== null) window.clearTimeout(clearTimer.current);
    clearTimer.current = window.setTimeout(
      () => setPlaying((current) => (current === id ? null : current)),
      Math.max(300, seconds * 1000),
    );
  };

  const progressionGroups = useMemo(() => groupBy(PROGRESSIONS, (p) => p.tonality), []);
  const chordGroups = useMemo(() => groupBy(CHORD_QUALITIES, (q) => q.group), []);
  const modeGroups = useMemo(() => groupBy(SCALES, (s) => s.parent), []);

  return (
    <div className="stack">
      <TopBar title="Cheat sheet" onBack={onBack} />

      <div className="refcontrols stack stack--tight">
        <Segmented value={tab} options={TABS} onChange={setTab} ariaLabel="Section" />
        <div className="field">
          <div className="field__label">
            <span>{tab === 'intervals' ? 'From' : 'Key'}</span>
            <span>{pcNameDual(key)}</span>
          </div>
          <div className="row row--wrap" style={{ gap: '0.3rem' }}>
            {PITCH_CLASSES.map((pc) => (
              <Chip key={pc} on={pc === key} onClick={() => updateSettings({ referenceKey: pc })}>
                {pcName(pc, accidental)}
              </Chip>
            ))}
          </div>
        </div>
      </div>

      {tab === 'progressions' && (
        <section className="card stack stack--tight">
          <div className="eyebrow">Voicing</div>
          <div className="row row--wrap" style={{ gap: '0.3rem' }}>
            {REFERENCE_VOICINGS.map((v) => (
              <Chip
                key={v.id}
                on={v.id === voicing}
                onClick={() => updateSettings({ referenceVoicing: v.id })}
              >
                {v.short}
              </Chip>
            ))}
          </div>
          <p className="small faint" style={{ marginTop: '0.1rem' }}>
            {REFERENCE_VOICINGS.find((v) => v.id === voicing)?.blurb}
          </p>
          <label className="refroll">
            <input
              type="checkbox"
              checked={roll}
              onChange={(e) => setRoll(e.currentTarget.checked)}
            />
            <span>Roll a single chord from the bass</span>
          </label>
        </section>
      )}

      {tab === 'progressions' &&
        (['major', 'minor', 'modal'] as const).map((tonality) => {
          const items = progressionGroups.get(tonality) ?? [];
          if (!items.length) return null;
          return (
            <Group key={tonality} title={TONALITY_LABEL[tonality]}>
              {items.map((def) => {
                const chords = referenceVoicings(def, key, voicing, accidental);
                return (
                  <div key={def.id} className="refprog">
                    <Row
                      title={def.name}
                      concrete={chords.map((c) => c.symbol).join('  |  ')}
                      detail={`${romanLine(def)}   ·   ${
                        rootMotionLine(chords.flatMap((c) => c.bass))}`}
                      blurb={def.blurb}
                      active={playing === def.id}
                      onPlay={() =>
                        void play(def.id, (perf) => playProgression(perf, def, key, voicing))}
                    />
                    {def.voicing && modeForStyle(def.voicing) !== voicing && (
                      <button
                        type="button"
                        className="refsuggest"
                        onClick={() =>
                          void play(`${def.id}-rec`, (perf) =>
                            playReference(
                              perf,
                              referenceVoicings(def, key, modeForStyle(def.voicing!), accidental),
                            ))}
                      >
                        <PlayIcon size={12} />
                        <span className="refsuggest__name">
                          {REFERENCE_VOICINGS.find((v) => v.id === modeForStyle(def.voicing!))?.label}
                        </span>
                        <span className="refsuggest__degrees">
                          {referenceVoicings(def, key, modeForStyle(def.voicing!), accidental)
                            .map((c) => referenceDegrees(c).join(' '))
                            .join('  ·  ')}
                        </span>
                      </button>
                    )}
                    <p className="refbasscaption">{referenceBassCaption(voicing)}</p>
                    <div className="refchords">
                      {chords.map((item, i) => (
                        <ChordCard
                          key={`${def.id}-${i}`}
                          item={item}
                          accidental={accidental}
                          active={playing === `${def.id}-${i}`}
                          onPlay={() =>
                            void play(`${def.id}-${i}`, (perf) =>
                              playReferenceChord(perf, item, { roll }))}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </Group>
          );
        })}

      {tab === 'voicings' &&
        VOICING_LESSONS.map((lesson) => {
          const def = PROGRESSIONS.find((p) => p.id === (lesson.demo ?? DEMO_FALLBACK))
            ?? PROGRESSIONS[0];
          const chords = referenceVoicings(def, key, lesson.id, accidental);
          return (
            <VoicingCard
              key={lesson.id}
              lesson={lesson}
              chords={chords}
              demo={`${def.short} in ${pcNameDual(key)}`}
              playing={playing}
              onPlay={() =>
                void play(`voicing-${lesson.id}`, (perf) => playReference(perf, chords))}
              onCompare={() =>
                void play(`compare-${lesson.id}`, (perf) =>
                  playComparison(perf, def, key, lesson.id))}
            />
          );
        })}

      {tab === 'chords' &&
        CHORD_GROUP_ORDER.map((group) => {
          const items = chordGroups.get(group) ?? [];
          if (!items.length) return null;
          return (
            <Group key={group} title={group}>
              {items.map((quality) => (
                <Row
                  key={quality.id}
                  title={`${chordSymbol(makeChord(key, quality.id), accidental)} — ${quality.name}`}
                  concrete={chordPitchClasses(makeChord(key, quality.id))
                    .map((pc) => pcName(pc, accidental))
                    .join('  ')}
                  blurb={quality.blurb}
                  active={playing === quality.id}
                  onPlay={() => void play(quality.id, (perf) => playChordQuality(perf, quality, key))}
                />
              ))}
            </Group>
          );
        })}

      {tab === 'intervals' &&
        (
          [
            ['Simple', INTERVALS.filter((i) => i.semitones <= 12)],
            ['Compound', INTERVALS.filter((i) => i.semitones > 12)],
          ] as const
        ).map(([title, items]) =>
          items.length ? (
            <Group key={title} title={title}>
              {items.map((interval) => {
                const [lo, hi] = intervalNotes(interval, key);
                return (
                  <Row
                    key={interval.id}
                    title={interval.name}
                    concrete={`${midiName(lo, accidental)}  →  ${midiName(hi, accidental)}`}
                    detail={`${interval.semitones} semitone${interval.semitones === 1 ? '' : 's'}`}
                    blurb={interval.blurb}
                    active={playing === interval.id}
                    onPlay={() => void play(interval.id, (perf) => playInterval(perf, interval, key))}
                  />
                );
              })}
            </Group>
          ) : null,
        )}

      {tab === 'modes' &&
        (['major', 'melodic minor', 'harmonic minor', 'symmetric', 'other'] as const).map(
          (parent) => {
            const items = modeGroups.get(parent) ?? [];
            if (!items.length) return null;
            return (
              <Group key={parent} title={PARENT_LABEL[parent]}>
                {items.map((scale) => (
                  <Row
                    key={scale.id}
                    title={`${pcName(key, accidental)} ${scale.name}`}
                    concrete={scalePitchClasses(key, scale)
                      .map((pc) => pcName(pc, accidental))
                      .join('  ')}
                    detail={scale.spelling}
                    blurb={scale.blurb}
                    active={playing === scale.id}
                    onPlay={() => void play(scale.id, (perf) => playScale(perf, scale, key))}
                  />
                ))}
              </Group>
            );
          },
        )}

      <p className="small faint" style={{ textAlign: 'center' }}>
        Everything the exercises draw on. Tap any row to hear it in {pcNameDual(key)}.
      </p>
    </div>
  );
}
