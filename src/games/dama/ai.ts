// Minimax with alpha-beta pruning and iterative deepening for Turkish draughts.
import { clone, moves, notation, play, type DMove, type DState } from "./engine";

/** Score from the side to move's point of view. */
export function evaluate(s: DState): number {
  let score = 0;
  const b = s.b;
  for (let i = 0; i < 64; i++) {
    const v = b[i];
    if (!v) continue;
    const r = i >> 3, c = i & 7;
    let val: number;
    if (Math.abs(v) === 2) val = 330;
    else {
      const adv = v > 0 ? 7 - r : r; // rows advanced
      val = 100 + adv * adv * 1.6 + (c === 0 || c === 7 ? 3 : 0);
    }
    score += v > 0 ? val : -val;
  }
  return s.side === 1 ? score : -score;
}

export interface DamaResult { best: DMove | null; score: number; depth: number; nodes: number; ms: number; pv: string[]; root: { move: string; score: number }[] }

export function search(start: DState, opts: { ms: number; maxDepth: number }, progress?: (r: DamaResult) => void): DamaResult {
  const t0 = performance.now();
  let nodes = 0, stop = false;
  const WIN = 100000;
  const pvTable: DMove[][] = [];
  function negamax(s: DState, depth: number, alpha: number, beta: number, ply: number): number {
    nodes++;
    pvTable[ply] = [];
    if ((nodes & 1023) === 0 && performance.now() - t0 > opts.ms) stop = true;
    const ms = moves(s);
    if (!ms.length) return -WIN + ply;
    // Keep searching while captures are pending so the evaluation is quiet.
    if (depth <= 0 && (!ms[0].caps.length || ply > 30)) return evaluate(s);
    ms.sort((a, b) => b.caps.length - a.caps.length || Number(b.promote) - Number(a.promote));
    for (const m of ms) {
      const n = clone(s);
      play(n, m);
      const v = -negamax(n, depth - 1, -beta, -alpha, ply + 1);
      if (stop) return alpha;
      if (v >= beta) return beta;
      if (v > alpha) { alpha = v; pvTable[ply] = [m, ...(pvTable[ply + 1] ?? [])]; }
    }
    return alpha;
  }
  const root = moves(start);
  let res: DamaResult = { best: root[0] ?? null, score: 0, depth: 0, nodes: 0, ms: 0, pv: [], root: [] };
  if (root.length <= 1) return { ...res, depth: 1, root: root.map((m) => ({ move: notation(m), score: 0 })) };
  let order = root.slice();
  for (let depth = 1; depth <= opts.maxDepth; depth++) {
    const scored: { m: DMove; v: number; line: DMove[] }[] = [];
    let alpha = -WIN - 1;
    for (const m of order) {
      const n = clone(start);
      play(n, m);
      const v = -negamax(n, depth - 1, -WIN - 1, scored.length < 4 ? WIN + 1 : -alpha + 1, 1);
      if (stop) break;
      scored.push({ m, v, line: [m, ...(pvTable[1] ?? [])] });
      if (v > alpha) alpha = v;
    }
    if (stop && !scored.length) break;
    scored.sort((a, b) => b.v - a.v);
    order = [...scored.map((x) => x.m), ...order.filter((m) => !scored.some((x) => x.m === m))];
    res = { best: scored[0].m, score: scored[0].v, depth, nodes, ms: Math.round(performance.now() - t0), pv: scored[0].line.map(notation), root: scored.slice(0, 5).map((x) => ({ move: notation(x.m), score: x.v })) };
    progress?.(res);
    if (stop || Math.abs(res.score) > WIN - 100) break;
  }
  res.nodes = nodes;
  res.ms = Math.round(performance.now() - t0);
  return res;
}
