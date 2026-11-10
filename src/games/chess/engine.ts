// Chess rules on a 0x88 board. Square 0 is a8, 119 is h1; white moves "up" (-16).
// Pieces: 1 pawn, 2 knight, 3 bishop, 4 rook, 5 queen, 6 king; negative values are black.

export const P = 1, N = 2, B = 3, R = 4, Q = 5, K = 6;
export const WHITE = 1, BLACK = -1;
const KNIGHT = [-33, -31, -18, -14, 14, 18, 31, 33];
const KING = [-17, -16, -15, -1, 1, 15, 16, 17];
const DIAG = [-17, -15, 15, 17];
const ORTHO = [-16, -1, 1, 16];
// Castling rights bits
const WK = 1, WQ = 2, BK = 4, BQ = 8;

export interface Move {
  from: number;
  to: number;
  piece: number;
  captured: number;
  promo: number;
  /** 1 en passant, 2 castle, 4 double pawn push */
  flags: number;
}
export interface Undo { castle: number; ep: number; half: number; captured: number; capSq: number }

export interface Position {
  board: Int8Array;
  side: number;
  castle: number;
  ep: number;
  half: number;
  full: number;
  kings: [number, number]; // [white, black]
}

export const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
export const sqName = (s: number): string => "abcdefgh"[s & 7] + (8 - (s >> 4));
export const sqOf = (n: string): number => (8 - Number(n[1])) * 16 + n.charCodeAt(0) - 97;
const onBoard = (s: number): boolean => (s & 0x88) === 0;
const LETTER = " pnbrqk";

export function fromFen(fen: string): Position {
  const [rows, side, cast, ep, half, full] = fen.trim().split(/\s+/);
  const board = new Int8Array(128);
  const kings: [number, number] = [-1, -1];
  rows.split("/").forEach((row, r) => {
    let f = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) { f += Number(ch); continue; }
      const t = LETTER.indexOf(ch.toLowerCase());
      const v = ch === ch.toUpperCase() ? t : -t;
      board[r * 16 + f] = v;
      if (t === K) kings[v > 0 ? 0 : 1] = r * 16 + f;
      f++;
    }
  });
  let castle = 0;
  if (cast.includes("K")) castle |= WK;
  if (cast.includes("Q")) castle |= WQ;
  if (cast.includes("k")) castle |= BK;
  if (cast.includes("q")) castle |= BQ;
  return { board, side: side === "w" ? WHITE : BLACK, castle, ep: ep === "-" ? -1 : sqOf(ep), half: Number(half || 0), full: Number(full || 1), kings };
}

export function toFen(p: Position): string {
  const rows: string[] = [];
  for (let r = 0; r < 8; r++) {
    let row = "", empty = 0;
    for (let f = 0; f < 8; f++) {
      const v = p.board[r * 16 + f];
      if (!v) { empty++; continue; }
      if (empty) { row += empty; empty = 0; }
      const ch = LETTER[Math.abs(v)];
      row += v > 0 ? ch.toUpperCase() : ch;
    }
    rows.push(row + (empty || ""));
  }
  const c = (p.castle & WK ? "K" : "") + (p.castle & WQ ? "Q" : "") + (p.castle & BK ? "k" : "") + (p.castle & BQ ? "q" : "");
  return `${rows.join("/")} ${p.side === WHITE ? "w" : "b"} ${c || "-"} ${p.ep < 0 ? "-" : sqName(p.ep)} ${p.half} ${p.full}`;
}

export const clone = (p: Position): Position => ({ ...p, board: p.board.slice(), kings: [p.kings[0], p.kings[1]] });

/** Is square s attacked by side `by`? */
export function attacked(p: Position, s: number, by: number): boolean {
  const b = p.board;
  // pawns: a white pawn attacks up (-15/-17), so look below the square
  const pd = by === WHITE ? 16 : -16;
  for (const d of [pd - 1, pd + 1]) {
    const t = s + d;
    if (onBoard(t) && b[t] === by * P) return true;
  }
  for (const d of KNIGHT) { const t = s + d; if (onBoard(t) && b[t] === by * N) return true; }
  for (const d of KING) { const t = s + d; if (onBoard(t) && b[t] === by * K) return true; }
  for (const d of DIAG) {
    for (let t = s + d; onBoard(t); t += d) {
      const v = b[t];
      if (!v) continue;
      if (v === by * B || v === by * Q) return true;
      break;
    }
  }
  for (const d of ORTHO) {
    for (let t = s + d; onBoard(t); t += d) {
      const v = b[t];
      if (!v) continue;
      if (v === by * R || v === by * Q) return true;
      break;
    }
  }
  return false;
}

export const inCheck = (p: Position, side = p.side): boolean => attacked(p, p.kings[side === WHITE ? 0 : 1], -side);

/** Pseudo-legal moves (may leave the king in check). */
export function pseudo(p: Position, capturesOnly = false): Move[] {
  const out: Move[] = [];
  const b = p.board, us = p.side;
  const add = (from: number, to: number, piece: number, flags = 0, promo = 0) =>
    out.push({ from, to, piece, captured: b[to], promo, flags });
  for (let s = 0; s < 128; s++) {
    if (s & 0x88) { s += 7; continue; }
    const v = b[s];
    if (!v || Math.sign(v) !== us) continue;
    const t = Math.abs(v);
    if (t === P) {
      const dir = us === WHITE ? -16 : 16;
      const lastRank = us === WHITE ? 0 : 7, startRank = us === WHITE ? 6 : 1;
      const one = s + dir;
      const promos = (to: number, flags = 0) => {
        if (to >> 4 === lastRank) for (const pr of [Q, R, B, N]) add(s, to, v, flags, pr * us);
        else add(s, to, v, flags);
      };
      if (!capturesOnly && onBoard(one) && !b[one]) {
        promos(one);
        const two = one + dir;
        if (s >> 4 === startRank && !b[two]) add(s, two, v, 4);
      } else if (capturesOnly && onBoard(one) && !b[one] && one >> 4 === lastRank) {
        add(s, one, v, 0, Q * us);
      }
      for (const d of [dir - 1, dir + 1]) {
        const to = s + d;
        if (!onBoard(to)) continue;
        if (b[to] && Math.sign(b[to]) === -us) promos(to);
        else if (to === p.ep) out.push({ from: s, to, piece: v, captured: -us * P, promo: 0, flags: 1 });
      }
      continue;
    }
    if (t === N || t === K) {
      for (const d of t === N ? KNIGHT : KING) {
        const to = s + d;
        if (!onBoard(to)) continue;
        if (!b[to]) { if (!capturesOnly) add(s, to, v); }
        else if (Math.sign(b[to]) === -us) add(s, to, v);
      }
      if (t === K && !capturesOnly) castles(p, s, out);
      continue;
    }
    const dirs = t === B ? DIAG : t === R ? ORTHO : KING;
    for (const d of dirs) {
      for (let to = s + d; onBoard(to); to += d) {
        if (!b[to]) { if (!capturesOnly) add(s, to, v); continue; }
        if (Math.sign(b[to]) === -us) add(s, to, v);
        break;
      }
    }
  }
  return out;
}

function castles(p: Position, s: number, out: Move[]): void {
  const b = p.board, us = p.side;
  if (inCheck(p)) return;
  const [kSide, qSide, home] = us === WHITE ? [WK, WQ, 116] : [BK, BQ, 4];
  if (s !== home) return;
  if (p.castle & kSide && !b[s + 1] && !b[s + 2] && b[s + 3] === us * R && !attacked(p, s + 1, -us) && !attacked(p, s + 2, -us))
    out.push({ from: s, to: s + 2, piece: us * K, captured: 0, promo: 0, flags: 2 });
  if (p.castle & qSide && !b[s - 1] && !b[s - 2] && !b[s - 3] && b[s - 4] === us * R && !attacked(p, s - 1, -us) && !attacked(p, s - 2, -us))
    out.push({ from: s, to: s - 2, piece: us * K, captured: 0, promo: 0, flags: 2 });
}

// Castling rights lost when a piece leaves or lands on these squares.
const RIGHTS = new Map<number, number>([[116, WK | WQ], [119, WK], [112, WQ], [4, BK | BQ], [7, BK], [0, BQ]]);

export function make(p: Position, m: Move): Undo {
  const b = p.board, us = p.side;
  const undo: Undo = { castle: p.castle, ep: p.ep, half: p.half, captured: b[m.to], capSq: m.to };
  b[m.to] = m.promo || m.piece;
  b[m.from] = 0;
  if (m.flags & 1) {
    const cs = m.to + (us === WHITE ? 16 : -16);
    undo.captured = b[cs];
    undo.capSq = cs;
    b[cs] = 0;
  }
  if (m.flags & 2) {
    if (m.to > m.from) { b[m.from + 1] = b[m.from + 3]; b[m.from + 3] = 0; }
    else { b[m.from - 1] = b[m.from - 4]; b[m.from - 4] = 0; }
  }
  if (Math.abs(m.piece) === K) p.kings[us === WHITE ? 0 : 1] = m.to;
  p.castle &= ~((RIGHTS.get(m.from) ?? 0) | (RIGHTS.get(m.to) ?? 0));
  p.ep = m.flags & 4 ? (m.from + m.to) >> 1 : -1;
  p.half = Math.abs(m.piece) === P || undo.captured ? 0 : p.half + 1;
  if (us === BLACK) p.full++;
  p.side = -us;
  return undo;
}

export function unmake(p: Position, m: Move, u: Undo): void {
  const b = p.board;
  p.side = -p.side;
  const us = p.side;
  if (us === BLACK) p.full--;
  b[m.from] = m.piece;
  b[m.to] = 0;
  b[u.capSq] = u.captured;
  if (m.flags & 2) {
    if (m.to > m.from) { b[m.from + 3] = b[m.from + 1]; b[m.from + 1] = 0; }
    else { b[m.from - 4] = b[m.from - 1]; b[m.from - 1] = 0; }
  }
  if (Math.abs(m.piece) === K) p.kings[us === WHITE ? 0 : 1] = m.from;
  p.castle = u.castle;
  p.ep = u.ep;
  p.half = u.half;
}

export function legal(p: Position, capturesOnly = false): Move[] {
  const us = p.side;
  return pseudo(p, capturesOnly).filter((m) => {
    const u = make(p, m);
    const ok = !inCheck(p, us);
    unmake(p, m, u);
    return ok;
  });
}

export function perft(p: Position, depth: number): number {
  if (depth === 0) return 1;
  let n = 0;
  for (const m of pseudo(p)) {
    const us = p.side;
    const u = make(p, m);
    if (!inCheck(p, us)) n += depth === 1 ? 1 : perft(p, depth - 1);
    unmake(p, m, u);
  }
  return n;
}

export type Outcome = { over: false } | { over: true; winner: number; reason: "mate" | "stalemate" | "fifty" | "material" | "repetition" };

export function outcome(p: Position, history: string[] = []): Outcome {
  const moves = legal(p);
  if (!moves.length) return inCheck(p) ? { over: true, winner: -p.side, reason: "mate" } : { over: true, winner: 0, reason: "stalemate" };
  if (p.half >= 100) return { over: true, winner: 0, reason: "fifty" };
  const key = toFen(p).split(" ").slice(0, 4).join(" ");
  if (history.filter((h) => h === key).length >= 3) return { over: true, winner: 0, reason: "repetition" };
  // insufficient material: only kings, or king + single minor piece
  const rest = [...p.board].filter((v, i) => !(i & 0x88) && v && Math.abs(v) !== K).map(Math.abs);
  if (!rest.length || (rest.length === 1 && (rest[0] === N || rest[0] === B))) return { over: true, winner: 0, reason: "material" };
  return { over: false };
}

export const posKey = (p: Position): string => toFen(p).split(" ").slice(0, 4).join(" ");

/** Standard algebraic notation for a legal move in position p (before it is played). */
export function san(p: Position, m: Move): string {
  const t = Math.abs(m.piece);
  let s: string;
  if (m.flags & 2) s = m.to > m.from ? "O-O" : "O-O-O";
  else {
    const cap = m.captured || m.flags & 1;
    if (t === P) s = (cap ? sqName(m.from)[0] + "x" : "") + sqName(m.to) + (m.promo ? "=" + "PNBRQK"[Math.abs(m.promo) - 1] : "");
    else {
      const others = legal(p).filter((o) => o.piece === m.piece && o.to === m.to && o.from !== m.from);
      let dis = "";
      if (others.length) {
        const sameFile = others.some((o) => (o.from & 7) === (m.from & 7));
        const sameRank = others.some((o) => o.from >> 4 === m.from >> 4);
        dis = !sameFile ? sqName(m.from)[0] : !sameRank ? sqName(m.from)[1] : sqName(m.from);
      }
      s = "PNBRQK"[t - 1] + dis + (cap ? "x" : "") + sqName(m.to);
    }
  }
  const u = make(p, m);
  const check = inCheck(p);
  const mate = check && legal(p).length === 0;
  unmake(p, m, u);
  return s + (mate ? "#" : check ? "+" : "");
}
