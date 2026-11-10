// Tiny Web Audio blips. Off by default; toggled from the header.
import { load, save } from "./store";

let ctx: AudioContext | null = null;
let on = load("sound", false);
export const soundOn = (): boolean => on;
export function toggleSound(): boolean {
  on = !on;
  save("sound", on);
  return on;
}
export function blip(freq = 440, ms = 70, type: OscillatorType = "square", vol = 0.05): void {
  if (!on) return;
  try {
    ctx ??= new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = vol;
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + ms / 1000);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + ms / 1000);
  } catch {
    /* audio not available */
  }
}
export const sfx = {
  move: () => blip(520, 50, "triangle"),
  capture: () => blip(220, 90, "sawtooth"),
  win: () => [660, 880, 1100].forEach((f, i) => setTimeout(() => blip(f, 110, "square", 0.06), i * 110)),
  lose: () => [330, 260, 200].forEach((f, i) => setTimeout(() => blip(f, 140, "sawtooth", 0.05), i * 130)),
  tick: () => blip(900, 25, "square", 0.03),
  boom: () => blip(90, 220, "sawtooth", 0.08),
};
