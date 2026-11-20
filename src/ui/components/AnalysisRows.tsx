import { Fragment, useState } from 'react';
import { clsx } from './ui';
import type { RevealRow, SoundedChord } from '../../exercises/types';

/**
 * One chord as it sounded: the bass apart, then the stack with its degrees.
 *
 * The degrees sit under the names rather than beside them so the two lines
 * line up column by column, which is the only way to read which degree
 * belongs to which note without counting.
 */
export function Sounded({ played }: { played: SoundedChord }) {
  return (
    <div className="sounded">
      {played.bass && (
        <span className="sounded__bass">
          <span className="sounded__label">Bass</span>
          {played.bass}
        </span>
      )}
      <span className="sounded__stack">
        {played.notes.map((name, i) => (
          <span
            key={`${name}-${i}`}
            className={clsx('sounded__note', played.added?.includes(i) && 'sounded__note--added')}
          >
            <span className="sounded__name">{name}</span>
            <span className="sounded__degree">{played.degrees[i]}</span>
          </span>
        ))}
      </span>
    </div>
  );
}

/**
 * The chords of a progression, one per row, each opening to show its notes.
 *
 * Folded away by default because the answer is the progression, not the
 * notes: someone who got it right wants the numerals and nothing else, and
 * someone who did not wants to open the chord they lost.
 */
export function RevealRows({ rows }: { rows: RevealRow[] }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="revrows">
      {rows.map((row, i) => (
        <Fragment key={i}>
          {row.key && <div className="revkey">{row.key}:</div>}
          <div
            className={clsx(
              'revrow',
              row.target && 'revrow--target',
              // The bracket is one line drawn down the left of two rows:
              // the top half on the ii, the bottom half on its V.
              row.pair && 'revrow--pairTop',
              rows[i - 1]?.pair && 'revrow--pairEnd',
            )}
          >
            <button
              type="button"
              className="revrow__head"
              onClick={() => setOpen(open === i ? null : i)}
              aria-expanded={open === i}
            >
              <span className="revrow__roman">{row.roman}</span>
              <span className="revrow__symbol">{row.symbol}</span>
              {row.tag && <span className="revrow__tag">{row.tag}</span>}
              {row.note && <span className="revrow__note">{row.note}</span>}
              {row.bass && <span className="revrow__bottom">{row.bass} in the bass</span>}
              {!row.bass && row.bottom && (
                <span className="revrow__bottom">{row.bottom} on the bottom</span>
              )}
              <span className="revrow__arrow" aria-hidden>{ARROW[row.arrow ?? 'none']}</span>
              <span className="revrow__more">{open === i ? '−' : '+'}</span>
            </button>
            {open === i && <Sounded played={row.played} />}
          </div>
        </Fragment>
      ))}
    </div>
  );
}

/** Solid down a fifth, dashed down a half step, nothing otherwise. */
const ARROW: Record<string, string> = { fifth: '→', half: '⇢', none: '' };
