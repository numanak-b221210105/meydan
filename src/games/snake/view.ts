import { h, hiDpi, segmented } from "../../core/dom";
import { L, fmt } from "../../core/i18n";
import type { Host } from "../../core/shell";
import { sfx } from "../../core/sfx";
import { best } from "../../core/store";
import { spark, stats } from "../../core/viz";
import { DIRS, plan, type Plan, type Snake } from "./ai";

type Mode = "auto" | "play";
const W = 22, H = 22, CELL = 28;

export function mount(host: Host): void {
  let mode: Mode = "auto";
  let speed = 14; // steps per second
  let showAI = true;
  let s: Snake;
  let dir = 1, queued: number[] = [];
  let alive = true, paused = false, steps = 0, score = 0;
  let pl: Plan | null = null;
  let acc = 0;
  let lengths: number[] = [];
  let totalNodes = 0;

  const canvas = h("canvas", { class: "arena" });
  const g = hiDpi(canvas, W * CELL, H * CELL);
  host.stage.append(h("div", { class: "arena-col" }, h("div", { class: "arena-wrap" }, canvas), h("div", { class: "hint" }, L("Oynarken ", "When playing: "), h("span", { class: "kbd" }, "← ↑ → ↓"), " / ", h("span", { class: "kbd" }, "WASD"), L(" ile yön, ", " to steer, "), h("span", { class: "kbd" }, "P"), L(" duraklat", " to pause"))));
  host.controls.append(
    segmented<Mode>([["auto", L("Otopilot (A*)", "Autopilot (A*)")], ["play", L("Sen oyna", "You play")]], mode, (m) => { mode = m; reset(); }),
    segmented<string>([["8", L("Yavaş", "Slow")], ["14", L("Normal", "Normal")], ["30", L("Hızlı", "Fast")], ["90", L("Turbo", "Turbo")]], "14", (v) => { speed = Number(v); }),
    segmented<string>([["on", L("AI görünümü açık", "AI view on")], ["off", L("Kapalı", "Off")]], "on", (v) => { showAI = v === "on"; }),
    h("button", { class: "btn pri", onclick: () => reset() }, L("Yeniden başla", "Restart")),
  );
  const statEl = host.section(L("Durum", "State"));
  const planEl = host.section(L("Plan", "Plan"));
  const chartBox = host.section(L("Uzunluk", "Length"));
  const chart = h("canvas", { class: "chart" });
  chartBox.append(chart);

  function placeFood() {
    const free: number[] = [];
    const occ = new Set(s.body);
    for (let i = 0; i < W * H; i++) if (!occ.has(i)) free.push(i);
    s.food = free.length ? free[Math.floor(Math.random() * free.length)] : -1;
  }
  function reset() {
    const mid = Math.floor(H / 2) * W + 5;
    s = { w: W, h: H, body: [mid, mid - 1, mid - 2], food: 0 };
    placeFood();
    dir = 1; queued = []; alive = true; paused = false; steps = 0; score = 0; acc = 0; lengths = [3]; totalNodes = 0;
    pl = null;
    host.status(mode === "auto" ? L("Otopilot sürüyor", "Autopilot driving") : L("Başlamak için bir yön tuşuna bas", "Press an arrow key to start"));
    if (mode === "play") paused = true;
    updatePanel();
  }

  function tick() {
    if (!alive || paused) return;
    if (mode === "auto") {
      pl = plan(s);
      totalNodes += pl.nodes;
      dir = pl.dir;
    } else {
      if (queued.length) { const d = queued.shift()!; if ((d + 2) % 4 !== dir) dir = d; }
      if (showAI) pl = plan(s);
    }
    const head = s.body[0];
    const x = (head % W) + DIRS[dir][0], y = Math.floor(head / W) + DIRS[dir][1];
    const nx = y * W + x;
    const tail = s.body[s.body.length - 1];
    if (x < 0 || y < 0 || x >= W || y >= H || (s.body.includes(nx) && nx !== tail)) return die();
    s.body.unshift(nx);
    if (nx === s.food) {
      score += 10;
      sfx.tick();
      if (s.body.length >= W * H) { alive = false; host.status(L("Tahta doldu! Mükemmel oyun", "Board filled! Perfect game"), "good"); sfx.win(); return; }
      placeFood();
    } else s.body.pop();
    steps++;
    if (steps % 5 === 0) { lengths.push(s.body.length); if (lengths.length > 200) lengths.shift(); }
  }
  function die() {
    alive = false;
    sfx.lose();
    const rec = mode === "play" && best("snake", score);
    host.status(`${L("Oyun bitti", "Game over")} · ${L("skor", "score")} ${score}${rec ? " · " + L("yeni rekor!", "new record!") : ""}`, "bad");
    if (mode === "auto") setTimeout(() => { if (!host.closed && mode === "auto") reset(); }, 2200);
  }

  function updatePanel() {
    const fill = Math.round((s.body.length / (W * H)) * 100);
    statEl.innerHTML = stats([[L("Uzunluk", "Length"), s.body.length], [L("Skor", "Score"), score], [L("Adım", "Steps"), fmt(steps)], [L("Tahta doluluğu", "Board filled"), fill + "%"]]);
    const label = { food: L("Yeme git (güvenli)", "Go for food (safe)"), tail: L("Kuyruğu takip et", "Follow the tail"), space: L("En geniş alana kaç", "Flee to open space") };
    planEl.innerHTML = pl
      ? stats([[L("Strateji", "Strategy"), label[pl.strategy]], [L("Yol uzunluğu", "Path length"), pl.path.length], [L("A* düğüm (bu adım)", "A* nodes (this step)"), pl.nodes], [L("Toplam düğüm", "Total nodes"), fmt(totalNodes)]]) +
        `<p class="hint" style="text-align:left;margin:10px 0 0">${L("Yeme giden yolu bulduktan sonra, yedikten sonra kendi kuyruğuna ulaşıp ulaşamayacağını da kontrol eder. Ulaşamayacaksa riske girmez, kuyruğunu izler.", "After finding a path to the food it checks whether it could still reach its own tail after eating. If not, it doesn't take the risk and follows its tail.")}</p>`
      : `<p class="hint" style="margin:0">—</p>`;
    spark(chart, [{ data: lengths, color: "#7dff6a" }]);
  }

  function draw(now: number) {
    g.clearRect(0, 0, W * CELL, H * CELL);
    g.fillStyle = "#07060f";
    g.fillRect(0, 0, W * CELL, H * CELL);
    g.strokeStyle = "rgba(125,255,106,.05)";
    for (let i = 1; i < W; i++) { g.beginPath(); g.moveTo(i * CELL, 0); g.lineTo(i * CELL, H * CELL); g.stroke(); }
    for (let i = 1; i < H; i++) { g.beginPath(); g.moveTo(0, i * CELL); g.lineTo(W * CELL, i * CELL); g.stroke(); }
    const cx = (c: number) => (c % W) * CELL + CELL / 2, cy = (c: number) => Math.floor(c / W) * CELL + CELL / 2;
    if (showAI && pl) {
      g.fillStyle = "rgba(34,228,255,.07)";
      for (const c of pl.explored) g.fillRect((c % W) * CELL + 2, Math.floor(c / W) * CELL + 2, CELL - 4, CELL - 4);
      if (pl.path.length) {
        g.setLineDash([5, 6]);
        g.strokeStyle = pl.strategy === "food" ? "#ffd23f" : "#ff8a3d";
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(cx(s.body[0]), cy(s.body[0]));
        for (const c of pl.path) g.lineTo(cx(c), cy(c));
        g.stroke();
        g.setLineDash([]);
      }
    }
    if (s.food >= 0) {
      const r = CELL * (0.3 + 0.05 * Math.sin(now / 160));
      g.fillStyle = "#ff3fd8"; g.shadowColor = "#ff3fd8"; g.shadowBlur = 18;
      g.beginPath(); g.arc(cx(s.food), cy(s.food), r, 0, Math.PI * 2); g.fill(); g.shadowBlur = 0;
    }
    const n = s.body.length;
    s.body.forEach((c, i) => {
      const t = 1 - i / Math.max(1, n);
      g.fillStyle = i === 0 ? "#e8ffe2" : `hsl(${110 + (1 - t) * 60}, 100%, ${45 + t * 20}%)`;
      if (i === 0) { g.shadowColor = "#7dff6a"; g.shadowBlur = 16; }
      const pad = i === 0 ? 2 : 3;
      g.beginPath();
      g.roundRect((c % W) * CELL + pad, Math.floor(c / W) * CELL + pad, CELL - pad * 2, CELL - pad * 2, 6);
      g.fill();
      g.shadowBlur = 0;
    });
    if (!alive || paused) {
      g.fillStyle = "rgba(7,6,15,.55)"; g.fillRect(0, 0, W * CELL, H * CELL);
      g.fillStyle = "#f2efff"; g.font = "800 26px system-ui"; g.textAlign = "center";
      g.fillText(!alive ? L("OYUN BİTTİ", "GAME OVER") : L("HAZIR", "READY"), (W * CELL) / 2, (H * CELL) / 2);
    }
  }

  host.on("keydown", (e) => {
    if (mode !== "play") return;
    const map: Record<string, number> = { ArrowUp: 0, KeyW: 0, ArrowRight: 1, KeyD: 1, ArrowDown: 2, KeyS: 2, ArrowLeft: 3, KeyA: 3 };
    if (e.code in map) {
      e.preventDefault();
      if (!alive) { reset(); }
      if (paused) { paused = false; host.status(L("Yemeye git!", "Go eat!")); }
      if (queued.length < 3) queued.push(map[e.code]);
    } else if (e.code === "KeyP") paused = !paused;
  });

  let panelT = 0;
  host.loop((dt, now) => {
    acc += dt * speed;
    let n = 0;
    while (acc >= 1 && n++ < 20) { tick(); acc -= 1; }
    draw(now);
    if (now - panelT > 200) { panelT = now; updatePanel(); }
  });
  reset();
}
