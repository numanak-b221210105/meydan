// Tetris rules: a 10x20 well, seven tetrominoes, a 7-bag randomiser and simple wall kicks.
export const COLS = 10, ROWS = 20;
export type Kind = 0 | 1 | 2 | 3 | 4 | 5 | 6; // I O T S Z J L
export const NAMES = "IOTSZJL";
// Base shapes as cell lists in a 4x4 box; rotations are generated.
const BASE: [number, number][][] = [
  [[0, 1], [1, 1], [2, 1], [3, 1]],
  [[1, 0], [2, 0], [1, 1], [2, 1]],
  [[1, 0], [0, 1], [1, 1], [2, 1]],
  [[1, 0], [2, 0], [0, 1], [1, 1]],
  [[0, 0], [1, 0], [1, 1], [2, 1]],
  [[0, 0], [0, 1], [1, 1], [2, 1]],
  [[2, 0], [0, 1], [1, 1], [2, 1]],
];
const SIZE = [4, 2, 3, 3, 3, 3, 3];
export const SHAPES: [number, number][][][] = BASE.map((cells, k) => {
  const n = SIZE[k];
  const rots = [cells.map(([x, y]) => [k === 1 ? x - 1 : x, y] as [number, number])];
  for (let r = 1; r < 4; r++) rots.push(rots[r - 1].map(([x, y]) => [n - 1 - y, x] as [number, number]));
  return k === 1 ? [rots[0], rots[0], rots[0], rots[0]] : rots;
});

export interface Piece { kind: Kind; rot: number; x: number; y: number }
export const cells = (p: Piece): [number, number][] => SHAPES[p.kind][p.rot].map(([cx, cy]) => [p.x + cx, p.y + cy]);

export function fits(board: Uint8Array, p: Piece): boolean {
  for (const [x, y] of cells(p)) {
    if (x < 0 || x >= COLS || y >= ROWS) return false;
    if (y >= 0 && board[y * COLS + x]) return false;
  }
  return true;
}
export const spawn = (kind: Kind): Piece => ({ kind, rot: 0, x: kind === 1 ? 4 : 3, y: kind === 0 ? -1 : 0 });

export function rotate(board: Uint8Array, p: Piece, dir: 1 | -1): Piece | null {
  const rot = (p.rot + dir + 4) % 4;
  for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0], [0, -1]]) {
    const q = { ...p, rot, x: p.x + dx, y: p.y + dy };
    if (fits(board, q)) return q;
  }
  return null;
}
export function dropY(board: Uint8Array, p: Piece): number {
  let y = p.y;
  while (fits(board, { ...p, y: y + 1 })) y++;
  return y;
}
/** Writes the piece into the board and clears full lines; returns lines cleared, or -1 if it locked out of view. */
export function lock(board: Uint8Array, p: Piece): number {
  let above = false;
  for (const [x, y] of cells(p)) { if (y < 0) above = true; else board[y * COLS + x] = p.kind + 1; }
  if (above) return -1;
  let cleared = 0;
  for (let y = ROWS - 1; y >= 0; y--) {
    let full = true;
    for (let x = 0; x < COLS; x++) if (!board[y * COLS + x]) { full = false; break; }
    if (full) {
      board.copyWithin(COLS, 0, y * COLS);
      board.fill(0, 0, COLS);
      cleared++;
      y++;
    }
  }
  return cleared;
}
export function bag(rand: () => number = Math.random): () => Kind {
  let q: Kind[] = [];
  return () => {
    if (!q.length) {
      q = [0, 1, 2, 3, 4, 5, 6];
      for (let i = q.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [q[i], q[j]] = [q[j], q[i]]; }
    }
    return q.pop()!;
  };
}
export const SCORE = [0, 100, 300, 500, 800];
