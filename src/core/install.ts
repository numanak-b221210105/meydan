// Install prompt for every platform:
// - Android / desktop Chromium: the real install dialog (beforeinstallprompt).
// - iPhone / iPad Safari: there is no dialog, so a one-time sheet shows the
//   "Share -> Add to Home Screen" steps.
// Also asks the browser to keep this site's data (otherwise Safari may clear
// unused site data after a week), and keeps the status bar colour in step with
// the page background.

type BIP = Event & { prompt(): Promise<void>; userChoice?: Promise<{ outcome: string }> };

export interface InstallOptions { app: string; lang?: () => "tr" | "en"; delayMs?: number; accent?: string; bottom?: number }

const isStandalone = () =>
  matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
// In-app browsers (Instagram, Gmail, ...) cannot add to the home screen.
const isInApp = () => /FBAN|FBAV|Instagram|Line\/|GSA\/|CriOS|FxiOS|EdgiOS/.test(navigator.userAgent);

let deferred: BIP | null = null;
const listeners: (() => void)[] = [];
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferred = e as BIP;
  listeners.forEach((f) => f());
});
window.addEventListener("appinstalled", () => { deferred = null; document.querySelector(".ik-sheet")?.remove(); });

/** True when the browser can show its own install dialog right now. */
export const canInstall = () => !!deferred;
export const onInstallable = (f: () => void) => listeners.push(f);
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const d = deferred;
  deferred = null;
  await d.prompt();
  const r = await d.userChoice?.catch(() => null);
  return r?.outcome === "accepted";
}

const KEY = "appkit.install.dismissed";
function dismissedRecently(): boolean {
  try { return Date.now() - Number(localStorage.getItem(KEY) || 0) < 30 * 864e5; } catch { return false; }
}
function remember() { try { localStorage.setItem(KEY, String(Date.now())); } catch { /* ignore */ } }

const SHARE_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M6 11v9h12v-9"/></svg>';
const PLUS_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8v8M8 12h8"/></svg>';

function css(accent: string, bottom: number) {
  if (document.getElementById("ik-css")) return;
  const s = document.createElement("style");
  s.id = "ik-css";
  s.textContent = `
.ik-sheet{position:fixed;z-index:2147482000;left:12px;right:12px;bottom:calc(${bottom}px + env(safe-area-inset-bottom));max-width:440px;margin:0 auto;
padding:14px 16px 14px 14px;border-radius:18px;background:rgba(22,24,32,.94);color:#f4f2ee;box-shadow:0 18px 50px -14px rgba(0,0,0,.55);
-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);font:500 14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;
display:grid;grid-template-columns:44px 1fr auto;gap:12px;align-items:center;animation:ik-in .45s cubic-bezier(.2,.9,.25,1.1)}
.ik-sheet img{width:44px;height:44px;border-radius:11px}
.ik-sheet b{display:block;font-weight:650;margin-bottom:2px}
.ik-sheet small{display:block;opacity:.78;font-size:12.5px}
.ik-sheet small svg{vertical-align:-4px;margin:0 2px}
.ik-sheet button{font:inherit;border:0;cursor:pointer;border-radius:11px}
.ik-go{background:${accent};color:#fff;padding:9px 14px;font-weight:650}
.ik-x{position:absolute;top:6px;right:8px;width:28px;height:28px;background:transparent;color:inherit;opacity:.6;font-size:18px}
.ik-sheet.ios{grid-template-columns:44px 1fr;padding-right:34px}
@keyframes ik-in{from{opacity:0;transform:translateY(16px)}}
@media (prefers-reduced-motion:reduce){.ik-sheet{animation:none}}`;
  document.head.append(s);
}

function icon(): string {
  const l = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]') || document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  return l?.href || "";
}

/** Shows the install sheet once (per 30 days) when it makes sense on this device. */
export function installHint(o: InstallOptions): void {
  const L = (tr: string, en: string) => ((o.lang?.() ?? (navigator.language.startsWith("tr") ? "tr" : "en")) === "tr" ? tr : en);
  const accent = o.accent || "#2563eb";
  void navigator.storage?.persist?.().catch(() => {});
  if (isStandalone() || dismissedRecently()) return;
  const touch = matchMedia("(pointer: coarse)").matches;
  const show = () => {
    if (document.querySelector(".ik-sheet") || isStandalone()) return;
    css(accent, o.bottom ?? 12);
    const el = document.createElement("div");
    el.className = "ik-sheet";
    el.setAttribute("role", "dialog");
    const close = () => { remember(); el.remove(); };
    const img = icon() ? `<img alt="" src="${icon()}">` : "<span></span>";
    if (deferred) {
      el.innerHTML = `${img}<div><b>${L(`${o.app} uygulamasını yükle`, `Install ${o.app}`)}</b><small>${L("Ana ekrandan aç, çevrimdışı da çalışsın.", "Open it from your home screen, works offline too.")}</small></div><button class="ik-go">${L("Yükle", "Install")}</button><button class="ik-x" aria-label="${L("Kapat", "Close")}">×</button>`;
      el.querySelector<HTMLButtonElement>(".ik-go")!.onclick = async () => { el.remove(); if (!(await promptInstall())) remember(); };
    } else if (isIOS() && !isInApp()) {
      el.classList.add("ios");
      el.innerHTML = `${img}<div><b>${L(`${o.app}'i ana ekrana ekle`, `Add ${o.app} to your Home Screen`)}</b><small>${L(`Safari'de ${SHARE_ICON} Paylaş'a (gerekirse ••• menüsünden), sonra ${PLUS_ICON} <b style="display:inline">Ana Ekrana Ekle</b>'ye dokun. Uygulama gibi açılır, verilerin kalıcı olur.`, `In Safari tap ${SHARE_ICON} Share (from the ••• menu if needed), then ${PLUS_ICON} <b style="display:inline">Add to Home Screen</b>. It opens like an app and keeps your data.`)}</small></div><button class="ik-x" aria-label="${L("Kapat", "Close")}">×</button>`;
    } else return;
    el.querySelector<HTMLButtonElement>(".ik-x")!.onclick = close;
    document.body.append(el);
  };
  if (!touch && !deferred) { onInstallable(() => setTimeout(show, o.delayMs ?? 25000)); return; }
  setTimeout(show, o.delayMs ?? 25000);
  onInstallable(() => setTimeout(show, 2000));
}

/** Keeps <meta name="theme-color"> equal to the page background (light/dark themes). */
export function syncThemeColor(): void {
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) { meta = document.createElement("meta"); meta.name = "theme-color"; document.head.append(meta); }
  const apply = () => {
    const bg = getComputedStyle(document.body || document.documentElement).backgroundColor;
    const m = bg.match(/rgba?\(([^)]+)\)/);
    if (!m) return;
    const [r, g, b, a = "1"] = m[1].split(",").map((x) => x.trim());
    if (Number(a) < 0.5) return;
    meta!.content = `rgb(${r}, ${g}, ${b})`;
  };
  const start = () => {
    apply();
    const mo = new MutationObserver(() => requestAnimationFrame(apply));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme", "style"] });
    if (document.body) mo.observe(document.body, { attributes: true, attributeFilter: ["class", "data-theme", "style"] });
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => setTimeout(apply, 50));
  };
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", start) : start();
}

/** Keeps the screen on while something long runs (recording, transcription). */
export async function keepAwake(): Promise<() => void> {
  type WL = { release(): Promise<void>; addEventListener(t: string, f: () => void): void };
  const nav = navigator as Navigator & { wakeLock?: { request(t: "screen"): Promise<WL> } };
  let lock: WL | null = null, done = false;
  const take = async () => { try { lock = (await nav.wakeLock?.request("screen")) ?? null; } catch { lock = null; } };
  const again = () => { if (!done && document.visibilityState === "visible") void take(); };
  await take();
  document.addEventListener("visibilitychange", again);
  return () => { done = true; document.removeEventListener("visibilitychange", again); void lock?.release().catch(() => {}); };
}
