// Tasks that run inside the AI worker.
import { search } from "./chess/ai";
import { fromFen } from "./chess/engine";
import { game as c4 } from "./connect4/engine";
import { search as damaSearch } from "./dama/ai";
import { mcts } from "./mcts";
import { search as revSearch } from "./reversi/ai";
import { game as rev } from "./reversi/engine";
import { choose } from "./tavla/ai";
import { evolve } from "./tetris/ai";
import { notation, sequences } from "./tavla/engine";

type Handler = (data: any, progress: (d: unknown) => void) => unknown;

export const handlers: Record<string, Handler> = {
  "chess.search": (d, progress) => search(fromFen(d.fen), { ms: d.ms, maxDepth: d.maxDepth }, progress),
  "c4.mcts": (d, progress) => mcts(c4, d.state, { ms: d.ms }, progress),
  "rev.mcts": (d, progress) => mcts(rev, d.state, { ms: d.ms }, progress),
  "rev.minimax": (d, progress) => revSearch(d.state, { ms: d.ms, maxDepth: d.maxDepth }, progress),
  "tetris.evolve": (d, progress) => evolve(d, progress),
  "dama.search": (d, progress) => damaSearch(d.state, { ms: d.ms, maxDepth: d.maxDepth }, progress),
  "tavla.choose": (d, progress) => {
    const r = choose(d.state, d.dice, d.plies, (q) => notation(q.moves), progress);
    const seqs = sequences(d.state, d.dice);
    return { ...r, moves: r.best >= 0 ? seqs[r.best].moves : [] };
  },
};
