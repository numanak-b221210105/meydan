import { think, type Job } from "../../core/ai";
import { h, hiDpi, segmented } from "../../core/dom";
import { L, fmt } from "../../core/i18n";
import type { Host } from "../../core/shell";
import { sfx } from "../../core/sfx";
import { best as record, load, save } from "../../core/store";
import { bars, spark, stats } from "../../core/viz";
import { DEFAULT_WEIGHTS, best, type GenInfo, type Placement, type Weights } from "./ai";
import { COLS, ROWS, SCORE, SHAPES, bag, cells, dropY, fits, lock, rotate, spawn, type Kind, type Piece } from "./engine";

type Mode = "ai" | "play";
const CELL = 30;
const COLORS = ["#22e4ff", "#ffd23f", "#b06cff", "#7dff6a", "#ff4d6d", "#4d7dff", "#ff8a3d"];

export function mount(host: Host): void {
  let mode: Mode = "ai";
  let speed = 2; // AI steps per frame group
  let weights: Weights = load<Weights>("tetris.weights", DEFAULT_WEIGHTS);
  let board = new Uint8Array(COLS * ROWS);
  let next = bag();
  let queue: Kind[] = [];
  let cur: Piece = spawn(0);
  let target: Placement | null = null;
  let top: Placement[] = [];
  let over = false, paused = false;
  let lines = 0, score = 0, pieces = 0;
  let gravityT = 0, aiT = 0;
  let evo: GenInfo | null = null;
  let evoJob: Job<GenInfo> | null = null;
  let flash: number[] = [];

  const canvas = h("canvas", { class: "arena tetris" });
  const g = hiDpi(canvas, COLS * CELL, ROWS * CELL);
  const nextCanvas = h("canvas", { class: "nextc" });
  const ng = hiDpi(nextCanvas, 120, 300);
  const side = h("div", { class: "t-side" }, h("small", {}, L("SIRADAKİ", "NEXT")), nextCanvas, h("div", { class: "t-score" }));
  host.stage.append(h("div", { class: "tetris-col" }, h("div", { class: "arena-wrap t-wrap" }, canvas), side));
  host.stage.append(h("div", { class: "hint t-hint" }, h("span", { class: "kbd" }, "← →"), L(" kaydır · ", " move · "), h("span", { class: "kbd" }, "↑"), L(" döndür · ", " rotate · "), h("span", { class: "kbd" }, "↓"), L(" hızlı · ", " soft drop · "), h("span", { class: "kbd" }, "Space"), L(" bırak", " hard drop")));
  host.controls.append(
    segmented<Mode>([["ai", L("AI oynasın", "AI plays")], ["play", L("Sen oyna", "You play")]], mode, (m) => { mode = m; reset(); }),
    segmented<string>([["1", L("Normal", "Normal")], ["2", L("Hızlı", "Fast")], ["30", L("Turbo", "Turbo")]], "2", (v) => { speed = Number(v); }),
    h("button", { class: "btn pri", onclick: () => reset() }, L("Yeniden başla", "Restart")),
  );
  const statEl = host.section(L("Oyun", "Game"));
  const featEl = host.section(L("Seçilen yerleşim", "Chosen placement"));
  const wEl = host.section(L("Ağırlıklar", "Weights"));
  const evoBox = host.section(L("Evrim laboratuvarı", "Evolution lab"));
  const evoInfo = h("div", {});
  const evoChart = h("canvas", { class: "chart" });
  const evoBtn = h("button", { class: "btn pri", onclick: () => runEvolution() }, L("Ağırlıkları evrimleştir", "Evolve weights"));
  const useBtn = h("button", { class: "btn", onclick: () => { if (evo) { weights = evo.weights; save("tetris.weights", weights); paintWeights(); } } }, L("Evrilmiş ağırlıkları kullan", "Use evolved weights"));
  const resetW = h("button", { class: "btn", onclick: () => { weights = DEFAULT_WEIGHTS; save("tetris.weights", weights); paintWeights(); } }, L("Varsayılana dön", "Reset"));
  evoBox.append(h("p", { class: "hint", style: "text-align:left;margin:0 0 10px" }, L("Rastgele ağırlıklarla 14 yapay zekâ oluşturur, her birini oyunda yarıştırır. En iyiler çiftleşir, çocukları biraz mutasyona uğrar. Nesiller geçtikçe silinen satır sayısı artar.", "Creates 14 AIs with random weights and lets them play. The best ones breed and their children mutate a little. Over generations the lines cleared go up.")),
    h("div", { class: "row-btns" }, evoBtn, useBtn, resetW), evoInfo, evoChart, h("div", { class: "legend" }, h("span", {}, h("i", { style: "background:#ffd23f" }), L("en iyi", "best")), h("span", {}, h("i", { style: "background:#8b6cff" }), L("ortalama", "average"))));

  function paintWeights() {
    const names = [L("Toplam yükseklik", "Aggregate height"), L("Silinen satır", "Lines cleared"), L("Boşluk", "Holes"), L("Pürüzlülük", "Bumpiness")];
    const max = Math.max(...weights.map(Math.abs));
    wEl.innerHTML = bars(weights.map((w, i) => ({ label: names[i], value: Math.abs(w) / max, text: (w >= 0 ? "+" : "") + w.toFixed(2), hot: w > 0 })), "wide") +
      `<p class="hint" style="text-align:left;margin:8px 0 0">${L("Her yerleşim bu dört özelliğin ağırlıklı toplamıyla puanlanır. Eksi ağırlık o özellikten kaçındığı anlamına gelir.", "Each placement is scored by a weighted sum of these features. A negative weight means it avoids that feature.")}</p>`;
  }

  function reset() {
    board = new Uint8Array(COLS * ROWS);
    next = bag();
    queue = [next(), next(), next()];
    over = false; paused = mode === "play";
    lines = 0; score = 0; pieces = 0; flash = [];
    newPiece();
    host.status(mode === "ai" ? L("Yapay zekâ oynuyor", "The AI is playing") : L("Başlamak için bir tuşa bas", "Press any key to start"));
  }
  function newPiece() {
    const k = queue.shift()!;
    queue.push(next());
    cur = spawn(k);
    if (!fits(board, cur)) return end();
    const r = best(board, k, weights, queue[0]);
    target = r.best;
    top = r.top;
    paintFeat();
  }
  function end() {
    over = true;
    sfx.lose();
    const rec = mode === "play" && record("tetris", score);
    host.status(`${L("Oyun bitti", "Game over")} · ${fmt(lines)} ${L("satır", "lines")} · ${fmt(score)}${rec ? " · " + L("yeni rekor!", "new record!") : ""}`, "bad");
    if (mode === "ai") setTimeout(() => { if (!host.closed && mode === "ai") reset(); }, 2500);
  }
  function place() {
    const n = lock(board, cur);
    pieces++;
    if (n < 0) return end();
    if (n) { lines += n; score += SCORE[n] * (1 + Math.floor(lines / 10)); sfx.capture(); flash = [performance.now()]; } else sfx.tick();
    newPiece();
  }
  const level = () => 1 + Math.floor(lines / 10);

  function aiStep() {
    if (!target) { cur = { ...cur, y: dropY(board, cur) }; place(); return; }
    if (cur.rot !== target.piece.rot) { cur = rotate(board, cur, 1) ?? { ...cur, rot: target.piece.rot }; return; }
    if (cur.x < target.piece.x && fits(board, { ...cur, x: cur.x + 1 })) { cur = { ...cur, x: cur.x + 1 }; return; }
    if (cur.x > target.piece.x && fits(board, { ...cur, x: cur.x - 1 })) { cur = { ...cur, x: cur.x - 1 }; return; }
    cur = { ...cur, y: dropY(board, cur) };
    place();
  }

  function paintFeat() {
    if (!target) return;
    const f = target.f;
    featEl.innerHTML = stats([[L("Toplam yükseklik", "Height"), f.height], [L("Silinen satır", "Lines"), f.lines], [L("Boşluk", "Holes"), f.holes], [L("Pürüzlülük", "Bumpiness"), f.bumpiness]]) +
      `<div style="height:10px"></div>` + bars(top.map((p, i) => ({ label: `${"IOTSZJL"[p.piece.kind]} r${p.piece.rot} x${p.piece.x}`, value: Math.max(0.05, 1 - Math.min(1, (top[0].score - p.score) / 6)), text: p.score.toFixed(1), hot: i === 0 })), "wide");
  }
  function paintStats() {
    statEl.innerHTML = stats([[L("Satır", "Lines"), fmt(lines)], [L("Skor", "Score"), fmt(score)], [L("Parça", "Pieces"), fmt(pieces)], [L("Seviye", "Level"), level()]]);
  }

  function runEvolution() {
    evoJob?.cancel();
    evoBtn.setAttribute("disabled", "");
    evoInfo.innerHTML = `<p class="hint" style="margin:8px 0"><span class="spin" style="display:inline-block;vertical-align:middle"></span> ${L("Nesiller yarışıyor…", "Generations competing…")}</p>`;
    evoJob = think<GenInfo>("tetris.evolve", { generations: 10, population: 14, pieces: 250 }, (gi) => { evo = gi; paintEvo(); });
    evoJob.promise.then((gi) => { evo = gi; paintEvo(true); evoBtn.removeAttribute("disabled"); }).catch(() => evoBtn.removeAttribute("disabled"));
  }
  function paintEvo(done = false) {
    if (!evo) return;
    evoInfo.innerHTML = stats([[L("Nesil", "Generation"), `${evo.gen} / 10`], [L("En iyi (satır)", "Best (lines)"), fmt(evo.best, 1)], [L("Ortalama", "Average"), fmt(evo.avg, 1)], [L("Durum", "Status"), done ? L("Bitti", "Done") : L("Çalışıyor", "Running")]]);
    spark(evoChart, [{ data: evo.history.map((x) => x.best), color: "#ffd23f" }, { data: evo.history.map((x) => x.avg), color: "#8b6cff" }]);
  }

  function drawCell(ctx: CanvasRenderingContext2D, x: number, y: number, kind: number, alpha = 1, size = CELL) {
    const c = COLORS[kind];
    ctx.globalAlpha = alpha;
    ctx.fillStyle = c;
    ctx.shadowColor = c;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.roundRect(x * size + 2, y * size + 2, size - 4, size - 4, 5);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,.25)";
    ctx.fillRect(x * size + 5, y * size + 5, size - 14, 3);
    ctx.globalAlpha = 1;
  }
  function draw(now: number) {
    g.fillStyle = "#07060f";
    g.fillRect(0, 0, COLS * CELL, ROWS * CELL);
    g.strokeStyle = "rgba(139,108,255,.07)";
    for (let x = 1; x < COLS; x++) { g.beginPath(); g.moveTo(x * CELL, 0); g.lineTo(x * CELL, ROWS * CELL); g.stroke(); }
    for (let y = 1; y < ROWS; y++) { g.beginPath(); g.moveTo(0, y * CELL); g.lineTo(COLS * CELL, y * CELL); g.stroke(); }
    for (let i = 0; i < board.length; i++) if (board[i]) drawCell(g, i % COLS, Math.floor(i / COLS), board[i] - 1);
    if (!over) {
      // AI target (outline) and the ghost of the current piece
      if (target) {
        g.strokeStyle = "#ffd23f"; g.lineWidth = 2; g.setLineDash([4, 4]);
        for (const [x, y] of cells(target.piece)) if (y >= 0) g.strokeRect(x * CELL + 3, y * CELL + 3, CELL - 6, CELL - 6);
        g.setLineDash([]);
      }
      if (mode === "play") for (const [x, y] of cells({ ...cur, y: dropY(board, cur) })) if (y >= 0) drawCell(g, x, y, cur.kind, 0.18);
      for (const [x, y] of cells(cur)) if (y >= 0) drawCell(g, x, y, cur.kind);
    }
    if (flash.length && now - flash[0] < 220) { g.fillStyle = `rgba(255,255,255,${0.18 * (1 - (now - flash[0]) / 220)})`; g.fillRect(0, 0, COLS * CELL, ROWS * CELL); }
    if (over || paused) {
      g.fillStyle = "rgba(7,6,15,.6)"; g.fillRect(0, 0, COLS * CELL, ROWS * CELL);
      g.fillStyle = "#f2efff"; g.font = "800 24px system-ui"; g.textAlign = "center";
      g.fillText(over ? L("OYUN BİTTİ", "GAME OVER") : L("HAZIR", "READY"), (COLS * CELL) / 2, (ROWS * CELL) / 2);
    }
    ng.clearRect(0, 0, 120, 300);
    queue.forEach((k, i) => {
      const shape = SHAPES[k][0];
      const minX = Math.min(...shape.map((c) => c[0])), maxX = Math.max(...shape.map((c) => c[0]));
      const ox = (120 / 22 - (maxX - minX + 1)) / 2 - minX;
      ng.save(); ng.translate(0, i * 96 + 14);
      for (const [x, y] of shape) drawCell(ng, x + ox, y, k, i ? 0.55 : 1, 22);
      ng.restore();
    });
    (side.querySelector(".t-score") as HTMLElement).innerHTML = `<small>${L("SATIR", "LINES")}</small><b>${fmt(lines)}</b><small>${L("SKOR", "SCORE")}</small><b>${fmt(score)}</b>`;
  }

  host.on("keydown", (e) => {
    if (mode !== "play") return;
    if (over) { if (e.code === "Space" || e.code === "Enter") reset(); return; }
    if (paused) { paused = false; host.status(L("Sen oynuyorsun", "You're playing")); return; }
    const mv = (p: Piece | null) => { if (p && fits(board, p)) cur = p; };
    switch (e.code) {
      case "ArrowLeft": mv({ ...cur, x: cur.x - 1 }); break;
      case "ArrowRight": mv({ ...cur, x: cur.x + 1 }); break;
      case "ArrowDown": if (fits(board, { ...cur, y: cur.y + 1 })) { cur = { ...cur, y: cur.y + 1 }; score += 1; } break;
      case "ArrowUp": case "KeyX": mv(rotate(board, cur, 1)); break;
      case "KeyZ": mv(rotate(board, cur, -1)); break;
      case "Space": score += 2 * (dropY(board, cur) - cur.y); cur = { ...cur, y: dropY(board, cur) }; place(); break;
      case "KeyP": paused = true; break;
      default: return;
    }
    e.preventDefault();
  });

  let panelT = 0;
  host.loop((dt, now) => {
    if (!over && !paused) {
      if (mode === "ai") {
        aiT += dt;
        const every = speed >= 30 ? 0 : speed === 2 ? 0.03 : 0.08;
        let n = 0;
        while (aiT >= every && n++ < (speed >= 30 ? 60 : 4) && !over) { aiStep(); aiT -= every || aiT; }
      } else {
        gravityT += dt * 1000;
        const interval = Math.max(70, 800 - (level() - 1) * 65);
        if (gravityT >= interval) {
          gravityT = 0;
          if (fits(board, { ...cur, y: cur.y + 1 })) cur = { ...cur, y: cur.y + 1 }; else place();
        }
      }
    }
    draw(now);
    if (now - panelT > 250) { panelT = now; paintStats(); }
  });
  host.onExit(() => evoJob?.cancel());
  paintWeights();
  reset();
}
