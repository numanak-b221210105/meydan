import "./style.css";
import { lang, onLang } from "./core/i18n";
import { openGame } from "./core/shell";
import { GAMES } from "./games";
import { renderHub } from "./hub/hub";
import { setMood } from "./core/sfx";
import { isTouch } from "./core/touch";
import { installHint } from "./core/install";

document.documentElement.classList.toggle("touch", isTouch());

const app = document.getElementById("app")!;
let close: (() => void) | null = null;

function route(): void {
  close?.();
  close = null;
  const id = location.hash.replace(/^#\/?/, "");
  const game = GAMES.find((g) => g.id === id);
  document.body.dataset.view = game ? "game" : "hub";
  window.scrollTo(0, 0);
  setMood(game?.kind === "arcade" ? "drive" : "calm");
  if (game) {
    document.title = `${game.name()} · Meydan`;
    close = openGame(game, app, () => { location.hash = "#/"; });
  } else {
    document.title = "Meydan";
    renderHub(app, (g) => { location.hash = "#/" + g; });
  }
}
window.addEventListener("hashchange", route);
onLang(route);
route();

installHint({ app: "Meydan", lang, accent: "#c026d3", delayMs: 40000 });
if ("serviceWorker" in navigator && import.meta.env.PROD) navigator.serviceWorker.register("./sw.js").catch(() => {});
