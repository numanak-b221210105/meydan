// A Bomberman-style arena with three or four AI bots.
// Bots read a "danger map" (which cells will burn, and when) and use
// breadth-first search to escape, collect power-ups and trap opponents.

export const GW = 15, GH = 13;
export const T = { Empty: 0, Wall: 1, Box: 2 } as const;
export type Power = "bomb" | "range" | "speed";
export interface Agent { id: number; x: number; y: number; tx: number; ty: number; alive: boolean; bombs: number; range: number; speed: number; human: boolean; intent: string; path: number[]; color: string; name: string; dieAt?: number }
export interface Bomb { x: number; y: number; t: number; range: number; owner: number }
export interface Flame { cell: number; t: number }
export interface World { grid: Uint8Array; power: Map<number, Power>; agents: Agent[]; bombs: Bomb[]; flames: Flame[]; time: number; danger: Float32Array }

export const idx = (x: number, y: number) => y * GW + x;
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const FUSE = 2.3, FLAME = 0.55;

export function create(humans: number, rand = Math.random): World {
  const grid = new Uint8Array(GW * GH);
  const spawns = [[1, 1], [GW - 2, GH - 2], [GW - 2, 1], [1, GH - 2]];
  const keep = new Set<number>();
  for (const [sx, sy] of spawns) for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1]]) keep.add(idx(sx + dx, sy + dy));
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    if (x === 0 || y === 0 || x === GW - 1 || y === GH - 1 || (x % 2 === 0 && y % 2 === 0)) grid[idx(x, y)] = T.Wall;
    else if (!keep.has(idx(x, y)) && rand() < 0.62) grid[idx(x, y)] = T.Box;
  }
  const power = new Map<number, Power>();
  for (let i = 0; i < grid.length; i++) if (grid[i] === T.Box && rand() < 0.3) power.set(i, (["bomb", "range", "speed"] as Power[])[Math.floor(rand() * 3)]);
  const colors = ["#ffd23f", "#22e4ff", "#ff3fd8", "#7dff6a"];
  const agents: Agent[] = spawns.map(([x, y], i) => ({ id: i, x, y, tx: x, ty: y, alive: true, bombs: 1, range: 2, speed: 4, human: i < humans, intent: "", path: [], color: colors[i], name: i < humans ? "P1" : "Bot " + "ABCD"[i - humans] }));
  return { grid, power, agents, bombs: [], flames: [], time: 0, danger: new Float32Array(GW * GH).fill(Infinity) };
}

/** Time until each cell burns (Infinity if safe), including chain reactions. */
export function dangerMap(w: World, extra?: Bomb): Float32Array {
  const bombs = extra ? [...w.bombs, extra] : w.bombs;
  const timers = bombs.map((b) => b.t);
  const blast = (b: Bomb) => {
    const cells = [idx(b.x, b.y)];
    for (const [dx, dy] of DIRS) for (let r = 1; r <= b.range; r++) {
      const x = b.x + dx * r, y = b.y + dy * r, c = idx(x, y);
      if (w.grid[c] === T.Wall) break;
      cells.push(c);
      if (w.grid[c] === T.Box) break;
    }
    return cells;
  };
  const blasts = bombs.map(blast);
  // Chain reactions: a bomb inside another blast goes off at the earlier time.
  for (let changed = true; changed;) {
    changed = false;
    bombs.forEach((b, i) => blasts.forEach((cells, j) => {
      if (i !== j && cells.includes(idx(b.x, b.y)) && timers[j] < timers[i]) { timers[i] = timers[j]; changed = true; }
    }));
  }
  const d = new Float32Array(GW * GH).fill(Infinity);
  blasts.forEach((cells, i) => { for (const c of cells) d[c] = Math.min(d[c], timers[i]); });
  for (const f of w.flames) d[f.cell] = 0;
  return d;
}

const walkable = (w: World, c: number, self?: Agent) => w.grid[c] === T.Empty && !w.bombs.some((b) => idx(b.x, b.y) === c && !(self && self.tx === b.x && self.ty === b.y));

/** BFS from the agent; returns distance and parent arrays. */
function bfs(w: World, a: Agent, danger: Float32Array, cautious: boolean) {
  const start = idx(a.tx, a.ty);
  const dist = new Int32Array(GW * GH).fill(-1), prev = new Int32Array(GW * GH).fill(-1);
  dist[start] = 0;
  const q = [start];
  const tile = 1 / a.speed;
  while (q.length) {
    const c = q.shift()!;
    for (const [dx, dy] of DIRS) {
      const n = c + dx + dy * GW;
      if (dist[n] >= 0 || !walkable(w, n, a)) continue;
      const arrive = (dist[c] + 1) * tile;
      // Do not step into a cell that will be burning when we get there.
      if (danger[n] !== Infinity && Math.abs(danger[n] - arrive) < (cautious ? 0.9 : 0.6)) continue;
      if (danger[n] <= arrive + 0.05 && danger[n] + FLAME >= arrive) continue;
      dist[n] = dist[c] + 1;
      prev[n] = c;
      q.push(n);
    }
  }
  return { dist, prev };
}
const pathTo = (prev: Int32Array, goal: number): number[] => { const p: number[] = []; for (let c = goal; prev[c] >= 0; c = prev[c]) p.unshift(c); return p; };

function canEscape(w: World, a: Agent, bomb: Bomb): boolean {
  const d = dangerMap(w, bomb);
  const { dist } = bfs(w, a, d, true);
  for (let c = 0; c < dist.length; c++) if (dist[c] >= 0 && d[c] === Infinity && dist[c] / a.speed < bomb.t - 0.4) return true;
  return false;
}

/** Chooses the next step for a bot standing on a tile centre. Returns a direction index or -1 to wait. */
export function botThink(w: World, a: Agent): { dir: number; bomb: boolean } {
  const here = idx(a.tx, a.ty);
  const d = w.danger;
  const { dist, prev } = bfs(w, a, d, true);
  const dirTo = (path: number[]) => { if (!path.length) return -1; const n = path[0]; return DIRS.findIndex(([dx, dy]) => here + dx + dy * GW === n); };
  // 1. In danger: run to the nearest safe cell.
  if (d[here] !== Infinity) {
    let best = -1;
    for (let c = 0; c < dist.length; c++) if (dist[c] > 0 && d[c] === Infinity && (best < 0 || dist[c] < dist[best])) best = c;
    a.intent = "flee";
    a.path = best >= 0 ? pathTo(prev, best) : [];
    return { dir: dirTo(a.path), bomb: false };
  }
  const enemies = w.agents.filter((o) => o.alive && o.id !== a.id);
  const placed = w.bombs.filter((b) => b.owner === a.id).length;
  // 2. Drop a bomb if it would hit a box or an enemy and there is a way out.
  if (placed < a.bombs) {
    const bomb: Bomb = { x: a.tx, y: a.ty, t: FUSE, range: a.range, owner: a.id };
    let hitsBox = false, hitsEnemy = false;
    for (const [dx, dy] of DIRS) for (let r = 1; r <= a.range; r++) {
      const c = idx(a.tx + dx * r, a.ty + dy * r);
      if (w.grid[c] === T.Wall) break;
      if (enemies.some((e) => idx(e.tx, e.ty) === c)) hitsEnemy = true;
      if (w.grid[c] === T.Box) { hitsBox = true; break; }
    }
    if ((hitsBox || hitsEnemy) && canEscape(w, a, bomb)) { a.intent = hitsEnemy ? "attack" : "bomb"; a.path = []; return { dir: -1, bomb: true }; }
  }
  // 3. Otherwise walk to the most useful reachable cell.
  let goal = -1, goalScore = -Infinity;
  for (let c = 0; c < dist.length; c++) {
    if (dist[c] < 0 || d[c] !== Infinity) continue;
    let score = -dist[c];
    if (w.power.has(c) && w.grid[c] === T.Empty) score += 14;
    let boxes = 0;
    for (const [dx, dy] of DIRS) if (w.grid[c + dx + dy * GW] === T.Box) boxes++;
    score += boxes * 3.5;
    const near = Math.min(...enemies.map((e) => Math.abs(e.tx - (c % GW)) + Math.abs(e.ty - Math.floor(c / GW))));
    if (near <= 2) score += 6 - near;
    if (score > goalScore) { goalScore = score; goal = c; }
  }
  if (goal >= 0 && goal !== here) {
    a.path = pathTo(prev, goal);
    a.intent = w.power.has(goal) ? "power" : enemies.some((e) => Math.abs(e.tx - (goal % GW)) + Math.abs(e.ty - Math.floor(goal / GW)) <= 2) ? "hunt" : "dig";
    return { dir: dirTo(a.path), bomb: false };
  }
  a.intent = "wait";
  a.path = [];
  return { dir: -1, bomb: false };
}

export function placeBomb(w: World, a: Agent): boolean {
  if (!a.alive || w.bombs.filter((b) => b.owner === a.id).length >= a.bombs) return false;
  if (w.bombs.some((b) => b.x === a.tx && b.y === a.ty)) return false;
  w.bombs.push({ x: a.tx, y: a.ty, t: FUSE, range: a.range, owner: a.id });
  return true;
}

/** Tries to start moving an agent one tile in `dir`. */
export function tryMove(w: World, a: Agent, dir: number): void {
  if (dir < 0 || a.tx !== a.x || a.ty !== a.y) return;
  const nx = a.tx + DIRS[dir][0], ny = a.ty + DIRS[dir][1];
  if (walkable(w, idx(nx, ny))) { a.tx = nx; a.ty = ny; }
}

/** Advances the world; returns events for sound and effects. */
export function step(w: World, dt: number): { exploded: number; died: Agent[]; picked: boolean } {
  w.time += dt;
  let exploded = 0, picked = false;
  const died: Agent[] = [];
  for (const a of w.agents) {
    if (!a.alive) continue;
    const s = a.speed * dt;
    a.x += Math.max(-s, Math.min(s, a.tx - a.x));
    a.y += Math.max(-s, Math.min(s, a.ty - a.y));
    if (Math.abs(a.x - a.tx) < 1e-3) a.x = a.tx;
    if (Math.abs(a.y - a.ty) < 1e-3) a.y = a.ty;
    const c = idx(Math.round(a.x), Math.round(a.y));
    const pw = w.power.get(c);
    if (pw && w.grid[c] === T.Empty) {
      w.power.delete(c);
      picked = true;
      if (pw === "bomb") a.bombs = Math.min(4, a.bombs + 1);
      if (pw === "range") a.range = Math.min(6, a.range + 1);
      if (pw === "speed") a.speed = Math.min(6.5, a.speed + 0.7);
    }
  }
  for (const b of w.bombs) b.t -= dt;
  w.flames = w.flames.filter((f) => (f.t -= dt) > 0);
  // Explode due bombs (and chains).
  for (let again = true; again;) {
    again = false;
    for (const b of [...w.bombs]) {
      if (b.t > 0) continue;
      w.bombs.splice(w.bombs.indexOf(b), 1);
      exploded++;
      const burn = (c: number) => {
        w.flames.push({ cell: c, t: FLAME });
        const other = w.bombs.find((o) => idx(o.x, o.y) === c);
        if (other) { other.t = 0; again = true; }
      };
      burn(idx(b.x, b.y));
      for (const [dx, dy] of DIRS) for (let r = 1; r <= b.range; r++) {
        const c = idx(b.x + dx * r, b.y + dy * r);
        if (w.grid[c] === T.Wall) break;
        if (w.grid[c] === T.Box) { w.grid[c] = T.Empty; burn(c); break; }
        if (w.power.has(c) && w.grid[c] === T.Empty) w.power.delete(c);
        burn(c);
      }
    }
  }
  const burning = new Set(w.flames.map((f) => f.cell));
  for (const a of w.agents) if (a.alive && burning.has(idx(Math.round(a.x), Math.round(a.y)))) { a.alive = false; a.dieAt = w.time; died.push(a); }
  w.danger = dangerMap(w);
  return { exploded, died, picked };
}
