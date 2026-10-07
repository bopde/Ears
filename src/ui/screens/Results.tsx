import { useMemo } from 'react';
import { useApp } from '../state';
import type { SessionSummary } from '../../session/engine';
import { Button, Meter, Stat, TopBar } from '../components/ui';
import { CONCEPTS } from '../../music/catalog';
import { REASON_LABEL, focusAreas } from '../../learning/selector';
import { sessionBreakdown } from '../../learning/stats';
import { makeRng } from '../../lib/rng';
import { formatClock, pct } from '../../lib/util';

export function Results({
  summary,
  onAgain,
  onHome,
  onProgress,
}: {
  summary: SessionSummary;
  onAgain: () => void;
  onHome: () => void;
  onProgress: () => void;
}) {
  const { profile, settings } = useApp();
  const { record } = summary;
  const accuracy = record.asked ? record.correct / record.asked : 0;

  const breakdown = useMemo(
    () => sessionBreakdown(profile, summary.outcomes, summary.deltas, 6),
    [profile, summary.outcomes, summary.deltas],
  );
  const promotions = useMemo(
    () => Array.from(new Set(summary.promotions)).map((id) => CONCEPTS.resolve(id)),
    [summary.promotions],
  );
  const next = useMemo(
    () => focusAreas(profile, settings, makeRng(record.endedAt), 3),
    [profile, settings, record.endedAt],
  );

  const verdict =
    accuracy >= 0.9
      ? 'Sharp session.'
      : accuracy >= 0.7
        ? 'Solid session.'
        : accuracy >= 0.5
          ? 'Useful session — plenty to chew on.'
          : 'Hard session. That is where the work is.';

  return (
    <div className="stack">
      <TopBar title="Session complete" onBack={onHome} />

      <section className="card stack">
        <div>
          <div className="eyebrow">Accuracy</div>
          <div className="display" style={{ fontSize: '2.75rem' }}>
            {record.asked ? pct(accuracy) : '—'}
          </div>
          <p className="muted small">{verdict}</p>
        </div>
        <Meter value={accuracy} tone={accuracy >= 0.75 ? 'ok' : accuracy >= 0.5 ? 'accent' : 'bad'} />
      </section>

      <div className="stats">
        <Stat value={record.asked} label="Questions" />
        <Stat value={record.correct} label="Correct" />
        <Stat value={record.hints} label="Hints used" />
        <Stat value={formatClock(record.seconds)} label="Time" />
      </div>

      {promotions.length > 0 && (
        <section className="card stack stack--tight">
          <div className="eyebrow">Moved up a level</div>
          <div className="row row--wrap" style={{ gap: '0.35rem' }}>
            {promotions.map((c) => (
              <span key={c.id} className="badge badge--accent">
                {c.name}
              </span>
            ))}
          </div>
          <p className="small faint">
            These will come back harder: closer alternatives, thinner voicings, fewer cues.
          </p>
        </section>
      )}

      {breakdown.length > 0 && (
        <section className="card stack stack--tight">
          <div className="eyebrow">How each concept went</div>
          <div className="list">
            {breakdown.map((row) => {
              const missed = row.asked - row.correct;
              return (
                <div className="list__row" key={row.concept.id}>
                  <div className="grow">
                    <div className="list__name">{row.concept.name}</div>
                    <div className="list__sub">
                      {row.correct}/{row.asked} this session
                      {row.hints > 0 ? ` · ${row.hints} hint${row.hints === 1 ? '' : 's'}` : ''}
                      {row.delta > 0.08 ? ' · moving up' : row.delta < -0.04 ? ' · slipping' : ''}
                    </div>
                  </div>
                  <span className={`badge ${missed === 0 ? 'badge--ok' : missed === row.asked ? 'badge--bad' : ''}`}>
                    {missed === 0 ? 'clean' : `${missed} missed`}
                  </span>
                  <div style={{ width: '3.5rem' }}>
                    <Meter
                      value={row.strength}
                      tone={row.strength >= 0.75 ? 'ok' : row.strength >= 0.45 ? 'accent' : 'bad'}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <p className="small faint">
            The bar is how solid each one is overall, not just today.
          </p>
        </section>
      )}

      {next.length > 0 && (
        <section className="card stack stack--tight">
          <div className="eyebrow">Next time</div>
          <div className="list">
            {next.map((item) => {
              const concept = CONCEPTS.resolve(item.conceptId);
              return (
                <div className="list__row" key={item.conceptId}>
                  <div className="grow">
                    <div className="list__name">{concept.name}</div>
                    <div className="list__sub">{REASON_LABEL[item.reason]}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <div className="stack stack--tight">
        <Button variant="primary" size="lg" block onClick={onAgain}>
          Practise again
        </Button>
        <div className="row" style={{ gap: '0.5rem' }}>
          <Button block onClick={onProgress}>
            Progress
          </Button>
          <Button block onClick={onHome}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
