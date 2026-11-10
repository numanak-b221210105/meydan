import { describe, expect, it } from "vitest";
import { START, fromFen, legal, make, outcome, perft, san, toFen } from "../src/games/chess/engine";

// Reference node counts from the Chess Programming Wiki "Perft Results" page.
describe("chess move generation (perft)", () => {
  it("start position", () => {
    const p = fromFen(START);
    expect(perft(p, 1)).toBe(20);
    expect(perft(p, 2)).toBe(400);
    expect(perft(p, 3)).toBe(8902);
    expect(perft(p, 4)).toBe(197281);
  });
  it("kiwipete: castling, en passant, promotions, pins", () => {
    const p = fromFen("r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1");
    expect(perft(p, 1)).toBe(48);
    expect(perft(p, 2)).toBe(2039);
    expect(perft(p, 3)).toBe(97862);
  });
  it("position 3: en passant discovered checks", () => {
    const p = fromFen("8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1");
    expect(perft(p, 4)).toBe(43238);
  });
  it("position 4: promotions and castling under attack", () => {
    const p = fromFen("r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1");
    expect(perft(p, 3)).toBe(9467);
  });
  it("position 5", () => {
    const p = fromFen("rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8");
    expect(perft(p, 3)).toBe(62379);
  });
});

describe("chess rules", () => {
  it("round-trips FEN", () => {
    const f = "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1";
    expect(toFen(fromFen(f))).toBe(f);
  });
  it("detects fool's mate and writes SAN", () => {
    const p = fromFen(START);
    const play = (s: string) => { const m = legal(p).find((m) => san(p, m) === s); expect(m, s).toBeTruthy(); make(p, m!); };
    ["f3", "e5", "g4"].forEach(play);
    const mate = legal(p).find((m) => san(p, m) === "Qh4#");
    expect(mate).toBeTruthy();
    make(p, mate!);
    expect(outcome(p)).toEqual({ over: true, winner: -1, reason: "mate" });
  });
});

import { search } from "../src/games/chess/ai";
describe("chess AI", () => {
  it("finds mate in one", () => {
    const p = fromFen("6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1");
    const r = search(p, { ms: 2000, maxDepth: 3 });
    expect(r.pv[0]).toBe("a1a8");
  });
  it("wins a hanging queen", () => {
    const p = fromFen("4k3/8/8/3q4/8/8/3R4/4K3 w - - 0 1");
    const r = search(p, { ms: 2000, maxDepth: 3 });
    expect(r.pv[0]).toBe("d2d5");
  });
});
