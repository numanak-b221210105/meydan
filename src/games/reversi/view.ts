import { think, type Job } from "../../core/ai";
import { h, segmented } from "../../core/dom";
import { L, fmt } from "../../core/i18n";
import type { Host } from "../../core/shell";
import { sfx } from "../../core/sfx";
import { bump, load, save } from "../../core/store";
import { evalBar, stats } from "../../core/viz";
import type { MctsResult } from "../mcts";
import type { RevResult } from "./ai";
import { clone, count, flips, moves, play, start, winner } from "./engine";

type Mode = "minimax" | "mcts" | "duel";
type Brain = "minimax" | "mcts";
const sq = (i: number) => "abcdefgh"[i & 7] + (8 - (i >> 3));

export function mount(host: Host): void {
  let s = start();
  let mode: Mode = "minimax";
  let job: Job<unknown> | null = null;
  let hints = new Map<number, string>();
  let lastFlips: number[] = [];
  let last = -1;
  let duel = load<{ mcts: number; minimax: number; draw: number }>("reversi.duel", { mcts: 0, minimax: 0, draw: 0 });
  let duelSwap = false;

  const boardEl = h("div", { class: "rboard" });
  const scoreEl = h("div", { class: "rscore" });
  host.stage.append(h("div", { class: "board-col" }, scoreEl, h("div", { class: "board-wrap reversi" }, boardEl)));
  host.controls.append(
    segmented<Mode>([["minimax", L("Sen vs Minimax", "You vs Minimax")], ["mcts", L("Sen vs MCTS", "You vs MCTS")], ["duel", L("Düello: MCTS vs Minimax", "Duel: MCTS vs Minimax")]], mode, (m) => { mode = m; reset(); }),
    h("button", { class: "btn pri", onclick: () => reset() }, L("Yeni oyun", "New game")),
  );
  const whoEl = host.section(L("Sıradaki yapay zekâ", "AI to move"));
  const evalEl = host.section(L("Tahmin", "Estimate"));
  const statEl = host.section(L("Arama", "Search"));
  const duelEl = host.section(L("Düello skoru", "Duel score"));
  host.section(L("İki yaklaşım", "Two approaches")).innerHTML = `<p class="hint" style="text-align:left;margin:0"><b style="color:var(--cyan)">Minimax</b> ${L("köşe ve kenar ağırlıkları, hareket serbestliği gibi insan bilgisiyle konumu puanlar ve birkaç hamle derine bakar.", "scores positions with human knowledge (corner and edge weights, mobility) and looks a few moves deep.")}<br><br><b style="color:var(--mag)">MCTS</b> ${L("hiçbir strateji bilmez; rastgele oyunlar oynayarak hangi karenin kazandırdığını kendisi keşfeder. Düello modunda hangisinin daha iyi olduğunu izleyebilirsin.", "knows no strategy; it discovers which squares win by playing random games. In duel mode you can watch which one is stronger.")}</p>`;

  const brainFor = (side: number): Brain | null => {
    if (mode === "duel") return (side === 1) !== duelSwap ? "mcts" : "minimax";
    return side === 1 ? null : mode;
  };

  function reset() {
    job?.cancel();
    s = start();
    hints.clear();
    lastFlips = [];
    last = -1;
    draw();
    paintDuel();
    next();
  }
  function paintDuel() {
    duelEl.innerHTML = stats([["MCTS", duel.mcts], ["Minimax", duel.minimax], [L("Berabere", "Draws"), duel.draw], [L("Bu oyunda siyah", "Black this game"), mode === "duel" ? (duelSwap ? "Minimax" : "MCTS") : L("Sen", "You")]]);
  }

  function move(i: number) {
    lastFlips = play(s, i);
    last = i;
    hints.clear();
    i >= 0 ? (lastFlips.length > 3 ? sfx.capture() : sfx.move()) : null;
    draw();
    next();
  }

  function next() {
    const w = winner(s);
    const [a, z] = count(s);
    if (w !== null) {
      if (mode === "duel") {
        const bw = w === 0 ? null : brainFor(w);
        if (bw) duel[bw]++; else duel.draw++;
        save("reversi.duel", duel);
        host.status(`${bw ? (bw === "mcts" ? "MCTS" : "Minimax") + " " + L("kazandı", "wins") : L("Berabere", "Draw")} · ${a} – ${z}`);
        duelSwap = !duelSwap;
        paintDuel();
        setTimeout(() => { if (!host.closed && mode === "duel") reset(); }, 2600);
      } else {
        host.status(`${w === 1 ? L("Kazandın!", "You win!") : w === 0 ? L("Berabere", "Draw") : L("Yapay zekâ kazandı", "The AI wins")} · ${a} – ${z}`, w === 1 ? "good" : w === 0 ? "warn" : "bad");
        bump("reversi", w === 1 ? "w" : w === 0 ? "d" : "l");
        w === 1 ? sfx.win() : sfx.lose();
      }
      return;
    }
    const brain = brainFor(s.side);
    if (!moves(s).length) {
      host.status(L("Hamle yok, sıra geçiyor", "No move, passing"), "warn");
      setTimeout(() => { if (!host.closed) move(-1); }, 900);
      return;
    }
    if (!brain) { host.status(L("Sıra sende", "Your move")); whoEl.innerHTML = `<p class="hint" style="margin:0">${L("Senin sıran. Noktalı kareler yasal hamlelerin.", "Your turn. Dotted squares are your legal moves.")}</p>`; return; }
    whoEl.innerHTML = `<div class="who ${brain}"><b>${brain === "mcts" ? "MCTS" : "Minimax"}</b><span>${brain === "mcts" ? L("Rastgele oyunlarla öğreniyor", "Learning from random games") : L("Ağaç araması + konum bilgisi", "Tree search + positional knowledge")}</span></div>`;
    host.status(`<span class="spin"></span>${brain === "mcts" ? "MCTS" : "Minimax"} ${L("düşünüyor…", "is thinking…")}`);
    const snap = clone(s);
    const ms = mode === "duel" ? 700 : 1200;
    if (brain === "mcts") {
      const j = think<MctsResult<number>>("rev.mcts", { state: snap, ms }, (r) => showMcts(r));
      job = j;
      j.promise.then((r) => { if (host.closed) return; showMcts(r); setTimeout(() => !host.closed && move(r.best), 200); }).catch(() => {});
    } else {
      const j = think<RevResult>("rev.minimax", { state: snap, ms, maxDepth: 8 }, (r) => showMinimax(r));
      job = j;
      j.promise.then((r) => { if (host.closed) return; showMinimax(r); setTimeout(() => !host.closed && move(r.best), 200); }).catch(() => {});
    }
  }

  function showMcts(r: MctsResult<number>) {
    hints = new Map(r.stats.map((x) => [x.move, Math.round(x.winRate * 100) + "%"]));
    const best = r.stats[0];
    evalEl.innerHTML = evalBar((best?.winRate ?? 0.5) * 2 - 1, "MCTS", L("Rakip", "Opponent"));
    statEl.innerHTML = stats([[L("Simülasyon", "Playouts"), fmt(r.iterations)], [L("Ağaç derinliği", "Tree depth"), r.depth], [L("En iyi hamle", "Best move"), best ? sq(best.move) : "—"], [L("Süre", "Time"), r.ms + " ms"]]);
    draw();
  }
  function showMinimax(r: RevResult) {
    hints = new Map(r.scores.map((x) => [x.move, (x.score >= 0 ? "+" : "") + Math.round(x.score)]));
    evalEl.innerHTML = evalBar(Math.tanh(r.score / 120), "Minimax", L("Rakip", "Opponent"));
    statEl.innerHTML = stats([[L("Derinlik", "Depth"), r.depth], [L("Konum", "Nodes"), fmt(r.nodes)], [L("En iyi hamle", "Best move"), sq(r.best)], [L("Süre", "Time"), r.ms + " ms"]]);
    draw();
  }

  function draw() {
    const human = !brainFor(s.side) && winner(s) === null;
    const legal = new Set(moves(s));
    const [a, z] = count(s);
    scoreEl.innerHTML = `<span class="p1"><i></i>${mode === "duel" ? (duelSwap ? "Minimax" : "MCTS") : L("Sen", "You")} <b>${a}</b></span><span class="p2"><b>${z}</b> ${mode === "duel" ? (duelSwap ? "MCTS" : "Minimax") : mode === "mcts" ? "MCTS" : "Minimax"}<i></i></span>`;
    boardEl.replaceChildren();
    for (let i = 0; i < 64; i++) {
      const v = s.b[i];
      const cls = ["rs"];
      if (i === last) cls.push("last");
      if (human && legal.has(i)) cls.push("can");
      const el = h("div", { class: cls.join(" "), onclick: () => { if (human && legal.has(i)) move(i); }, title: human && legal.has(i) ? `${sq(i)} · ${flips(s, i).length} ${L("taş çevirir", "flips")}` : sq(i) });
      if (v) el.append(h("i", { class: "disc " + (v > 0 ? "p1" : "p2") + (lastFlips.includes(i) ? " flip" : "") + (i === last ? " placed" : "") }));
      else if (hints.has(i) && !human) el.append(h("span", { class: "hintv" }, hints.get(i)!));
      boardEl.append(el);
    }
  }

  host.onExit(() => job?.cancel());
  reset();
}
