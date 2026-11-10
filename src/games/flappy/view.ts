import { h, hiDpi, segmented } from "../../core/dom";
import { L, fmt } from "../../core/i18n";
import type { Host } from "../../core/shell";
import { sfx } from "../../core/sfx";
import { best as record, load, save } from "../../core/store";
import { spark, stats } from "../../core/viz";
import { HID, IN, cloneNet, forward, nextGeneration, randomNet, type Net } from "./neat";

type Mode = "evolve" | "play";
const W = 480, H = 640, GAP = 160, SPACING = 230, SPEED = 2.8, GRAV = 0.42, FLAP = -7.2, BX = 110, POP = 80, GROUND = H - 40;

interface Bird { y: number; vy: number; alive: boolean; fit: number; net?: Net; pipes: number; human?: boolean; out?: number; hidden?: number[]; inputs?: number[] }
interface Pipe { x: number; gap: number; passed: Set<Bird> }

export function mount(host: Host): void {
  let mode: Mode = "evolve";
  let steps = 1;
  let birds: Bird[] = [];
  let pipes: Pipe[] = [];
  let gen = 1, frame = 0, bestEver = load("flappy.bestGen", 0);
  let history: number[] = [];
  let champion: Net | null = (() => { const raw = load<{ w1: number[]; b1: number[]; w2: number[]; b2: number } | null>("flappy.champ", null); return raw ? { w1: Float32Array.from(raw.w1), b1: Float32Array.from(raw.b1), w2: Float32Array.from(raw.w2), b2: raw.b2 } : null; })();
  let started = false;
  let stars = Array.from({ length: 60 }, () => [Math.random() * W, Math.random() * GROUND, Math.random() * 1.5 + 0.3]);

  const canvas = h("canvas", { class: "arena flappy" });
  const g = hiDpi(canvas, W, H);
  host.stage.append(h("div", { class: "arena-col flappy-col" }, h("div", { class: "arena-wrap" }, canvas), h("div", { class: "hint" }, L("Oynarken ", "When playing: "), h("span", { class: "kbd" }, "Space"), " / ", h("span", { class: "kbd" }, L("tıkla", "click")), L(" ile kanat çırp", " to flap"))));
  host.controls.append(
    segmented<Mode>([["evolve", L("Evrimi izle", "Watch evolution")], ["play", L("Sen oyna (şampiyona karşı)", "You play (vs champion)")]], mode, (m) => { mode = m; reset(true); }),
    segmented<string>([["1", "x1"], ["5", "x5"], ["25", "x25"], ["100", "x100"]], "1", (v) => { steps = Number(v); }),
    h("button", { class: "btn", onclick: () => { history = []; gen = 1; bestEver = 0; save("flappy.bestGen", 0); reset(true, true); } }, L("Sıfırdan evrimleştir", "Restart evolution")),
  );
  const statEl = host.section(L("Nesil", "Generation"));
  const netBox = host.section(L("En iyi kuşun beyni", "Best bird's brain"));
  const netCanvas = h("canvas", { class: "netc" });
  const nc = hiDpi(netCanvas, 300, 190);
  netBox.append(netCanvas, h("div", { class: "legend" }, h("span", {}, h("i", { style: "background:#22e4ff" }), L("pozitif ağırlık", "positive weight")), h("span", {}, h("i", { style: "background:#ff3fd8" }), L("negatif", "negative"))));
  const chartBox = host.section(L("Nesillere göre en iyi skor", "Best score per generation"));
  const chart = h("canvas", { class: "chart" });
  chartBox.append(chart);
  host.section(L("Girdiler", "Inputs")).innerHTML = `<p class="hint" style="text-align:left;margin:0">${L("Her kuşun 5 girdili, 6 gizli nöronlu küçük bir sinir ağı var: yüksekliği, hızı, borulara uzaklığı, boşluğun üst ve alt kenarı. Çıkış 0,5'ten büyükse kanat çırpar. Eğitim geri yayılımla değil, evrimle olur: en uzağa uçanların ağırlıkları karışır ve biraz mutasyona uğrar.", "Each bird has a tiny neural network: 5 inputs (height, speed, distance to the pipe, gap top and bottom) and 6 hidden neurons. It flaps when the output is above 0.5. Training uses evolution, not backpropagation: the birds that fly furthest mix their weights and mutate a little.")}</p>`;

  function spawnPipe(x: number): Pipe { return { x, gap: 110 + Math.random() * (GROUND - 220 - GAP / 2), passed: new Set() }; }
  function reset(full = false, fresh = false) {
    pipes = [spawnPipe(W + 40), spawnPipe(W + 40 + SPACING), spawnPipe(W + 40 + 2 * SPACING)];
    frame = 0;
    started = mode === "evolve";
    if (mode === "evolve") {
      const nets = fresh || full || !birds.length || !birds[0].net ? (fresh || !champion ? Array.from({ length: POP }, randomNet) : [cloneNet(champion), ...Array.from({ length: POP - 1 }, randomNet)]) : nextGeneration(birds.map((b) => ({ net: b.net!, fitness: b.fit })), POP);
      birds = nets.map((net) => ({ y: H / 2, vy: 0, alive: true, fit: 0, net, pipes: 0 }));
      host.status(`${L("Nesil", "Generation")} ${gen}`);
    } else {
      birds = [{ y: H / 2, vy: 0, alive: true, fit: 0, pipes: 0, human: true }];
      if (champion) birds.push({ y: H / 2, vy: 0, alive: true, fit: 0, pipes: 0, net: cloneNet(champion) });
      host.status(champion ? L("Şampiyon yapay zekâya karşı uç! Space ile başla", "Race the champion AI! Press Space") : L("Space ile başla (önce evrimi izlersen bir şampiyonla yarışırsın)", "Press Space (watch evolution first to race a champion)"));
    }
  }

  function inputs(b: Bird): number[] {
    const p = pipes.find((q) => q.x + 60 > BX - 14) ?? pipes[0];
    return [b.y / H, b.vy / 10, (p.x - BX) / W, (p.gap - GAP / 2) / H, (p.gap + GAP / 2) / H];
  }
  function step() {
    if (!started) return;
    frame++;
    for (const p of pipes) p.x -= SPEED;
    if (pipes[0].x < -70) { pipes.shift(); pipes.push(spawnPipe(pipes[pipes.length - 1].x + SPACING)); }
    for (const b of birds) {
      if (!b.alive) continue;
      if (b.net) {
        const x = inputs(b);
        const r = forward(b.net, x);
        b.out = r.out; b.hidden = r.hidden; b.inputs = x;
        if (r.out > 0.5) b.vy = FLAP;
      }
      b.vy = Math.min(10, b.vy + GRAV);
      b.y += b.vy;
      b.fit++;
      for (const p of pipes) {
        if (!p.passed.has(b) && p.x + 60 < BX - 14) { p.passed.add(b); b.pipes++; if (b.human) sfx.tick(); }
        const inX = BX + 14 > p.x && BX - 14 < p.x + 60;
        if (inX && (b.y - 12 < p.gap - GAP / 2 || b.y + 12 > p.gap + GAP / 2)) b.alive = false;
      }
      if (b.y > GROUND - 12 || b.y < 0) b.alive = false;
      if (!b.alive) {
        const p = pipes.find((q) => q.x + 60 > BX - 14) ?? pipes[0];
        b.fit -= Math.abs(b.y - p.gap) * 0.5; // reward dying close to the gap
        if (b.human) end();
      }
    }
    // A bird that has mastered the course ends the generation so evolution keeps moving.
    if (mode === "evolve" && birds.some((b) => b.alive && b.pipes >= 300)) birds.forEach((b) => (b.alive = false));
    if (mode === "evolve" && !birds.some((b) => b.alive)) generationDone();
  }
  function generationDone() {
    const top = birds.reduce((a, b) => (b.fit > a.fit ? b : a));
    history.push(top.pipes);
    if (history.length > 60) history.shift();
    if (top.pipes >= bestEver) { bestEver = top.pipes; save("flappy.bestGen", bestEver); champion = cloneNet(top.net!); save("flappy.champ", { w1: [...champion.w1], b1: [...champion.b1], w2: [...champion.w2], b2: champion.b2 }); }
    gen++;
    reset();
  }
  function end() {
    sfx.lose();
    const me = birds[0];
    const rec = record("flappy", me.pipes);
    host.status(`${L("Düştün", "You crashed")} · ${me.pipes} ${L("boru", "pipes")}${rec ? " · " + L("yeni rekor!", "new record!") : ""} · ${L("Space ile tekrar", "Space to retry")}`, "bad");
  }
  const flap = () => {
    if (mode !== "play") return;
    if (!birds[0].alive) { reset(); return; }
    if (!started) { started = true; host.status(L("Uç!", "Fly!")); }
    birds[0].vy = FLAP;
    sfx.move();
  };
  host.on("keydown", (e) => { if (e.code === "Space" || e.code === "ArrowUp") { e.preventDefault(); flap(); } });
  canvas.addEventListener("pointerdown", flap);

  function draw() {
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#0a0620"); sky.addColorStop(1, "#24083a");
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    for (const s of stars) { s[0] -= s[2] * 0.3 * (started ? 1 : 0); if (s[0] < 0) s[0] = W; g.fillStyle = `rgba(255,255,255,${0.2 + s[2] * 0.3})`; g.fillRect(s[0], s[1], s[2], s[2]); }
    for (const p of pipes) {
      g.fillStyle = "rgba(34,228,255,.08)";
      g.strokeStyle = "#22e4ff"; g.lineWidth = 2.5; g.shadowColor = "#22e4ff"; g.shadowBlur = 12;
      g.beginPath(); g.roundRect(p.x, -10, 60, p.gap - GAP / 2 + 10, 8); g.fill(); g.stroke();
      g.beginPath(); g.roundRect(p.x, p.gap + GAP / 2, 60, GROUND - p.gap - GAP / 2 + 10, 8); g.fill(); g.stroke();
      g.shadowBlur = 0;
    }
    g.fillStyle = "#150a26"; g.fillRect(0, GROUND, W, H - GROUND);
    g.strokeStyle = "rgba(255,63,216,.6)"; g.lineWidth = 2; g.beginPath(); g.moveTo(0, GROUND); g.lineTo(W, GROUND); g.stroke();
    const off = (frame * SPEED) % 32;
    g.strokeStyle = "rgba(255,63,216,.25)"; g.lineWidth = 1;
    for (let x = -off; x < W; x += 32) { g.beginPath(); g.moveTo(x, GROUND); g.lineTo(x - 30, H); g.stroke(); }
    const lead = birds.filter((b) => b.alive).sort((a, b) => b.fit - a.fit)[0];
    for (const b of birds) {
      if (!b.alive) continue;
      const isLead = b === lead && mode === "evolve";
      const color = b.human ? "#ffd23f" : mode === "play" ? "#ff3fd8" : isLead ? "#7dff6a" : "#ff3fd8";
      g.globalAlpha = b.human || isLead || mode === "play" ? 1 : 0.32;
      g.save(); g.translate(BX, b.y); g.rotate(Math.max(-0.5, Math.min(0.9, b.vy / 10)));
      g.fillStyle = color; g.shadowColor = color; g.shadowBlur = b.human || isLead ? 16 : 0;
      g.beginPath(); g.ellipse(0, 0, 14, 11, 0, 0, Math.PI * 2); g.fill();
      g.shadowBlur = 0; g.fillStyle = "#07060f"; g.beginPath(); g.arc(5, -3, 2.6, 0, Math.PI * 2); g.fill();
      g.fillStyle = "rgba(255,255,255,.7)"; g.beginPath(); g.moveTo(-6, 0); g.lineTo(-16, frame % 12 < 6 ? -8 : 6); g.lineTo(-2, 3); g.fill();
      g.restore();
    }
    g.globalAlpha = 1;
    g.fillStyle = "#f2efff"; g.font = "800 40px system-ui"; g.textAlign = "center";
    g.shadowColor = "#ff3fd8"; g.shadowBlur = 14;
    g.fillText(String(lead?.pipes ?? birds[0].pipes), W / 2, 70);
    g.shadowBlur = 0;
    if (mode === "play" && birds[1]) { g.font = "600 12px system-ui"; g.fillStyle = "#ff7ae6"; g.textAlign = "left"; g.fillText(L("Şampiyon AI", "Champion AI") + `: ${birds[1].pipes}${birds[1].alive ? "" : " ✕"}`, 12, H - 14); }
    return lead;
  }
  function drawNet(b: Bird | undefined) {
    nc.clearRect(0, 0, 300, 190);
    if (!b?.net) { nc.fillStyle = "#7d76a3"; nc.font = "12px system-ui"; nc.fillText("—", 140, 95); return; }
    const n = b.net, xs = [36, 150, 264];
    const yIn = (i: number) => 22 + i * ((190 - 44) / (IN - 1)), yH = (j: number) => 16 + j * ((190 - 32) / (HID - 1));
    for (let j = 0; j < HID; j++) for (let i = 0; i < IN; i++) {
      const w = n.w1[j * IN + i];
      nc.strokeStyle = w > 0 ? `rgba(34,228,255,${Math.min(0.9, Math.abs(w) / 2.5)})` : `rgba(255,63,216,${Math.min(0.9, Math.abs(w) / 2.5)})`;
      nc.lineWidth = Math.min(3, Math.abs(w) * 1.2);
      nc.beginPath(); nc.moveTo(xs[0], yIn(i)); nc.lineTo(xs[1], yH(j)); nc.stroke();
    }
    for (let j = 0; j < HID; j++) {
      const w = n.w2[j];
      nc.strokeStyle = w > 0 ? `rgba(34,228,255,${Math.min(0.9, Math.abs(w) / 2.5)})` : `rgba(255,63,216,${Math.min(0.9, Math.abs(w) / 2.5)})`;
      nc.lineWidth = Math.min(3, Math.abs(w) * 1.2);
      nc.beginPath(); nc.moveTo(xs[1], yH(j)); nc.lineTo(xs[2], 95); nc.stroke();
    }
    const node = (x: number, y: number, a: number, label?: string) => {
      nc.fillStyle = `rgba(${a > 0 ? "34,228,255" : "255,63,216"},${0.25 + Math.min(0.75, Math.abs(a))})`;
      nc.strokeStyle = "#f2efff"; nc.lineWidth = 1;
      nc.beginPath(); nc.arc(x, y, 8, 0, Math.PI * 2); nc.fill(); nc.stroke();
      if (label) { nc.fillStyle = "#7d76a3"; nc.font = "10px ui-monospace, monospace"; nc.textAlign = x < 100 ? "right" : "left"; nc.fillText(label, x + (x < 100 ? -12 : 12), y + 3); }
    };
    const names = L("y,hız,uzak,üst,alt", "y,vel,dist,top,bot").split(",");
    (b.inputs ?? [0, 0, 0, 0, 0]).forEach((v, i) => node(xs[0], yIn(i), v, names[i]));
    (b.hidden ?? new Array(HID).fill(0)).forEach((v, j) => node(xs[1], yH(j), v));
    node(xs[2], 95, (b.out ?? 0.5) * 2 - 1, (b.out ?? 0) > 0.5 ? L("ÇIRP", "FLAP") : "—");
  }

  let panelT = 0;
  host.loop((_dt, now) => {
    for (let i = 0; i < steps; i++) step();
    const lead = draw();
    if (now - panelT > 120) {
      panelT = now;
      drawNet(mode === "evolve" ? lead : birds[1]);
      const alive = birds.filter((b) => b.alive).length;
      statEl.innerHTML = mode === "evolve"
        ? stats([[L("Nesil", "Generation"), gen], [L("Hayatta", "Alive"), `${alive} / ${POP}`], [L("Bu nesil", "This gen"), lead?.pipes ?? 0], [L("En iyi", "Best ever"), bestEver]])
        : stats([[L("Senin skorun", "Your score"), birds[0].pipes], [L("Şampiyon", "Champion"), birds[1]?.pipes ?? "—"], [L("Şampiyonun nesli", "Champion from"), bestEver ? fmt(bestEver) + " " + L("boru", "pipes") : "—"], [L("Rekor", "Record"), load<{ best: number }>("rec.flappy", { best: 0 }).best]]);
      spark(chart, [{ data: history, color: "#7dff6a" }]);
    }
  });
  reset(true);
}
