import { useMemo } from 'react';
import { useApp } from '../state';
import { Button, Chip, Disclosure, Segmented, Slider, SwitchRow, TopBar } from '../components/ui';
import { EXERCISE_TYPES } from '../../exercises/registry';
import { DURATION_OPTIONS, type PracticeSettings } from '../../session/settings';
import { CHORD_GROUP_ORDER, CHORD_QUALITIES, qualityLabel } from '../../music/chords';
import { INTERVALS } from '../../music/intervals';
import { SCALES } from '../../music/scales';
import { PROGRESSIONS } from '../../music/progressions';
import { PITCH_CLASSES, pcNameDual } from '../../music/pitch';
import { groupBy } from '../../lib/util';

/** Toggling one item out of a list, never leaving the list empty. */
function toggle(list: string[], id: string): string[] {
  const next = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  return next.length ? next : list;
}

function ChipGroup<T extends { id: string }>({
  items,
  selected,
  onChange,
  label,
  render,
}: {
  items: readonly T[];
  selected: string[];
  onChange: (next: string[]) => void;
  label: (item: T) => string;
  render?: (item: T) => string | undefined;
}) {
  const allOn = items.every((i) => selected.includes(i.id));
  const ids = items.map((i) => i.id);
  return (
    <div className="stack stack--tight">
      <div className="row row--between">
        <span className="small faint">
          {items.filter((i) => selected.includes(i.id)).length} of {items.length}
        </span>
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            onChange(
              allOn
                ? selected.filter((id) => !ids.includes(id))
                : Array.from(new Set([...selected, ...ids])),
            )
          }
        >
          {allOn ? 'None' : 'All'}
        </Button>
      </div>
      <div className="row row--wrap" style={{ gap: '0.35rem' }}>
        {items.map((item) => (
          <Chip
            key={item.id}
            on={selected.includes(item.id)}
            onClick={() => onChange(toggle(selected, item.id))}
          >
            <span>{label(item)}</span>
            {render?.(item) && <span className="faint small">{render(item)}</span>}
          </Chip>
        ))}
      </div>
    </div>
  );
}

export function Setup({ onBack, onStart }: { onBack: () => void; onStart: () => void }) {
  const { settings, updateSettings } = useApp();
  const set = (patch: Partial<PracticeSettings>) => updateSettings(patch);

  const chordGroups = useMemo(() => groupBy(CHORD_QUALITIES, (q) => q.group), []);
  const keysAll = settings.keys === 'all';
  const selectedKeys: number[] = settings.keys === 'all' ? [] : settings.keys;

  return (
    <div className="stack">
      <TopBar title="Choose what to practise" onBack={onBack} />

      <section className="card stack stack--tight">
        <div className="eyebrow">Exercises</div>
        <div className="stack stack--tight">
          {EXERCISE_TYPES.map((type) => {
            const on = settings.exerciseTypes.includes(type.id);
            return (
              <button
                key={type.id}
                type="button"
                className={`opt ${on ? 'opt--on' : ''}`}
                style={{ alignItems: 'flex-start', textAlign: 'left', minHeight: '3.5rem' }}
                onClick={() => set({ exerciseTypes: toggle(settings.exerciseTypes, type.id) })}
                aria-pressed={on}
              >
                <span className="opt__label" style={{ fontSize: '0.98rem' }}>
                  {type.name}
                </span>
                <span
                  className="opt__sub"
                  style={{ whiteSpace: 'normal', fontSize: '0.74rem', textAlign: 'left' }}
                >
                  {type.description}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="card stack">
        <div className="eyebrow">Session</div>
        <div className="field">
          <div className="field__label">
            <span>Length</span>
            <span className="tabular">{settings.durationMinutes} min</span>
          </div>
          <div className="row row--wrap" style={{ gap: '0.35rem' }}>
            {DURATION_OPTIONS.map((m) => (
              <Chip
                key={m}
                on={settings.durationMinutes === m}
                onClick={() => set({ durationMinutes: m })}
              >
                {m} min
              </Chip>
            ))}
          </div>
          <Slider
            label="Custom length"
            min={3}
            max={60}
            step={1}
            value={settings.durationMinutes}
            onChange={(v) => set({ durationMinutes: v })}
            format={(v) => `${v} min`}
          />
        </div>

        <div className="field">
          <div className="field__label">
            <span>Stop after</span>
          </div>
          <div className="row row--wrap" style={{ gap: '0.35rem' }}>
            <Chip on={settings.questionLimit === null} onClick={() => set({ questionLimit: null })}>
              The clock
            </Chip>
            {[10, 20, 30, 50].map((n) => (
              <Chip
                key={n}
                on={settings.questionLimit === n}
                onClick={() => set({ questionLimit: n })}
              >
                {n} questions
              </Chip>
            ))}
          </div>
          <p className="small faint" style={{ marginTop: '0.4rem' }}>
            {settings.questionLimit
              ? `The session runs until ${settings.questionLimit} questions are answered, however long that takes.`
              : 'The session fits as many questions as the time allows, mixing shorter and longer exercises.'}
          </p>
        </div>

        <div className="field">
          <div className="field__label">
            <span>Difficulty</span>
          </div>
          <Segmented
            ariaLabel="Difficulty"
            value={settings.difficulty === 'adaptive' ? 'adaptive' : String(settings.difficulty)}
            options={[
              { value: 'adaptive', label: 'Adaptive' },
              { value: '1', label: '1' },
              { value: '2', label: '2' },
              { value: '3', label: '3' },
              { value: '4', label: '4' },
              { value: '5', label: '5' },
            ]}
            onChange={(v) => set({ difficulty: v === 'adaptive' ? 'adaptive' : Number(v) })}
          />
          <p className="small faint" style={{ marginTop: '0.4rem' }}>
            {settings.difficulty === 'adaptive'
              ? 'Each concept carries its own level, raised as you get it right and lowered when you do not.'
              : 'Harder levels use closer wrong answers, thinner voicings, fewer reference cues and faster harmony.'}
          </p>
        </div>

        <div>
          <SwitchRow
            label="Hints"
            hint="Offer a reference pitch. Hinted answers still count, but for less."
            on={settings.hintsEnabled}
            onChange={(v) => set({ hintsEnabled: v })}
          />
          <SwitchRow
            label="Follow my history"
            hint="Choose material from past performance rather than at random."
            on={settings.adaptive}
            onChange={(v) => set({ adaptive: v })}
          />
        </div>
      </section>

      <section className="card stack stack--tight">
        <div className="eyebrow">Keys</div>
        <div className="row row--wrap" style={{ gap: '0.35rem' }}>
          <Chip on={keysAll} onClick={() => set({ keys: 'all' })}>
            All 12
          </Chip>
          {PITCH_CLASSES.map((pc) => (
            <Chip
              key={pc}
              on={!keysAll && selectedKeys.includes(pc)}
              onClick={() => {
                const next = selectedKeys.includes(pc)
                  ? selectedKeys.filter((k) => k !== pc)
                  : [...selectedKeys, pc];
                set({ keys: next.length ? next.sort((a, b) => a - b) : 'all' });
              }}
            >
              {pcNameDual(pc)}
            </Chip>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="eyebrow" style={{ marginBottom: '0.25rem' }}>
          Vocabulary
        </div>
        {CHORD_GROUP_ORDER.map((group) => {
          const items = chordGroups.get(group) ?? [];
          if (!items.length) return null;
          const on = items.filter((q) => settings.chordQualities.includes(q.id)).length;
          return (
            <Disclosure key={group} title={group} summary={`${on}/${items.length}`}>
              <ChipGroup
                items={items}
                selected={settings.chordQualities}
                onChange={(next) => set({ chordQualities: next })}
                label={(q) => qualityLabel(q)}
              />
            </Disclosure>
          );
        })}
        <Disclosure
          title="Intervals"
          summary={`${settings.intervals.length}/${INTERVALS.length}`}
        >
          <ChipGroup
            items={INTERVALS}
            selected={settings.intervals}
            onChange={(next) => set({ intervals: next })}
            label={(i) => i.short}
          />
          <div className="divider" />
          <div className="row row--wrap" style={{ gap: '0.35rem' }}>
            {(['ascending', 'descending', 'harmonic'] as const).map((dir) => (
              <Chip
                key={dir}
                on={settings.intervalDirections.includes(dir)}
                onClick={() =>
                  set({
                    intervalDirections: toggle(settings.intervalDirections, dir) as typeof settings.intervalDirections,
                  })
                }
              >
                {dir[0].toUpperCase() + dir.slice(1)}
              </Chip>
            ))}
          </div>
        </Disclosure>
        <Disclosure title="Modes & scales" summary={`${settings.modes.length}/${SCALES.length}`}>
          <ChipGroup
            items={SCALES}
            selected={settings.modes}
            onChange={(next) => set({ modes: next })}
            label={(s) => s.name}
          />
        </Disclosure>
        <Disclosure
          title="Progressions"
          summary={`${settings.progressions.length}/${PROGRESSIONS.length}`}
        >
          <ChipGroup
            items={PROGRESSIONS}
            selected={settings.progressions}
            onChange={(next) => set({ progressions: next })}
            label={(p) => p.short}
          />
        </Disclosure>
      </section>

      <Button variant="primary" size="lg" block onClick={onStart}>
        Start {settings.durationMinutes}-minute session
      </Button>
    </div>
  );
}
