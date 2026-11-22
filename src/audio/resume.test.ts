// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioEngine, IDLE_RELEASE_MS } from './engine';
import { Performer } from './performer';

/**
 * What the app does with the device's audio session, which on iOS is a
 * thing you hold rather than a thing you use.
 *
 * Holding it is what makes the mute switch not apply — the original fix,
 * and it works. Holding it with nothing to play is what put the app on
 * the lock screen with a dead play button and the orange dot in the
 * status bar, all night, for anyone who left the tab open.
 *
 * jsdom has no Web Audio and no media playback, so both are stood in for.
 * What is under test is which of the two the engine reaches for, and when
 * it lets go.
 */

type State = AudioContextState | 'interrupted';

class FakeContext extends EventTarget {
  state: State = 'running';
  sampleRate = 48000;
  destination = node() as unknown as AudioDestinationNode;
  resumed = 0;
  suspended = 0;
  currentTime = 0;

  resume(): Promise<void> {
    this.resumed += 1;
    this.state = 'running';
    this.dispatchEvent(new Event('statechange'));
    return Promise.resolve();
  }

  suspend(): Promise<void> {
    this.suspended += 1;
    this.state = 'suspended';
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
 * test of what the app does with the audio session should not have to be
 * edited every time the chain grows a filter.
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
  pauses = 0;
  constructor(public src: string) {
    played.push(this);
  }

  setAttribute(): void {}

  play(): Promise<void> {
    this.plays += 1;
    this.paused = false;
    return Promise.resolve();
  }

  pause(): void {
    this.pauses += 1;
    this.paused = true;
  }
}

/** Safari 17 and later. Absent by default, as on an older phone. */
function withAudioSession(): { type: string } {
  const session = { type: 'auto' };
  Object.defineProperty(navigator, 'audioSession', { value: session, configurable: true });
  return session;
}

/** The lock-screen entry, which is the thing a listener actually complains about. */
function withMediaSession(): { playbackState: string; metadata: unknown } {
  const media = { playbackState: 'playing', metadata: {} };
  Object.defineProperty(navigator, 'mediaSession', { value: media, configurable: true });
  return media;
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

const visibility = (value: 'visible' | 'hidden') => {
  Object.defineProperty(document, 'visibilityState', { value, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  visibility('visible');
  Reflect.deleteProperty(navigator, 'audioSession');
  Reflect.deleteProperty(navigator, 'mediaSession');
});

describe('the app holds the audio session only while it is playing', () => {
  it('says what the audio is for, and keeps nothing playing to say it', async () => {
    const session = withAudioSession();
    const { engine } = rig();
    await engine.unlock();

    // From Safari 17 this is the whole mechanism — the mute switch does
    // not apply to playback audio. A looping element would say the same
    // thing and charge the lock screen for it.
    expect(session.type).toBe('playback');
    expect(played, 'nothing had to be kept playing').toHaveLength(0);
    expect(engine.holdingAudio).toBe(true);
  });

  it('falls back to the silent loop where Safari cannot be told', async () => {
    const { engine } = rig();
    await engine.unlock();
    expect(played, 'a keep-alive element exists').toHaveLength(1);
    expect(played[0].paused, 'and it is playing').toBe(false);
    expect(engine.holdingAudio).toBe(true);
  });

  it('gives it back when the page goes away', async () => {
    const session = withAudioSession();
    const media = withMediaSession();
    const { ctx, engine } = rig();
    await engine.unlock();

    visibility('hidden');
    expect(engine.holdingAudio, 'released').toBe(false);
    expect(ctx.suspended, 'the context was suspended').toBe(1);
    expect(session.type, 'and the session handed back').toBe('auto');
    expect(media.playbackState, 'the lock-screen entry cleared').toBe('none');
    expect(media.metadata).toBeNull();
  });

  it('gives it back on pagehide, and pauses the loop with it', async () => {
    const { ctx, engine } = rig();
    await engine.unlock();

    window.dispatchEvent(new Event('pagehide'));
    expect(played[0].paused, 'the keep-alive stopped').toBe(true);
    expect(ctx.suspended).toBe(1);
    expect(engine.holdingAudio).toBe(false);
  });

  it('gives it back after a minute with nothing to play', async () => {
    vi.useFakeTimers();
    const { ctx, engine } = rig();
    await engine.unlock();

    await vi.advanceTimersByTimeAsync(IDLE_RELEASE_MS - 1000);
    expect(engine.holdingAudio, 'still held, a second short').toBe(true);
    await vi.advanceTimersByTimeAsync(2000);
    expect(engine.holdingAudio, 'let go').toBe(false);
    expect(ctx.suspended).toBe(1);
    expect(played[0].paused).toBe(true);
  });

  it('waits for a long progression to finish ringing out', async () => {
    vi.useFakeTimers();
    const { engine } = rig();
    await engine.unlock();

    // A voice that has not died away yet. The clock the engine reads is
    // the context's, which the fake leaves at zero.
    engine.track({ stop: () => {} }, 30);
    await vi.advanceTimersByTimeAsync(IDLE_RELEASE_MS + 1000);
    expect(engine.holdingAudio, 'something was still sounding').toBe(true);

    engine.stopAll();
    await vi.advanceTimersByTimeAsync(IDLE_RELEASE_MS + 1000);
    expect(engine.holdingAudio, 'and now nothing is').toBe(false);
  });

  it('starts the minute again at each note, not at the first', async () => {
    vi.useFakeTimers();
    const { engine } = rig();
    await engine.unlock();

    for (let i = 0; i < 3; i += 1) {
      await vi.advanceTimersByTimeAsync(IDLE_RELEASE_MS - 5000);
      engine.track({ stop: () => {} }, 0);
    }
    expect(engine.holdingAudio, 'kept alive by the playing').toBe(true);
    await vi.advanceTimersByTimeAsync(IDLE_RELEASE_MS + 1000);
    expect(engine.holdingAudio).toBe(false);
  });
});

describe('coming back does not take the audio again', () => {
  it('resumes nothing when the page becomes visible', async () => {
    const session = withAudioSession();
    const { ctx, engine } = rig();
    await engine.unlock();
    visibility('hidden');
    const resumed = ctx.resumed;

    visibility('visible');
    window.dispatchEvent(new Event('pageshow'));
    ctx.interrupt();

    // The app came back because somebody switched to it, not because they
    // asked for a sound. Taking the audio session here is what put the app
    // on the lock screen for the rest of the day.
    expect(ctx.resumed, 'nothing resumed the context').toBe(resumed);
    expect(session.type, 'and nothing claimed the session').toBe('auto');
    expect(engine.holdingAudio).toBe(false);
  });

  it('leaves the loop paused until something wants to play', async () => {
    const { engine } = rig();
    await engine.unlock();
    visibility('hidden');
    const plays = played[0].plays;

    visibility('visible');
    window.dispatchEvent(new Event('pageshow'));
    expect(played[0].paused, 'still paused').toBe(true);
    expect(played[0].plays).toBe(plays);
    expect(engine.holdingAudio).toBe(false);
  });

  it('spends no tap on it either', async () => {
    vi.useFakeTimers();
    const { engine } = rig();
    await engine.unlock();
    visibility('hidden');
    visibility('visible');
    await vi.advanceTimersByTimeAsync(500);

    const spy = vi.spyOn(engine, 'unlock');
    window.dispatchEvent(new Event('pointerdown'));
    window.dispatchEvent(new Event('touchend'));
    expect(spy, 'a tap on nothing in particular is not a request for sound')
      .not.toHaveBeenCalled();
  });
});

describe('the next tap on something that plays takes it back', () => {
  it('restores playback after a release — the mute switch fix, kept', async () => {
    const session = withAudioSession();
    const media = withMediaSession();
    const { ctx, engine } = rig();
    await engine.unlock();
    visibility('hidden');
    expect(session.type).toBe('auto');
    expect(ctx.state).toBe('suspended');

    visibility('visible');
    await engine.unlock();

    // What the silent-switch fix needs, and all of it: the session is
    // "playback" again before anything is scheduled, so the first tap
    // sounds without a trip through Notification Centre.
    expect(session.type).toBe('playback');
    expect(ctx.state).toBe('running');
    expect(engine.holdingAudio).toBe(true);
    expect(media.playbackState, 'and it is playing again').toBe('none');
  });

  it('restarts the silent loop too, where that is the mechanism', async () => {
    const { ctx, engine } = rig();
    await engine.unlock();
    visibility('hidden');
    expect(played[0].paused).toBe(true);

    visibility('visible');
    await engine.unlock();
    expect(played, 'the same element, not another one').toHaveLength(1);
    expect(played[0].paused, 'playing again').toBe(false);
    expect(ctx.state).toBe('running');
  });

  it('takes it back before the phrase it is taking it back for', async () => {
    const { ctx, engine } = rig();
    await engine.unlock();
    visibility('hidden');

    // Every phrase the app plays starts from an origin, and the origin is
    // worked out inside the tap that asked for it. So this is the moment
    // the audio has to come back, and it is a gesture.
    const perf = new Performer(engine);
    const spy = vi.spyOn(engine, 'acquire');
    const at = perf.origin();

    expect(spy, 'the session was taken back').toHaveBeenCalled();
    expect(ctx.state, 'and the context is running').toBe('running');
    expect(engine.holdingAudio).toBe(true);
    expect(at, 'the phrase starts a little after now').toBeGreaterThan(0);

    // And a note scheduled right behind it is not dropped on the floor by
    // a context that has not finished waking up. A suspended context that
    // has been asked to resume is still suspended for a moment, and a
    // player that waits for the clock loses the question that woke it.
    expect(engine.live, 'there is somewhere to schedule').toBe(true);
    const tracked = vi.spyOn(engine, 'track');
    ctx.state = 'suspended';
    perf.note(60, at, 1);
    expect(tracked, 'the note was scheduled, not dropped').toHaveBeenCalled();
  });

  it('gives it back again when the player says it has finished', async () => {
    const session = withAudioSession();
    const { ctx, engine } = rig();
    await engine.unlock();
    const perf = new Performer(engine);
    perf.origin();

    perf.release();
    expect(engine.holdingAudio).toBe(false);
    expect(session.type).toBe('auto');
    expect(ctx.suspended).toBe(1);
  });
});
