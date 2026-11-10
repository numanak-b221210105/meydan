// Minesweeper with a probability solver. The solver only looks at what a
// player can see (revealed numbers), splits the unknown border into independent
// groups, enumerates every consistent mine layout and weights them by how
// many ways the remaining mines fit elsewhere.

export interface MState { w: number; h: number; mines: number; mine: Uint8Array; open: Uint8Array; flag: Uint8Array; n: Uint8Array; started: boolean; lost: boolean; won: boolean }

export function create(w = 16, h = 16, mines = 40): MState {
  const z = () => new Uint8Array(w * h);
  return { w, h, mines, mine: z(), open: z(), flag: z(), n: z(), started: false, lost: false, won: false };
}
export function neighbors(s: { w: number; h: number }, i: number): number[] {
  const x = i % s.w, y = Math.floor(i / s.w), out: number[] = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < s.w && ny < s.h) out.push(ny * s.w + nx);
  }
  return out;
}
/** Mines are placed after the first click so the first click is always safe (and opens an area). */
export function place(s: MState, first: number, rand = Math.random): void {
  const banned = new Set([first, ...neighbors(s, first)]);
  let left = s.mines;
  while (left) {
    const i = Math.floor(rand() * s.w * s.h);
    if (banned.has(i) || s.mine[i]) continue;
    s.mine[i] = 1;
    left--;
  }
  for (let i = 0; i < s.mine.length; i++) s.n[i] = neighbors(s, i).filter((j) => s.mine[j]).length;
  s.started = true;
}
/** Reveals a cell (flood-filling zeros). Returns the cells opened. */
export function reveal(s: MState, i: number): number[] {
  if (!s.started) place(s, i);
  if (s.open[i] || s.flag[i] || s.lost || s.won) return [];
  if (s.mine[i]) { s.open[i] = 1; s.lost = true; return [i]; }
  const opened: number[] = [];
  const stack = [i];
  while (stack.length) {
    const c = stack.pop()!;
    if (s.open[c] || s.flag[c]) continue;
    s.open[c] = 1;
    opened.push(c);
    if (s.n[c] === 0) for (const j of neighbors(s, c)) if (!s.open[j] && !s.mine[j]) stack.push(j);
  }
  const closed = s.open.reduce((a, v) => a + (v ? 0 : 1), 0);
  if (closed === s.mines) s.won = true;
  return opened;
}

const comb = (() => {
  const memo = new Map<string, number>();
  return (n: number, k: number): number => {
    if (k < 0 || k > n) return 0;
    k = Math.min(k, n - k);
    const key = n + "," + k;
    if (memo.has(key)) return memo.get(key)!;
    let r = 1;
    for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
    memo.set(key, r);
    return r;
  };
})();

export interface Solve { prob: Float64Array; safe: number[]; mines: number[]; exact: boolean; components: number; layouts: number }

/** Probability that each closed cell holds a mine, from the visible board only. */
export function solve(s: MState): Solve {
  const N = s.w * s.h;
  const prob = new Float64Array(N).fill(-1);
  if (!s.started) { prob.fill(s.mines / N); return { prob, safe: [], mines: [], exact: true, components: 0, layouts: 0 }; }
  // Constraints from every opened number touching closed cells.
  const cons: { cells: number[]; need: number }[] = [];
  const frontier = new Set<number>();
  for (let i = 0; i < N; i++) {
    if (!s.open[i] || s.mine[i]) continue;
    const closed = neighbors(s, i).filter((j) => !s.open[j]);
    if (!closed.length) continue;
    cons.push({ cells: closed, need: s.n[i] });
    closed.forEach((c) => frontier.add(c));
  }
  // Group frontier cells that share constraints.
  const parent = new Map<number, number>();
  const find = (x: number): number => { while (parent.get(x) !== x) x = parent.get(x)!; return x; };
  frontier.forEach((c) => parent.set(c, c));
  for (const c of cons) for (let k = 1; k < c.cells.length; k++) parent.set(find(c.cells[k]), find(c.cells[0]));
  const groups = new Map<number, number[]>();
  frontier.forEach((c) => { const r = find(c); groups.set(r, [...(groups.get(r) ?? []), c]); });

  const closedCount = s.open.reduce((a, v) => a + (v ? 0 : 1), 0);
  const unconstrained = closedCount - frontier.size;
  let exact = true, layouts = 0;
  // For each group: ways[k] and per-cell counts[k]
  const comps: { cells: number[]; ways: number[]; per: Map<number, number[]> }[] = [];
  for (const cells of groups.values()) {
    const myCons = cons.filter((c) => c.cells.some((x) => cells.includes(x)));
    const pos = new Map(cells.map((c, i) => [c, i]));
    const assign = new Int8Array(cells.length).fill(-1);
    const ways: number[] = [];
    const per = new Map<number, number[]>(cells.map((c) => [c, []]));
    // Order cells so constraints get decided early.
    const order = [...cells].sort((a, b) => myCons.filter((c) => c.cells.includes(b)).length - myCons.filter((c) => c.cells.includes(a)).length);
    let budget = 400000;
    const ok = () => myCons.every((c) => {
      let m = 0, u = 0;
      for (const x of c.cells) { const v = assign[pos.get(x)!]; if (v === 1) m++; else if (v === -1) u++; }
      return m <= c.need && m + u >= c.need;
    });
    const rec = (k: number, mines: number) => {
      if (--budget < 0) return;
      if (k === order.length) {
        ways[mines] = (ways[mines] ?? 0) + 1;
        layouts++;
        for (const c of cells) if (assign[pos.get(c)!] === 1) { const a = per.get(c)!; a[mines] = (a[mines] ?? 0) + 1; }
        return;
      }
      const i = pos.get(order[k])!;
      for (const v of [0, 1]) {
        assign[i] = v;
        if (ok()) rec(k + 1, mines + v);
      }
      assign[i] = -1;
    };
    rec(0, 0);
    if (budget < 0) exact = false;
    comps.push({ cells, ways, per });
  }
  // Combine groups: distribution of total frontier mines, then weight by C(unconstrained, rest).
  const conv = (a: number[], b: number[]) => { const r: number[] = []; a.forEach((x, i) => { if (x) b.forEach((y, j) => { if (y) r[i + j] = (r[i + j] ?? 0) + x * y; }); }); return r; };
  const M = s.mines;
  const all = comps.reduce((acc, c) => conv(acc, c.ways), [1] as number[]);
  let total = 0, uncMines = 0;
  all.forEach((w, t) => { if (!w) return; const c = comb(unconstrained, M - t) * w; total += c; uncMines += c * (M - t); });
  for (let ci = 0; ci < comps.length; ci++) {
    const others = comps.reduce((acc, c, j) => (j === ci ? acc : conv(acc, c.ways)), [1] as number[]);
    for (const cell of comps[ci].cells) {
      let num = 0;
      comps[ci].per.get(cell)!.forEach((cnt, k) => { if (!cnt) return; others.forEach((w, t) => { if (w) num += cnt * w * comb(unconstrained, M - k - t); }); });
      prob[cell] = total ? num / total : 0.5;
    }
  }
  const pU = unconstrained && total ? uncMines / total / unconstrained : 0;
  for (let i = 0; i < N; i++) if (!s.open[i] && !frontier.has(i)) prob[i] = pU;
  const safe: number[] = [], mines: number[] = [];
  for (let i = 0; i < N; i++) if (!s.open[i]) { if (prob[i] < 1e-9) safe.push(i); else if (prob[i] > 1 - 1e-9) mines.push(i); }
  return { prob, safe, mines, exact, components: comps.length, layouts };
}
