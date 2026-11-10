// Tetris AI: try every rotation and column, score the resulting board with
// four features and a weight vector. The weights can be evolved with a
// genetic algorithm.
import { COLS, ROWS, bag, dropY, fits, lock, spawn, type Kind, type Piece } from "./engine";

export interface Features { height: number; lines: number; holes: number; bumpiness: number }
export type Weights = [number, number, number, number]; // height, lines, holes, bumpiness
export const DEFAULT_WEIGHTS: Weights = [-0.510066, 0.760666, -0.35663, -0.184483];

export function features(board: Uint8Array, lines: number): Features {
  const heights = new Array(COLS).fill(0);
  let holes = 0;
  for (let x = 0; x < COLS; x++) {
    let seen = false;
    for (let y = 0; y < ROWS; y++) {
      if (board[y * COLS + x]) { if (!seen) { heights[x] = ROWS - y; seen = true; } }
      else if (seen) holes++;
    }
  }
  let bump = 0;
  for (let x = 0; x < COLS - 1; x++) bump += Math.abs(heights[x] - heights[x + 1]);
  return { height: heights.reduce((a, b) => a + b, 0), lines, holes, bumpiness: bump };
}
export const scoreOf = (f: Features, w: Weights): number => w[0] * f.height + w[1] * f.lines + w[2] * f.holes + w[3] * f.bumpiness;

export interface Placement { piece: Piece; score: number; f: Features }

function placements(board: Uint8Array, kind: Kind): { piece: Piece; board: Uint8Array; lines: number }[] {
  const out: { piece: Piece; board: Uint8Array; lines: number }[] = [];
  const rots = kind === 1 ? 1 : kind === 0 || kind === 3 || kind === 4 ? 2 : 4;
  for (let rot = 0; rot < rots; rot++) {
    for (let x = -2; x < COLS; x++) {
      const p: Piece = { kind, rot, x, y: kind === 0 ? -1 : 0 };
      if (!fits(board, p)) continue;
      const q = { ...p, y: dropY(board, p) };
      const b = board.slice();
      const lines = lock(b, q);
      if (lines < 0) continue;
      out.push({ piece: q, board: b, lines });
    }
  }
  return out;
}

/** Best placement for `kind`, optionally looking at the next piece too. */
export function best(board: Uint8Array, kind: Kind, w: Weights, next?: Kind): { best: Placement | null; top: Placement[] } {
  const all: Placement[] = [];
  for (const c of placements(board, kind)) {
    let s = scoreOf(features(c.board, c.lines), w);
    if (next !== undefined) {
      let bestNext = -Infinity;
      for (const n of placements(c.board, next)) bestNext = Math.max(bestNext, scoreOf(features(n.board, n.lines), w));
      s = bestNext === -Infinity ? -1e9 : s * 0.25 + bestNext; // reward setting up the next piece
    }
    all.push({ piece: c.piece, score: s, f: features(c.board, c.lines) });
  }
  all.sort((a, b) => b.score - a.score);
  return { best: all[0] ?? null, top: all.slice(0, 5) };
}

/** Plays a fast headless game; returns lines cleared. Used as GA fitness. */
export function simulate(w: Weights, maxPieces: number, seed: number): number {
  let st = seed;
  const rand = () => { st = (st * 1664525 + 1013904223) >>> 0; return st / 2 ** 32; };
  const next = bag(rand);
  const board = new Uint8Array(COLS * ROWS);
  let lines = 0;
  for (let i = 0; i < maxPieces; i++) {
    const k = next();
    if (!fits(board, spawn(k))) break;
    const { best: b } = best(board, k, w);
    if (!b) break;
    const n = lock(board, b.piece);
    if (n < 0) break;
    lines += n;
  }
  return lines;
}

export interface GenInfo { gen: number; best: number; avg: number; weights: Weights; history: { best: number; avg: number }[] }

/** A small genetic algorithm that evolves the four weights. */
export function evolve(opts: { generations: number; population: number; pieces: number }, progress?: (g: GenInfo) => void): GenInfo {
  const norm = (w: number[]): Weights => { const n = Math.hypot(...w) || 1; return w.map((x) => x / n) as Weights; };
  const randW = (): Weights => norm([-Math.random(), Math.random(), -Math.random(), -Math.random()]);
  let pop = Array.from({ length: opts.population }, randW);
  const history: { best: number; avg: number }[] = [];
  let info: GenInfo = { gen: 0, best: 0, avg: 0, weights: pop[0], history };
  for (let gen = 1; gen <= opts.generations; gen++) {
    const seeds = [gen * 7919, gen * 104729];
    const scored = pop.map((w) => ({ w, fit: seeds.reduce((a, s) => a + simulate(w, opts.pieces, s), 0) / seeds.length })).sort((a, b) => b.fit - a.fit);
    const avg = scored.reduce((a, x) => a + x.fit, 0) / scored.length;
    history.push({ best: scored[0].fit, avg });
    info = { gen, best: scored[0].fit, avg, weights: scored[0].w, history: history.slice() };
    progress?.(info);
    // Keep the top half; children are fitness-weighted averages of two parents, plus mutation.
    const elite = scored.slice(0, Math.max(2, Math.floor(opts.population / 2)));
    const kids: Weights[] = [];
    while (elite.length + kids.length < opts.population) {
      const a = elite[Math.floor(Math.random() * elite.length)], b = elite[Math.floor(Math.random() * elite.length)];
      const fa = a.fit + 1, fb = b.fit + 1;
      const child = a.w.map((x, i) => (x * fa + b.w[i] * fb) / (fa + fb) + (Math.random() < 0.3 ? (Math.random() - 0.5) * 0.4 : 0));
      kids.push(norm(child));
    }
    pop = [...elite.map((e) => e.w), ...kids];
  }
  return info;
}
