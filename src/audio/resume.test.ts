// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioEngine } from './engine';

/**
 * The return from backgrounding, as iOS actually performs it.
 *
 * Leaving the app pauses the keep-alive element and interrupts the context.
 * Nothing used to restart either, so the app came back with Web Audio routed
 * as ringer audio and muted until Notification Centre was opened, which is
 * what makes iOS reset its audio session.
 *
 * jsdom has no Web Audio and no media playback, so both are stood in for.
 * What is under test is the engine's reaction, which is all that was
 * missing: whether it replays a paused element and resumes a context that
 * says it is interrupted.
 */

type State = AudioContextState | 'interrupted';

class FakeContext extends EventTarget {
  state: State = 'running';
  sampleRate = 48000;
  destination = node() as unknown as AudioDestinationNode;
  resumed = 0;
  currentTime = 0;

  resume(): Promise<void> {
    this.resumed += 1;
    this.state = 'running';
    this.dispatchEvent(new Event('statechange'));
    return Promise.resolve();
  }

  createBuffer(channels: number, length: number): AudioBuffer {
    const data = new Float32Array(length);
    return {
      length,
      numberOfChannels: channels,
      sampleRate: this.sampleRate,
      getChannelData: () => data,
    } as unknown as AudioBuffer;
  }

  interrupt(): void {
    this.state = 'interrupted';
    this.dispatchEvent(new Event('statechange'));
  }
}

/**
 * Any `create…` the master chain reaches for, answered with a node that
 * connects to anything and remembers nothing.
 *
 * A proxy rather than a list, because the list is the chain's business: a
 * test of whether audio comes back after backgrounding should not have to
 * be edited every time the chain grows a filter.
 */
const fakeContext = (): FakeContext => {
  const real = new FakeContext();
  return new Proxy(real, {
    get(target, key, receiver) {
      if (typeof key === 'string' && key.startsWith('create') && !(key in target)) {
        return () => node();
      }
      const value = Reflect.get(target, key, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
};

/** A node that connects to anything and remembers nothing. */
function node(): Record<string, unknown> {
  const param = () => ({
    value: 1,
    setValueAtTime: () => {},
    setTargetAtTime: () => {},
    linearRampToValueAtTime: () => {},
    exponentialRampToValueAtTime: () => {},
    cancelScheduledValues: () => {},
  });
  return new Proxy({} as Record<string, unknown>, {
    get(_t, key) {
      if (key === 'connect') return () => node();
      if (key === 'disconnect' || key === 'start' || key === 'stop') return () => {};
      if (key === 'oversample') return 'none';
      if (key === 'curve' || key === 'buffer') return null;
      return param();
    },
    set: () => true,
  });
}

const played: FakeAudio[] = [];

class FakeAudio {
  loop = false;
  volume = 1;
  paused = true;
  plays = 0;
  constructor(public src: string) {
    played.push(this);
  }

  setAttribute(): void {}

  play(): Promise<void> {
    this.plays += 1;
    this.paused = false;
    return Promise.resolve();
  }
}

function rig() {
  const ctx = fakeContext();
  vi.stubGlobal('AudioContext', function AudioContextStub() {
    return ctx;
  } as unknown as typeof AudioContext);
  vi.stubGlobal('Audio', FakeAudio as unknown as typeof Audio);
  played.length = 0;
  return { ctx, engine: new AudioEngine() };
}

const goAway = () => {
  // What iOS does, not what the page does: the element is paused for it.
  for (const el of played) el.paused = true;
};

const comeBack = () => {
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('the sound comes back after the app has been away', () => {
  it('replays the keep-alive element the system paused', async () => {
    const { engine } = rig();
    await engine.unlock();
    expect(played, 'a keep-alive element exists').toHaveLength(1);
    expect(played[0].paused, 'and it is playing').toBe(false);
    const before = played[0].plays;

    goAway();
    comeBack();
    expect(played[0].paused, 'it is playing again').toBe(false);
    expect(played[0].plays, 'because it was told to').toBeGreaterThan(before);
  });

  it('resumes a context the system interrupted', async () => {
    const { ctx, engine } = rig();
    await engine.unlock();
    const before = ctx.resumed;

    ctx.state = 'interrupted';
    goAway();
    comeBack();
    expect(ctx.resumed, 'resume was called').toBeGreaterThan(before);
    expect(ctx.state).toBe('running');
  });

  it('recovers on a restore from the back/forward cache too', async () => {
    const { ctx, engine } = rig();
    await engine.unlock();
    ctx.state = 'suspended';
    goAway();

    window.dispatchEvent(new Event('pageshow'));
    expect(played[0].paused).toBe(false);
    expect(ctx.state).toBe('running');
  });

  it('recovers when the context says its own state changed', async () => {
    const { ctx, engine } = rig();
    await engine.unlock();
    goAway();

    // Safari reports "interrupted" here and nowhere else, and for some
    // returns it is the only notice there is.
    ctx.interrupt();
    expect(played[0].paused, 'the element went back on').toBe(false);
    expect(ctx.state, 'and the context came back').toBe('running');
  });

  it('leaves a healthy return costing nothing', async () => {
    vi.useFakeTimers();
    const { engine } = rig();
    await engine.unlock();
    goAway();
    comeBack();
    await vi.advanceTimersByTimeAsync(300);

    // Everything recovered, so no gesture is waiting to be spent on it.
    const spy = vi.spyOn(engine, 'unlock');
    window.dispatchEvent(new Event('pointerdown'));
    expect(spy).not.toHaveBeenCalled();
  });

  it('asks the next tap for help when the system refused', async () => {
    vi.useFakeTimers();
    const { ctx, engine } = rig();
    await engine.unlock();
    // iOS refusing `play()` outside a gesture is exactly this: the calls
    // happen, nothing changes.
    for (const el of played) el.play = () => Promise.resolve();
    ctx.resume = () => Promise.resolve();
    ctx.state = 'suspended';
    goAway();
    comeBack();
    await vi.advanceTimersByTimeAsync(300);

    const spy = vi.spyOn(engine, 'unlock');
    window.dispatchEvent(new Event('pointerdown'));
    expect(spy, 'the first tap tries again, and that one is a gesture')
      .toHaveBeenCalled();
  });

  it('tells Safari what the audio is for, where it can be told', async () => {
    const session: { type: string } = { type: 'auto' };
    Object.defineProperty(navigator, 'audioSession', { value: session, configurable: true });
    const { engine } = rig();
    await engine.unlock();
    // From Safari 17 this is the whole mechanism — the mute switch does not
    // apply to playback audio, and nothing has to keep playing to say so.
    expect(session.type).toBe('playback');
    Reflect.deleteProperty(navigator, 'audioSession');
  });
});
