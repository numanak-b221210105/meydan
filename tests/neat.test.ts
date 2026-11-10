import { describe, expect, it } from "vitest";
import { forward, nextGeneration, randomNet } from "../src/games/flappy/neat";

describe("neuroevolution", () => {
  it("forward pass returns a probability", () => {
    const r = forward(randomNet(), [0.1, -0.2, 0.3, 0.4, 0.5]);
    expect(r.out).toBeGreaterThan(0);
    expect(r.out).toBeLessThan(1);
    expect(r.hidden.length).toBe(6);
  });
  it("keeps the population size and the best network", () => {
    const pop = Array.from({ length: 20 }, (_, i) => ({ net: randomNet(), fitness: i }));
    const next = nextGeneration(pop, 20);
    expect(next.length).toBe(20);
    expect(Array.from(next[0].w1)).toEqual(Array.from(pop[19].net.w1));
  });
  it("evolution improves a simple task (output > 0.5 when x0 > 0)", () => {
    const task = (n: ReturnType<typeof randomNet>) => {
      let ok = 0;
      for (let i = -10; i <= 10; i++) if (i !== 0 && (forward(n, [i / 10, 0, 0, 0, 0]).out > 0.5) === i > 0) ok++;
      return ok;
    };
    let pop = Array.from({ length: 30 }, randomNet);
    const first = Math.max(...pop.map(task));
    for (let g = 0; g < 25; g++) pop = nextGeneration(pop.map((net) => ({ net, fitness: task(net) })), 30);
    expect(Math.max(...pop.map(task))).toBeGreaterThanOrEqual(Math.max(first, 18));
  });
});
