import { describe, expect, it } from "vitest";
import { astar, plan, space } from "../src/games/snake/ai";

describe("snake autopilot", () => {
  it("A* finds the shortest path to the food", () => {
    const s = { w: 10, h: 10, body: [0], food: 33 };
    const r = astar(s, 0, 33, s.body)!;
    expect(r.path.length).toBe(6); // 3 right + 3 down
  });
  it("walks around its own body", () => {
    // A wall of body between head and food
    const body = [5 * 10 + 1, 4 * 10 + 1, 3 * 10 + 1, 2 * 10 + 1, 1 * 10 + 1, 1 * 10 + 2, 1 * 10 + 3, 1 * 10 + 4, 1 * 10 + 5];
    const s = { w: 10, h: 10, body, food: 5 * 10 + 0 };
    const p = plan(s);
    expect(p.path.length).toBeGreaterThan(0);
    expect(body).not.toContain(p.path[0]);
  });
  it("never moves into a dead end it cannot leave", () => {
    const s = { w: 6, h: 6, body: [7, 8, 9, 10, 16, 22, 21, 20, 19, 13], food: 14 };
    const p = plan(s);
    const next = p.path[0];
    expect(next).toBeDefined();
    expect(space(s, next, [next, ...s.body.slice(0, -1)])).toBeGreaterThan(1);
  });
});
