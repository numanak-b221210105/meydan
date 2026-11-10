// Alpha-beta search with iterative deepening, quiescence search, MVV-LVA move
// ordering, killer moves and piece-square tables.
import { B, K, N, P, Q, R, WHITE, inCheck, legal, make, pseudo, sqName, unmake, type Move, type Position } from "./engine";

const VAL = [0, 100, 320, 330, 500, 900, 0];
// Piece-square tables from white's point of view, a8..h1 (index = rank*8 + file).
const PST: number[][] = [
  [],
  [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
  [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
  [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
  [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
  [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
  [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20],
];
const KING_END = [-50, -40, -30, -20, -20, -30, -40, -50, -30, -20, -10, 0, 0, -10, -20, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -30, 0, 0, 0, 0, -30, -30, -50, -30, -30, -30, -30, -30, -30, -50];

/** Static evaluation in centipawns from the side to move's point of view. */
export function evaluate(p: Position): number {
  let score = 0, material = 0;
  const b = p.board;
  for (let s = 0; s < 128; s++) {
    if (s & 0x88) { s += 7; continue; }
    const v = b[s];
    if (v && Math.abs(v) !== K && Math.abs(v) !== P) material += VAL[Math.abs(v)];
  }
  const endgame = material <= 2600;
  for (let s = 0; s < 128; s++) {
    if (s & 0x88) { s += 7; continue; }
    const v = b[s];
    if (!v) continue;
    const t = Math.abs(v);
    const idx = v > 0 ? (s >> 4) * 8 + (s & 7) : (7 - (s >> 4)) * 8 + (s & 7);
    const pst = t === K && endgame ? KING_END[idx] : PST[t][idx];
    score += (v > 0 ? 1 : -1) * (VAL[t] + pst);
  }
  return p.side === WHITE ? score : -score;
}

const MATE = 100000;
export interface SearchInfo { depth: number; score: number; pv: string[]; nodes: number; ms: number; root: { move: string; score: number }[] }
export interface SearchResult extends SearchInfo { best: Move | null }

export function search(p: Position, opts: { ms: number; maxDepth: number }, progress?: (i: SearchInfo) => void): SearchResult {
  const t0 = performance.now();
  let nodes = 0, stop = false;
  const killers: Move[][] = [];
  const same = (a: Move | undefined, b: Move) => !!a && a.from === b.from && a.to === b.to;
  const order = (ms: Move[], ply: number, pvMove?: Move) => {
    const sc = (m: Move) =>
      (pvMove && same(pvMove, m) ? 1e6 : 0) +
      (m.captured ? 10 * VAL[Math.abs(m.captured)] - VAL[Math.abs(m.piece)] + 1000 : 0) +
      (m.promo ? 800 : 0) +
      (killers[ply]?.some((k) => same(k, m)) ? 500 : 0);
    return ms.sort((a, b) => sc(b) - sc(a));
  };
  const timeUp = () => (nodes & 1023) === 0 && performance.now() - t0 > opts.ms;

  function quiesce(alpha: number, beta: number, ply: number): number {
    nodes++;
    if (timeUp()) stop = true;
    const stand = evaluate(p);
    if (stand >= beta) return beta;
    if (stand > alpha) alpha = stand;
    if (ply > 24) return alpha;
    for (const m of order(pseudo(p, true), ply)) {
      const us = p.side;
      const u = make(p, m);
      if (inCheck(p, us)) { unmake(p, m, u); continue; }
      const s = -quiesce(-beta, -alpha, ply + 1);
      unmake(p, m, u);
      if (stop) return alpha;
      if (s >= beta) return beta;
      if (s > alpha) alpha = s;
    }
    return alpha;
  }

  const pvTable: Move[][] = [];
  function negamax(depth: number, alpha: number, beta: number, ply: number, pvMove?: Move): number {
    pvTable[ply] = [];
    if (depth <= 0) return quiesce(alpha, beta, ply);
    nodes++;
    if (timeUp()) stop = true;
    let any = false;
    const check = inCheck(p);
    for (const m of order(pseudo(p), ply, pvMove)) {
      const us = p.side;
      const u = make(p, m);
      if (inCheck(p, us)) { unmake(p, m, u); continue; }
      any = true;
      const s = -negamax(depth - 1 + (check ? 1 : 0) * (ply < 6 ? 1 : 0), -beta, -alpha, ply + 1, pvMove && same(pvMove, m) ? prevPv[ply + 1] : undefined);
      unmake(p, m, u);
      if (stop) return alpha;
      if (s >= beta) {
        if (!m.captured) killers[ply] = [m, ...(killers[ply] ?? [])].slice(0, 2);
        return beta;
      }
      if (s > alpha) { alpha = s; pvTable[ply] = [m, ...(pvTable[ply + 1] ?? [])]; }
    }
    if (!any) return check ? -MATE + ply : 0;
    return alpha;
  }

  let prevPv: Move[] = [];
  let result: SearchResult = { best: null, depth: 0, score: 0, pv: [], nodes: 0, ms: 0, root: [] };
  const rootMoves = legal(p);
  if (rootMoves.length === 1) return { ...result, best: rootMoves[0], depth: 1, root: [{ move: name(rootMoves[0]), score: 0 }] };

  for (let depth = 1; depth <= opts.maxDepth; depth++) {
    // Search root moves one by one so every candidate gets a score for the console.
    const scored: { m: Move; s: number }[] = [];
    let alpha = -MATE - 1;
    const ordered = order(rootMoves.slice(), 0, prevPv[0]);
    for (const m of ordered) {
      const u = make(p, m);
      // Full window for the first few moves (to show real scores), then a null window.
      const s = -negamax(depth - 1, -MATE - 1, scored.length < 5 ? MATE + 1 : -alpha + 1, 1, same(prevPv[0], m) ? prevPv[1] : undefined);
      const line = [m, ...(pvTable[1] ?? [])];
      unmake(p, m, u);
      if (stop) break;
      scored.push({ m, s });
      if (s > alpha) { alpha = s; prevPv = line; }
    }
    if (stop && scored.length === 0) break;
    scored.sort((a, b) => b.s - a.s);
    result = {
      best: scored[0].m,
      depth,
      score: scored[0].s,
      pv: prevPv.map(name),
      nodes,
      ms: Math.round(performance.now() - t0),
      root: scored.slice(0, 5).map((x) => ({ move: name(x.m), score: x.s })),
    };
    progress?.(result);
    if (stop || Math.abs(result.score) > MATE - 100) break;
  }
  result.nodes = nodes;
  result.ms = Math.round(performance.now() - t0);
  return result;
}

const name = (m: Move): string => sqName(m.from) + sqName(m.to) + (m.promo ? "nbrq"[[N, B, R, Q].indexOf(Math.abs(m.promo))] : "");
export const isMate = (score: number): boolean => Math.abs(score) > MATE - 200;
export const mateIn = (score: number): number => Math.ceil((MATE - Math.abs(score)) / 2);
