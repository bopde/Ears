import { useEffect, useRef, useState } from 'react';
import type { DailyResult } from '../../learning/model';
import { dailyShareText, shareText, type ShareOutcome } from '../../session/share';
import { Button } from './ui';
import { ShareIcon } from './Icons';

/**
 * Hands a Daily result to the share sheet, or the clipboard where there is no
 * sheet. If neither works the text is shown so it can be copied by hand —
 * better than a dead button.
 */
export function ShareDaily({
  result,
  block,
  size = 'md',
}: {
  result: DailyResult;
  block?: boolean;
  size?: 'sm' | 'md';
}) {
  const [outcome, setOutcome] = useState<ShareOutcome | null>(null);
  const text = dailyShareText(result);
  // The confirmation clears itself, but the button often sits on a screen the
  // user leaves straight after sharing, so the timer is cancelled on unmount.
  const resetTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    },
    [],
  );

  const send = async () => {
    const next = await shareText(text);
    setOutcome(next);
    if (next === 'copied') {
      if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
      resetTimer.current = window.setTimeout(() => setOutcome(null), 2500);
    }
  };

  return (
    <>
      <Button block={block} size={size} onClick={() => void send()}>
        <ShareIcon size={size === 'sm' ? 15 : 18} />
        Share result
      </Button>
      {outcome === 'copied' && <p className="small faint">Copied to the clipboard.</p>}
      {outcome === 'failed' && (
        <>
          <p className="small faint">
            This browser will not share or copy for us. Here it is to copy by hand:
          </p>
          <pre className="sharetext">{text}</pre>
        </>
      )}
    </>
  );
}
