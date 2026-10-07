import { useMemo } from 'react';
import { useApp, type Screen } from '../state';
import { Button, Chip, HeroButton, Meter, Stat } from '../components/ui';
import { ChartIcon, ClockIcon, FlameIcon, NoteIcon, TuneIcon } from '../components/Icons';
import { DURATION_OPTIONS } from '../../session/settings';
import { REASON_LABEL, focusAreas } from '../../learning/selector';
import { overview } from '../../learning/stats';
import { CONCEPTS } from '../../music/catalog';
import { makeRng } from '../../lib/rng';
import { formatClock, pct } from '../../lib/util';

export function Home({
  navigate,
  onStart,
}: {
  navigate: (screen: Screen) => void;
  onStart: (adaptive: boolean) => void;
}) {
  const { profile, settings, updateSettings } = useApp();
  const stats = useMemo(() => overview(profile), [profile]);

  // A stable seed keeps the home screen from reshuffling on every render.
  const focus = useMemo(
    () => focusAreas(profile, settings, makeRng(profile.attempts.length + 7), 4),
    [profile, settings],
  );

  const lastSession = profile.sessions[profile.sessions.length - 1];
  const isNew = stats.attempts === 0;

  return (
    <div className="stack">
      <header className="row row--between" style={{ paddingBlock: '0.5rem 0.25rem' }}>
        <div className="row" style={{ gap: '0.5rem' }}>
          <span style={{ color: 'var(--accent)' }}>
            <NoteIcon size={24} />
          </span>
          <h1 className="display" style={{ fontSize: '1.5rem' }}>
            Ears
          </h1>
        </div>
        <div className="row" style={{ gap: '0.15rem' }}>
          <button
            type="button"
            className="iconbtn"
            onClick={() => navigate('progress')}
            aria-label="Progress"
          >
            <ChartIcon />
          </button>
          <button
            type="button"
            className="iconbtn"
            onClick={() => navigate('settings')}
            aria-label="Settings"
          >
            <TuneIcon />
          </button>
        </div>
      </header>

      <section className="stack stack--tight">
        <div className="field__label">
          <span>Session length</span>
        </div>
        <div className="row row--wrap" style={{ gap: '0.4rem' }}>
          {DURATION_OPTIONS.map((minutes) => (
            <Chip
              key={minutes}
              on={settings.durationMinutes === minutes}
              onClick={() => updateSettings({ durationMinutes: minutes })}
            >
              {minutes} min
            </Chip>
          ))}
          <Chip
            on={!DURATION_OPTIONS.includes(settings.durationMinutes as never)}
            onClick={() => navigate('setup')}
          >
            Custom
          </Chip>
        </div>
      </section>

      <HeroButton
        title="Today’s practice"
        sub={
          isNew
            ? `${settings.durationMinutes} min · starts broad, then follows what you miss`
            : `${settings.durationMinutes} min · chosen from your history`
        }
        onClick={() => onStart(true)}
      />

      <Button block onClick={() => navigate('setup')}>
        Choose what to practise
      </Button>

      {!isNew && (
        <div className="stats">
          <Stat value={pct(stats.accuracy)} label="Accuracy" />
          <Stat
            value={
              <span className="row" style={{ gap: '0.3rem' }}>
                <span style={{ color: 'var(--accent)' }}>
                  <FlameIcon size={18} />
                </span>
                {stats.streak}
              </span>
            }
            label={stats.streak === 1 ? 'Day streak' : 'Day streak'}
          />
          <Stat value={stats.attempts} label="Answered" />
          <Stat value={formatClock(stats.practiceSeconds)} label="Practised" />
        </div>
      )}

      {focus.length > 0 && (
        <section className="card stack stack--tight">
          <div className="eyebrow">Currently prioritising</div>
          <div className="list">
            {focus.map((item) => {
              const concept = CONCEPTS.resolve(item.conceptId);
              const strength = item.skill?.strength ?? 0;
              return (
                <div className="list__row" key={item.conceptId}>
                  <div className="grow">
                    <div className="list__name">{concept.name}</div>
                    <div className="list__sub">
                      {item.skill
                        ? `${REASON_LABEL[item.reason]} · level ${item.skill.level}`
                        : `${concept.kind} · difficulty ${concept.tier}`}
                    </div>
                  </div>
                  {item.skill ? (
                    <div style={{ width: '4.5rem' }}>
                      <Meter
                        value={strength}
                        tone={strength >= 0.75 ? 'ok' : strength >= 0.45 ? 'accent' : 'bad'}
                      />
                    </div>
                  ) : (
                    <span className="badge">New</span>
                  )}
                </div>
              );
            })}
          </div>
          {isNew && (
            <p className="small faint">
              Nothing practised yet — the first session samples broadly, then narrows onto whatever
              you miss.
            </p>
          )}
        </section>
      )}

      {lastSession && (
        <section className="card row row--between">
          <div>
            <div className="eyebrow">Last session</div>
            <div className="small muted">
              {new Date(lastSession.startedAt).toLocaleDateString(undefined, {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
              })}{' '}
              · {lastSession.asked} questions ·{' '}
              {lastSession.asked ? pct(lastSession.correct / lastSession.asked) : '—'}
            </div>
          </div>
          <span className="row small faint" style={{ gap: '0.3rem' }}>
            <ClockIcon size={16} />
            {formatClock(lastSession.seconds)}
          </span>
        </section>
      )}
    </div>
  );
}
