// The game screen: a top bar, the stage, a control row and the AI console.
import { h } from "./dom";
import { L } from "./i18n";
import type { GameDef } from "./types";

export interface Host {
  game: GameDef;
  stage: HTMLElement;
  controls: HTMLElement;
  /** Adds a titled section to the AI console and returns its body. */
  section(title: string, cls?: string): HTMLElement;
  status(html: string, tone?: "" | "good" | "bad" | "warn"): void;
  /** Requests animation frames until the game is closed. */
  loop(fn: (dt: number, now: number) => void): void;
  on<K extends keyof WindowEventMap>(type: K, fn: (e: WindowEventMap[K]) => void): void;
  onExit(fn: () => void): void;
  readonly closed: boolean;
}

export function openGame(game: GameDef, root: HTMLElement, back: () => void): () => void {
  const cleanups: (() => void)[] = [];
  let closed = false;
  const stage = h("div", { class: "stage" });
  const controls = h("div", { class: "controls" });
  const statusEl = h("div", { class: "status" });
  const consoleBody = h("div", { class: "console-body" });

  const view = h("div", { class: "game", style: `--accent:${game.accent}` },
    h("header", { class: "g-top" },
      h("button", { class: "back", onclick: back, title: L("Meydana dön", "Back to the arcade") }, h("span", { html: "&larr;" }), L("Meydan", "Arcade")),
      h("div", { class: "g-title" }, h("span", { class: "g-art", html: game.art }), h("div", {}, h("h1", {}, game.name()), h("small", {}, game.blurb()))),
      statusEl),
    h("div", { class: "g-main" },
      h("section", { class: "g-play" }, stage, controls),
      h("aside", { class: "console" },
        h("div", { class: "console-head" }, h("span", { class: "led" }), L("YAPAY ZEKÂ KONSOLU", "AI CONSOLE")),
        h("div", { class: "tech" }, h("b", {}, game.tech()), h("p", {}, game.how())),
        consoleBody)));
  root.replaceChildren(view);

  const host: Host = {
    game,
    stage,
    controls,
    get closed() { return closed; },
    section(title, cls = "") {
      const body = h("div", { class: "sec-b" });
      consoleBody.append(h("section", { class: "sec " + cls }, h("h3", {}, title), body));
      return body;
    },
    status(html, tone = "") {
      statusEl.className = "status " + tone;
      statusEl.innerHTML = html;
    },
    loop(fn) {
      let last = performance.now();
      const step = (now: number) => {
        if (closed) return;
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        fn(dt, now);
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    },
    on(type, fn) {
      window.addEventListener(type, fn as EventListener);
      cleanups.push(() => window.removeEventListener(type, fn as EventListener));
    },
    onExit(fn) { cleanups.push(fn); },
  };
  game.load().then((m) => { if (!closed) m.mount(host); });
  return () => {
    closed = true;
    cleanups.forEach((f) => f());
  };
}
