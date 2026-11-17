import { useMemo } from 'react';
import { useApp } from '../state';
import type { SessionSummary } from '../../session/engine';
import { Button, Disclosure, Meter, Stat, TopBar } from '../components/ui';
import { CONCEPTS } from '../../music/catalog';
import { REASON_LABEL, focusAreas } from '../../learning/selector';
import { sessionBreakdown, type SessionConceptRow } from '../../learning/stats';
import { makeRng } from '../../lib/rng';
import { formatClock, pct } from '../../lib/util';
import { dailyLabel, dailyNumber } from '../../session/daily';
import { marksToSquares } from '../../session/share';
import { ShareDaily } from '../components/ShareDaily';

/** How much of a concept went right today. */
const share = (row: SessionConceptRow) => row.correct / row.asked;

/**
 * The session cut into what went best and what was hardest.
 *
 * Two short lists rather than one long one, and a concept is in at most
 * one of them: a screen that opens with everything you missed is a screen
 * that says the session was a failure, whatever the figure above it says.
 * The best end is listed first because there usually is one.
 *
 * A concept asked once is not evidence either way, so it waits for the
 * full list at the bottom. Where that leaves fewer than two to go on
 * there is nothing to cut, and the session is shown as one list.
 */
export function splitSession(rows: readonly SessionConceptRow[]): {
  best: SessionConceptRow[];
  hardest: SessionConceptRow[];
  combined: SessionConceptRow[] | null;
} {
  const qualified = rows.filter((r) => r.asked >= 2)
    // Ties on today's results go to the one that moved most, which is the
    // difference between a concept holding steady and one coming good.
    .sort((a, b) => share(b) - share(a) || b.delta - a.delta || b.asked - a.asked);
  if (qualified.length < 2) {
    return { best: [], hardest: [], combined: rows.slice(0, 6) };
  }
  const split = Math.min(3, Math.ceil(qualified.length / 2));
  return {
    // Nothing right is not a best, and nothing missed is not a hardest,
    // so a clean session shows one section and a rough one the other.
    best: qualified.slice(0, split).filter((r) => r.correct > 0),
    hardest: [...qualified.slice(split)].reverse()
      .filter((r) => r.correct < r.asked)
      .slice(0, 3),
    combined: null,
  };
}

/**
 * One concept, as a row: what it is, how it went, how solid it is.
 *
 * The count reads "3 of 4" rather than "1 missed". The same number either
 * way, but a results screen that counts a learner's failures at them is
 * not one they come back to.
 */
function ConceptLine(
  { row, note, movement = true }:
  { row: SessionConceptRow; note?: string; movement?: boolean },
) {
  const sub = note ?? (row.hints > 0 ? `${row.hints} hint${row.hints === 1 ? '' : 's'}` : '');
  // Not among the hard ones: "slipping" beside a concept somebody has
  // just missed four times is piling on, and the line under it already
  // says what to do about it.
  const moved = !movement ? null
    : row.delta > 0.08 ? 'moving up' : row.delta < -0.04 ? 'slipping' : null;
  return (
    <div className="list__row">
      <div className="grow">
        <div className="list__name">{row.concept.name}</div>
        {sub && <div className="list__sub">{sub}</div>}
      </div>
      {moved && (
        <span className={`badge ${moved === 'moving up' ? 'badge--accent' : ''}`}>{moved}</span>
      )}
      <span className={`badge ${row.correct === row.asked ? 'badge--ok' : ''}`}>
        {row.correct} of {row.asked}
      </span>
      <div style={{ width: '3.5rem' }}>
        <Meter
          value={row.strength}
          tone={row.strength >= 0.75 ? 'ok' : row.strength >= 0.45 ? 'accent' : 'bad'}
        />
      </div>
    </div>
  );
}

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
  // The stored result is the day's score — a replay does not rewrite it, so
  // that is what gets shared.
  const dailyResult = summary.daily ? profile.dailyResults[summary.daily] : undefined;
  const accuracy = record.asked ? record.correct / record.asked : 0;

  // Every concept, not the first six: the fold at the bottom lists them
  // all, and the two sections above it pick from the whole session rather
  // than from the weakest end of it.
  const rows = useMemo(
    () => sessionBreakdown(
      profile, summary.outcomes, summary.deltas, Object.keys(summary.outcomes).length,
    ),
    [profile, summary.outcomes, summary.deltas],
  );
  // What the selector would say about each one, for the line under the
  // hard ones. A missed concept usually comes near the top of this list,
  // and where it does not there is nothing to add.
  const steps = useMemo(() => {
    const map = new Map<string, string>();
    const every = focusAreas(profile, settings, makeRng(record.endedAt), CONCEPTS.all().length);
    for (const item of every) {
      map.set(item.conceptId, REASON_LABEL[item.reason]);
    }
    return map;
  }, [profile, settings, record.endedAt]);
  const { best, hardest, combined } = useMemo(() => splitSession(rows), [rows]);
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
          : 'Hard session — the ones below are where the next gains are.';

  return (
    <div className="stack">
      <TopBar title={summary.daily ? 'Daily complete' : 'Session complete'} onBack={onHome} />

      {summary.daily && (
        <section className="card stack stack--tight">
          <div className="row row--between">
            <span className="badge badge--accent">Daily No. {dailyNumber(summary.daily)}</span>
            <span className="small faint">
              {summary.dailyRecorded
                ? `${dailyLabel(summary.daily)} \u00b7 score saved`
                : 'Replay \u00b7 today\u2019s score is unchanged'}
            </span>
          </div>
          {dailyResult?.marks && (
            <div className="sharegrid">{marksToSquares(dailyResult.marks)}</div>
          )}
          {dailyResult && <ShareDaily result={dailyResult} block />}
        </section>
      )}

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

      {best.length > 0 && (
        <section className="card stack stack--tight">
          <div className="eyebrow">Went best</div>
          <div className="list">
            {best.map((row) => <ConceptLine key={row.concept.id} row={row} />)}
          </div>
        </section>
      )}

      {hardest.length > 0 && (
        <section className="card stack stack--tight">
          <div className="eyebrow">Hardest today</div>
          <div className="list">
            {hardest.map((row) => (
              <ConceptLine
                key={row.concept.id}
                row={row}
                note={steps.get(row.concept.id)}
                movement={false}
              />
            ))}
          </div>
        </section>
      )}

      {combined && combined.length > 0 && (
        <section className="card stack stack--tight">
          <div className="eyebrow">How it went</div>
          <div className="list">
            {combined.map((row) => (
              <ConceptLine key={row.concept.id} row={row} note={steps.get(row.concept.id)} />
            ))}
          </div>
          <p className="small faint">The bar is how solid each one is overall, not just today.</p>
        </section>
      )}

      {!combined && rows.length > 0 && (
        <section className="card">
          <Disclosure
            title="All concepts this session"
            summary={`${rows.length} concept${rows.length === 1 ? '' : 's'}`}
          >
            <div className="list">
              {[...rows].sort((a, b) => b.asked - a.asked || share(a) - share(b))
                .map((row) => <ConceptLine key={row.concept.id} row={row} />)}
            </div>
            <p className="small faint">
              The bar is how solid each one is overall, not just today.
            </p>
          </Disclosure>
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
          {summary.daily ? 'Play it again' : 'Practise again'}
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
