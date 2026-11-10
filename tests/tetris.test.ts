import { describe, expect, it } from "vitest";
import { DEFAULT_WEIGHTS, best, features, simulate } from "../src/games/tetris/ai";
import { COLS, ROWS, SHAPES, cells, lock, spawn } from "../src/games/tetris/engine";

describe("tetris", () => {
  it("every rotation has four cells", () => {
    for (const k of SHAPES) for (const r of k) expect(r.length).toBe(4);
  });
  it("clears a full line", () => {
    const b = new Uint8Array(COLS * ROWS);
    for (let x = 0; x < 6; x++) b[(ROWS - 1) * COLS + x] = 1;
    const p = { ...spawn(0), y: ROWS - 2, x: 6 }; // horizontal I fills columns 6..9 on the last row
    expect(cells(p).every(([, y]) => y === ROWS - 1)).toBe(true);
    expect(lock(b, p)).toBe(1);
    expect([...b].every((v) => v === 0)).toBe(true);
  });
  it("counts holes and heights", () => {
    const b = new Uint8Array(COLS * ROWS);
    b[(ROWS - 2) * COLS] = 1; // a block with an empty cell below it
    const f = features(b, 0);
    expect(f.holes).toBe(1);
    expect(f.height).toBe(2);
  });
  it("the AI fills an obvious gap", () => {
    const b = new Uint8Array(COLS * ROWS);
    for (let x = 0; x < COLS; x++) if (x !== 4) { b[(ROWS - 1) * COLS + x] = 1; b[(ROWS - 2) * COLS + x] = 1; }
    const r = best(b, 0, DEFAULT_WEIGHTS);
    expect(r.best!.f.lines).toBe(2); // vertical I in the gap
  });
  it("plays a long game with the default weights", () => {
    expect(simulate(DEFAULT_WEIGHTS, 400, 42)).toBeGreaterThan(100);
  });
});
