import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { useApp } from '../state';
import { SessionEngine, type SessionSummary } from '../../session/engine';
import { buildDailyQuestions, dailyNumber, dailySettings } from '../../session/daily';
import { AnswerGrid } from '../components/AnswerGrid';
import { Button, TopBar } from '../components/ui';
import { CheckIcon, CrossIcon, HintIcon, NextIcon, ReplayIcon } from '../components/Icons';
import { formatClock } from '../../lib/util';

export function SessionScreen({
  daily,
  onFinish,
  onExit,
}: {
  /** Day key when this run is the Daily, otherwise null. */
  daily: string | null;
  onFinish: (summary: SessionSummary) => void;
  onExit: () => void;
}) {
  const { settings, profile, performer, setProfile, audioReady, unlockAudio } = useApp();
  const engineRef = useRef<SessionEngine | null>(null);
  if (!engineRef.current) {
    // The Daily is built from the date alone, under its own fixed settings, so
    // that everyone playing today works through exactly the same ten questions.
    const script = daily ? buildDailyQuestions(daily, settings) : null;
    engineRef.current = new SessionEngine({
      settings: daily ? dailySettings(settings) : settings,
      profile,
      performer,
      onProfileChange: setProfile,
      ...(script && daily ? { script, daily } : {}),
    });
  }
  const engine = engineRef.current;
  const state = useSyncExternalStore(engine.subscribe, engine.getState);
  const finishedRef = useRef(false);

  useEffect(() => {
    engine.start();
    return () => engine.dispose();
  }, [engine]);

  useEffect(() => {
    if (state.phase === 'finished' && state.summary && !finishedRef.current) {
      finishedRef.current = true;
      onFinish(state.summary);
    }
  }, [state.phase, state.summary, onFinish]);

  // Feedback waits for a tap by default: it names the chord, spells it out and
  // lists the notes that sounded, and that is the moment the learning happens.
  // Only when the user has explicitly asked for speed does a correct answer
  // move on by itself, and even then with long enough to read the answer.
  useEffect(() => {
    if (!settings.autoAdvance) return;
    if (state.phase !== 'feedback' || !state.outcome?.correct) return;
    const timer = window.setTimeout(() => engine.next(), 2000);
    return () => window.clearTimeout(timer);
  }, [state.phase, state.outcome, settings.autoAdvance, engine]);

  const quit = useCallback(() => {
    if (state.asked > 0) engine.finish();
    else {
      engine.dispose();
      onExit();
    }
  }, [engine, onExit, state.asked]);

  // Desktop shortcuts: digits answer, R replays, H hints, Enter moves on.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === 'r') {
        engine.replay();
        return;
      }
      if (key === 'h') {
        engine.useHint();
        return;
      }
      if (key === 'enter' || key === ' ') {
        if (state.phase === 'feedback') {
          e.preventDefault();
          engine.next();
        }
        return;
      }
      if (state.phase !== 'question' || !state.question) return;
      const digit = Number(key);
      if (!Number.isInteger(digit) || digit < 1) return;
      const field =
        state.question.fields.find((f) => state.answers[f.key] === undefined) ??
        state.question.fields[0];
      const option = field.options[digit - 1];
      if (option) engine.select(field.key, option.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [engine, state.phase, state.question, state.answers]);

  if (state.error) {
    return (
      <div className="app">
        <TopBar title="Practice" onBack={onExit} />
        <div className="card stack">
          <p>{state.error}</p>
          <Button variant="primary" onClick={onExit}>
            Back
          </Button>
        </div>
      </div>
    );
  }

  const question = state.question;
  const revealed = state.phase === 'feedback';
  const total = state.untimed
    ? state.plannedQuestions
    : (settings.questionLimit ?? state.plannedQuestions);
  const progress = state.untimed || settings.questionLimit
    ? state.asked / Math.max(1, total)
    : 1 - state.remainingSeconds / Math.max(1, settings.durationMinutes * 60);

  return (
    <div className="app app--session">
      <TopBar
        title={
          state.daily
            ? `Daily No. ${dailyNumber(state.daily)}`
            : question
              ? `Question ${state.index + 1}`
              : 'Practice'
        }
        right={
          <Button size="sm" variant="ghost" onClick={quit}>
            End
          </Button>
        }
      />

      <div className="session">
        <div className="session__head">
          <div className="progressbar">
            <div
              className="progressbar__fill"
              style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
            />
          </div>
          <div className="session__meta">
            <span>
              {state.index + 1}
              {total ? ` / ${state.untimed ? total : `~${total}`}` : ''}
            </span>
            <span className="grow" />
            <span>
              {state.correct}/{state.asked} correct
            </span>
            {/* No countdown on the Daily — it is untimed by design. */}
            {!state.untimed && <span>{formatClock(state.remainingSeconds)}</span>}
          </div>
        </div>

        {!audioReady && (
          <Button variant="primary" block onClick={() => void unlockAudio()}>
            Tap to enable sound
          </Button>
        )}

        {question && (
          <>
            <div className="prompt">
              <div className="row" style={{ gap: '0.55rem', alignItems: 'flex-start' }}>
                {state.playing && <span className="playing-dot" style={{ marginTop: '0.55rem' }} />}
                <div className="grow">
                  <div className="prompt__title">{question.prompt.title}</div>
                  {question.prompt.sub && <div className="prompt__sub">{question.prompt.sub}</div>}
                </div>
              </div>
              <div className="transport">
                <Button onClick={() => engine.replay()}>
                  <ReplayIcon size={18} />
                  Replay
                </Button>
                {question.hint && settings.hintsEnabled && (
                  <Button
                    onClick={() => engine.useHint()}
                    disabled={revealed}
                    title={question.hint.description}
                  >
                    <HintIcon size={18} />
                    {state.hintUsed ? 'Hint again' : question.hint.label}
                  </Button>
                )}
              </div>
            </div>

            <div className="answers">
              <div className="answers__inner">
                {question.fields.map((field, fieldIndex) => (
                  <AnswerGrid
                    key={field.key}
                    field={field}
                    selected={state.answers[field.key]}
                    revealed={revealed}
                    correctId={question.correct[field.key]}
                    onSelect={(optionId) => engine.select(field.key, optionId)}
                    note={
                      !revealed &&
                      question.fields.length > 1 &&
                      question.fields.findIndex((f) => state.answers[f.key] === undefined) ===
                        fieldIndex
                        ? 'Choose'
                        : undefined
                    }
                  />
                ))}
              </div>
            </div>

            {revealed && state.outcome && (
              <div className={`feedback feedback--${state.outcome.correct ? 'right' : 'wrong'}`}>
                <div className="row row--between">
                  <span className="feedback__verdict row" style={{ gap: '0.35rem' }}>
                    {state.outcome.correct ? <CheckIcon size={16} /> : <CrossIcon size={16} />}
                    {state.outcome.correct ? 'Correct' : 'Not quite'}
                  </span>
                  {state.outcome.hintUsed && <span className="badge">Hint used</span>}
                </div>
                <div>
                  <div className="feedback__heading">{question.reveal.heading}</div>
                  <div className="feedback__detail">{question.reveal.detail}</div>
                  {question.reveal.notes && (
                    <div className="feedback__notes">{question.reveal.notes}</div>
                  )}
                </div>
                <div className="transport">
                  <Button onClick={() => engine.playReveal()}>
                    <ReplayIcon size={18} />
                    Hear again
                  </Button>
                  <Button variant="primary" onClick={() => engine.next()}>
                    Next
                    <NextIcon size={18} />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
