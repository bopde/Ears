// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AppContext, type AppValue } from './state';
import { SessionScreen } from './screens/Session';
import { FakePerformer } from '../test-support';
import { AudioEngine } from '../audio/engine';
import { emptyProfile } from '../learning/model';
import { normaliseSettings } from '../session/settings';

// Tells React that updates wrapped in act() are being flushed deliberately,
// so it stops warning that something outside a test might miss them.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The answer panel mounted over a stand-in performer.
 *
 * The real one wants an AudioContext, so the screen is given a recorder
 * instead; everything above the audio — the engine, the questions, the panel
 * — is the code that actually ships.
 */
function mount(): { root: Root; host: HTMLElement } {
  const profile = emptyProfile();
  const settings = normaliseSettings({
    ...profile.settings,
    exerciseTypes: ['progression', 'chord-quality'],
    answerDelay: 0,
    autoAdvance: false,
  });
  const value: AppValue = {
    profile,
    setProfile: () => {},
    resetProfile: () => {},
    settings,
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
        <SessionScreen daily={null} onFinish={() => {}} onExit={() => {}} />
      </AppContext.Provider>,
    );
  });
  return { root, host };
}

const mounted: Array<{ root: Root; host: HTMLElement }> = [];
function screen() {
  const m = mount();
  mounted.push(m);
  return m.host;
}

afterEach(() => {
  for (const m of mounted.splice(0)) {
    act(() => m.root.unmount());
    m.host.remove();
  }
});

const click = (el: Element) => act(() => {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
});

const fold = (host: HTMLElement) => host.querySelector<HTMLButtonElement>('.feedback__fold');
const detail = (host: HTMLElement) => host.querySelector<HTMLElement>('#feedback-answer');

/** Picks the first option of every field, which puts the panel on screen. */
function answer(host: HTMLElement): void {
  for (const group of host.querySelectorAll('.optgrid')) {
    const first = group.querySelector('button');
    if (first) click(first);
  }
}

describe('the answer panel folds away', () => {
  it('hides the answer and brings it back', () => {
    const host = screen();
    answer(host);
    const button = fold(host)!;
    expect(button, 'the panel has a fold control').toBeTruthy();
    expect(detail(host)!.hidden).toBe(false);
    expect(button.getAttribute('aria-expanded')).toBe('true');

    click(button);
    expect(detail(host)!.hidden, 'folded').toBe(true);
    expect(fold(host)!.getAttribute('aria-expanded')).toBe('false');

    click(fold(host)!);
    expect(detail(host)!.hidden, 'opened again').toBe(false);
    expect(fold(host)!.getAttribute('aria-expanded')).toBe('true');
  });

  it('arrives open on the next question, however the last one was left', () => {
    const host = screen();
    answer(host);
    click(fold(host)!);
    expect(detail(host)!.hidden).toBe(true);

    click([...host.querySelectorAll('button')].find((b) => /Next/.test(b.textContent ?? ''))!);
    answer(host);
    // Someone who never asked for the answer to be hidden should not have to
    // ask for it back, question after question.
    expect(detail(host)!.hidden, 'the next question shows its answer').toBe(false);
    expect(fold(host)!.getAttribute('aria-expanded')).toBe('true');
  });

  it('leaves the answer buttons and Next where they were', () => {
    const host = screen();
    answer(host);
    const marked = () =>
      host.querySelectorAll('.optgrid .opt--right, .optgrid .opt--wrong').length;
    const nextButton = () =>
      [...host.querySelectorAll('.feedback button')].find((b) => /Next/.test(b.textContent ?? ''));
    expect(marked(), 'the grid marks what was picked and what was right')
      .toBeGreaterThan(0);
    const before = marked();

    click(fold(host)!);
    // Folding is about the panel; the grid underneath it does not move, and
    // the way on is still there.
    expect(marked()).toBe(before);
    expect(nextButton(), 'Next survives the fold').toBeTruthy();
  });

  it('says which it was in a line, and nothing else', () => {
    const host = screen();
    answer(host);
    // The heading's own words, without the "played with 9" tag that sits
    // inside it: the tag is a note on the voicing, not the chord's name.
    const headingNode = host.querySelector('.feedback__heading')!.cloneNode(true) as HTMLElement;
    headingNode.querySelector('.feedback__tag')?.remove();
    const heading = headingNode.textContent!;
    click(fold(host)!);

    const bar = host.querySelector<HTMLElement>('.feedback__bar')!;
    const line = bar.textContent ?? '';
    expect(line).toMatch(/Correct|Not quite/);
    // The name moves up to the bar, so the one line left is still an answer.
    expect(host.querySelector('.feedback__name')!.textContent).toBe(heading);

    // And nothing else came with it. The pixels are measured in a browser —
    // jsdom lays nothing out — but what the row is asked to fit is this.
    expect(bar.querySelector('.sounded')).toBeNull();
    expect(bar.querySelector('.revrow')).toBeNull();
    expect(bar.querySelector('.feedback__detail')).toBeNull();
    expect(line.includes('\n'), `one line: ${JSON.stringify(line)}`).toBe(false);
  });

  it('folds the tallest answer there is', () => {
    const host = screen();
    // A progression reveal is the one that matters: it lists a row per chord
    // and in a browser it runs to 699 px at 380 px wide, which leaves the
    // answer grid no room at all. Walk on until one comes up.
    let rows = 0;
    for (let i = 0; i < 25 && rows === 0; i++) {
      answer(host);
      rows = host.querySelectorAll('.revrow').length;
      if (rows === 0) {
        const next = [...host.querySelectorAll('.feedback button')]
          .find((b) => /Next/.test(b.textContent ?? ''));
        if (!next) break;
        click(next);
      }
    }
    expect(rows, 'a progression reveal came up').toBeGreaterThan(2);

    click(fold(host)!);
    expect(detail(host)!.hidden).toBe(true);
    // The rows are inside the folded half, so they are out of the way, and
    // the grid underneath still shows which one was picked.
    expect(detail(host)!.querySelectorAll('.revrow').length).toBe(rows);
    expect(host.querySelectorAll('.optgrid .opt--right, .optgrid .opt--wrong').length)
      .toBeGreaterThan(0);
    expect(
      [...host.querySelectorAll('.feedback button')].some((b) => /Next/.test(b.textContent ?? '')),
      'and Next is still there',
    ).toBe(true);
  });

  it('is a button, labelled, and big enough to hit', () => {
    const host = screen();
    answer(host);
    const button = fold(host)!;
    expect(button.tagName).toBe('BUTTON');
    expect(button.getAttribute('type')).toBe('button');
    expect(button.getAttribute('aria-label')).toBe('Hide answer');
    expect(button.getAttribute('aria-controls')).toBe(detail(host)!.id);
    click(button);
    expect(fold(host)!.getAttribute('aria-label')).toBe('Show answer');
  });

  it('lets a keyboard work the controls instead of moving on', () => {
    const host = screen();
    answer(host);
    const button = fold(host)!;
    button.focus();
    // Enter and space are how a keyboard presses a button. The screen takes
    // them as "next question" only when nothing focused wants them, or the
    // fold control would be reachable by tab and impossible to operate.
    act(() => {
      // From the focused control, as a browser sends it — it bubbles to the
      // window listener carrying the button as its target.
      button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(host.querySelector('.feedback'), 'still on the same answer').toBeTruthy();
    expect(detail(host)!.hidden, 'and the panel did not fold by itself').toBe(false);
  });
});
