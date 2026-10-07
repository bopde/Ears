import { describe, expect, it } from 'vitest';
import { LIMITER_POST, LIMITER_PRE, makeSoftClipCurve } from './engine';
import { polyphonyGain } from './performer';

describe('output limiter', () => {
  const curve = makeSoftClipCurve();

  it('is monotonic and odd-symmetric', () => {
    // Flat once saturated, so non-decreasing rather than strictly increasing.
    for (let i = 1; i < curve.length; i++) {
      expect(curve[i], `point ${i}`).toBeGreaterThanOrEqual(curve[i - 1]);
    }
    const mid = (curve.length - 1) / 2;
    // Strictly increasing through the linear region around zero.
    for (let i = mid + 1; i < mid + 200; i++) {
      expect(curve[i], `point ${i}`).toBeGreaterThan(curve[i - 1]);
    }
    expect(Math.abs(curve[mid])).toBeLessThan(1e-6);
    expect(curve[0]).toBeCloseTo(-curve[curve.length - 1], 6);
  });

  it('cannot produce a sample beyond full scale', () => {
    // A WaveShaper clamps its input to the curve's endpoints, so the loudest
    // possible output is the last point of the curve scaled by the make-up gain.
    const loudest = Math.max(...Array.from(curve, Math.abs)) * LIMITER_POST;
    expect(loudest).toBeLessThan(1);
  });

  it('is a straight wire below the knee and only bends above it', () => {
    const through = (signal: number) => {
      const x = signal * LIMITER_PRE;
      const i = Math.round(((x + 1) / 2) * (curve.length - 1));
      return curve[Math.min(curve.length - 1, Math.max(0, i))] * LIMITER_POST;
    };
    for (const level of [0.05, 0.1, 0.3, 0.5, 0.7]) {
      expect(through(level), `level ${level} is untouched`).toBeCloseTo(level, 3);
    }
    // Loud material is rounded off rather than clipped, and stays in bounds
    // however hard it is driven.
    expect(through(1)).toBeLessThan(1);
    expect(through(1)).toBeGreaterThan(0.85);
    expect(through(1.75), 'the loudest measured chord').toBeLessThan(1);
    expect(through(2.5)).toBeLessThan(1);
    expect(through(8)).toBeLessThan(1);
  });
});

describe('polyphony gain', () => {
  it('leaves a single note alone and holds a chord to a comparable level', () => {
    expect(polyphonyGain(1)).toBe(1);
    expect(polyphonyGain(0)).toBe(1);
    for (const voices of [2, 3, 4, 5, 6, 7]) {
      const trimmed = polyphonyGain(voices);
      // Worst case the voices sum coherently; keep that inside the headroom
      // the limiter is there to catch rather than relying on it.
      expect(voices * trimmed, `${voices} voices`).toBeLessThanOrEqual(Math.sqrt(voices) * 1.01);
      expect(trimmed).toBeGreaterThan(0.3);
    }
  });
});
