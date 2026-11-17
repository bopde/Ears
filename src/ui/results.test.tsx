// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AppContext, type AppValue } from './state';
import { Results } from './screens/Results';
import { splitSession } from './screens/Results';
import { FakePerformer } from '../test-support';
import { AudioEngine } from '../audio/engine';
import { emptyProfile } from '../learning/model';
import { normaliseSettings } from '../session/settings';
import { CONCEPTS } from '../music/catalog';
import type { SessionSummary } from '../session/engine';
import type { SessionConceptRow } from '../learning/stats';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mounted: Array<{ root: Root; host: HTMLElement }> = [];

/** Real concept ids, so the rows carry the names a learner would read. */
const ids = CONCEPTS.all().map((c) => c.id);

type Result = [id: string, asked: number, correct: number];

function summaryOf(results: readonly Result[]): SessionSummary {
  const outcomes: SessionSummary['outcomes'] = {};
  const deltas: Record<string, number> = {};
  let asked = 0;
  let correct = 0;
  results.forEach(([id, a, c], i) => {
    outcomes[id] = { asked: a, correct: c, hints: 0 };
    // A spread of movements, so the tie-break on strength gain has
    // something to break ties with.
    deltas[id] = (i % 3) * 0.06;
    asked += a;
    correct += c;
  });
  return {
    record: {
      id: 'test', startedAt: 0, endedAt: 1, seconds: 300,
      asked, correct, hints: 0, types: ['chord-quality'], adaptive: true, deltas,
    },
    deltas,
    outcomes,
    promotions: [],
  };
}

function screen(results: readonly Result[]): HTMLElement {
  const profile = emptyProfile();
  const value: AppValue = {
    profile,
    setProfile: () => {},
    resetProfile: () => {},
    settings: normaliseSettings(profile.settings),
    updateSettings: () => {},
    engine: new AudioEngine(),
    performer: new FakePerformer().asPerformer(),
    audioReady: true,
    unlockAudio: async () => {},
    storageOk: false,
  };
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      <AppContext.Provider value={value}>
        <Results
          summary={summaryOf(results)}
          onAgain={() => {}}
          onHome={() => {}}
          onProgress={() => {}}
        />
      </AppContext.Provider>,
    );
  });
  mounted.push({ root, host });
  return host;
}

/**
 * The rows of the card under a heading, by the names they print.
 *
 * A heading is either an eyebrow over a card or the summary line of a
 * fold, because "All concepts this session" is one of these and the rest
 * are the other.
 */
function section(host: HTMLElement, heading: string): string[] | null {
  const found = [...host.querySelectorAll('.eyebrow, details.disclosure > summary > span')]
    .find((el) => el.textContent?.trim() === heading);
  if (!found) return null;
  const card = found.closest('section');
  return [...(card?.querySelectorAll('.list__name') ?? [])].map((el) => el.textContent ?? '');
}

const badges = (host: HTMLElement) =>
  [...host.querySelectorAll('.badge')].map((el) => el.textContent ?? '');

afterEach(() => {
  for (const { root, host } of mounted.splice(0)) {
    act(() => root.unmount());
    host.remove();
  }
});

describe('the results screen leads with what went well', () => {
  it('shows what went best and what was hardest, and nothing in both', () => {
    // Five, not six: with six the top three and the bottom three do not
    // meet, and a split that simply took both ends would pass anyway.
    const host = screen([
      [ids[0], 4, 4], [ids[1], 4, 3], [ids[2], 3, 2], [ids[3], 5, 2], [ids[4], 4, 1],
    ]);
    const best = section(host, 'Went best');
    const hardest = section(host, 'Hardest today');
    expect(best, 'a "Went best" section').not.toBeNull();
    expect(hardest, 'a "Hardest today" section').not.toBeNull();
    expect(best!.length).toBeGreaterThan(0);
    expect(hardest!.length).toBeGreaterThan(0);
    expect(best!.length).toBeLessThanOrEqual(3);
    expect(hardest!.length).toBeLessThanOrEqual(3);
    for (const name of best!) {
      expect(hardest, `${name} is in both lists`).not.toContain(name);
    }
    // And the one that went best is listed first, above the hard ones.
    const order = host.innerHTML;
    expect(order.indexOf('Went best')).toBeLessThan(order.indexOf('Hardest today'));
    // The old screen stopped at six concepts; the fold holds them all.
    expect(section(host, 'How it went'), 'no combined list when both have rows').toBeNull();
  });

  it('says only what went best when nothing was missed', () => {
    const host = screen([[ids[0], 4, 4], [ids[1], 3, 3], [ids[2], 2, 2]]);
    expect(section(host, 'Went best')).not.toBeNull();
    expect(section(host, 'Hardest today'), 'nothing was hard').toBeNull();
    expect(host.textContent).toContain('Sharp session.');
  });

  it('says only what was hardest when nothing went right', () => {
    const host = screen([[ids[0], 4, 0], [ids[1], 3, 0], [ids[2], 2, 0]]);
    expect(section(host, 'Went best'), 'nothing went best').toBeNull();
    expect(section(host, 'Hardest today')).not.toBeNull();
    // The verdict at the top no longer tells them that is where the work is.
    expect(host.textContent)
      .toContain('Hard session — the ones below are where the next gains are.');
  });

  it('never counts the misses back at the learner', () => {
    const host = screen([
      [ids[0], 4, 4], [ids[1], 4, 1], [ids[2], 5, 2], [ids[3], 2, 0], [ids[4], 1, 0],
    ]);
    for (const badge of badges(host)) {
      expect(badge, 'a badge that counts misses').not.toContain('missed');
    }
    // Every count reads "N of M" instead.
    const counts = badges(host).filter((b) => / of /.test(b));
    expect(counts.length, 'rows counted as N of M').toBeGreaterThan(3);
    expect(counts).toContain('4 of 4');
    expect(counts).toContain('1 of 4');
  });

  it('folds the full list away, most asked first', () => {
    const host = screen([
      [ids[0], 2, 2], [ids[1], 7, 4], [ids[2], 4, 1], [ids[3], 3, 3], [ids[4], 1, 0],
    ]);
    const all = section(host, 'All concepts this session');
    expect(all, 'the fold is there').not.toBeNull();
    expect(all).toEqual([
      CONCEPTS.resolve(ids[1]).name,
      CONCEPTS.resolve(ids[2]).name,
      CONCEPTS.resolve(ids[3]).name,
      CONCEPTS.resolve(ids[0]).name,
      CONCEPTS.resolve(ids[4]).name,
    ]);
    // It is a <details>, so the screen opens without it in the way.
    const fold = host.querySelector('details.disclosure');
    expect(fold, 'folded rather than listed').not.toBeNull();
    expect((fold as HTMLDetailsElement).open).toBe(false);
  });

  it('shows one list when there is nothing to cut in two', () => {
    const host = screen([[ids[0], 3, 1], [ids[1], 1, 1], [ids[2], 1, 0]]);
    expect(section(host, 'Went best')).toBeNull();
    expect(section(host, 'Hardest today')).toBeNull();
    expect(section(host, 'How it went')).toHaveLength(3);
  });
});

describe('the split itself', () => {
  const row = (name: string, asked: number, correct: number, delta = 0): SessionConceptRow => ({
    concept: { id: name, kind: 'chord', name, short: name, tier: 1, tags: [] },
    asked,
    correct,
    hints: 0,
    delta,
    strength: 0.5,
  });

  it('keeps a concept asked once out of both lists', () => {
    const { best, hardest } = splitSession([
      row('a', 1, 1), row('b', 4, 4), row('c', 4, 0), row('d', 1, 0),
    ]);
    const names = [...best, ...hardest].map((r) => r.concept.name);
    expect(names).toContain('b');
    expect(names).toContain('c');
    expect(names, 'one answer is not evidence').not.toContain('a');
    expect(names, 'nor is one miss').not.toContain('d');
  });

  it('breaks a tie on today by what moved most', () => {
    const { best } = splitSession([
      row('steady', 4, 2, 0), row('rising', 4, 2, 0.2), row('sinking', 4, 2, -0.1),
      row('other', 4, 2, 0.05),
    ]);
    expect(best.map((r) => r.concept.name)[0]).toBe('rising');
  });

  it('puts a concept in one list or the other, never both', () => {
    const rows = [row('a', 4, 4), row('b', 4, 3), row('c', 4, 2), row('d', 4, 1)];
    const { best, hardest } = splitSession(rows);
    const names = [...best, ...hardest].map((r) => r.concept.name);
    expect(new Set(names).size, 'no concept counted twice').toBe(names.length);
    expect([...names].sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('gives each list something when only two qualify', () => {
    const { best, hardest, combined } = splitSession([row('a', 2, 2), row('b', 2, 0)]);
    expect(combined).toBeNull();
    expect(best.map((r) => r.concept.name)).toEqual(['a']);
    expect(hardest.map((r) => r.concept.name)).toEqual(['b']);
  });
});
