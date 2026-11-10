import { think, type Job } from "../../core/ai";
import { h, segmented } from "../../core/dom";
import { L, fmt } from "../../core/i18n";
import type { Host } from "../../core/shell";
import { sfx } from "../../core/sfx";
import { bump } from "../../core/store";
import { evalBar, stats } from "../../core/viz";
import type { MctsResult } from "../mcts";
import { COLS, ROWS, canDrop, clone, drop, line, start, winner, type C4 } from "./engine";

type Mode = "first" | "second" | "watch";
const TIME = { easy: 250, mid: 1000, hard: 3000 };

export function mount(host: Host): void {
  let s = start();
  let mode: Mode = "first";
  let level: keyof typeof TIME = "mid";
  let job: Job<MctsResult<number>> | null = null;
  let heat: MctsResult<number> | null = null;
  let busy = false;

  const heatEl = h("div", { class: "c4-heat" });
  const boardEl = h("div", { class: "c4" });
  host.stage.append(h("div", { class: "board-col c4-col" }, heatEl, h("div", { class: "board-wrap c4wrap" }, boardEl)));
  host.controls.append(
    segmented<Mode>([["first", L("Sen başla", "You start")], ["second", L("AI başlasın", "AI starts")], ["watch", L("AI vs AI", "AI vs AI")]], mode, (m) => { mode = m; reset(); }),
    segmented<keyof typeof TIME>([["easy", L("Kolay", "Easy")], ["mid", L("Orta", "Medium")], ["hard", L("Zor", "Hard")]], level, (v) => { level = v; }),
    h("button", { class: "btn pri", onclick: () => reset() }, L("Yeni oyun", "New game")),
  );
  const winEl = host.section(L("AI'nin kazanma tahmini", "AI's win estimate"));
  const statEl = host.section(L("Ağaç araması", "Tree search"));
  const colEl = host.section(L("Sütunlara göre simülasyon", "Simulations per column"));
  host.section(L("Nasıl okunur", "How to read it")).innerHTML = `<p class="hint" style="text-align:left;margin:0">${L("Tahtanın üstündeki sütunlar, yapay zekânın o sütuna kaç simülasyon ayırdığını gösterir. Parlaklık ilgiyi, yüzde ise o hamleden sonra kazandığı rastgele oyunların oranını gösterir.", "The columns above the board show how many simulations the AI spent on each move. Brightness is attention; the percentage is how often random games after that move were won.")}</p>`;

  const humanSide = (): number => (mode === "first" ? 1 : mode === "second" ? -1 : 0);

  function reset() {
    job?.cancel();
    s = start();
    heat = null;
    busy = false;
    winEl.innerHTML = evalBar(0, L("AI", "AI"), L("Rakip", "Opponent"));
    statEl.innerHTML = stats([[L("Simülasyon", "Playouts"), "—"], [L("Hız", "Speed"), "—"], [L("Ağaç derinliği", "Tree depth"), "—"], [L("Süre", "Time"), "—"]]);
    colEl.innerHTML = "";
    draw();
    next();
  }

  function put(c: number) {
    const i = drop(s, c);
    sfx.move();
    draw(i);
    next();
  }

  function next() {
    const w = winner(s);
    if (w !== null) {
      const me = humanSide();
      const msg = w === 0 ? L("Berabere", "Draw") : me ? (w === me ? L("Kazandın!", "You win!") : L("Yapay zekâ kazandı", "The AI wins")) : w === 1 ? L("Camgöbeği kazandı", "Cyan wins") : L("Pembe kazandı", "Pink wins");
      host.status(msg, me ? (w === me ? "good" : w === 0 ? "warn" : "bad") : "");
      if (me) { bump("connect4", w === 0 ? "d" : w === me ? "w" : "l"); w === me ? sfx.win() : sfx.lose(); }
      if (mode === "watch") setTimeout(() => { if (!host.closed && mode === "watch") reset(); }, 2600);
      return;
    }
    if (s.side === humanSide()) { host.status(L("Sıra sende: bir sütun seç", "Your move: pick a column")); return; }
    busy = true;
    host.status(`<span class="spin"></span>${L("Yapay zekâ binlerce oyun oynuyor…", "The AI is playing thousands of games…")}`);
    const snap = clone(s);
    job = think<MctsResult<number>>("c4.mcts", { state: snap, ms: mode === "watch" ? 700 : TIME[level] }, (r) => { heat = r; showHeat(snap); });
    job.promise.then((r) => {
      if (host.closed) return;
      heat = r;
      showHeat(snap);
      busy = false;
      setTimeout(() => { if (!host.closed) put(r.best); }, 180);
    }).catch(() => {});
  }

  function showHeat(snap: C4) {
    if (!heat) return;
    const total = heat.stats.reduce((a, x) => a + x.visits, 0) || 1;
    const best = heat.stats[0];
    winEl.innerHTML = evalBar((best?.winRate ?? 0.5) * 2 - 1, L("AI", "AI"), L("Rakip", "Opponent"));
    statEl.innerHTML = stats([[L("Simülasyon", "Playouts"), fmt(heat.iterations)], [L("Hız", "Speed"), fmt(Math.round(heat.iterations / Math.max(1, heat.ms / 1000))) + "/s"], [L("Ağaç derinliği", "Tree depth"), heat.depth], [L("Süre", "Time"), heat.ms + " ms"]]);
    colEl.innerHTML = `<div class="colbars">${Array.from({ length: COLS }, (_, c) => {
      const st = heat!.stats.find((x) => x.move === c);
      const share = st ? st.visits / total : 0;
      return `<div class="cb ${st && st === best ? "hot" : ""}"><i style="height:${Math.max(3, share * 100)}%"></i><b>${st ? Math.round(st.winRate * 100) + "%" : "–"}</b><small>${c + 1}</small></div>`;
    }).join("")}</div>`;
    heatEl.replaceChildren(...Array.from({ length: COLS }, (_, c) => {
      const st = heat!.stats.find((x) => x.move === c);
      const share = st ? st.visits / total : 0;
      return h("div", { class: "hc" + (st === best ? " hot" : ""), style: `--a:${Math.min(1, share * 2.2)}` }, canDrop(snap, c) && st ? Math.round(st.winRate * 100) + "%" : "");
    }));
  }

  function draw(dropped = -1) {
    const w = winner(s);
    const win = w ? line(s.b, s.last) ?? [] : [];
    const human = s.side === humanSide() && w === null && !busy;
    boardEl.replaceChildren();
    for (let c = 0; c < COLS; c++) {
      const col = h("div", { class: "c4c" + (human && canDrop(s, c) ? " can" : ""), onclick: () => { if (human && canDrop(s, c)) put(c); } });
      for (let r = 0; r < ROWS; r++) {
        const i = r * COLS + c, v = s.b[i];
        const cell = h("div", { class: "c4s" });
        if (v) cell.append(h("i", { class: "disc " + (v > 0 ? "p1" : "p2") + (win.includes(i) ? " win" : "") + (i === dropped ? " drop" : ""), style: i === dropped ? `--r:${r + 1}` : "" }));
        col.append(cell);
      }
      if (human && canDrop(s, c)) col.prepend(h("i", { class: "ghost " + (s.side > 0 ? "p1" : "p2") }));
      boardEl.append(col);
    }
  }

  host.onExit(() => job?.cancel());
  reset();
}
