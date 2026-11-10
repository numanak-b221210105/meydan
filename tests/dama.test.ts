import { describe, expect, it } from "vitest";
import { search } from "../src/games/dama/ai";
import { moves, play, result, start, type DState } from "../src/games/dama/engine";

const empty = (side: 1 | -1 = 1): DState => ({ b: new Int8Array(64), side, quiet: 0 });
const at = (n: string) => (8 - Number(n[1])) * 8 + n.charCodeAt(0) - 97;

describe("dama rules", () => {
  it("has 16 men each and white's opening moves", () => {
    const s = start();
    expect([...s.b].filter((v) => v === 1).length).toBe(16);
    // Only the front row (rank 3) can move: 8 forward moves; sideways is blocked.
    expect(moves(s).length).toBe(8);
  });
  it("men cannot capture backwards", () => {
    const s = empty();
    s.b[at("d4")] = 1; s.b[at("d3")] = -1;
    expect(moves(s).every((m) => m.caps.length === 0)).toBe(true);
  });
  it("forces the sequence that captures the most pieces", () => {
    const s = empty();
    s.b[at("a2")] = 1;
    s.b[at("a3")] = -1; s.b[at("a5")] = -1; // two in a row up the a-file
    s.b[at("b2")] = -1; // a single sideways capture is also possible
    s.b[at("h8")] = -1;
    const ms = moves(s);
    expect(ms.length).toBe(1);
    expect(ms[0].caps.length).toBe(2);
  });
  it("kings fly and capture from a distance", () => {
    const s = empty();
    s.b[at("a1")] = 2; s.b[at("a6")] = -1; s.b[at("h8")] = -1;
    const ms = moves(s);
    expect(ms.every((m) => m.caps.length === 1)).toBe(true);
    expect(ms.map((m) => m.path[1]).sort()).toEqual([at("a7"), at("a8")].sort());
  });
  it("promotes on the last row", () => {
    const s = empty();
    s.b[at("c7")] = 1; s.b[at("h1")] = -1;
    const m = moves(s).find((x) => x.path[1] === at("c8"))!;
    expect(m.promote).toBe(true);
    play(s, m);
    expect(s.b[at("c8")]).toBe(2);
  });
  it("a side with no pieces loses", () => {
    const s = empty();
    s.b[at("c3")] = 1;
    expect(result(s)).toEqual({ over: true, winner: 1 });
  });
});

describe("dama AI", () => {
  it("takes a free piece", () => {
    const s = empty();
    s.b[at("d4")] = 1; s.b[at("d5")] = -1; s.b[at("a8")] = -1; s.b[at("h1")] = 1;
    const r = search(s, { ms: 1500, maxDepth: 4 });
    expect(r.best?.caps.length).toBe(1);
  });
});
