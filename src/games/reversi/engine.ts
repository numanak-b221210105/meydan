// Reversi (Othello) on an 8x8 board. Black (1) moves first; -1 is white.
import type { MctsGame } from "../mcts";

export interface RState { b: Int8Array; side: 1 | -1; passes: number }
const DIRS = [-9, -8, -7, -1, 1, 7, 8, 9];
export function start(): RState {
  const b = new Int8Array(64);
  b[27] = -1; b[36] = -1; b[28] = 1; b[35] = 1;
  return { b, side: 1, passes: 0 };
}
export const clone = (s: RState): RState => ({ b: s.b.slice(), side: s.side, passes: s.passes });

function flipsFrom(b: Int8Array, i: number, side: number): number[] {
  if (b[i]) return [];
  const out: number[] = [];
  const r0 = i >> 3, c0 = i & 7;
  for (const d of DIRS) {
    const dr = d === -9 || d === -8 || d === -7 ? -1 : d === 7 || d === 8 || d === 9 ? 1 : 0;
    const dc = d === -9 || d === -1 || d === 7 ? -1 : d === -7 || d === 1 || d === 9 ? 1 : 0;
    const line: number[] = [];
    let r = r0 + dr, c = c0 + dc;
    while (r >= 0 && r < 8 && c >= 0 && c < 8 && b[r * 8 + c] === -side) { line.push(r * 8 + c); r += dr; c += dc; }
    if (line.length && r >= 0 && r < 8 && c >= 0 && c < 8 && b[r * 8 + c] === side) out.push(...line);
  }
  return out;
}
export const flips = (s: RState, i: number): number[] => flipsFrom(s.b, i, s.side);
export function moves(s: RState): number[] {
  const out: number[] = [];
  for (let i = 0; i < 64; i++) if (!s.b[i] && flipsFrom(s.b, i, s.side).length) out.push(i);
  return out;
}
/** Plays a move (or a pass with -1). Returns the flipped discs. */
export function play(s: RState, i: number): number[] {
  if (i < 0) { s.side = -s.side as 1 | -1; s.passes++; return []; }
  const f = flipsFrom(s.b, i, s.side);
  s.b[i] = s.side;
  for (const x of f) s.b[x] = s.side;
  s.side = -s.side as 1 | -1;
  s.passes = 0;
  return f;
}
export const count = (s: RState): [number, number] => {
  let a = 0, z = 0;
  for (const v of s.b) { if (v === 1) a++; else if (v === -1) z++; }
  return [a, z];
};
export function over(s: RState): boolean {
  if (s.passes >= 2) return true;
  if (moves(s).length) return false;
  const t = clone(s); t.side = -t.side as 1 | -1;
  return moves(t).length === 0;
}
export function winner(s: RState): number | null {
  if (!over(s)) return null;
  const [a, z] = count(s);
  return a > z ? 1 : z > a ? -1 : 0;
}
/** Legal moves, or [-1] (pass) when there are none and the game goes on. */
export const movesOrPass = (s: RState): number[] => { const m = moves(s); return m.length ? m : [-1]; };

export const game: MctsGame<RState, number> = {
  moves: movesOrPass,
  play: (s, m) => { const n = clone(s); play(n, m); return n; },
  toMove: (s) => s.side,
  winner,
  rollout(s) {
    const n = clone(s);
    for (let guard = 0; guard < 130; guard++) {
      const ms = moves(n);
      if (!ms.length) {
        n.side = -n.side as 1 | -1;
        if (!moves(n).length) break;
        continue;
      }
      // Corners are almost always good, even for a random player.
      const corner = ms.find((m) => m === 0 || m === 7 || m === 56 || m === 63);
      play(n, corner ?? ms[Math.floor(Math.random() * ms.length)]);
    }
    const [a, z] = count(n);
    return a > z ? 1 : z > a ? -1 : 0;
  },
};
