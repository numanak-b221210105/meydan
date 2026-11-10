// Turkish draughts (dama). All 64 squares are used and pieces move orthogonally.
// Men step forward or sideways; kings ("dama") fly any distance. Capturing is
// mandatory and the sequence that captures the most pieces must be chosen.
// Board index = row * 8 + col, row 0 at the top. White moves up.

export type Board = Int8Array; // 1 white man, 2 white king, -1 black man, -2 black king
export interface DMove { path: number[]; caps: number[]; promote: boolean }
export interface DState { b: Board; side: 1 | -1; quiet: number }

export function start(): DState {
  const b = new Int8Array(64);
  for (let c = 0; c < 8; c++) { b[8 + c] = -1; b[16 + c] = -1; b[40 + c] = 1; b[48 + c] = 1; }
  return { b, side: 1, quiet: 0 };
}
export const clone = (s: DState): DState => ({ b: s.b.slice(), side: s.side, quiet: s.quiet });
export const sqName = (i: number): string => "abcdefgh"[i & 7] + (8 - (i >> 3));
const DIRS: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const inside = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8;

function capturesFrom(b: Board, from: number, side: number): DMove[] {
  const out: DMove[] = [];
  const king = Math.abs(b[from]) === 2;
  const fwd = side === 1 ? -1 : 1;
  const walk = (sq: number, path: number[], caps: number[], lastDir: [number, number] | null) => {
    let extended = false;
    const r0 = sq >> 3, c0 = sq & 7;
    for (const d of DIRS) {
      if (!king && d[0] === -fwd) continue; // men never capture backwards
      if (king && lastDir && d[0] === -lastDir[0] && d[1] === -lastDir[1]) continue; // no 180° turn
      let r = r0 + d[0], c = c0 + d[1];
      if (king) while (inside(r, c) && b[r * 8 + c] === 0) { r += d[0]; c += d[1]; }
      if (!inside(r, c)) continue;
      const mid = r * 8 + c;
      if (Math.sign(b[mid]) !== -side) continue;
      let lr = r + d[0], lc = c + d[1];
      while (inside(lr, lc) && b[lr * 8 + lc] === 0) {
        const land = lr * 8 + lc;
        const saved = b[mid];
        b[mid] = 0; // captured pieces are removed as they are jumped
        b[land] = b[sq]; b[sq] = 0;
        extended = true;
        walk(land, [...path, land], [...caps, mid], d);
        b[sq] = b[land]; b[land] = 0;
        b[mid] = saved;
        if (!king) break;
        lr += d[0]; lc += d[1];
      }
    }
    if (!extended && caps.length) out.push({ path, caps, promote: false });
  };
  walk(from, [from], [], null);
  return out;
}

export function moves(s: DState): DMove[] {
  const b = s.b, side = s.side;
  let caps: DMove[] = [];
  for (let i = 0; i < 64; i++) if (Math.sign(b[i]) === side) caps.push(...capturesFrom(b, i, side));
  const lastRow = side === 1 ? 0 : 7;
  const promo = (m: DMove) => { m.promote = Math.abs(b[m.path[0]]) === 1 && m.path[m.path.length - 1] >> 3 === lastRow; return m; };
  if (caps.length) {
    const max = Math.max(...caps.map((m) => m.caps.length));
    caps = caps.filter((m) => m.caps.length === max);
    // Different paths may capture the same pieces and land on the same square.
    const seen = new Set<string>();
    return caps.filter((m) => { const k = m.path[0] + ">" + m.path[m.path.length - 1] + ":" + [...m.caps].sort().join(","); if (seen.has(k)) return false; seen.add(k); return true; }).map(promo);
  }
  const out: DMove[] = [];
  const fwd = side === 1 ? -1 : 1;
  for (let i = 0; i < 64; i++) {
    if (Math.sign(b[i]) !== side) continue;
    const king = Math.abs(b[i]) === 2, r0 = i >> 3, c0 = i & 7;
    for (const d of DIRS) {
      if (!king && d[0] === -fwd) continue;
      let r = r0 + d[0], c = c0 + d[1];
      while (inside(r, c) && b[r * 8 + c] === 0) {
        out.push(promo({ path: [i, r * 8 + c], caps: [], promote: false }));
        if (!king) break;
        r += d[0]; c += d[1];
      }
    }
  }
  return out;
}

export function play(s: DState, m: DMove): void {
  const b = s.b, from = m.path[0], to = m.path[m.path.length - 1];
  const piece = b[from];
  b[from] = 0;
  for (const c of m.caps) b[c] = 0;
  b[to] = m.promote ? 2 * Math.sign(piece) : piece;
  s.quiet = m.caps.length || Math.abs(piece) === 1 ? 0 : s.quiet + 1;
  s.side = -s.side as 1 | -1;
}

export type DResult = { over: false } | { over: true; winner: 1 | -1 | 0 };
export function result(s: DState): DResult {
  let w = 0, bl = 0;
  for (const v of s.b) { if (v > 0) w++; else if (v < 0) bl++; }
  if (!w) return { over: true, winner: -1 };
  if (!bl) return { over: true, winner: 1 };
  if (!moves(s).length) return { over: true, winner: -s.side as 1 | -1 };
  if (s.quiet >= 60) return { over: true, winner: 0 };
  return { over: false };
}

export const notation = (m: DMove): string => m.path.map(sqName).join(m.caps.length ? "x" : "-") + (m.promote ? "=D" : "");
