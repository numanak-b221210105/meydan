// Expectiminimax for backgammon. Dice make the game random, so instead of
// assuming one opponent reply, the AI averages over all 21 possible rolls.
import { clone, pips, sequences, type Seq, type TState } from "./engine";

// Rolls that hit a blot at distance d (direct and combination shots), out of 36.
const SHOTS = [0, 11, 12, 14, 15, 15, 17, 6, 6, 5, 3, 2, 3, 0, 0, 1, 1, 0, 1, 0, 1, 0, 0, 0, 1];
export const ROLLS: { d: [number, number]; p: number }[] = [];
for (let a = 1; a <= 6; a++) for (let b = a; b <= 6; b++) ROLLS.push({ d: [a, b], p: a === b ? 1 / 36 : 2 / 36 });

/** Heuristic score for `side`; positive is good. Roughly in pips. */
export function evaluate(s: TState, side: 0 | 1): number {
  const me = s.pts[side], op = s.pts[1 - side];
  if (s.off[side] === 15) return 1000;
  if (s.off[1 - side] === 15) return -1000;
  const pipMe = pips(s, side), pipOp = pips(s, (1 - side) as 0 | 1);
  // Contact: is any of my checkers still behind an opponent checker?
  let myBack = 0, opBack = 0;
  for (let i = 25; i >= 1; i--) if (me[i]) { myBack = i; break; }
  for (let i = 25; i >= 1; i--) if (op[i]) { opBack = i; break; }
  const contact = myBack + opBack > 25;
  let score = (pipOp - pipMe) + 8 * (s.off[side] - s.off[1 - side]);
  if (!contact) return score * 1.2;

  // Blots: my single checkers the opponent can hit.
  for (let i = 1; i <= 24; i++) {
    if (me[i] !== 1) continue;
    let shots = 0;
    for (let j = 1; j <= 25; j++) {
      if (!op[j]) continue;
      const dist = j - (25 - i); // opponent moves down its own numbering
      if (dist > 0 && dist < SHOTS.length) shots = Math.max(shots, SHOTS[dist]);
    }
    score -= (shots / 36) * (6 + (25 - i) * 0.55);
  }
  // Made points, home board and the bar point; plus the longest prime.
  let run = 0, best = 0;
  for (let i = 1; i <= 24; i++) {
    if (me[i] >= 2) {
      score += i <= 6 ? 2.6 : i === 7 ? 3.2 : i <= 11 ? 1.2 : 0.4;
      run++;
      best = Math.max(best, run);
    } else run = 0;
  }
  score += best >= 3 ? (best - 2) * 3.5 : 0;
  // Checkers on the bar, and how hard it is for them to enter.
  let opHome = 0;
  for (let i = 1; i <= 6; i++) if (me[i] >= 2) opHome++;
  score += op[25] * (4 + opHome * 1.8);
  let myHomeBlock = 0;
  for (let i = 1; i <= 6; i++) if (op[i] >= 2) myHomeBlock++;
  score -= me[25] * (4 + myHomeBlock * 1.8);
  // Stacking too many checkers on one point wastes them.
  for (let i = 1; i <= 24; i++) if (me[i] > 3) score -= (me[i] - 3) * 0.6;
  // Back checkers left behind late in the game.
  if (pipMe < 120) for (let i = 19; i <= 24; i++) score -= me[i] * 1.2;
  return score;
}

/** Converts a heuristic score into a rough win probability. */
export const winProb = (score: number): number => 1 / (1 + Math.exp(-score / 18));

export interface Candidate { notation: string; seq: number; score: number; win: number }
export interface TavlaResult { best: number; candidates: Candidate[]; evaluated: number; ms: number; plies: 1 | 2 }

export function choose(s: TState, dice: [number, number], plies: 1 | 2, notationOf: (q: Seq) => string, progress?: (r: TavlaResult) => void): TavlaResult {
  const t0 = performance.now();
  const side = s.turn;
  const seqs = sequences(s, dice);
  let evaluated = seqs.length;
  if (!seqs.length) return { best: -1, candidates: [], evaluated: 0, ms: 0, plies };
  const first = seqs.map((q, i) => ({ i, score: evaluate(q.state, side) })).sort((a, b) => b.score - a.score);
  if (plies === 1 || seqs.length === 1) {
    const candidates = first.slice(0, 6).map((c) => ({ notation: notationOf(seqs[c.i]), seq: c.i, score: c.score, win: winProb(c.score) }));
    return { best: first[0].i, candidates, evaluated, ms: Math.round(performance.now() - t0), plies: 1 };
  }
  // Look one roll deeper for the most promising candidates.
  const top = first.slice(0, 6);
  const scored: Candidate[] = [];
  for (const c of top) {
    const after = seqs[c.i].state;
    let expected = 0;
    for (const r of ROLLS) {
      const replies = sequences(clone(after), r.d);
      evaluated += replies.length;
      let worst = Infinity;
      if (!replies.length) worst = evaluate(after, side);
      for (const rep of replies) worst = Math.min(worst, evaluate(rep.state, side));
      expected += r.p * worst;
    }
    scored.push({ notation: notationOf(seqs[c.i]), seq: c.i, score: expected, win: winProb(expected) });
    scored.sort((a, b) => b.score - a.score);
    progress?.({ best: scored[0].seq, candidates: scored.slice(), evaluated, ms: Math.round(performance.now() - t0), plies: 2 });
  }
  return { best: scored[0].seq, candidates: scored, evaluated, ms: Math.round(performance.now() - t0), plies: 2 };
}
