import { describe, expect, it } from "vitest";
import { GW, T, botThink, create, dangerMap, idx, placeBomb, step } from "../src/games/bomber/game";

const flat = () => {
  const w = create(0, () => 0.99); // no boxes, no power-ups
  return w;
};

describe("bomber arena", () => {
  it("builds walls on the border and pillars on even cells", () => {
    const w = flat();
    expect(w.grid[idx(0, 0)]).toBe(T.Wall);
    expect(w.grid[idx(2, 2)]).toBe(T.Wall);
    expect(w.grid[idx(1, 1)]).toBe(T.Empty);
  });
  it("danger map follows the blast and stops at walls", () => {
    const w = flat();
    w.bombs.push({ x: 1, y: 1, t: 2, range: 3, owner: 0 });
    const d = dangerMap(w);
    expect(d[idx(1, 1)]).toBe(2);
    expect(d[idx(4, 1)]).toBe(2);
    expect(d[idx(5, 1)]).toBe(Infinity);
    expect(d[idx(2, 2)]).toBe(Infinity); // pillar
  });
  it("chain reactions take the earliest timer", () => {
    const w = flat();
    w.bombs.push({ x: 1, y: 1, t: 0.5, range: 2, owner: 0 }, { x: 3, y: 1, t: 2, range: 2, owner: 1 });
    const d = dangerMap(w);
    expect(d[idx(5, 1)]).toBe(0.5);
  });
  it("a bot standing on its own bomb runs to safety", () => {
    const w = flat();
    const a = w.agents[1];
    placeBomb(w, a);
    w.danger = dangerMap(w);
    const r = botThink(w, a);
    expect(r.dir).toBeGreaterThanOrEqual(0);
    expect(a.intent).toBe("flee");
  });
  it("bombs destroy boxes and kill agents in the blast", () => {
    const w = flat();
    w.grid[idx(3, 1)] = T.Box;
    const a = w.agents[0];
    placeBomb(w, a);
    for (let i = 0; i < 40; i++) step(w, 0.1);
    expect(w.grid[idx(3, 1)]).toBe(T.Empty);
    expect(a.alive).toBe(false);
    expect(GW).toBe(15);
  });
});
