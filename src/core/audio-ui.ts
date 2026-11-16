// Sound and music toggles shared by the lobby and the game screens.
import { h } from "./dom";
import { L } from "./i18n";
import { musicEnabled, soundOn, toggleMusic, toggleSound } from "./sfx";

const SPEAKER = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9Z"/><path class="wave" d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/><path class="mute" d="M16 9l6 6M22 9l-6 6"/></svg>`;
const NOTE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/><path class="mute" d="M3 3l18 18"/></svg>`;

export function audioToggles(): HTMLElement[] {
  const fx: HTMLButtonElement = h("button", {
    class: "tbtn snd", "aria-pressed": String(soundOn()), title: L("Ses efektleri", "Sound effects"),
    onclick: () => fx.setAttribute("aria-pressed", String(toggleSound())),
  }, h("span", { html: SPEAKER }));
  const mu: HTMLButtonElement = h("button", {
    class: "tbtn snd", "aria-pressed": String(musicEnabled()), title: L("Müzik", "Music"),
    onclick: () => mu.setAttribute("aria-pressed", String(toggleMusic())),
  }, h("span", { html: NOTE }));
  return [fx, mu];
}
