// Snake autopilot: A* to the food, but only if the snake can still reach its
// own tail afterwards. Otherwise it chases its tail or moves to the largest open area.

export interface Snake { w: number; h: number; body: number[]; food: number } // body[0] is the head
export interface Plan { dir: number; path: number[]; explored: number[]; strategy: "food" | "tail" | "space"; nodes: number }

export const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // up, right, down, left
const step = (s: Snake, cell: number, d: number): number => {
  const x = (cell % s.w) + DIRS[d][0], y = Math.floor(cell / s.w) + DIRS[d][1];
  return x < 0 || y < 0 || x >= s.w || y >= s.h ? -1 : y * s.w + x;
};

/** A* where a body segment blocks a cell only until it has moved away. */
export function astar(s: Snake, from: number, goal: number, body: number[], grows = false): { path: number[]; explored: number[] } | null {
  const n = s.w * s.h;
  const freeAt = new Int32Array(n); // number of steps until the cell is free
  body.forEach((c, i) => { freeAt[c] = body.length - i + (grows ? 1 : 0); });
  const g = new Int32Array(n).fill(-1), came = new Int32Array(n).fill(-1);
  const hx = (c: number) => Math.abs((c % s.w) - (goal % s.w)) + Math.abs(Math.floor(c / s.w) - Math.floor(goal / s.w));
  const open: [number, number][] = [[hx(from), from]];
  g[from] = 0;
  const explored: number[] = [];
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
    const [, cur] = open.splice(bi, 1)[0];
    explored.push(cur);
    if (cur === goal) {
      const path: number[] = [];
      for (let c = goal; c !== from; c = came[c]) path.unshift(c);
      return { path, explored };
    }
    for (let d = 0; d < 4; d++) {
      const nx = step(s, cur, d);
      if (nx < 0) continue;
      const ng = g[cur] + 1;
      if (freeAt[nx] > ng - 1 && nx !== goal) continue;
      if (nx === goal && freeAt[nx] > ng && goal !== body[body.length - 1]) continue;
      if (g[nx] >= 0 && g[nx] <= ng) continue;
      g[nx] = ng;
      came[nx] = cur;
      open.push([ng + hx(nx), nx]);
    }
  }
  return null;
}

/** Cells reachable from `from` (flood fill), treating the body as walls. */
export function space(s: Snake, from: number, body: number[]): number {
  const wall = new Set(body.slice(0, -1));
  const seen = new Set([from]);
  const q = [from];
  while (q.length) {
    const c = q.pop()!;
    for (let d = 0; d < 4; d++) {
      const nx = step(s, c, d);
      if (nx >= 0 && !wall.has(nx) && !seen.has(nx)) { seen.add(nx); q.push(nx); }
    }
  }
  return seen.size;
}

function simulate(body: number[], path: number[], grow: boolean): number[] {
  let b = body.slice();
  path.forEach((c, i) => { b = [c, ...b]; if (!(grow && i === path.length - 1)) b.pop(); });
  return b;
}

export function plan(s: Snake): Plan {
  const head = s.body[0];
  const dirTo = (c: number) => { for (let d = 0; d < 4; d++) if (step(s, head, d) === c) return d; return 0; };
  let nodes = 0;
  const toFood = astar(s, head, s.food, s.body);
  if (toFood) {
    nodes += toFood.explored.length;
    const after = simulate(s.body, toFood.path, true);
    const tail = after[after.length - 1];
    const back = astar({ ...s, body: after }, after[0], tail, after);
    if (back) nodes += back.explored.length;
    if (back || after.length >= s.w * s.h - 1) return { dir: dirTo(toFood.path[0]), path: toFood.path, explored: toFood.explored, strategy: "food", nodes };
  }
  // Not safe: follow the tail, which always keeps an escape route open.
  const tail = s.body[s.body.length - 1];
  let best: Plan | null = null, bestScore = -1;
  for (let d = 0; d < 4; d++) {
    const nx = step(s, head, d);
    if (nx < 0 || (s.body.includes(nx) && nx !== tail)) continue;
    const nb = [nx, ...s.body.slice(0, -1)];
    const back = astar({ ...s, body: nb }, nx, nb[nb.length - 1], nb);
    nodes++;
    const room = space(s, nx, nb);
    // Prefer moves that keep the tail reachable, then the longest route to it.
    const score = (back ? 10000 + back.path.length * 10 : 0) + room;
    if (score > bestScore) { bestScore = score; best = { dir: d, path: back ? [nx, ...back.path] : [nx], explored: back?.explored ?? [], strategy: back ? "tail" : "space", nodes: 0 }; }
  }
  if (best) return { ...best, nodes };
  return { dir: 0, path: [], explored: [], strategy: "space", nodes };
}
