import { describe, expect, it } from "vitest";
import { choose, evaluate } from "../src/games/tavla/ai";
import { apply, canMove, notation, pips, sequences, start, winner, type TState } from "../src/games/tavla/engine";

const empty = (): TState => ({ pts: [new Array(26).fill(0), new Array(26).fill(0)], off: [0, 0], turn: 0 });

describe("tavla rules", () => {
  it("starts with 167 pips each", () => {
    const s = start();
    expect(pips(s, 0)).toBe(167);
    expect(pips(s, 1)).toBe(167);
  });
  it("cannot land on a point held by two opponent checkers", () => {
    const s = start();
    // White 24 -> 19 lands on black's 6-point (5 checkers)
    expect(canMove(s, 24, 5)).toBe(false);
    expect(canMove(s, 24, 1)).toBe(true);
  });
  it("hitting sends the blot to the bar, and the bar must enter first", () => {
    const s = empty();
    s.pts[0][10] = 1; s.pts[0][3] = 1;
    s.pts[1][25 - 7] = 1; // a black blot on white's 7-point
    const m = apply(s, 10, 3);
    expect(m.hit).toBe(true);
    expect(s.pts[1][25]).toBe(1);
    s.turn = 1;
    expect(canMove(s, 18, 1)).toBe(false); // black must enter from the bar
  });
  it("doubles give four moves; the larger die is forced when only one can be played", () => {
    const s = start();
    const q = sequences(s, [6, 6]);
    expect(q.every((x) => x.moves.length === 4)).toBe(true);
    const t = empty();
    t.pts[0][13] = 1;
    t.pts[1][25 - 3] = 2; // 13-7-3 and 13-9-3 both blocked: only one die can be played
    const r = sequences(t, [6, 4]);
    expect(r.length).toBe(1);
    expect(r[0].moves.map((m) => m.die)).toEqual([6]);
  });
  it("bears off only when every checker is home", () => {
    const s = empty();
    s.pts[0][3] = 2; s.pts[0][8] = 1;
    expect(canMove(s, 3, 3)).toBe(false);
    s.pts[0][8] = 0; s.pts[0][1] = 1;
    expect(canMove(s, 3, 3)).toBe(true);
    expect(canMove(s, 1, 6)).toBe(false); // a higher checker (on 3) must move first
    expect(canMove(s, 3, 6)).toBe(true);
  });
  it("detects the winner", () => {
    const s = empty();
    s.off[0] = 15;
    expect(winner(s)).toBe(0);
  });
});

describe("tavla AI", () => {
  it("makes its points with the classic opening 3-1 (8/5 6/5)", () => {
    const r = choose(start(), [3, 1], 2, (q) => notation(q.moves));
    expect(r.candidates[0].notation.split(" ").sort().join(" ")).toBe("6/5 8/5");
  });
  it("prefers hitting a blot in its home board", () => {
    const s = start();
    s.pts[1][13] = 4; s.pts[1][25 - 5] = 1; // black blot on white's 5-point
    const r = choose(s, [3, 1], 1, (q) => notation(q.moves));
    expect(r.candidates[0].notation).toContain("*");
  });
  it("evaluation is symmetric at the start", () => {
    const s = start();
    expect(evaluate(s, 0)).toBeCloseTo(evaluate(s, 1));
  });
});
