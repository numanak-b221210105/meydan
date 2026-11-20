// Sound for Meydan: effects and a generative soundtrack, all synthesized at runtime
// with physical-style models (wood, mallets, bells, plucked strings) by SoundKit.
import { SoundKit, bell, glide, mallet, modal, noiseBurst, note, pluck, seq, soften, wood, type Synth } from "./soundkit";
import { load, save } from "./store";

// ---------- settings ----------
let fxOn = load("sound", true);
let musicOn = load("music", true);
export const soundOn = (): boolean => fxOn;
export const musicEnabled = (): boolean => musicOn;

const kit = new SoundKit({ storageKey: "meydan.audio", volume: 0.85, reverb: 0.2, session: musicOn ? "playback" : "ambient" });
kit.onUnlock = () => { if (musicOn) startMusic(); };

export function toggleSound(): boolean {
  fxOn = !fxOn;
  save("sound", fxOn);
  kit.unlock();
  if (fxOn) sfx.click();
  return fxOn;
}
export function toggleMusic(): boolean {
  musicOn = !musicOn;
  save("music", musicOn);
  // With music on, Meydan behaves like a game app (plays even when the phone is on silent).
  kit.setSession(musicOn ? "playback" : "ambient");
  kit.unlock();
  if (musicOn) startMusic(); else stopMusic();
  return musicOn;
}

// ---------- effect palette ----------
const dice: Synth = (sr) => {
  const hits: [Synth, number, number][] = [];
  for (let i = 0; i < 5; i++) hits.push([wood(1700 + i * 230, 0.05, 0.9), i * 0.028 + (i % 2) * 0.009, 1 - i * 0.12]);
  return seq(hits)(sr);
};
const arp = (notes: number[], gap: number, len = 0.7): Synth => seq(notes.map((n, i) => [mallet(note(n), len), i * gap, 1 - i * 0.06] as [Synth, number, number]));

kit
  .define("tap", (sr) => soften(noiseBurst(0.007, 3000, 1.1), 7000)(sr))
  .define("move", wood(560, 0.14, 0.55))
  .define("capture", seq([[wood(560, 0.12, 0.6), 0, 1], [wood(330, 0.2, 0.5), 0.065, 1]]))
  .define("flip", seq([[noiseBurst(0.06, 1800, 1.4, 5200), 0, 0.5], [wood(980, 0.07, 0.4), 0.035, 0.9]]))
  .define("dice", dice)
  .define("eat", seq([[glide(480, 960, 0.12, 0.06), 0, 0.8], [mallet(note(91), 0.3), 0.03, 0.5]]))
  .define("point", soften(bell(note(96), 0.7), 6500))
  .define("flap", soften(noiseBurst(0.13, 650, 0.9, 1900), 3500))
  .define("rotate", wood(1250, 0.05, 0.3))
  .define("lock", seq([[wood(190, 0.16, 0.7), 0, 1], [noiseBurst(0.03, 900, 1.5), 0, 0.3]]))
  .define("clear1", arp([79, 84], 0.06))
  .define("clear2", arp([76, 79, 84], 0.055))
  .define("clear3", arp([72, 76, 79, 84], 0.05))
  .define("clear4", seq([[arp([72, 76, 79, 84, 88], 0.045), 0, 1], [bell(note(100), 1), 0.22, 0.3]]))
  .define("reveal", wood(2300, 0.03, 0.4))
  .define("flag", pluck(note(76), 0.45, 0.6))
  .define("drop", seq([[glide(230, 110, 0.2, 0.07), 0, 1], [wood(210, 0.08, 0.4), 0, 0.6]]))
  .define("pickup", seq([[arp([84, 88, 91, 96], 0.04, 0.35), 0, 1], [bell(note(103), 0.6), 0.14, 0.25]]))
  .define("boom", seq([[soften(noiseBurst(0.75, 1400, 0.7, 70, "lp"), 2500), 0, 1], [glide(95, 34, 0.7, 0.25), 0, 0.9]]))
  .define("win", seq([[arp([72, 76, 79, 84], 0.11, 1), 0, 1], [bell(note(96), 1.6), 0.44, 0.35]]))
  .define("lose", soften(arp([67, 63, 60], 0.17, 0.9), 2200))
  .define("draw", arp([72, 79], 0.16, 0.8));

const fx = (name: string, vol = 1, gap = 35, vary = 0.04) => () => {
  if (!fxOn) return;
  kit.play(name, { vol, rate: 1 + (Math.random() * 2 - 1) * vary }, gap);
};

export const sfx = {
  click: fx("tap", 0.5, 40, 0.02),
  move: fx("move", 0.9, 45),
  capture: fx("capture", 0.95, 60),
  flip: fx("flip", 0.55, 50),
  dice: fx("dice", 0.7, 60, 0.06),
  eat: fx("eat", 0.55, 40, 0.02),
  point: fx("point", 0.35, 60, 0),
  flap: fx("flap", 0.45, 40, 0.08),
  shift: fx("tap", 0.25, 30, 0.03),
  rotate: fx("rotate", 0.45, 35),
  lock: fx("lock", 0.75, 50),
  clear: (n = 1) => fx(`clear${Math.max(1, Math.min(4, n))}`, 0.55, 120, 0)(),
  reveal: fx("reveal", 0.35, 30, 0.06),
  flag: fx("flag", 0.55, 50, 0),
  drop: fx("drop", 0.7, 60),
  pickup: fx("pickup", 0.5, 60, 0),
  boom: fx("boom", 0.9, 90, 0.05),
  tick: fx("tap", 0.4, 40),
  win: fx("win", 0.6, 800, 0),
  lose: fx("lose", 0.6, 800, 0),
  draw: fx("draw", 0.55, 800, 0),
};

// ---------- music ----------
// A slow, generative lounge piece in A minor: electric-piano chords, a plucked bass,
// a sparse mallet melody, and (in arcade games) a soft kit. The melody is chosen at
// random within the chord each bar, so it never loops exactly.
export type Mood = "calm" | "drive";
let mood: Mood = "calm";
export function setMood(m: Mood): void { mood = m; }

const epiano = (f: number) => soften(modal(f, [[1, 1, 1.6], [2, 0.28, 0.7], [3, 0.1, 0.35], [4.02, 0.06, 0.2], [7.1, 0.025, 0.05]], 2.6, 0.004), 2600);
const kick: Synth = seq([[glide(130, 46, 0.32, 0.11), 0, 1], [noiseBurst(0.01, 1800, 1.2), 0, 0.15]]);
const hat: Synth = (sr) => noiseBurst(0.04, 8500, 0.8, undefined, "hp")(sr);
const rim: Synth = wood(1700, 0.05, 0.6);

// Am9 · Fmaj9 · Cmaj7 · G6  (MIDI)
const CHORDS = [
  { bass: 45, keys: [60, 64, 67, 71] },
  { bass: 41, keys: [60, 64, 67, 69] },
  { bass: 48, keys: [59, 64, 67, 71] },
  { bass: 43, keys: [59, 62, 64, 67] },
];
const MELODY = [69, 72, 74, 76, 79, 81, 84];
const needed = new Set<string>();
function voice(kind: "ep" | "bass" | "mel", midi: number): string {
  const name = `${kind}${midi}`;
  if (!needed.has(name)) {
    needed.add(name);
    kit.define(name, kind === "ep" ? epiano(note(midi)) : kind === "bass" ? pluck(note(midi), 1.6, 0.25, 0.9985) : mallet(note(midi), 1.1));
  }
  return name;
}
kit.define("kick", kick).define("hat", hat).define("rim", rim);

let timer = 0;
let nextTime = 0;
let step = 0;
let musicGain: GainNode | null = null;

function startMusic(): void {
  const c = kit.ctx;
  if (!c || timer || c.state !== "running" || !kit.out) return;
  // Render the instruments once up front so the first bars do not stutter.
  for (const ch of CHORDS) { ch.keys.forEach((k) => voice("ep", k)); voice("bass", ch.bass - 12); voice("bass", ch.bass - 5); }
  MELODY.forEach((m) => voice("mel", m));
  kit.warm([...needed, "kick", "hat", "rim"]);
  musicGain = c.createGain();
  musicGain.gain.value = 0;
  musicGain.gain.setTargetAtTime(0.32, c.currentTime, 1.5);
  musicGain.connect(kit.out);
  nextTime = c.currentTime + 0.15;
  step = 0;
  timer = window.setInterval(schedule, 50);
}
function stopMusic(): void {
  if (!timer || !kit.ctx || !musicGain) return;
  clearInterval(timer);
  timer = 0;
  const g = musicGain;
  g.gain.setTargetAtTime(0, kit.ctx.currentTime, 0.35);
  setTimeout(() => g.disconnect(), 2500);
  musicGain = null;
}

function hit(name: string, at: number, vol: number, pan = 0, send = 0.6) {
  const c = kit.ctx!, b = kit.buffer(name);
  if (!b || !musicGain) return;
  const s = c.createBufferSource();
  s.buffer = b;
  const g = c.createGain();
  g.gain.value = vol;
  let n: AudioNode = s.connect(g);
  if (pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; n = n.connect(p); }
  n.connect(musicGain);
  if (send > 0 && kit.send) { const sg = c.createGain(); sg.gain.value = send; n.connect(sg).connect(kit.send); }
  s.start(at);
}

function schedule(): void {
  const c = kit.ctx;
  if (!c || !musicGain) return;
  const bpm = mood === "drive" ? 92 : 70;
  const sixteenth = 60 / bpm / 4;
  while (nextTime < c.currentTime + 0.25) {
    const bar = Math.floor(step / 16) % CHORDS.length;
    const pos = step % 16;
    const ch = CHORDS[bar];
    const t = nextTime + (pos % 2 ? sixteenth * 0.12 : 0); // light swing
    if (pos === 0 || (mood === "drive" && pos === 10)) {
      ch.keys.forEach((k, i) => hit(voice("ep", k), t + i * 0.012, pos === 0 ? 0.16 : 0.1, (i - 1.5) * 0.15, 0.8));
    }
    if (pos === 0) hit(voice("bass", ch.bass - 12), t, 0.5, 0, 0.15);
    if (pos === 8 && Math.random() < 0.6) hit(voice("bass", ch.bass - 5), t, 0.32, 0, 0.15);
    if (mood === "drive") {
      if (pos === 0 || pos === 8) hit("kick", t, 0.42, 0, 0.05);
      if (pos === 4 || pos === 12) hit("rim", t, 0.12, -0.2, 0.3);
      if (pos % 2 === 0) hit("hat", t, pos % 4 === 2 ? 0.07 : 0.04, 0.25, 0.1);
    }
    const chance = mood === "drive" ? 0.3 : 0.18;
    if (pos % 2 === 0 && pos !== 0 && Math.random() < chance) {
      const pool = MELODY.filter((n) => ch.keys.some((k) => (n - k) % 12 === 0) || Math.random() < 0.3);
      hit(voice("mel", pool[Math.floor(Math.random() * pool.length)]), t, 0.14, (Math.random() - 0.5) * 0.6, 1);
    }
    nextTime += sixteenth;
    step++;
  }
}
