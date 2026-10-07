import { useCallback, useState } from 'react';
import { useApp, useRoute } from './state';
import { Home } from './screens/Home';
import { Setup } from './screens/Setup';
import { SessionScreen } from './screens/Session';
import { Results } from './screens/Results';
import { Progress } from './screens/Progress';
import { Settings } from './screens/Settings';
import type { SessionSummary } from '../session/engine';

export function App() {
  const [screen, navigate] = useRoute();
  const { unlockAudio } = useApp();
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  // Bumping this remounts the session screen, which is what starts a new one.
  const [runId, setRunId] = useState(0);

  const start = useCallback(async () => {
    // Safari only starts audio from inside a user gesture, so the unlock has to
    // happen on the tap that begins the session rather than when it first plays.
    await unlockAudio();
    setSummary(null);
    setRunId((n) => n + 1);
    navigate('session');
  }, [navigate, unlockAudio]);

  const finish = useCallback(
    (next: SessionSummary) => {
      setSummary(next);
      navigate(next.record.asked > 0 ? 'results' : 'home', true);
    },
    [navigate],
  );

  if (screen === 'session') {
    return <SessionScreen key={runId} onFinish={finish} onExit={() => navigate('home', true)} />;
  }

  return (
    <div className="app">
      {screen === 'home' && <Home navigate={navigate} onStart={() => void start()} />}
      {screen === 'setup' && (
        <Setup onBack={() => navigate('home')} onStart={() => void start()} />
      )}
      {screen === 'results' &&
        (summary ? (
          <Results
            summary={summary}
            onAgain={() => void start()}
            onHome={() => navigate('home', true)}
            onProgress={() => navigate('progress')}
          />
        ) : (
          <Home navigate={navigate} onStart={() => void start()} />
        ))}
      {screen === 'progress' && (
        <Progress onBack={() => navigate('home')} onStart={() => void start()} />
      )}
      {screen === 'settings' && <Settings onBack={() => navigate('home')} />}
    </div>
  );
}
