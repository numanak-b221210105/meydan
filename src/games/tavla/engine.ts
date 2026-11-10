// Backgammon (tavla) rules. Each side keeps its checkers in its own numbering:
// points 1..24 counted from its own home, index 25 is the bar. A checker on my
// point p sits on the opponent's point 25 - p. Moving always goes downwards.

export interface TState {
  pts: [number[], number[]]; // [white, black], length 26
  off: [number, number];
  turn: 0 | 1;
}
export interface TMove { from: number; to: number; die: number; hit: boolean }
export interface Seq { moves: TMove[]; state: TState }

export function start(): TState {
  const side = () => { const a = new Array(26).fill(0); a[24] = 2; a[13] = 5; a[8] = 3; a[6] = 5; return a; };
  return { pts: [side(), side()], off: [0, 0], turn: 0 };
}
export const clone = (s: TState): TState => ({ pts: [s.pts[0].slice(), s.pts[1].slice()], off: [s.off[0], s.off[1]], turn: s.turn });
export const key = (s: TState): string => s.pts[0].join(",") + "|" + s.pts[1].join(",") + "|" + s.off.join(",") + "|" + s.turn;
export const pips = (s: TState, side: 0 | 1): number => s.pts[side].reduce((a, n, i) => a + n * i, 0);
const allHome = (me: number[]) => { for (let i = 7; i <= 25; i++) if (me[i]) return false; return true; };

export function canMove(s: TState, from: number, die: number): boolean {
  const me = s.pts[s.turn], op = s.pts[1 - s.turn];
  if (!me[from]) return false;
  if (me[25] && from !== 25) return false;
  const to = from - die;
  if (to >= 1) return op[25 - to] < 2;
  if (!allHome(me)) return false;
  if (to === 0) return true;
  for (let i = from + 1; i <= 6; i++) if (me[i]) return false; // a higher checker must move first
  return true;
}

export function apply(s: TState, from: number, die: number): TMove {
  const me = s.pts[s.turn], op = s.pts[1 - s.turn];
  const to = Math.max(0, from - die);
  me[from]--;
  let hit = false;
  if (to >= 1) {
    if (op[25 - to] === 1) { op[25 - to] = 0; op[25]++; hit = true; }
    me[to]++;
  } else s.off[s.turn]++;
  return { from, to, die, hit };
}

/** All legal ways to play a roll. With `unique`, sequences reaching the same position are merged. */
export function sequences(s: TState, dice: [number, number], unique = true): Seq[] {
  const orders = dice[0] === dice[1] ? [[dice[0], dice[0], dice[0], dice[0]]] : [[dice[0], dice[1]], [dice[1], dice[0]]];
  let out: Seq[] = [];
  let maxLen = 0;
  const walk = (st: TState, rest: number[], moves: TMove[]) => {
    let moved = false;
    if (rest.length) {
      const d = rest[0];
      const tried = new Set<number>();
      for (let from = 25; from >= 1; from--) {
        if (tried.has(from) || !canMove(st, from, d)) continue;
        tried.add(from);
        const n = clone(st);
        const m = apply(n, from, d);
        moved = true;
        walk(n, rest.slice(1), [...moves, m]);
      }
    }
    if (!moved) {
      if (moves.length > maxLen) { maxLen = moves.length; out = []; }
      if (moves.length === maxLen) out.push({ moves, state: st });
    }
  };
  for (const o of orders) walk(s, o, []);
  // If only one die can be played, the larger one must be used when possible.
  if (maxLen === 1 && dice[0] !== dice[1]) {
    const hi = Math.max(...dice);
    if (out.some((q) => q.moves[0].die === hi)) out = out.filter((q) => q.moves[0].die === hi);
  }
  if (unique) {
    const seen = new Map<string, Seq>();
    for (const q of out) { const k = key(q.state); if (!seen.has(k)) seen.set(k, q); }
    out = [...seen.values()];
  }
  for (const q of out) q.state.turn = (1 - s.turn) as 0 | 1;
  return out;
}

export function winner(s: TState): -1 | 0 | 1 {
  if (s.off[0] === 15) return 0;
  if (s.off[1] === 15) return 1;
  return -1;
}
/** 2 for a "mars" (gammon): the loser has not borne off any checker. */
export const points = (s: TState, w: 0 | 1): number => (s.off[1 - w] === 0 ? 2 : 1);

/** Notation like "24/18 13/10*". */
export function notation(moves: TMove[]): string {
  return moves.map((m) => `${m.from === 25 ? "bar" : m.from}/${m.to === 0 ? "off" : m.to}${m.hit ? "*" : ""}`).join(" ") || "—";
}
