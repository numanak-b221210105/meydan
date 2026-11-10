// Minimax for Reversi: positional weights, mobility and corner control.
import { clone, count, moves, over, play, type RState } from "./engine";

const W = [
  100, -20, 10, 5, 5, 10, -20, 100,
  -20, -50, -2, -2, -2, -2, -50, -20,
  10, -2, 1, 1, 1, 1, -2, 10,
  5, -2, 1, 0, 0, 1, -2, 5,
  5, -2, 1, 0, 0, 1, -2, 5,
  10, -2, 1, 1, 1, 1, -2, 10,
  -20, -50, -2, -2, -2, -2, -50, -20,
  100, -20, 10, 5, 5, 10, -20, 100,
];

export function evaluate(s: RState): number {
  const me = s.side;
  if (over(s)) { const [a, z] = count(s); const d = (a - z) * me; return d > 0 ? 10000 + d : d < 0 ? -10000 + d : 0; }
  let pos = 0;
  for (let i = 0; i < 64; i++) pos += W[i] * s.b[i];
  pos *= me;
  const mine = moves(s).length;
  const t = clone(s); t.side = -t.side as 1 | -1;
  const theirs = moves(t).length;
  const mob = mine + theirs ? (100 * (mine - theirs)) / (mine + theirs) : 0;
  const empties = s.b.filter((v) => !v).length;
  const [a, z] = count(s);
  const disc = empties < 14 ? ((a - z) * me * 100) / (a + z) : 0; // disc count matters late
  return pos + mob * 0.8 + disc;
}

export interface RevResult { best: number; score: number; depth: number; nodes: number; ms: number; scores: { move: number; score: number }[] }

export function search(root: RState, opts: { ms: number; maxDepth: number }, progress?: (r: RevResult) => void): RevResult {
  const t0 = performance.now();
  let nodes = 0, stop = false;
  function negamax(s: RState, depth: number, alpha: number, beta: number): number {
    nodes++;
    if ((nodes & 511) === 0 && performance.now() - t0 > opts.ms) stop = true;
    if (depth === 0 || over(s)) return evaluate(s);
    const ms = moves(s);
    if (!ms.length) { const n = clone(s); play(n, -1); return -negamax(n, depth, -beta, -alpha); }
    ms.sort((x, y) => W[y] - W[x]);
    for (const m of ms) {
      const n = clone(s);
      play(n, m);
      const v = -negamax(n, depth - 1, -beta, -alpha);
      if (stop) return alpha;
      if (v >= beta) return beta;
      if (v > alpha) alpha = v;
    }
    return alpha;
  }
  const ms = moves(root);
  let res: RevResult = { best: ms[0] ?? -1, score: 0, depth: 0, nodes: 0, ms: 0, scores: [] };
  if (ms.length <= 1) return { ...res, depth: 1, scores: ms.map((m) => ({ move: m, score: 0 })) };
  for (let depth = 1; depth <= opts.maxDepth; depth++) {
    const scores: { move: number; score: number }[] = [];
    for (const m of ms) {
      const n = clone(root);
      play(n, m);
      const v = -negamax(n, depth - 1, -1e9, 1e9);
      if (stop) break;
      scores.push({ move: m, score: v });
    }
    if (stop && scores.length < ms.length) break;
    scores.sort((a, b) => b.score - a.score);
    res = { best: scores[0].move, score: scores[0].score, depth, nodes, ms: Math.round(performance.now() - t0), scores };
    progress?.(res);
    if (Math.abs(res.score) >= 10000) break;
  }
  res.nodes = nodes;
  res.ms = Math.round(performance.now() - t0);
  return res;
}
