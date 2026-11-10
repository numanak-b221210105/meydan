import { describe, expect, it } from "vitest";
import { search } from "../src/games/reversi/ai";
import { count, moves, over, play, start } from "../src/games/reversi/engine";

describe("reversi", () => {
  it("has four opening moves that each flip one disc", () => {
    const s = start();
    expect(moves(s).sort((a, b) => a - b)).toEqual([19, 26, 37, 44]);
    expect(play(s, 19)).toEqual([27]);
    expect(count(s)).toEqual([4, 1]);
  });
  it("ends when nobody can move", () => {
    const s = start();
    s.b.fill(1);
    expect(over(s)).toBe(true);
  });
  it("minimax grabs an available corner", () => {
    const s = start();
    s.b.fill(0);
    s.b[9] = -1; s.b[18] = 1; // black can take corner 0 by flanking 9
    s.b[44] = -1; s.b[45] = 1;
    const r = search(s, { ms: 800, maxDepth: 4 });
    expect(r.best).toBe(0);
  });
});
