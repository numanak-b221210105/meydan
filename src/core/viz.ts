// Shared visual pieces for the AI console.
import { esc } from "./dom";

/** Evaluation bar; v in [-1, 1], positive favours the first label. */
export function evalBar(v: number, a: string, b: string): string {
  const p = Math.round(50 + 50 * Math.max(-1, Math.min(1, v)));
  return `<div class="evalbar"><div class="eb-track"><i style="width:${p}%"></i></div><div class="eb-l"><span>${esc(a)}</span><b>${p}%</b><span>${esc(b)}</span></div></div>`;
}
export function stats(items: [string, string | number][]): string {
  return `<div class="stats">${items.map(([k, v]) => `<div><small>${esc(k)}</small><b>${esc(v)}</b></div>`).join("")}</div>`;
}
/** Horizontal bars; value in [0, 1]. */
export function bars(items: { label: string; value: number; text?: string; hot?: boolean }[], cls = ""): string {
  return `<div class="bars ${cls}">${items
    .map((it) => `<div class="bar ${it.hot ? "hot" : ""}"><span>${esc(it.label)}</span><i><u style="width:${Math.max(2, Math.round(it.value * 100))}%"></u></i><b>${esc(it.text ?? Math.round(it.value * 100) + "%")}</b></div>`)
    .join("")}</div>`;
}
/** Small line chart drawn into a canvas. */
export function spark(canvas: HTMLCanvasElement, series: { data: number[]; color: string }[], w = 300, hgt = 90): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = w * dpr;
  canvas.height = hgt * dpr;
  const g = canvas.getContext("2d")!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, hgt);
  const all = series.flatMap((s) => s.data);
  if (!all.length) return;
  const max = Math.max(...all, 1e-9), min = Math.min(0, ...all);
  g.strokeStyle = "rgba(255,255,255,.08)";
  for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(0, (hgt * i) / 4); g.lineTo(w, (hgt * i) / 4); g.stroke(); }
  for (const s of series) {
    if (s.data.length < 2) continue;
    g.beginPath();
    s.data.forEach((v, i) => {
      const x = (i / (s.data.length - 1)) * (w - 4) + 2, y = hgt - 4 - ((v - min) / (max - min)) * (hgt - 8);
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    });
    g.strokeStyle = s.color;
    g.lineWidth = 2;
    g.shadowColor = s.color;
    g.shadowBlur = 8;
    g.stroke();
    g.shadowBlur = 0;
  }
}
export function log(el: HTMLElement, html: string, max = 40): void {
  const row = document.createElement("div");
  row.innerHTML = html;
  el.prepend(row);
  while (el.children.length > max) el.lastChild!.remove();
}
