import type { DailyResult } from '../learning/model';
import { dailyNumber } from './daily';

/**
 * Sharing a Daily.
 *
 * The grid says how each question went without saying what any of them were,
 * so a result can be posted somewhere the other person has not played yet.
 */
const SQUARES: Record<string, string> = {
  /** Right, cold. */
  c: '\u{1F7E9}',
  /** Right, after a hint. */
  h: '\u{1F7E8}',
  /** Wrong. */
  x: '\u{1F7E5}',
};

export function marksToSquares(marks: string): string {
  return Array.from(marks)
    .map((mark) => SQUARES[mark] ?? SQUARES.x)
    .join('');
}

/** Where this copy of the app is running, without the route on the end. */
export function appUrl(): string {
  if (typeof window === 'undefined') return '';
  const { origin, pathname } = window.location;
  return `${origin}${pathname}`;
}

export function dailyShareText(result: DailyResult, url = appUrl()): string {
  const hints =
    result.hints > 0 ? ` · ${result.hints} with a hint` : '';
  const lines = [`Ears Daily No. ${dailyNumber(result.day)}`, `${result.correct}/${result.total}${hints}`];
  if (result.marks) lines.push('', marksToSquares(result.marks));
  if (url) lines.push('', url);
  return lines.join('\n');
}

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed';

/**
 * Hands the result to the system share sheet where there is one — which on a
 * phone is the whole point — and falls back to the clipboard everywhere else.
 */
export async function shareText(text: string): Promise<ShareOutcome> {
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  if (nav && typeof nav.share === 'function') {
    try {
      await nav.share({ text });
      return 'shared';
    } catch (error) {
      // Backing out of the sheet is a decision, not a failure: do not then
      // silently copy something the user chose not to send.
      if (error instanceof Error && error.name === 'AbortError') return 'cancelled';
      // Anything else means the sheet is unusable here, so fall through.
    }
  }
  if (!nav?.clipboard?.writeText) return 'failed';
  try {
    await nav.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}
