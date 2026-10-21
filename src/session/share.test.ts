import { describe, expect, it } from 'vitest';
import { dailyShareText, marksToSquares } from './share';
import type { DailyResult } from '../learning/model';

const result = (over: Partial<DailyResult> = {}): DailyResult => ({
  day: '2026-10-15',
  correct: 7,
  total: 10,
  hints: 2,
  seconds: 240,
  completedAt: Date.now(),
  marks: 'cchxcxchcc',
  ...over,
});

describe('the shared grid', () => {
  it('maps each answer to a square', () => {
    expect(marksToSquares('chx')).toBe('\u{1F7E9}\u{1F7E8}\u{1F7E5}');
    expect(Array.from(marksToSquares('cchxcxchcc'))).toHaveLength(10);
  });

  it('falls back rather than dropping an unknown mark', () => {
    expect(Array.from(marksToSquares('c?x'))).toHaveLength(3);
  });
});

describe('the shared text', () => {
  it('leads with the puzzle number and the score', () => {
    const lines = dailyShareText(result(), 'https://example.test/Ears/').split('\n');
    expect(lines[0]).toBe('Ears Daily No. 288');
    expect(lines[1]).toBe('7/10 · 2 with a hint');
    expect(lines).toContain(marksToSquares('cchxcxchcc'));
    expect(lines[lines.length - 1]).toBe('https://example.test/Ears/');
  });

  it('says nothing about hints when none were used', () => {
    expect(dailyShareText(result({ hints: 0 }), 'u').split('\n')[1]).toBe('7/10');
  });

  it('gives away none of the questions', () => {
    const text = dailyShareText(result(), 'u');
    for (const giveaway of ['Dorian', 'ii', 'V7', 'maj7', 'interval', 'chord']) {
      expect(text.toLowerCase(), `leaks "${giveaway}"`).not.toContain(giveaway.toLowerCase());
    }
  });

  it('still works for a result recorded before sharing existed', () => {
    const text = dailyShareText(result({ marks: undefined }), 'u');
    expect(text).toContain('7/10');
    expect(text).not.toContain('\u{1F7E9}');
  });

  it('leaves the link out when there is nowhere to point at', () => {
    expect(dailyShareText(result(), '')).not.toContain('http');
  });
});
