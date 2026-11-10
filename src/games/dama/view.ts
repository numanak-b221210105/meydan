import { think, type Job } from "../../core/ai";
import { h, segmented } from "../../core/dom";
import { L, fmt } from "../../core/i18n";
import type { Host } from "../../core/shell";
import { sfx } from "../../core/sfx";
import { bump } from "../../core/store";
import { bars, evalBar, log, stats } from "../../core/viz";
import type { DamaResult } from "./ai";
import { clone, moves, notation, play, result, start, type DMove, type DState } from "./engine";

type Mode = "play" | "watch";
const LEVELS = { easy: { ms: 250, maxDepth: 3 }, mid: { ms: 1000, maxDepth: 7 }, hard: { ms: 2500, maxDepth: 14 } };

export function mount(host: Host): void {
  let s = start();
  let mode: Mode = "play";
  let level: keyof typeof LEVELS = "mid";
  let selected = -1;
  let last: DMove | null = null;
  let job: Job<DamaResult> | null = null;
  let animating = false;

  const boardEl = h("div", { class: "dboard" });
  host.stage.append(h("div", { class: "board-col" }, h("div", { class: "board-wrap dama" }, boardEl)));
  host.controls.append(
    segmented<Mode>([["play", L("Beyazla oyna", "Play white")], ["watch", L("AI vs AI izle", "Watch AI vs AI")]], mode, (m) => { mode = m; reset(); }),
    segmented<keyof typeof LEVELS>([["easy", L("Kolay", "Easy")], ["mid", L("Orta", "Medium")], ["hard", L("Zor", "Hard")]], level, (v) => { level = v; }),
    h("button", { class: "btn pri", onclick: () => reset() }, L("Yeni oyun", "New game")),
  );
  const evalEl = host.section(L("Değerlendirme", "Evaluation"));
  const statEl = host.section(L("Arama", "Search"));
  const pvEl = host.section(L("Düşündüğü hamle dizisi", "Principal variation"));
  const candEl = host.section(L("Aday hamleler", "Candidate moves"));
  const logEl = h("div", { class: "logbox" });
  host.section(L("Kurallar ve kayıt", "Rules and log")).append(
    h("p", { class: "hint", style: "text-align:left;margin:0 0 8px" }, L("Taşlar ileri ve yana gider, geri gitmez. Taş almak zorunludur ve en çok taş alan yol seçilmelidir. Son sıraya ulaşan taş dama olur ve istediği kadar uzağa gider.", "Men move forward or sideways, never back. Capturing is mandatory and you must take the most pieces possible. A man reaching the last row becomes a king that moves any distance.")),
    logEl);

  const human = () => mode === "play" && s.side === 1;

  function reset() {
    job?.cancel();
    s = start();
    selected = -1;
    last = null;
    animating = false;
    logEl.replaceChildren();
    evalEl.innerHTML = evalBar(0, L("Beyaz", "White"), L("Siyah", "Black"));
    statEl.innerHTML = stats([[L("Derinlik", "Depth"), "—"], [L("Konum", "Nodes"), "—"], [L("Süre", "Time"), "—"], [L("Taşlar", "Pieces"), "16 – 16"]]);
    pvEl.innerHTML = candEl.innerHTML = "";
    draw();
    next();
  }

  async function commit(m: DMove) {
    animating = true;
    const piece = s.b[m.path[0]];
    // Animate step by step along the capture path.
    for (let i = 1; i < m.path.length; i++) {
      const tmp = clone(s);
      tmp.b[m.path[0]] = 0;
      for (const c of m.caps.slice(0, i)) tmp.b[c] = 0;
      tmp.b[m.path[i]] = piece;
      drawBoard(tmp, m.path.slice(0, i + 1));
      m.caps.length ? sfx.capture() : sfx.move();
      if (m.path.length > 2) await new Promise((r) => setTimeout(r, 220));
    }
    log(logEl, `<b>${s.side === 1 ? L("Beyaz", "White") : L("Siyah", "Black")}</b> ${notation(m)}`);
    play(s, m);
    last = m;
    selected = -1;
    animating = false;
    draw();
    next();
  }

  function next() {
    const r = result(s);
    const count = (sg: number) => [...s.b].filter((v) => Math.sign(v) === sg).length;
    statEl.querySelector(".stats > div:last-child b")!.textContent = `${count(1)} – ${count(-1)}`;
    if (r.over) {
      const msg = r.winner === 1 ? L("Beyaz kazandı", "White wins") : r.winner === -1 ? L("Siyah kazandı", "Black wins") : L("Berabere", "Draw");
      host.status(msg, mode === "play" ? (r.winner === 1 ? "good" : r.winner === 0 ? "warn" : "bad") : "");
      if (mode === "play") { bump("dama", r.winner === 1 ? "w" : r.winner === 0 ? "d" : "l"); r.winner === 1 ? sfx.win() : sfx.lose(); }
      if (mode === "watch") setTimeout(() => { if (!host.closed && mode === "watch") reset(); }, 3000);
      return;
    }
    if (human()) {
      const forced = moves(s)[0]?.caps.length;
      host.status(forced ? L("Taş almak zorundasın", "You must capture") : L("Sıra sende", "Your move"), forced ? "warn" : "");
      return;
    }
    host.status(`<span class="spin"></span>${L("Yapay zekâ düşünüyor…", "The AI is thinking…")}`);
    const snap = clone(s);
    job = think<DamaResult>("dama.search", { state: snap, ...(mode === "watch" ? { ms: 600, maxDepth: 8 } : LEVELS[level]) }, show);
    job.promise.then((r) => {
      if (host.closed) return;
      show(r);
      const m = moves(s).find((x) => r.best && notation(x) === notation(r.best));
      if (m) setTimeout(() => { if (!host.closed) commit(m); }, mode === "watch" ? 300 : 150);
    }).catch(() => {});
  }

  function show(r: DamaResult) {
    const whiteScore = r.score * s.side;
    const v = Math.abs(r.score) > 99000 ? Math.sign(whiteScore) : Math.tanh(whiteScore / 400);
    evalEl.innerHTML = evalBar(v, L("Beyaz", "White"), L("Siyah", "Black")) + `<div class="big-score">${Math.abs(r.score) > 99000 ? (whiteScore > 0 ? "+" : "-") + L("Kazanç", "Win") : (whiteScore >= 0 ? "+" : "") + fmt(whiteScore / 100, 2)}</div>`;
    const pieces = statEl.querySelector(".stats > div:last-child b")?.textContent ?? "";
    statEl.innerHTML = stats([[L("Derinlik", "Depth"), r.depth], [L("Konum", "Nodes"), fmt(r.nodes)], [L("Süre", "Time"), r.ms + " ms"], [L("Taşlar", "Pieces"), pieces]]);
    pvEl.innerHTML = `<div class="pv">${r.pv.slice(0, 8).map((m, i) => `<span class="${i ? "" : "first"}">${m}</span>`).join("")}</div>`;
    const best = r.root[0]?.score ?? 0;
    candEl.innerHTML = bars(r.root.map((x, i) => ({ label: x.move, value: Math.max(0.03, 1 - Math.min(1, (best - x.score) / 250)), text: (x.score >= 0 ? "+" : "") + fmt(x.score / 100, 1), hot: i === 0 })), "wide");
  }

  function click(i: number) {
    if (!human() || animating) return;
    const ms = moves(s);
    if (selected >= 0) {
      const m = ms.find((x) => x.path[0] === selected && x.path[x.path.length - 1] === i);
      if (m) { commit(m); return; }
    }
    selected = ms.some((x) => x.path[0] === i) ? i : -1;
    draw();
  }

  function drawBoard(st: DState, trail: number[] = []) {
    const ms = human() && !animating ? moves(st) : [];
    const movable = new Set(ms.map((m) => m.path[0]));
    const dests = new Set(ms.filter((m) => m.path[0] === selected).map((m) => m.path[m.path.length - 1]));
    const capsSel = new Set(ms.filter((m) => m.path[0] === selected).flatMap((m) => m.caps));
    boardEl.replaceChildren();
    for (let i = 0; i < 64; i++) {
      const r = i >> 3, c = i & 7, v = st.b[i];
      const cls = ["sq", (r + c) % 2 ? "dk" : "lt"];
      if (last && (last.path.includes(i))) cls.push("last");
      if (trail.includes(i)) cls.push("trail");
      if (i === selected) cls.push("sel");
      if (dests.has(i)) cls.push("dot");
      if (capsSel.has(i)) cls.push("target");
      const el = h("div", { class: cls.join(" "), onclick: () => click(i) });
      if (v) el.append(h("span", { class: "man " + (v > 0 ? "w" : "b") + (Math.abs(v) === 2 ? " king" : "") + (movable.has(i) ? " can" : "") }));
      if (c === 0) el.append(h("i", { class: "rk" }, String(8 - r)));
      if (r === 7) el.append(h("i", { class: "fl" }, "abcdefgh"[c]));
      boardEl.append(el);
    }
  }
  const draw = () => drawBoard(s);

  host.onExit(() => job?.cancel());
  reset();
}
