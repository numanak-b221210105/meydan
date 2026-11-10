import { h, segmented } from "../../core/dom";
import { L, fmt } from "../../core/i18n";
import type { Host } from "../../core/shell";
import { sfx } from "../../core/sfx";
import { best, load, save } from "../../core/store";
import { log, stats } from "../../core/viz";
import { create, reveal, solve, type MState, type Solve } from "./engine";

type Mode = "ai" | "play";
const SIZES = { s: [9, 9, 10], m: [16, 16, 40], l: [24, 16, 75] } as const;

export function mount(host: Host): void {
  let mode: Mode = "ai";
  let size: keyof typeof SIZES = "m";
  let heat = true;
  let s: MState = create();
  let sol: Solve | null = null;
  let hint = -1;
  let t0 = 0, timer = 0;
  let aiT = 0;
  let aiSpeed = 220;
  let lastPick = -1;
  let aiRec = load("mines.ai", { games: 0, wins: 0 });

  const grid = h("div", { class: "mgrid" });
  const top = h("div", { class: "mtop" });
  host.stage.append(h("div", { class: "board-col mines-col" }, top, h("div", { class: "board-wrap mines" }, grid)));
  host.controls.append(
    segmented<Mode>([["ai", L("AI çözsün", "AI solves")], ["play", L("Sen oyna", "You play")]], mode, (m) => { mode = m; reset(); }),
    segmented<keyof typeof SIZES>([["s", "9×9"], ["m", "16×16"], ["l", "24×16"]], size, (v) => { size = v; reset(); }),
    segmented<string>([["on", L("Olasılıklar açık", "Odds on")], ["off", L("Kapalı", "Off")]], "on", (v) => { heat = v === "on"; draw(); }),
    h("button", { class: "btn", onclick: () => showHint() }, L("İpucu", "Hint")),
    h("button", { class: "btn pri", onclick: () => reset() }, L("Yeni oyun", "New game")),
  );
  const statEl = host.section(L("Çözücü", "Solver"));
  const riskEl = host.section(L("Sıradaki hamle", "Next move"));
  const logEl = h("div", { class: "logbox" });
  host.section(L("Akıl yürütme", "Reasoning")).append(logEl);
  const aiStat = host.section(L("AI'nin başarısı", "AI track record"));

  function reset() {
    const [w, hh, m] = SIZES[size];
    s = create(w, hh, m);
    sol = solve(s);
    hint = -1; lastPick = -1; t0 = 0; timer = 0;
    logEl.replaceChildren();
    grid.style.gridTemplateColumns = `repeat(${w}, 1fr)`;
    grid.parentElement!.style.aspectRatio = `${w} / ${hh}`;
    host.status(mode === "ai" ? L("Yapay zekâ çözüyor", "The AI is solving") : L("Bir kareye tıkla; sağ tıkla bayrak koy", "Click a cell; right-click to flag"));
    draw();
  }

  function open(i: number, byAI = false) {
    if (s.lost || s.won || s.open[i]) return;
    if (!t0) t0 = performance.now();
    const opened = reveal(s, i);
    lastPick = i;
    hint = -1;
    if (s.lost) {
      sfx.boom();
      host.status(L("Mayına bastın", "You hit a mine") + (byAI ? " · " + L("şanssız tahmin", "an unlucky guess") : ""), "bad");
      if (byAI) record(false);
    } else if (opened.length) {
      sfx.tick();
      if (s.won) {
        const sec = Math.round((performance.now() - t0) / 100) / 10;
        sfx.win();
        if (byAI) { host.status(`${L("Çözüldü", "Solved")} · ${sec} sn`, "good"); record(true); }
        else { const rec = size === "m" && best("mines", sec, true); host.status(`${L("Temizledin!", "Cleared!")} ${sec} sn${rec ? " · " + L("yeni rekor!", "new record!") : ""}`, "good"); }
      }
    }
    sol = solve(s);
    draw();
  }
  function record(win: boolean) {
    aiRec = { games: aiRec.games + 1, wins: aiRec.wins + (win ? 1 : 0) };
    save("mines.ai", aiRec);
    setTimeout(() => { if (!host.closed && mode === "ai") reset(); }, 2200);
  }

  function aiStep() {
    if (s.lost || s.won || !sol) return;
    if (!s.started) { const c = Math.floor(s.w * s.h / 2 + s.w / 2); log(logEl, `<b>${L("İlk tık", "First click")}</b> ${L("ortadan, ilk tık her zaman güvenli", "in the middle; the first click is always safe")}`); open(c, true); return; }
    // Certain mines get a flag; certain safe cells are opened.
    const newMines = sol.mines.filter((i) => !s.flag[i]);
    if (newMines.length) {
      newMines.forEach((i) => (s.flag[i] = 1));
      log(logEl, `<b>${L("Kesin mayın", "Certain mine")}</b> ×${newMines.length} · ${L("bayrak kondu", "flagged")}`);
      draw();
      return;
    }
    if (sol.safe.length) {
      log(logEl, `<b>${L("Kesin güvenli", "Certainly safe")}</b> ×${sol.safe.length} · ${L("açılıyor", "opening")}`);
      open(sol.safe[0], true);
      return;
    }
    let pick = -1, risk = 2;
    for (let i = 0; i < sol.prob.length; i++) if (!s.open[i] && !s.flag[i] && sol.prob[i] < risk) { risk = sol.prob[i]; pick = i; }
    if (pick < 0) return;
    log(logEl, `<b>${L("Tahmin", "Guess")}</b> ${L("en düşük risk", "lowest risk")} %${fmt(risk * 100, 1)}`);
    open(pick, true);
  }

  function showHint() {
    if (!sol || s.lost || s.won) return;
    let pick = -1, risk = 2;
    for (let i = 0; i < sol.prob.length; i++) if (!s.open[i] && !s.flag[i] && sol.prob[i] < risk) { risk = sol.prob[i]; pick = i; }
    hint = pick;
    draw();
  }

  function color(p: number) {
    const hue = 140 - p * 140;
    return `hsla(${hue}, 100%, 55%, ${0.14 + p * 0.3})`;
  }
  function draw() {
    const flags = s.flag.reduce((a, v) => a + v, 0);
    top.innerHTML = `<span>💣 <b>${s.mines - flags}</b></span><span class="face">${s.lost ? "✕" : s.won ? "★" : "●"}</span><span>⏱ <b class="tm">${timer}</b></span>`;
    grid.replaceChildren();
    for (let i = 0; i < s.w * s.h; i++) {
      const o = s.open[i];
      const cls = ["mc", o ? "o" : "c"];
      if (o && s.mine[i]) cls.push("boom");
      if (i === hint) cls.push("hint");
      if (i === lastPick) cls.push("last");
      const el = h("button", { class: cls.join(" "), onclick: () => { if (mode === "play") open(i); }, oncontextmenu: (e: Event) => { e.preventDefault(); if (mode === "play" && !s.open[i]) { s.flag[i] ^= 1; sfx.move(); draw(); } } });
      if (o) {
        if (s.mine[i]) el.textContent = "✸";
        else if (s.n[i]) { el.textContent = String(s.n[i]); el.dataset.n = String(s.n[i]); }
      } else if (s.flag[i]) el.textContent = "⚑";
      else if ((s.lost || s.won) && s.mine[i]) el.append(h("i", { class: "mm" }, "✸"));
      else if (heat && sol && sol.prob[i] >= 0 && s.started) {
        el.style.background = color(sol.prob[i]);
        const p = sol.prob[i];
        if (s.w <= 16) el.append(h("small", {}, p < 0.005 ? "0" : p > 0.995 ? "!" : String(Math.round(p * 100))));
      }
      grid.append(el);
    }
    if (sol) {
      const closed = [...s.open].filter((v) => !v).length;
      statEl.innerHTML = stats([[L("Bağımsız grup", "Groups"), sol.components], [L("Denenen dizilim", "Layouts tried"), fmt(sol.layouts)], [L("Kesin güvenli", "Certain safe"), sol.safe.length], [L("Kesin mayın", "Certain mines"), sol.mines.length]]) +
        `<p class="hint" style="text-align:left;margin:10px 0 0">${L("Görünen sayılarla tutarlı tüm mayın dizilimlerini sayar; her kareye düşen mayın olasılığı bu dizilimlerin ağırlıklı oranıdır.", "It counts every mine layout consistent with the visible numbers; each cell's probability is its weighted share of those layouts.")} ${sol.exact ? "" : L("(Büyük grupta yaklaşık)", "(approximate for a large group)")}</p>`;
      let risk = 2;
      for (let i = 0; i < sol.prob.length; i++) if (!s.open[i] && !s.flag[i]) risk = Math.min(risk, sol.prob[i]);
      riskEl.innerHTML = stats([[L("Kapalı kare", "Closed cells"), closed], [L("En güvenli karede risk", "Risk of the safest cell"), risk <= 1 ? "%" + fmt(risk * 100, 1) : "—"]]);
    }
    aiStat.innerHTML = stats([[L("Oyun", "Games"), aiRec.games], [L("Kazanma oranı", "Win rate"), aiRec.games ? "%" + Math.round((100 * aiRec.wins) / aiRec.games) : "—"]]);
  }

  host.loop((dt, now) => {
    if (t0 && !s.lost && !s.won) { const tt = Math.floor((now - t0) / 1000); if (tt !== timer) { timer = tt; const el = top.querySelector(".tm"); if (el) el.textContent = String(timer); } }
    if (mode === "ai") { aiT += dt * 1000; if (aiT > aiSpeed) { aiT = 0; aiStep(); } }
  });
  host.controls.append(segmented<string>([["400", L("Yavaş", "Slow")], ["220", L("Normal", "Normal")], ["40", L("Hızlı", "Fast")]], "220", (v) => { aiSpeed = Number(v); }));
  reset();
}
