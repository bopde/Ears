import { useMemo } from 'react';
import { useApp } from '../state';
import { Bars, Button, Disclosure, Empty, Meter, Stat, TopBar } from '../components/ui';
import {
  accuracyTrend, byExerciseType, byKey, conceptStats, dailyHistory, overview, strongest, weakest,
} from '../../learning/stats';
import { MASTERY_LABEL, mastery } from '../../learning/model';
import { REASON_LABEL, focusAreas } from '../../learning/selector';
import { makeRng } from '../../lib/rng';
import { CONCEPTS } from '../../music/catalog';
import { pcNameDual } from '../../music/pitch';
import type { ConceptKind } from '../../music/concept';
import { formatClock, pct } from '../../lib/util';

const KIND_TITLE: Record<ConceptKind, string> = {
  chord: 'Chord qualities',
  interval: 'Intervals',
  mode: 'Modes',
  progression: 'Progressions',
  key: 'Tonal centres',
};

export function Progress({ onBack, onStart }: { onBack: () => void; onStart: () => void }) {
  const { profile, settings } = useApp();
  const stats = useMemo(() => overview(profile), [profile]);
  const days = useMemo(() => dailyHistory(profile, 14), [profile]);
  const trend = useMemo(() => accuracyTrend(profile), [profile]);
  const weak = useMemo(() => weakest(profile, 6), [profile]);
  const strong = useMemo(() => strongest(profile, 6), [profile]);
  const types = useMemo(() => byExerciseType(profile), [profile]);
  const keys = useMemo(() => byKey(profile), [profile]);
  const all = useMemo(() => conceptStats(profile), [profile]);
  const focus = useMemo(
    () => focusAreas(profile, settings, makeRng(profile.attempts.length + 13), 5),
    [profile, settings],
  );
  const recentSessions = useMemo(() => profile.sessions.slice(-8).reverse(), [profile.sessions]);

  if (stats.attempts === 0) {
    return (
      <div className="stack">
        <TopBar title="Progress" onBack={onBack} />
        <Empty>
          Nothing recorded yet. Practice history is kept on this device — no account needed.
        </Empty>
        <Button variant="primary" size="lg" block onClick={onStart}>
          Start a session
        </Button>
      </div>
    );
  }

  const kinds: ConceptKind[] = ['chord', 'interval', 'mode', 'progression', 'key'];

  return (
    <div className="stack">
      <TopBar title="Progress" onBack={onBack} />

      <div className="stats">
        <Stat value={pct(stats.accuracy)} label="Overall accuracy" />
        <Stat value={stats.attempts} label="Questions" />
        <Stat value={stats.sessions} label="Sessions" />
        <Stat value={formatClock(stats.practiceSeconds)} label="Time practised" />
        <Stat value={stats.streak} label="Day streak" />
        <Stat value={pct(stats.hintRate)} label="Hint rate" />
      </div>

      <section className="card stack stack--tight">
        <div className="row row--between">
          <span className="eyebrow">Last 14 days</span>
          <span className="small faint">{days.reduce((n, d) => n + d.asked, 0)} questions</span>
        </div>
        <Bars values={days.map((d) => d.asked)} labels={days.map((d) => `${d.day}: ${d.asked}`)} />
      </section>

      {trend.length > 0 && (
        <section className="card stack stack--tight">
          <div className="row row--between">
            <span className="eyebrow">Accuracy trend</span>
            <span className="small faint">recent {Math.min(240, stats.attempts)} answers</span>
          </div>
          <Bars
            values={trend.map((t) => Math.max(0.02, t))}
            labels={trend.map((t) => pct(t))}
          />
          <div className="row row--between small faint">
            <span>earlier</span>
            <span>now</span>
          </div>
        </section>
      )}

      {weak.length > 0 && (
        <section className="card stack stack--tight">
          <div className="eyebrow">Needs work</div>
          <div className="list">
            {weak.map(({ concept, skill }) => (
              <div className="list__row" key={concept.id}>
                <div className="grow">
                  <div className="list__name">{concept.name}</div>
                  <div className="list__sub">
                    {skill.correct}/{skill.attempts} · level {skill.level}
                  </div>
                </div>
                <div style={{ width: '4.5rem' }}>
                  <Meter value={skill.strength} tone="bad" />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {strong.length > 0 && (
        <section className="card stack stack--tight">
          <div className="eyebrow">Strong</div>
          <div className="list">
            {strong.map(({ concept, skill }) => (
              <div className="list__row" key={concept.id}>
                <div className="grow">
                  <div className="list__name">{concept.name}</div>
                  <div className="list__sub">
                    {skill.correct}/{skill.attempts} · level {skill.level}
                  </div>
                </div>
                <div style={{ width: '4.5rem' }}>
                  <Meter value={skill.strength} tone="ok" />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card stack stack--tight">
        <div className="eyebrow">By exercise</div>
        <div className="list">
          {types.map((t) => (
            <div className="list__row" key={t.label}>
              <div className="grow">
                <div className="list__name">{t.label}</div>
                <div className="list__sub">
                  {t.correct}/{t.asked}
                </div>
              </div>
              <div style={{ width: '4.5rem' }}>
                <Meter value={t.accuracy} tone={t.accuracy >= 0.75 ? 'ok' : 'accent'} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {keys.length > 0 && (
        <section className="card stack stack--tight">
          <div className="eyebrow">By key</div>
          <div className="list">
            {keys.map((k) => (
              <div className="list__row" key={k.pc}>
                <div className="grow row" style={{ gap: '0.6rem' }}>
                  <span className="list__name" style={{ width: '3.5rem' }}>
                    {pcNameDual(k.pc)}
                  </span>
                  <span className="list__sub">
                    {k.correct}/{k.asked}
                  </span>
                </div>
                <div style={{ width: '4.5rem' }}>
                  <Meter value={k.accuracy} tone={k.accuracy >= 0.75 ? 'ok' : 'accent'} />
                </div>
              </div>
            ))}
          </div>
          <p className="small faint">
            Counts every question with a root or tonal centre, not only key recognition.
          </p>
        </section>
      )}

      {focus.length > 0 && (
        <section className="card stack stack--tight">
          <div className="eyebrow">Currently prioritising</div>
          <div className="list">
            {focus.map((item) => {
              const concept = CONCEPTS.resolve(item.conceptId);
              return (
                <div className="list__row" key={item.conceptId}>
                  <div className="grow">
                    <div className="list__name">{concept.name}</div>
                    <div className="list__sub">
                      {item.skill
                        ? `${REASON_LABEL[item.reason]} · level ${item.skill.level}`
                        : REASON_LABEL[item.reason]}
                    </div>
                  </div>
                  {item.skill ? (
                    <div style={{ width: '4.5rem' }}>
                      <Meter
                        value={item.skill.strength}
                        tone={
                          item.skill.strength >= 0.75
                            ? 'ok'
                            : item.skill.strength >= 0.45
                              ? 'accent'
                              : 'bad'
                        }
                      />
                    </div>
                  ) : (
                    <span className="badge">New</span>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {recentSessions.length > 0 && (
        <section className="card stack stack--tight">
          <div className="eyebrow">Recent sessions</div>
          <div className="list">
            {recentSessions.map((session) => (
              <div className="list__row" key={session.id}>
                <div className="grow">
                  <div className="list__name">
                    {new Date(session.startedAt).toLocaleDateString(undefined, {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                    })}
                  </div>
                  <div className="list__sub">
                    {session.asked} questions · {formatClock(session.seconds)}
                    {session.hints > 0 ? ` · ${session.hints} hints` : ''}
                    {session.adaptive ? ' · adaptive' : ''}
                  </div>
                </div>
                <span className="badge">
                  {session.asked ? pct(session.correct / session.asked) : '—'}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card">
        <div className="eyebrow" style={{ marginBottom: '0.25rem' }}>
          Everything practised
        </div>
        {kinds.map((kind) => {
          const items = all.filter((s) => s.concept.kind === kind);
          if (!items.length) return null;
          return (
            <Disclosure key={kind} title={KIND_TITLE[kind]} summary={`${items.length}`}>
              <div className="list">
                {items.map(({ concept, skill }) => (
                  <div className="list__row" key={concept.id}>
                    <div className="grow">
                      <div className="list__name">{concept.name}</div>
                      <div className="list__sub">
                        {MASTERY_LABEL[mastery(skill)]} · {skill.correct}/{skill.attempts} · level{' '}
                        {skill.level}
                      </div>
                    </div>
                    <div style={{ width: '4.5rem' }}>
                      <Meter
                        value={skill.strength}
                        tone={skill.strength >= 0.75 ? 'ok' : skill.strength >= 0.45 ? 'accent' : 'bad'}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Disclosure>
          );
        })}
      </section>

      <p className="small faint">
        {settings.adaptive
          ? 'Sessions are built from this history: weak and overdue material first, mastered material revisited to check it holds.'
          : 'Adaptive selection is off, so sessions are drawn at random from the vocabulary you enabled.'}
      </p>

      <Button variant="primary" size="lg" block onClick={onStart}>
        Practise now
      </Button>
    </div>
  );
}
