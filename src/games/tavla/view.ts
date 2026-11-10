import { think, type Job } from "../../core/ai";
import { h, segmented } from "../../core/dom";
import { L, fmt } from "../../core/i18n";
import type { Host } from "../../core/shell";
import { sfx } from "../../core/sfx";
import { bump } from "../../core/store";
import { bars, evalBar, log, stats } from "../../core/viz";
import { evaluate, winProb, type TavlaResult } from "./ai";
import { apply, clone, notation, pips, points, sequences, start, winner, type Seq, type TMove, type TState } from "./engine";

type Mode = "play" | "watch";
const PIPS: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

export function mount(host: Host): void {
  let s = start();
  let mode: Mode = "play";
  let plies: 1 | 2 = 2;
  let dice: [number, number] = [0, 0];
  let used: TMove[] = [];
  let seqs: Seq[] = [];
  let selected = -1;
  let turnStart: TState = clone(s);
  let job: Job<TavlaResult & { moves: TMove[] }> | null = null;
  let busy = false;
  let score: [number, number] = [0, 0];

  const boardEl = h("div", { class: "tboard" });
  const diceEl = h("div", { class: "dice" });
  host.stage.append(h("div", { class: "tavla-col" }, h("div", { class: "board-wrap tavla" }, boardEl), diceEl));
  const undoBtn = h("button", { class: "btn", onclick: () => undoPartial() }, L("Hamleyi geri al", "Undo move"));
  host.controls.append(
    segmented<Mode>([["play", L("Sen vs AI", "You vs AI")], ["watch", L("AI vs AI izle", "Watch AI vs AI")]], mode, (m) => { mode = m; newGame(); }),
    segmented<"1" | "2">([["1", L("Hızlı (1 zar)", "Fast (1 roll)")], ["2", L("Derin (2 zar)", "Deep (2 rolls)")]], "2", (v) => { plies = Number(v) as 1 | 2; }),
    undoBtn,
    h("button", { class: "btn pri", onclick: () => newGame() }, L("Yeni oyun", "New game")),
  );

  const winEl = host.section(L("Kazanma ihtimali", "Win probability"));
  const statEl = host.section(L("Durum", "State"));
  const candEl = host.section(L("Değerlendirilen hamleler", "Moves considered"));
  const logEl = h("div", { class: "logbox" });
  host.section(L("Hamle kaydı", "Move log")).append(logEl);

  function newGame() {
    job?.cancel();
    s = start();
    used = [];
    selected = -1;
    busy = false;
    candEl.innerHTML = `<div class="hint">${L("Yapay zekânın sırası gelince burada aday hamleleri görürsün.", "Candidate moves appear here on the AI's turn.")}</div>`;
    logEl.replaceChildren();
    s.turn = Math.random() < 0.5 ? 0 : 1;
    beginTurn();
  }

  const isHuman = () => mode === "play" && s.turn === 0;
  const sideName = (t: number) => (t === 0 ? L("Beyaz", "White") : L("Siyah", "Black"));

  async function beginTurn() {
    const w = winner(s);
    if (w >= 0) return finish(w as 0 | 1);
    busy = true;
    used = [];
    selected = -1;
    await rollAnim();
    turnStart = clone(s);
    seqs = sequences(s, dice, false);
    busy = false;
    draw();
    if (!seqs.length || !seqs[0].moves.length) {
      host.status(`${sideName(s.turn)}: ${L("oynanacak hamle yok", "no legal move")}`, "warn");
      log(logEl, `<b>${sideName(s.turn)}</b> ${dice.join("-")} · ${L("pas", "pass")}`);
      setTimeout(() => { if (!host.closed) endTurn(); }, 1200);
      return;
    }
    if (isHuman()) host.status(L("Sıra sende: bir pul seç", "Your move: pick a checker"));
    else aiTurn();
  }

  function rollAnim(): Promise<void> {
    return new Promise((res) => {
      let n = 0;
      const id = setInterval(() => {
        dice = [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
        drawDice(true);
        sfx.tick();
        if (++n >= 7 || host.closed) { clearInterval(id); drawDice(false); res(); }
      }, 70);
    });
  }

  function aiTurn() {
    host.status(`<span class="spin"></span>${sideName(s.turn)}: ${L("yapay zekâ hesaplıyor…", "the AI is calculating…")}`);
    const snapshot = clone(s);
    job = think("tavla.choose", { state: snapshot, dice, plies: mode === "watch" ? 1 : plies }, (r: TavlaResult) => showCandidates(r));
    job.promise.then(async (r) => {
      if (host.closed) return;
      showCandidates(r);
      for (const m of r.moves) {
        await new Promise((res) => setTimeout(res, mode === "watch" ? 260 : 420));
        if (host.closed) return;
        apply(s, m.from, m.die);
        used.push(m);
        m.hit ? sfx.capture() : sfx.move();
        draw();
      }
      setTimeout(() => { if (!host.closed) endTurn(); }, mode === "watch" ? 250 : 500);
    }).catch(() => {});
  }

  function endTurn() {
    log(logEl, `<b>${sideName(s.turn)}</b> ${dice.join("-")} · ${notation(used)}`);
    s.turn = (1 - s.turn) as 0 | 1;
    showWin();
    beginTurn();
  }

  function finish(w: 0 | 1) {
    const p = points(s, w);
    score[w] += p;
    const label = `${sideName(w)} ${L("kazandı", "wins")}${p === 2 ? " · " + L("MARS!", "GAMMON!") : ""}`;
    host.status(`${label} · ${score[0]} – ${score[1]}`, mode === "play" ? (w === 0 ? "good" : "bad") : "");
    if (mode === "play") { bump("tavla", w === 0 ? "w" : "l"); w === 0 ? sfx.win() : sfx.lose(); }
    log(logEl, `<b>${label}</b>`);
    if (mode === "watch") setTimeout(() => { if (!host.closed && mode === "watch") newGame(); }, 2500);
  }

  // ----- human input
  const prefixOk = (q: Seq) => used.every((m, i) => q.moves[i] && q.moves[i].from === m.from && q.moves[i].die === m.die);
  const nextMoves = (): TMove[] => {
    const out: TMove[] = [];
    for (const q of seqs) if (q.moves.length > used.length && prefixOk(q)) {
      const m = q.moves[used.length];
      if (!out.some((o) => o.from === m.from && o.to === m.to)) out.push(m);
    }
    return out;
  };
  function clickPoint(p: number) {
    if (!isHuman() || busy) return;
    const moves = nextMoves();
    if (selected >= 0) {
      const m = moves.find((x) => x.from === selected && x.to === p);
      if (m) {
        apply(s, m.from, m.die);
        used.push(m);
        m.hit ? sfx.capture() : sfx.move();
        selected = -1;
        draw();
        const maxLen = Math.max(...seqs.map((q) => q.moves.length));
        if (used.length >= maxLen) { busy = true; setTimeout(() => { busy = false; if (!host.closed) endTurn(); }, 450); }
        return;
      }
    }
    selected = moves.some((x) => x.from === p) ? p : -1;
    draw();
  }
  function undoPartial() {
    if (!isHuman() || !used.length || busy) return;
    s = clone(turnStart);
    used = [];
    selected = -1;
    draw();
  }

  // ----- drawing
  function checkers(n: number, color: "w" | "b", top: boolean) {
    const box = h("div", { class: "stack" + (top ? " top" : "") });
    const shown = Math.min(n, 5);
    for (let i = 0; i < shown; i++) box.append(h("i", { class: "ck " + color }, i === shown - 1 && n > 5 ? String(n) : ""));
    return box;
  }
  function draw() {
    const moves = isHuman() ? nextMoves() : [];
    const from = new Set(moves.map((m) => m.from));
    const dest = new Set(moves.filter((m) => m.from === selected).map((m) => m.to));
    const W = s.pts[0], B = s.pts[1];
    const pointEl = (p: number, top: boolean) => {
      const w = W[p], b = B[25 - p];
      const cls = ["pt", top ? "top" : "bot", p % 2 ? "odd" : "even"];
      if (from.has(p)) cls.push("can");
      if (p === selected) cls.push("sel");
      if (dest.has(p)) cls.push("dest");
      const el = h("div", { class: cls.join(" "), onclick: () => clickPoint(p) }, h("span", { class: "num" }, String(p)));
      if (w) el.append(checkers(w, "w", top));
      if (b) el.append(checkers(b, "b", top));
      return el;
    };
    const bar = h("div", { class: "bar-col" + (from.has(25) ? " can" : "") + (selected === 25 ? " sel" : ""), onclick: () => clickPoint(25) },
      B[25] ? checkers(B[25], "b", true) : "", h("span", { class: "bar-l" }, "BAR"), W[25] ? checkers(W[25], "w", false) : "");
    const off = h("div", { class: "off" + (dest.has(0) ? " dest" : ""), onclick: () => clickPoint(0) },
      h("div", { class: "tray b" }, ...Array.from({ length: s.off[1] }, () => h("i", {}))),
      h("small", {}, L("TOPLA", "OFF")),
      h("div", { class: "tray w" }, ...Array.from({ length: s.off[0] }, () => h("i", {}))));
    const q = (a: number, b: number, top: boolean) => {
      const out = h("div", { class: "quad" });
      for (let p = a; a < b ? p <= b : p >= b; p += a < b ? 1 : -1) out.append(pointEl(p, top));
      return out;
    };
    boardEl.replaceChildren(
      h("div", { class: "half top" }, q(13, 18, true), h("div", { class: "bar-sp" }), q(19, 24, true)),
      h("div", { class: "half bot" }, q(12, 7, false), h("div", { class: "bar-sp" }), q(6, 1, false)),
      bar, off);
    drawDice(false);
    undoBtn.toggleAttribute("disabled", !(isHuman() && used.length));
    showWin();
  }
  function drawDice(rolling: boolean) {
    const usedDice = used.map((m) => m.die);
    const list = dice[0] === dice[1] ? [dice[0], dice[0], dice[0], dice[0]] : dice;
    const left = [...usedDice];
    diceEl.replaceChildren(h("span", { class: "turn-l" }, `${sideName(s.turn)} ${L("zar atıyor", "to roll")}`),
      ...list.map((d) => {
        const i = left.indexOf(d);
        const spent = !rolling && i >= 0;
        if (spent) left.splice(i, 1);
        const el = h("div", { class: "die" + (rolling ? " roll" : "") + (spent ? " used" : "") + (s.turn ? " b" : " w") });
        for (let k = 0; k < 9; k++) el.append(h("i", { class: PIPS[d]?.includes(k) ? "on" : "" }));
        return el;
      }));
  }
  function showWin() {
    const e = evaluate(s, 0);
    winEl.innerHTML = evalBar(winProb(e) * 2 - 1, L("Beyaz", "White"), L("Siyah", "Black"));
    statEl.innerHTML = stats([[L("Beyaz pip", "White pips"), pips(s, 0)], [L("Siyah pip", "Black pips"), pips(s, 1)], [L("Toplanan", "Borne off"), `${s.off[0]} – ${s.off[1]}`], [L("Skor", "Score"), `${score[0]} – ${score[1]}`]]);
  }
  function showCandidates(r: TavlaResult) {
    const best = r.candidates[0]?.win ?? 0;
    candEl.innerHTML = stats([[L("Bakılan konum", "Positions"), fmt(r.evaluated)], [L("Derinlik", "Depth"), r.plies === 2 ? L("2 zar", "2 rolls") : L("1 zar", "1 roll")]]) +
      `<div style="height:10px"></div>` + bars(r.candidates.map((c, i) => ({ label: c.notation, value: Math.max(0.02, c.win / Math.max(best, 0.01)), text: Math.round(c.win * 100) + "%", hot: i === 0 })), "wide");
  }

  host.onExit(() => job?.cancel());
  newGame();
}
