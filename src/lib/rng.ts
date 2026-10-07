/**
 * Small deterministic PRNG utilities.
 *
 * Every question is generated from an explicit Rng so that a session can be
 * replayed or unit-tested without relying on Math.random.
 */
export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [0, n). */
  int(n: number): number;
  /** Integer in [min, max] inclusive. */
  range(min: number, max: number): number;
  /** Uniform pick. Throws on an empty list so generator bugs surface early. */
  pick<T>(items: readonly T[]): T;
  /** Weighted pick; weights must be non-negative and not all zero. */
  weighted<T>(items: readonly T[], weight: (item: T) => number): T;
  /** Returns a new shuffled array (Fisher–Yates). */
  shuffle<T>(items: readonly T[]): T[];
  /** Picks up to n distinct items. */
  sample<T>(items: readonly T[], n: number): T[];
  /** True with probability p. */
  chance(p: number): boolean;
}

export function makeRng(seed: number): Rng {
  let s = seed >>> 0 || 0x9e3779b9;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng: Rng = {
    next,
    int: (n) => Math.floor(next() * n),
    range: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (items) => {
      if (items.length === 0) throw new Error('pick() called on an empty list');
      return items[Math.floor(next() * items.length)];
    },
    weighted: (items, weight) => {
      if (items.length === 0) throw new Error('weighted() called on an empty list');
      const weights = items.map((i) => Math.max(0, weight(i)));
      const total = weights.reduce((a, b) => a + b, 0);
      if (total <= 0) return rng.pick(items);
      let r = next() * total;
      for (let i = 0; i < items.length; i++) {
        r -= weights[i];
        if (r <= 0) return items[i];
      }
      return items[items.length - 1];
    },
    shuffle: (items) => {
      const out = items.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    sample: (items, n) => rng.shuffle(items).slice(0, Math.max(0, n)),
    chance: (p) => next() < p,
  };
  return rng;
}

/** Seed derived from the clock, for sessions that should not repeat. */
export function timeSeed(): number {
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
}
