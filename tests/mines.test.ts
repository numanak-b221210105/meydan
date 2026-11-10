import { describe, expect, it } from "vitest";
import { create, neighbors, reveal, solve, type MState } from "../src/games/mines/engine";

function fixed(w: number, h: number, mines: number[]): MState {
  const s = create(w, h, mines.length);
  mines.forEach((m) => (s.mine[m] = 1));
  for (let i = 0; i < w * h; i++) s.n[i] = neighbors(s, i).filter((j) => s.mine[j]).length;
  s.started = true;
  return s;
}

describe("minesweeper", () => {
  it("first click is safe and opens an area", () => {
    const s = create(16, 16, 40);
    const opened = reveal(s, 100);
    expect(s.lost).toBe(false);
    expect(opened.length).toBeGreaterThan(0);
  });
  it("solver finds a certain mine and certain safe cells (1-1 pattern)", () => {
    // 3x2 board, single mine in the corner (top-left). Open the bottom row.
    const s = fixed(3, 2, [0]);
    reveal(s, 3); reveal(s, 4); reveal(s, 5);
    const r = solve(s);
    expect(r.prob[0]).toBeCloseTo(1);
    expect(r.mines).toEqual([0]);
    // Cell 1 is either already opened by the flood fill or certainly safe.
    for (const c of [1, 2]) expect(s.open[c] === 1 || r.safe.includes(c)).toBe(true);
  });
  it("50/50 when the numbers cannot decide", () => {
    // 2x2 board with one mine on top; the bottom row shows 1 and 1.
    const s = fixed(2, 2, [0]);
    reveal(s, 2); reveal(s, 3);
    const r = solve(s);
    expect(r.prob[0]).toBeCloseTo(0.5);
    expect(r.prob[1]).toBeCloseTo(0.5);
  });
  it("probabilities of closed cells add up to the mine count", () => {
    const s = create(16, 16, 40);
    reveal(s, 120);
    const r = solve(s);
    let sum = 0;
    for (let i = 0; i < 256; i++) if (!s.open[i]) sum += r.prob[i];
    expect(sum).toBeCloseTo(40, 4);
  });
});
