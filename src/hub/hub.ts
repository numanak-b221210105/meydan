// The arcade lobby: ten cabinets, each a game with its own AI.
import { h } from "../core/dom";
import { L, lang, setLang } from "../core/i18n";
import { soundOn, toggleSound } from "../core/sfx";
import { load, record, save } from "../core/store";
import { GAMES } from "../games";

export const LOGO = `<svg viewBox="0 0 48 48" fill="none"><path d="M24 3 45 24 24 45 3 24Z" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M24 13 35 24 24 35 13 24Z" stroke="currentColor" stroke-width="2" opacity=".55"/><path d="M24 13 29.5 18.5 24 24 18.5 18.5Z" fill="var(--mag)"/><path d="M24 24 29.5 29.5 24 35 18.5 29.5Z" fill="var(--cyan)" opacity=".9"/></svg>`;
const REPO = "https://github.com/numanak-b221210105/meydan";

export function renderHub(root: HTMLElement, open: (id: string) => void): void {
  let filter = load<"all" | "board" | "arcade">("filter", "all");
  const grid = h("div", { class: "cabinets" });

  const paint = () => {
    grid.replaceChildren();
    GAMES.filter((g) => filter === "all" || g.kind === filter).forEach((g, i) => {
      const r = record(g.id);
      const rec = g.kind === "board" ? (r.w + r.l + r.d ? `${r.w}${L("G", "W")} · ${r.l}${L("M", "L")} · ${r.d}${L("B", "D")}` : L("Henüz oynanmadı", "Not played yet")) : r.best ? `${L("Rekor", "Best")}: ${r.best}` : L("Rekor yok", "No record yet");
      grid.append(h("button", { class: "cab", style: `--accent:${g.accent};animation-delay:${i * 45}ms`, onclick: () => open(g.id) },
        h("div", { class: "screen" }, h("span", { class: "art", html: g.art }), h("span", { class: "scan" }), h("span", { class: "no" }, String(GAMES.indexOf(g) + 1).padStart(2, "0"))),
        h("div", { class: "marquee" }, h("b", {}, g.name()), h("small", {}, g.blurb())),
        h("div", { class: "cab-foot" }, h("span", { class: "chip" }, g.tech()), h("span", { class: "rec" }, rec)),
        h("span", { class: "press" }, L("OYNA", "PLAY"), h("i", { html: "&#9656;" }))));
    });
  };

  const chips = h("div", { class: "filters" });
  const chipList: [typeof filter, string][] = [["all", L("Tümü", "All")], ["board", L("Tahta oyunları", "Board games")], ["arcade", L("Arcade", "Arcade")]];
  for (const [v, label] of chipList) {
    chips.append(h("button", { class: "fchip" + (v === filter ? " on" : ""), onclick: (e: Event) => {
      filter = v; save("filter", v);
      chips.querySelectorAll(".fchip").forEach((c) => c.classList.toggle("on", c === e.currentTarget));
      paint();
    } }, label));
  }

  const soundBtn = h("button", { class: "tbtn", title: L("Ses", "Sound"), onclick: () => { soundBtn.classList.toggle("on", toggleSound()); } }, h("span", { html: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9Z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>` }));
  soundBtn.classList.toggle("on", soundOn());

  root.replaceChildren(h("div", { class: "hub" },
    h("div", { class: "sky", "aria-hidden": "true" }, h("i", { class: "sun" }), h("i", { class: "floor" })),
    h("header", { class: "hub-top" },
      h("a", { class: "logo", href: "#/" }, h("span", { html: LOGO }), "MEYDAN"),
      h("div", { class: "top-r" },
        h("button", { class: "tbtn lang", onclick: () => setLang(lang() === "tr" ? "en" : "tr") }, lang() === "tr" ? "EN" : "TR"),
        soundBtn,
        h("a", { class: "tbtn", href: REPO, target: "_blank", rel: "noopener", title: "GitHub", html: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.3-3.4-1.3-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.6 2.4 1.1 3 .9.1-.7.4-1.1.6-1.4-2.2-.3-4.6-1.1-4.6-5 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.8 1a9.6 9.6 0 0 1 5 0c1.9-1.3 2.8-1 2.8-1 .5 1.4.2 2.4.1 2.7.6.7 1 1.6 1 2.7 0 3.9-2.4 4.7-4.6 5 .4.3.7.9.7 1.9V21c0 .3.2.6.7.5A10 10 0 0 0 12 2Z"/></svg>` }))),
    h("section", { class: "hero" },
      h("h1", { class: "neon", "data-text": "MEYDAN" }, "MEYDAN"),
      h("p", {}, L("On klasik oyun, on farklı yapay zekâ. Rakibini yen, onu izle ve nasıl düşündüğünü gör.", "Ten classic games, ten different AIs. Beat them, watch them, and see how they think.")),
      h("div", { class: "counters" },
        h("span", {}, h("b", {}, "10"), L("oyun", "games")),
        h("span", {}, h("b", {}, "10"), L("yapay zekâ tekniği", "AI techniques")),
        h("span", {}, h("b", {}, "0"), L("sunucu", "servers")))),
    chips, grid,
    h("footer", { class: "hub-foot" }, L("Her şey tarayıcında çalışır. Yapay zekâ hesapları ayrı bir iş parçacığında (Web Worker) yapılır, ekran donmaz.", "Everything runs in your browser. AI searches run in a Web Worker so the page never freezes."))));
  paint();
}
