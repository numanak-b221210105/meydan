import { think, type Job } from "../../core/ai";
import { h, segmented } from "../../core/dom";
import { L, fmt } from "../../core/i18n";
import type { Host } from "../../core/shell";
import { sfx } from "../../core/sfx";
import { bump } from "../../core/store";
import { bars, evalBar, stats } from "../../core/viz";
import type { SearchResult } from "./ai";
import { BLACK, K, START, WHITE, clone, fromFen, inCheck, legal, make, outcome, posKey, san, sqName, toFen, type Move, type Position } from "./engine";

const GLYPH = ["", "♟", "♞", "♝", "♜", "♛", "♚"];
const LEVELS = { easy: { ms: 300, maxDepth: 2 }, mid: { ms: 1200, maxDepth: 5 }, hard: { ms: 3000, maxDepth: 12 } };
type Mode = "white" | "black" | "watch";

export function mount(host: Host): void {
  let pos: Position = fromFen(START);
  let mode: Mode = "white";
  let level: keyof typeof LEVELS = "mid";
  let selected = -1;
  let lastMove: Move | null = null;
  let history: { move: Move; san: string; fen: string }[] = [];
  let keys: string[] = [posKey(pos)];
  let job: Job<SearchResult> | null = null;
  let arrow: [number, number] | null = null;
  let flipped = false;

  const boardEl = h("div", { class: "cboard" });
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 8 8");
  svg.classList.add("arrows");
  const wrap = h("div", { class: "board-wrap chess" }, boardEl, svg);
  const movesEl = h("ol", { class: "movelist" });
  host.stage.append(h("div", { class: "board-col" }, wrap));

  host.controls.append(
    segmented<Mode>([["white", L("Beyazla oyna", "Play white")], ["black", L("Siyahla oyna", "Play black")], ["watch", L("AI vs AI izle", "Watch AI vs AI")]], mode, (m) => { mode = m; flipped = m === "black"; reset(); }),
    segmented<keyof typeof LEVELS>([["easy", L("Kolay", "Easy")], ["mid", L("Orta", "Medium")], ["hard", L("Zor", "Hard")]], level, (v) => { level = v; }),
    h("button", { class: "btn", onclick: () => undo() }, L("Geri al", "Undo")),
    h("button", { class: "btn", onclick: () => { flipped = !flipped; draw(); } }, L("Tahtayı çevir", "Flip")),
    h("button", { class: "btn pri", onclick: () => reset() }, L("Yeni oyun", "New game")),
  );

  const evalEl = host.section(L("Değerlendirme", "Evaluation"));
  const statEl = host.section(L("Arama", "Search"));
  const pvEl = host.section(L("Düşündüğü hamle dizisi", "Principal variation"));
  const candEl = host.section(L("Aday hamleler", "Candidate moves"));
  const histEl = host.section(L("Hamleler", "Moves"));
  histEl.append(movesEl);
  evalEl.innerHTML = evalBar(0, L("Beyaz", "White"), L("Siyah", "Black"));
  statEl.innerHTML = stats([[L("Derinlik", "Depth"), "—"], [L("Konum", "Nodes"), "—"], [L("Hız", "Speed"), "—"], [L("Süre", "Time"), "—"]]);

  const humanSide = () => (mode === "white" ? WHITE : mode === "black" ? BLACK : 0);

  function reset() {
    job?.cancel();
    pos = fromFen(START);
    history = [];
    keys = [posKey(pos)];
    lastMove = null;
    selected = -1;
    arrow = null;
    draw();
    next();
  }

  function play(m: Move) {
    const s = san(pos, m);
    make(pos, m);
    keys.push(posKey(pos));
    history.push({ move: m, san: s, fen: toFen(pos) });
    lastMove = m;
    selected = -1;
    arrow = null;
    m.captured ? sfx.capture() : sfx.move();
    draw();
    next();
  }

  function undo() {
    job?.cancel();
    const n = mode === "watch" ? 1 : pos.side === humanSide() ? 2 : 1;
    history = history.slice(0, Math.max(0, history.length - n));
    keys = keys.slice(0, Math.max(1, keys.length - n));
    pos = history.length ? fromFen(history[history.length - 1].fen) : fromFen(START);
    lastMove = history.length ? history[history.length - 1].move : null;
    selected = -1;
    arrow = null;
    draw();
    next();
  }

  function next() {
    const o = outcome(pos, keys);
    if (o.over) {
      const reasons = { mate: L("Şah mat", "Checkmate"), stalemate: L("Pat", "Stalemate"), fifty: L("50 hamle kuralı", "Fifty-move rule"), material: L("Yetersiz taş", "Insufficient material"), repetition: L("Üç kez tekrar", "Threefold repetition") };
      const who = o.winner === WHITE ? L("Beyaz kazandı", "White wins") : o.winner === BLACK ? L("Siyah kazandı", "Black wins") : L("Berabere", "Draw");
      const me = humanSide();
      host.status(`${reasons[o.reason]} · ${who}`, o.winner === 0 ? "warn" : me && o.winner === me ? "good" : me ? "bad" : "");
      if (me) { bump("chess", o.winner === 0 ? "d" : o.winner === me ? "w" : "l"); o.winner === me ? sfx.win() : sfx.lose(); }
      return;
    }
    if (pos.side === humanSide()) {
      host.status(inCheck(pos) ? L("Şah! Sıra sende", "Check! Your move") : L("Sıra sende", "Your move"), inCheck(pos) ? "warn" : "");
      return;
    }
    host.status(`<span class="spin"></span>${L("Yapay zekâ düşünüyor…", "The AI is thinking…")}`);
    const fen = toFen(pos);
    const opts = mode === "watch" ? { ms: 700, maxDepth: 6 } : LEVELS[level];
    job = think<SearchResult>("chess.search", { fen, ...opts }, (info: SearchResult) => showInfo(info, fen));
    job.promise.then((r) => {
      if (host.closed || toFen(pos) !== fen) return;
      showInfo(r, fen);
      const m = legal(pos).find((x) => r.best && x.from === r.best.from && x.to === r.best.to && x.promo === r.best.promo);
      if (m) setTimeout(() => { if (!host.closed && toFen(pos) === fen) play(m); }, mode === "watch" ? 350 : 120);
    }).catch(() => {});
  }

  function uciToSan(p: Position, line: string[]): string[] {
    const q = clone(p), out: string[] = [];
    for (const u of line) {
      const m = legal(q).find((x) => sqName(x.from) + sqName(x.to) === u.slice(0, 4) && (u.length < 5 || x.promo));
      if (!m) break;
      out.push(san(q, m));
      make(q, m);
    }
    return out;
  }

  function scoreText(cp: number, pov: number): string {
    const white = cp * pov;
    if (Math.abs(cp) > 99000) { const n = Math.ceil((100000 - Math.abs(cp)) / 2); return (white > 0 ? "+M" : "-M") + n; }
    return (white >= 0 ? "+" : "") + fmt(white / 100, 2);
  }

  function showInfo(r: SearchResult, fen: string) {
    const p = fromFen(fen), pov = p.side;
    const whiteCp = r.score * pov;
    const v = Math.abs(r.score) > 99000 ? Math.sign(whiteCp) : Math.tanh(whiteCp / 600);
    evalEl.innerHTML = evalBar(v, L("Beyaz", "White"), L("Siyah", "Black")) + `<div class="big-score">${scoreText(r.score, pov)}</div>`;
    statEl.innerHTML = stats([[L("Derinlik", "Depth"), r.depth], [L("Konum", "Nodes"), fmt(r.nodes)], [L("Hız", "Speed"), fmt(Math.round(r.nodes / Math.max(1, r.ms))) + " kN/s"], [L("Süre", "Time"), r.ms + " ms"]]);
    const line = uciToSan(p, r.pv);
    pvEl.innerHTML = `<div class="pv">${line.map((s, i) => `<span class="${i ? "" : "first"}">${s}</span>`).join("")}</div>`;
    const best = Math.max(...r.root.map((x) => x.score));
    candEl.innerHTML = bars(r.root.map((x, i) => ({
      label: uciToSan(p, [x.move])[0] ?? x.move,
      value: Math.max(0.03, 1 - Math.min(1, (best - x.score) / 300)),
      text: scoreText(x.score, pov),
      hot: i === 0,
    })));
    if (r.pv[0]) { arrow = [sqOfName(r.pv[0].slice(0, 2)), sqOfName(r.pv[0].slice(2, 4))]; drawArrow(); }
  }
  const sqOfName = (n: string) => (8 - Number(n[1])) * 16 + n.charCodeAt(0) - 97;

  function targets(from: number): Move[] {
    return legal(pos).filter((m) => m.from === from);
  }

  function click(s: number) {
    if (pos.side !== humanSide() || outcome(pos, keys).over) return;
    const v = pos.board[s];
    if (selected >= 0) {
      const m = targets(selected).filter((x) => x.to === s);
      if (m.length) { play(m.find((x) => !x.promo || Math.abs(x.promo) === 5) ?? m[0]); return; }
    }
    selected = v && Math.sign(v) === pos.side ? s : -1;
    draw();
  }

  function draw() {
    const tg = selected >= 0 ? targets(selected).map((m) => m.to) : [];
    const check = inCheck(pos) ? pos.kings[pos.side === WHITE ? 0 : 1] : -1;
    boardEl.replaceChildren();
    for (let i = 0; i < 64; i++) {
      const r = flipped ? 7 - (i >> 3) : i >> 3, f = flipped ? 7 - (i & 7) : i & 7;
      const s = r * 16 + f, v = pos.board[s];
      const cls = ["sq", (r + f) % 2 ? "dk" : "lt"];
      if (s === selected) cls.push("sel");
      if (lastMove && (s === lastMove.from || s === lastMove.to)) cls.push("last");
      if (tg.includes(s)) cls.push(v ? "cap" : "dot");
      if (s === check) cls.push("check");
      const el = h("div", { class: cls.join(" "), onclick: () => click(s) });
      if (v) el.append(h("span", { class: "pc " + (v > 0 ? "w" : "b") + (Math.abs(v) === K ? " k" : "") }, GLYPH[Math.abs(v)] + "︎"));
      if (f === (flipped ? 7 : 0)) el.append(h("i", { class: "rk" }, String(8 - r)));
      if (r === (flipped ? 0 : 7)) el.append(h("i", { class: "fl" }, "abcdefgh"[f]));
      boardEl.append(el);
    }
    drawArrow();
    movesEl.replaceChildren(...pairs().map(([n, a, b]) => h("li", {}, h("small", {}, n + "."), h("span", {}, a), h("span", {}, b ?? ""))));
    movesEl.scrollTop = movesEl.scrollHeight;
  }
  const pairs = () => {
    const out: [number, string, string | undefined][] = [];
    for (let i = 0; i < history.length; i += 2) out.push([i / 2 + 1, history[i].san, history[i + 1]?.san]);
    return out;
  };
  function drawArrow() {
    svg.innerHTML = "";
    if (!arrow) return;
    const xy = (s: number) => { let x = (s & 7) + 0.5, y = (s >> 4) + 0.5; if (flipped) { x = 8 - x; y = 8 - y; } return [x, y]; };
    const [x1, y1] = xy(arrow[0]), [x2, y2] = xy(arrow[1]);
    const a = Math.atan2(y2 - y1, x2 - x1), len = Math.hypot(x2 - x1, y2 - y1) - 0.35;
    const ex = x1 + Math.cos(a) * len, ey = y1 + Math.sin(a) * len;
    svg.innerHTML = `<line x1="${x1}" y1="${y1}" x2="${ex}" y2="${ey}"/><polygon points="${x2},${y2} ${ex + Math.cos(a + 1.9) * 0.28},${ey + Math.sin(a + 1.9) * 0.28} ${ex + Math.cos(a - 1.9) * 0.28},${ey + Math.sin(a - 1.9) * 0.28}"/>`;
  }

  host.onExit(() => job?.cancel());
  reset();
}
