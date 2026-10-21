import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../state';
import { Chip, Segmented, TopBar, clsx } from '../components/ui';
import { PlayIcon } from '../components/Icons';
import type { Performer } from '../../audio/performer';
import {
  intervalNotes, playChordQuality, playInterval, playProgression, playScale,
} from '../../audio/demo';
import {
  CHORD_GROUP_ORDER, CHORD_QUALITIES, chordPitchClasses, chordSymbol, makeChord,
} from '../../music/chords';
import { INTERVALS } from '../../music/intervals';
import { SCALES, scalePitchClasses } from '../../music/scales';
import { PROGRESSIONS, realiseProgression, romanLine } from '../../music/progressions';
import { PITCH_CLASSES, midiName, pcName, pcNameDual } from '../../music/pitch';
import { groupBy } from '../../lib/util';

type Tab = 'progressions' | 'chords' | 'intervals' | 'modes';

const TABS: Array<{ value: Tab; label: string }> = [
  { value: 'progressions', label: 'Changes' },
  { value: 'chords', label: 'Chords' },
  { value: 'intervals', label: 'Intervals' },
  { value: 'modes', label: 'Modes' },
];

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
  const key = settings.referenceKey;
  const accidental = settings.accidental;

  useEffect(() => () => performer.stop(), [performer]);

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
    window.setTimeout(
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

      {tab === 'progressions' &&
        (['major', 'minor', 'modal'] as const).map((tonality) => {
          const items = progressionGroups.get(tonality) ?? [];
          if (!items.length) return null;
          return (
            <Group key={tonality} title={TONALITY_LABEL[tonality]}>
              {items.map((def) => (
                <Row
                  key={def.id}
                  title={def.name}
                  concrete={realiseProgression(def, key)
                    .map((r) => chordSymbol(r.chord, accidental))
                    .join('  |  ')}
                  detail={romanLine(def)}
                  blurb={def.blurb}
                  active={playing === def.id}
                  onPlay={() => void play(def.id, (perf) => playProgression(perf, def, key))}
                />
              ))}
            </Group>
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
