// Small localStorage wrapper for scores and settings.
export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem("meydan." + key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}
export function save(key: string, value: unknown): void {
  try {
    localStorage.setItem("meydan." + key, JSON.stringify(value));
  } catch {
    /* storage may be unavailable */
  }
}
export interface Record { w: number; l: number; d: number; best: number }
export const record = (id: string): Record => load<Record>("rec." + id, { w: 0, l: 0, d: 0, best: 0 });
export function bump(id: string, k: "w" | "l" | "d"): void {
  const r = record(id);
  r[k]++;
  save("rec." + id, r);
}
export function best(id: string, score: number, lowerIsBetter = false): boolean {
  const r = record(id);
  const better = r.best === 0 || (lowerIsBetter ? score < r.best : score > r.best);
  if (better) {
    r.best = score;
    save("rec." + id, r);
  }
  return better;
}
