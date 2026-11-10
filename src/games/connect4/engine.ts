// Connect Four: 7 columns, 6 rows. Index = row * 7 + col, row 0 at the top.
import type { MctsGame } from "../mcts";

export const COLS = 7, ROWS = 6;
export interface C4 { b: Int8Array; side: 1 | -1; last: number; count: number }
export const start = (): C4 => ({ b: new Int8Array(42), side: 1, last: -1, count: 0 });
export const clone = (s: C4): C4 => ({ b: s.b.slice(), side: s.side, last: s.last, count: s.count });
export const canDrop = (s: C4, c: number): boolean => s.b[c] === 0;
export const moves = (s: C4): number[] => [3, 2, 4, 1, 5, 0, 6].filter((c) => canDrop(s, c));

export function drop(s: C4, c: number): number {
  for (let r = ROWS - 1; r >= 0; r--) {
    const i = r * COLS + c;
    if (!s.b[i]) { s.b[i] = s.side; s.last = i; s.count++; s.side = -s.side as 1 | -1; return i; }
  }
  return -1;
}

/** Cells of the winning line through `i`, or null. */
export function line(b: Int8Array, i: number): number[] | null {
  const v = b[i];
  if (!v) return null;
  const r = Math.floor(i / COLS), c = i % COLS;
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    const cells = [i];
    for (const sgn of [1, -1]) {
      let rr = r + dr * sgn, cc = c + dc * sgn;
      while (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS && b[rr * COLS + cc] === v) { cells.push(rr * COLS + cc); rr += dr * sgn; cc += dc * sgn; }
    }
    if (cells.length >= 4) return cells;
  }
  return null;
}
export function winner(s: C4): number | null {
  if (s.last >= 0 && line(s.b, s.last)) return s.b[s.last];
  return s.count === 42 ? 0 : null;
}

export const game: MctsGame<C4, number> = {
  moves,
  play: (s, m) => { const n = clone(s); drop(n, m); return n; },
  toMove: (s) => s.side,
  winner,
  rollout(s) {
    const n = clone(s);
    for (;;) {
      const w = winner(n);
      if (w !== null) return w;
      // Light heuristic: win immediately or block an immediate loss, otherwise random.
      const ms = moves(n);
      let pick = -1;
      for (const target of [n.side, -n.side]) {
        for (const m of ms) {
          const t = clone(n); t.side = target as 1 | -1; drop(t, m);
          if (line(t.b, t.last)) { pick = m; break; }
        }
        if (pick >= 0) break;
      }
      drop(n, pick >= 0 ? pick : ms[Math.floor(Math.random() * ms.length)]);
    }
  },
};
