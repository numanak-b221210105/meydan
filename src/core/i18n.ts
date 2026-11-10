// Two-language support. Strings are written inline as L("Türkçe", "English").
export type Lang = "tr" | "en";

const KEY = "meydan.lang";
let current: Lang = (localStorage.getItem(KEY) as Lang) || (navigator.language.startsWith("tr") ? "tr" : "en");
const listeners = new Set<() => void>();

export const lang = (): Lang => current;
export const L = (tr: string, en: string): string => (current === "tr" ? tr : en);
export function setLang(l: Lang): void {
  current = l;
  localStorage.setItem(KEY, l);
  document.documentElement.lang = l;
  listeners.forEach((f) => f());
}
export const onLang = (f: () => void): (() => void) => {
  listeners.add(f);
  return () => listeners.delete(f);
};
export const fmt = (n: number, d = 0): string =>
  n.toLocaleString(current === "tr" ? "tr-TR" : "en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
