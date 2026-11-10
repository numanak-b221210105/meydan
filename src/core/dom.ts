// Minimal DOM helpers.
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number | boolean | ((e: Event) => void) | undefined> = {},
  ...kids: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (typeof v === "function") el.addEventListener(k.replace(/^on/, ""), v);
    else if (k === "html") el.innerHTML = String(v);
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, String(v));
  }
  for (const k of kids) if (k !== null && k !== undefined && k !== false) el.append(k);
  return el;
}
export const $ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document): T | null => r.querySelector<T>(s);
export const esc = (s: unknown): string =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** A segmented control. Returns the element; calls onPick with the chosen value. */
export function segmented<T extends string>(items: [T, string][], value: T, onPick: (v: T) => void): HTMLElement {
  const box = h("div", { class: "seg" });
  const paint = (v: T) => box.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.v === v));
  for (const [v, label] of items) {
    const b = h("button", { "data-v": v, onclick: () => { paint(v); onPick(v); } }, label);
    box.append(b);
  }
  paint(value);
  return box;
}
/** Sets up a canvas sized for the device pixel ratio. */
export function hiDpi(canvas: HTMLCanvasElement, w: number, hgt: number): CanvasRenderingContext2D {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(hgt * dpr);
  canvas.style.aspectRatio = `${w} / ${hgt}`;
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}
