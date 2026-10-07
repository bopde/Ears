export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export const mod = (n: number, m: number) => ((n % m) + m) % m;

export const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

export const mean = (xs: readonly number[]) => (xs.length ? sum(xs) / xs.length : 0);

export const uniq = <T>(xs: readonly T[]) => Array.from(new Set(xs));

export function byId<T extends { id: string }>(items: readonly T[]): Map<string, T> {
  return new Map(items.map((i) => [i.id, i]));
}

/** Groups items by a key, preserving insertion order of both keys and items. */
export function groupBy<T, K extends string>(items: readonly T[], key: (item: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = out.get(k);
    if (list) list.push(item);
    else out.set(k, [item]);
  }
  return out;
}

/** Formats a duration in seconds as m:ss. */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function pct(n: number, digits = 0): string {
  return `${(n * 100).toFixed(digits)}%`;
}
