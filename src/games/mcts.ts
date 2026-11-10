// Generic Monte Carlo Tree Search (UCT). It needs no evaluation function:
// it plays thousands of random games and grows a tree towards moves that win.

export interface MctsGame<S, M> {
  moves(s: S): M[];
  play(s: S, m: M): S; // returns a new state
  toMove(s: S): number; // 1 or -1
  /** 1 or -1 for a winner, 0 for a draw, null while the game is running. */
  winner(s: S): number | null;
  /** Fast random playout to the end; returns the winner (1, -1 or 0). */
  rollout(s: S): number;
}

interface Node<M> { move: M | null; parent: Node<M> | null; children: Node<M>[]; untried: M[]; visits: number; wins: number; player: number }

export interface MctsStat<M> { move: M; visits: number; winRate: number }
export interface MctsResult<M> { best: M; stats: MctsStat<M>[]; iterations: number; ms: number; depth: number }

export function mcts<S, M>(game: MctsGame<S, M>, root: S, opts: { ms: number; maxIter?: number; c?: number }, progress?: (r: MctsResult<M>) => void): MctsResult<M> {
  const t0 = performance.now();
  const C = opts.c ?? 1.4;
  const mk = (s: S, move: M | null, parent: Node<M> | null): Node<M> => ({ move, parent, children: [], untried: game.winner(s) === null ? game.moves(s) : [], visits: 0, wins: 0, player: parent ? -game.toMove(s) : -game.toMove(s) });
  const rootNode = mk(root, null, null);
  let iter = 0, maxDepth = 0, lastReport = t0;
  const summary = (): MctsResult<M> => {
    const stats = rootNode.children.map((c) => ({ move: c.move as M, visits: c.visits, winRate: c.visits ? c.wins / c.visits : 0 })).sort((a, b) => b.visits - a.visits);
    return { best: stats[0]?.move as M, stats, iterations: iter, ms: Math.round(performance.now() - t0), depth: maxDepth };
  };
  while (performance.now() - t0 < opts.ms && (!opts.maxIter || iter < opts.maxIter)) {
    let node = rootNode, s = root, depth = 0;
    // 1. selection
    while (!node.untried.length && node.children.length) {
      const logN = Math.log(node.visits);
      let best = node.children[0], bestV = -Infinity;
      for (const ch of node.children) {
        const v = ch.wins / ch.visits + C * Math.sqrt(logN / ch.visits);
        if (v > bestV) { bestV = v; best = ch; }
      }
      node = best;
      s = game.play(s, node.move as M);
      depth++;
    }
    // 2. expansion
    if (node.untried.length) {
      const i = Math.floor(Math.random() * node.untried.length);
      const m = node.untried.splice(i, 1)[0];
      s = game.play(s, m);
      const child = mk(s, m, node);
      node.children.push(child);
      node = child;
      depth++;
    }
    maxDepth = Math.max(maxDepth, depth);
    // 3. simulation
    const w = game.winner(s) ?? game.rollout(s);
    // 4. backpropagation: each node scores from the view of the player who moved into it
    for (let n: Node<M> | null = node; n; n = n.parent) {
      n.visits++;
      if (w === n.player) n.wins += 1;
      else if (w === 0) n.wins += 0.5;
    }
    iter++;
    if (progress && performance.now() - lastReport > 90) { lastReport = performance.now(); progress(summary()); }
  }
  return summary();
}
