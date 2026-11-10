import { h, hiDpi, segmented } from "../../core/dom";
import { L } from "../../core/i18n";
import type { Host } from "../../core/shell";
import { sfx } from "../../core/sfx";
import { bump } from "../../core/store";
import { stats } from "../../core/viz";
import { GH, GW, T, botThink, create, placeBomb, step, tryMove, type World } from "./game";

type Mode = "play" | "watch";
const C = 44;

export function mount(host: Host): void {
  let mode: Mode = "play";
  let showAI = true;
  let w: World = create(1);
  let held: number[] = [];
  let over = false;
  let round = 1;
  const wins = [0, 0, 0, 0];
  let fx: { x: number; y: number; t: number }[] = [];

  const canvas = h("canvas", { class: "arena bomber" });
  const g = hiDpi(canvas, GW * C, GH * C);
  host.stage.append(h("div", { class: "arena-col bomber-col" }, h("div", { class: "arena-wrap" }, canvas), h("div", { class: "hint" }, h("span", { class: "kbd" }, "← ↑ → ↓"), L(" hareket · ", " move · "), h("span", { class: "kbd" }, "Space"), L(" bomba bırak", " drop a bomb"))));
  host.controls.append(
    segmented<Mode>([["play", L("Sen vs 3 bot", "You vs 3 bots")], ["watch", L("4 botu izle", "Watch 4 bots")]], mode, (m) => { mode = m; restart(); }),
    segmented<string>([["on", L("Tehlike haritası açık", "Danger map on")], ["off", L("Kapalı", "Off")]], "on", (v) => { showAI = v === "on"; }),
    h("button", { class: "btn pri", onclick: () => restart() }, L("Yeni tur", "New round")),
  );
  const botsEl = host.section(L("Botlar ne yapıyor", "What the bots are doing"));
  const scoreEl = host.section(L("Skor tablosu", "Scoreboard"));
  host.section(L("Tehlike haritası", "Danger map")).innerHTML = `<p class="hint" style="text-align:left;margin:0">${L("Kırmızı kareler yakında patlayacak bölgeler; renk ne kadar koyuysa patlama o kadar yakın. Botlar bu haritayı okuyup genişlik öncelikli arama (BFS) ile güvenli kareye kaçar. Bomba bırakmadan önce de kaçış yolu olup olmadığını hesaplarlar; yoksa bırakmazlar.", "Red cells will explode soon; the darker, the sooner. Bots read this map and use breadth-first search (BFS) to reach a safe cell. Before dropping a bomb they check that an escape route exists; if not, they don't drop it.")}</p>`;

  const INTENT: Record<string, () => string> = {
    flee: () => L("Kaçıyor", "Fleeing"), attack: () => L("Saldırıyor", "Attacking"), bomb: () => L("Kutu patlatıyor", "Blasting a box"),
    power: () => L("Güç topluyor", "Grabbing a power-up"), hunt: () => L("Avlanıyor", "Hunting"), dig: () => L("Yol açıyor", "Digging"), wait: () => L("Bekliyor", "Waiting"), "": () => "—",
  };

  function restart() {
    w = create(mode === "play" ? 1 : 0);
    over = false;
    held = [];
    fx = [];
    host.status(`${L("Tur", "Round")} ${round}`);
  }

  function update(dt: number) {
    if (over) return;
    for (const a of w.agents) {
      if (!a.alive || a.x !== a.tx || a.y !== a.ty) continue;
      if (a.human) { if (held.length) tryMove(w, a, held[held.length - 1]); continue; }
      const r = botThink(w, a);
      if (r.bomb && placeBomb(w, a)) { w.danger = new Float32Array(w.danger); }
      tryMove(w, a, r.dir);
    }
    const ev = step(w, dt);
    if (ev.exploded) { sfx.boom(); for (const f of w.flames) fx.push({ x: f.cell % GW, y: Math.floor(f.cell / GW), t: performance.now() }); }
    if (ev.picked) sfx.tick();
    const alive = w.agents.filter((a) => a.alive);
    const human = w.agents.find((a) => a.human);
    if (human && !human.alive && !over) { over = true; host.status(L("Patladın! Yeni tur için Space", "You got blown up! Space for a new round"), "bad"); sfx.lose(); bump("bomber", "l"); round++; }
    else if (alive.length <= 1 && !over) {
      over = true;
      const win = alive[0];
      if (win) wins[win.id]++;
      if (win?.human) { host.status(L("Kazandın! Son ayakta kalan sensin", "You win! Last one standing"), "good"); sfx.win(); bump("bomber", "w"); }
      else host.status(win ? `${win.name} ${L("kazandı", "wins")}` : L("Herkes patladı, berabere", "Everyone blew up: draw"), "warn");
      round++;
      if (mode === "watch" || !human) setTimeout(() => { if (!host.closed) restart(); }, 2200);
    }
  }

  function draw(now: number) {
    g.fillStyle = "#0b0918";
    g.fillRect(0, 0, GW * C, GH * C);
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
      const c = y * GW + x, t = w.grid[c];
      if (t === T.Wall) {
        g.fillStyle = "#231d4a"; g.fillRect(x * C, y * C, C, C);
        g.strokeStyle = "rgba(139,108,255,.35)"; g.strokeRect(x * C + 3.5, y * C + 3.5, C - 7, C - 7);
      } else {
        g.fillStyle = (x + y) % 2 ? "#110e24" : "#0f0c20"; g.fillRect(x * C, y * C, C, C);
        if (showAI && w.danger[c] !== Infinity) { const u = Math.max(0, Math.min(1, 1 - w.danger[c] / 2.4)); g.fillStyle = `rgba(255,77,109,${0.12 + u * 0.4})`; g.fillRect(x * C, y * C, C, C); }
        const pw = w.power.get(c);
        if (pw && t === T.Empty) {
          const col = pw === "bomb" ? "#ff3fd8" : pw === "range" ? "#ff8a3d" : "#22e4ff";
          g.fillStyle = col; g.shadowColor = col; g.shadowBlur = 12;
          g.beginPath(); g.roundRect(x * C + 12, y * C + 12, C - 24, C - 24, 5); g.fill(); g.shadowBlur = 0;
          g.fillStyle = "#07060f"; g.font = "800 12px system-ui"; g.textAlign = "center"; g.fillText(pw === "bomb" ? "B" : pw === "range" ? "+" : "»", x * C + C / 2, y * C + C / 2 + 4);
        }
        if (t === T.Box) {
          g.fillStyle = "#5a3a1e"; g.fillRect(x * C + 4, y * C + 4, C - 8, C - 8);
          g.strokeStyle = "#ffb067"; g.lineWidth = 1.5; g.strokeRect(x * C + 4.5, y * C + 4.5, C - 9, C - 9);
          g.beginPath(); g.moveTo(x * C + 6, y * C + 6); g.lineTo(x * C + C - 6, y * C + C - 6); g.moveTo(x * C + C - 6, y * C + 6); g.lineTo(x * C + 6, y * C + C - 6); g.strokeStyle = "rgba(255,176,103,.35)"; g.stroke();
        }
      }
    }
    if (showAI) for (const a of w.agents) {
      if (!a.alive || a.human || !a.path.length) continue;
      g.strokeStyle = a.color; g.globalAlpha = 0.6; g.lineWidth = 2; g.setLineDash([4, 5]);
      g.beginPath(); g.moveTo(a.x * C + C / 2, a.y * C + C / 2);
      for (const c of a.path) g.lineTo((c % GW) * C + C / 2, Math.floor(c / GW) * C + C / 2);
      g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
    }
    for (const b of w.bombs) {
      const pulse = 1 + 0.08 * Math.sin(now / (b.t < 0.8 ? 40 : 110));
      g.fillStyle = "#1a1530"; g.strokeStyle = b.t < 0.8 ? "#ff4d6d" : "#f2efff"; g.lineWidth = 2;
      g.shadowColor = "#ff4d6d"; g.shadowBlur = b.t < 0.8 ? 18 : 6;
      g.beginPath(); g.arc(b.x * C + C / 2, b.y * C + C / 2 + 2, 13 * pulse, 0, Math.PI * 2); g.fill(); g.stroke(); g.shadowBlur = 0;
      g.fillStyle = "#ffd23f"; g.fillRect(b.x * C + C / 2 + 6, b.y * C + 7, 4, 6);
    }
    for (const f of w.flames) {
      const x = f.cell % GW, y = Math.floor(f.cell / GW), a = f.t / 0.55;
      const grad = g.createRadialGradient(x * C + C / 2, y * C + C / 2, 2, x * C + C / 2, y * C + C / 2, C * 0.7);
      grad.addColorStop(0, `rgba(255,255,220,${a})`); grad.addColorStop(0.4, `rgba(255,170,60,${a})`); grad.addColorStop(1, "rgba(255,63,120,0)");
      g.fillStyle = grad; g.fillRect(x * C - 6, y * C - 6, C + 12, C + 12);
    }
    for (const a of w.agents) {
      if (!a.alive) continue;
      const px = a.x * C + C / 2, py = a.y * C + C / 2;
      g.fillStyle = a.color; g.shadowColor = a.color; g.shadowBlur = 14;
      g.beginPath(); g.roundRect(px - 13, py - 15, 26, 30, 10); g.fill(); g.shadowBlur = 0;
      g.fillStyle = "#07060f"; g.fillRect(px - 8, py - 7, 16, 7);
      g.fillStyle = a.color; g.fillRect(px - 5, py - 5, 3, 3); g.fillRect(px + 2, py - 5, 3, 3);
      g.font = "700 10px ui-monospace, monospace"; g.textAlign = "center"; g.fillStyle = "#f2efff";
      g.fillText(a.human ? L("SEN", "YOU") : a.name.replace("Bot ", ""), px, py - 20);
    }
    fx = fx.filter((f) => now - f.t < 300);
  }

  function panel() {
    botsEl.innerHTML = w.agents.map((a) => `<div class="botrow ${a.alive ? "" : "dead"}"><i style="background:${a.color};box-shadow:0 0 8px ${a.color}"></i><b>${a.human ? L("Sen", "You") : a.name}</b><span>${a.alive ? (a.human ? "—" : INTENT[a.intent]?.() ?? a.intent) : L("Elendi", "Out")}</span><small>💣${a.bombs} · ${L("menzil", "range")} ${a.range}</small></div>`).join("");
    scoreEl.innerHTML = stats(w.agents.map((a) => [a.human ? L("Sen", "You") : a.name, wins[a.id]] as [string, number]));
  }

  const KEYS: Record<string, number> = { ArrowUp: 0, KeyW: 0, ArrowRight: 1, KeyD: 1, ArrowDown: 2, KeyS: 2, ArrowLeft: 3, KeyA: 3 };
  host.on("keydown", (e) => {
    if (mode !== "play") return;
    if (e.code in KEYS) { e.preventDefault(); const d = KEYS[e.code]; if (!held.includes(d)) held.push(d); }
    if (e.code === "Space") {
      e.preventDefault();
      if (over) { restart(); return; }
      const me = w.agents.find((a) => a.human);
      if (me && placeBomb(w, me)) sfx.move();
    }
  });
  host.on("keyup", (e) => { if (e.code in KEYS) held = held.filter((d) => d !== KEYS[e.code]); });

  let panelT = 0;
  host.loop((dt, now) => {
    update(dt);
    draw(now);
    if (now - panelT > 200) { panelT = now; panel(); }
  });
  restart();
}
