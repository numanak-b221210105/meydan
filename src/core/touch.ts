// Touch controls for phones and tablets: an on-screen pad and swipe gestures.
// They send the same keyboard events the games already listen to, so game code stays unchanged.
import { h } from "./dom";

export const isTouch = (): boolean => matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;

const key = (type: "keydown" | "keyup", code: string) =>
  window.dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true, cancelable: true }));

export interface PadButton {
  code: string;
  label: string;
  /** grid area name: up, down, left, right, a, b */
  area: string;
  /** keep firing while held (e.g. moving a tetromino) */
  repeat?: boolean;
  wide?: boolean;
}

/** On-screen buttons that press and release keys. Shown only on touch screens. */
export function touchPad(buttons: PadButton[]): HTMLElement {
  const pad = h("div", { class: "tpad", "aria-hidden": "true" });
  for (const b of buttons) {
    const el = h("button", { class: `tkey tk-${b.area}${b.wide ? " wide" : ""}`, type: "button" }, b.label);
    let rep = 0, delay = 0;
    const stop = () => {
      clearTimeout(delay); clearInterval(rep);
      if (el.classList.contains("on")) key("keyup", b.code);
      el.classList.remove("on");
    };
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      el.setPointerCapture?.(e.pointerId);
      el.classList.add("on");
      key("keydown", b.code);
      navigator.vibrate?.(8);
      if (b.repeat) delay = window.setTimeout(() => { rep = window.setInterval(() => key("keydown", b.code), 70); }, 200);
    });
    for (const ev of ["pointerup", "pointercancel", "lostpointercapture"]) el.addEventListener(ev, stop);
    el.addEventListener("contextmenu", (e) => e.preventDefault());
    pad.append(el);
  }
  return pad;
}

/** Swipes on an element become arrow keys; a short tap can press another key. */
export function swipe(el: HTMLElement, tapCode?: string): void {
  let x0 = 0, y0 = 0, t0 = 0, id = -1;
  el.style.touchAction = "none";
  el.addEventListener("pointerdown", (e) => { if (e.pointerType === "mouse") return; id = e.pointerId; x0 = e.clientX; y0 = e.clientY; t0 = performance.now(); });
  el.addEventListener("pointerup", (e) => {
    if (e.pointerId !== id) return;
    id = -1;
    const dx = e.clientX - x0, dy = e.clientY - y0;
    const dist = Math.hypot(dx, dy);
    if (dist < 18) { if (tapCode && performance.now() - t0 < 300) { key("keydown", tapCode); key("keyup", tapCode); } return; }
    const code = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "ArrowRight" : "ArrowLeft") : dy > 0 ? "ArrowDown" : "ArrowUp";
    key("keydown", code); key("keyup", code);
  });
}
