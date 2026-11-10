import { describe, expect, it } from "vitest";
import { drop, game, line, start, winner } from "../src/games/connect4/engine";
import { mcts } from "../src/games/mcts";

describe("connect four", () => {
  it("detects a diagonal win", () => {
    const s = start();
    // 1:col0 2:col1 1:col1 2:col2 1:col2 2:col3 1:col2 2:col3 1:col3 2:col6 1:col3
    for (const c of [0, 1, 1, 2, 2, 3, 2, 3, 3, 6, 3]) drop(s, c);
    expect(winner(s)).toBe(1);
    expect(line(s.b, s.last)?.length).toBe(4);
  });
  it("MCTS takes an immediate win", () => {
    const s = start();
    for (const c of [0, 6, 1, 6, 2]) drop(s, c); // red has three in a row on the bottom
    s.side = 1;
    const r = mcts(game, s, { ms: 400 });
    expect(r.best).toBe(3);
  });
  it("MCTS blocks an immediate loss", () => {
    const s = start();
    for (const c of [6, 0, 6, 1, 5, 2]) drop(s, c); // yellow threatens col 3
    const r = mcts(game, s, { ms: 600 });
    expect(r.best).toBe(3);
  });
});
