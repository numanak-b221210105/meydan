// Sound for Meydan: soft synthesized effects and a calm generative soundtrack.
// Everything is made with the Web Audio API at runtime, so there are no audio files.
import { load, save } from "./store";

// ---------- settings ----------
let fxOn = load("sound", true);
let musicOn = load("music", true);
export const soundOn = (): boolean => fxOn;
export const musicEnabled = (): boolean => musicOn;
export function toggleSound(): boolean {
  fxOn = !fxOn;
  save("sound", fxOn);
  return fxOn;
}
export function toggleMusic(): boolean {
  musicOn = !musicOn;
  save("music", musicOn);
  if (musicOn) startMusic(); else stopMusic();
  return musicOn;
}

// ---------- audio graph ----------
//  effects ─► fxBus ─┐
//  music ──► musicBus ─► (dry + reverb) ─► compressor ─► out
let ctx: AudioContext | null = null;
let fxBus: GainNode, musicBus: GainNode, reverb: ConvolverNode, verbSend: GainNode, master: GainNode;
let noiseBuf: AudioBuffer;

function graph(): AudioContext | null {
  if (ctx) return ctx;
  try {
    ctx = new AudioContext();
  } catch {
    return null;
  }
  const c = ctx;
  master = c.createGain();
  master.gain.value = 0.9;
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 3;
  master.connect(comp).connect(c.destination);

  // A small, dark room made from decaying noise.
  reverb = c.createConvolver();
  const len = c.sampleRate * 2.2;
  const ir = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  }
  reverb.buffer = ir;
  const verbTone = c.createBiquadFilter();
  verbTone.type = "lowpass";
  verbTone.frequency.value = 2400;
  verbSend = c.createGain();
  verbSend.gain.value = 0.35;
  verbSend.connect(reverb).connect(verbTone).connect(master);

  const soft = c.createBiquadFilter(); // takes the edge off every effect
  soft.type = "lowpass";
  soft.frequency.value = 6000;
  fxBus = c.createGain();
  fxBus.gain.value = 0.55;
  fxBus.connect(soft).connect(master);
  const fxVerb = c.createGain();
  fxVerb.gain.value = 0.18;
  fxBus.connect(fxVerb).connect(verbSend);

  musicBus = c.createGain();
  musicBus.gain.value = 0;
  musicBus.connect(master);
  const musicVerb = c.createGain();
  musicVerb.gain.value = 0.9;
  musicBus.connect(musicVerb).connect(verbSend);

  noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  return c;
}

/** Browsers only allow audio after a user gesture; the first click or key unlocks it. */
function unlock() {
  const c = graph();
  if (!c) return;
  c.resume().then(() => { if (musicOn) startMusic(); }).catch(() => {});
}
for (const ev of ["pointerdown", "keydown", "touchstart"] as const) window.addEventListener(ev, unlock, { capture: true, passive: true });
document.addEventListener("visibilitychange", () => {
  if (!ctx) return;
  if (document.hidden) ctx.suspend().catch(() => {});
  else ctx.resume().catch(() => {});
});

// ---------- effect building blocks ----------
interface ToneOpts { type?: OscillatorType; vol?: number; attack?: number; to?: number; delay?: number; dest?: AudioNode; detune?: number }
function tone(freq: number, dur: number, o: ToneOpts = {}): void {
  const c = ctx;
  if (!c) return;
  const t = c.currentTime + (o.delay ?? 0);
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = o.type ?? "sine";
  osc.frequency.setValueAtTime(freq, t);
  if (o.detune) osc.detune.value = o.detune;
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur);
  const a = o.attack ?? 0.005;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(o.vol ?? 0.2, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(o.dest ?? fxBus);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}
function noise(dur: number, freq: number, o: { q?: number; vol?: number; type?: BiquadFilterType; delay?: number; to?: number; dest?: AudioNode } = {}): void {
  const c = ctx;
  if (!c) return;
  const t = c.currentTime + (o.delay ?? 0);
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = c.createBiquadFilter();
  f.type = o.type ?? "bandpass";
  f.frequency.setValueAtTime(freq, t);
  if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + dur);
  f.Q.value = o.q ?? 1;
  const g = c.createGain();
  g.gain.setValueAtTime(o.vol ?? 0.2, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(o.dest ?? fxBus);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.02);
}

// Each effect is rate-limited so fast AI-vs-AI play never turns into a buzz.
const lastPlayed = new Map<string, number>();
function play(name: string, minGapMs: number, fn: () => void): void {
  if (!fxOn || !graph() || ctx!.state !== "running") return;
  const now = performance.now();
  if (now - (lastPlayed.get(name) ?? 0) < minGapMs) return;
  lastPlayed.set(name, now);
  try { fn(); } catch { /* audio not available */ }
}
const vary = (f: number, cents = 30) => f * Math.pow(2, ((Math.random() * 2 - 1) * cents) / 1200);

export const sfx = {
  /** A soft UI tap. */
  click: () => play("click", 40, () => tone(vary(880, 20), 0.05, { vol: 0.07 })),
  /** A piece set down on a board: a short wooden knock. */
  move: () => play("move", 45, () => {
    noise(0.05, vary(1700, 80), { q: 4, vol: 0.32 });
    tone(vary(240, 40), 0.09, { vol: 0.16, to: 180 });
  }),
  /** Taking a piece: two knocks, the second deeper. */
  capture: () => play("capture", 60, () => {
    noise(0.05, vary(1500), { q: 4, vol: 0.3 });
    tone(vary(220), 0.08, { vol: 0.14, to: 170 });
    noise(0.07, vary(900), { q: 3, vol: 0.28, delay: 0.07 });
    tone(vary(150), 0.14, { vol: 0.18, to: 100, delay: 0.07 });
  }),
  /** Discs turning over (reversi). */
  flip: () => play("flip", 50, () => tone(vary(520), 0.07, { type: "triangle", vol: 0.1, to: 760 })),
  /** Dice rattling in the cup. */
  dice: () => play("dice", 55, () => {
    noise(0.03, vary(3000, 200), { q: 6, vol: 0.22 });
    noise(0.03, vary(2400, 200), { q: 6, vol: 0.16, delay: 0.025 });
  }),
  /** Snake eats; Flappy passes a pipe. */
  eat: () => play("eat", 40, () => tone(vary(620, 10), 0.11, { type: "triangle", vol: 0.12, to: 940 })),
  point: () => play("point", 60, () => { tone(1046, 0.18, { vol: 0.07 }); tone(1568, 0.25, { vol: 0.04, delay: 0.04 }); }),
  /** A wing beat: a puff of air. */
  flap: () => play("flap", 40, () => {
    noise(0.09, 900, { type: "bandpass", q: 0.8, vol: 0.16, to: 2200 });
    tone(330, 0.07, { vol: 0.05, to: 420 });
  }),
  /** Tetris: piece shifted / rotated / locked / lines cleared. */
  shift: () => play("shift", 30, () => tone(vary(1200, 10), 0.025, { vol: 0.03 })),
  rotate: () => play("rotate", 35, () => tone(vary(700, 10), 0.05, { type: "triangle", vol: 0.06, to: 900 })),
  lock: () => play("lock", 50, () => { tone(150, 0.1, { vol: 0.16, to: 110 }); noise(0.04, 800, { q: 2, vol: 0.12 }); }),
  clear: (n = 1) => play("clear", 120, () => {
    const notes = [523, 659, 784, 1046].slice(0, Math.max(2, Math.min(4, n + 1)));
    notes.forEach((f, i) => tone(f, 0.35, { type: "triangle", vol: 0.08, delay: i * 0.06 }));
  }),
  /** Minesweeper. */
  reveal: () => play("reveal", 35, () => tone(vary(1400, 40), 0.03, { vol: 0.05 })),
  flag: () => play("flag", 50, () => { tone(660, 0.06, { type: "triangle", vol: 0.08 }); tone(990, 0.08, { type: "triangle", vol: 0.06, delay: 0.05 }); }),
  /** Bomberman. */
  drop: () => play("drop", 60, () => tone(200, 0.12, { vol: 0.15, to: 120 })),
  pickup: () => play("pickup", 60, () => [784, 1046, 1318].forEach((f, i) => tone(f, 0.12, { type: "triangle", vol: 0.06, delay: i * 0.045 }))),
  boom: () => play("boom", 90, () => {
    noise(0.55, 900, { type: "lowpass", q: 0.7, vol: 0.5, to: 120 });
    tone(90, 0.4, { vol: 0.3, to: 40 });
  }),
  /** Generic soft tick (kept for older call sites). */
  tick: () => play("tick", 40, () => tone(vary(1100, 20), 0.04, { vol: 0.05 })),
  /** Endings: gentle, never fanfare-loud. */
  win: () => play("win", 800, () => {
    [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.6, { type: "triangle", vol: 0.09, delay: i * 0.11 }));
    tone(1568, 0.9, { vol: 0.04, delay: 0.44 });
  }),
  lose: () => play("lose", 800, () => [440, 370, 294].forEach((f, i) => tone(f, 0.45, { type: "triangle", vol: 0.08, delay: i * 0.16 }))),
  draw: () => play("draw", 800, () => [523, 523].forEach((f, i) => tone(f, 0.35, { type: "triangle", vol: 0.07, delay: i * 0.18 }))),
};

// ---------- music ----------
// A slow, generative piece in A minor: a soft pad, a sine bass and a sparse
// pentatonic melody chosen at random each bar, so it never loops exactly.
// "calm" for the lobby and board games, "drive" for the arcade games.
export type Mood = "calm" | "drive";
let mood: Mood = "calm";
export function setMood(m: Mood): void { mood = m; }

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
// Am9 · Fmaj7 · Cmaj7 · G6 (MIDI notes)
const CHORDS = [
  { bass: 45, pad: [57, 60, 64, 71] },
  { bass: 41, pad: [57, 60, 64, 65] },
  { bass: 48, pad: [55, 59, 60, 64] },
  { bass: 43, pad: [55, 59, 62, 64] },
];
const SCALE = [69, 72, 74, 76, 79, 81, 84]; // A minor pentatonic, upper register

let timer = 0;
let nextTime = 0;
let step = 0;
let musicGain: GainNode | null = null;

function startMusic(): void {
  const c = graph();
  if (!c || timer || c.state !== "running") return;
  musicGain = c.createGain();
  musicGain.gain.value = 1;
  musicGain.connect(musicBus);
  musicBus.gain.cancelScheduledValues(c.currentTime);
  musicBus.gain.setTargetAtTime(0.16, c.currentTime, 1.2);
  nextTime = c.currentTime + 0.1;
  step = 0;
  timer = window.setInterval(schedule, 60);
}
function stopMusic(): void {
  if (!ctx || !timer) return;
  clearInterval(timer);
  timer = 0;
  musicBus.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
  const g = musicGain;
  setTimeout(() => g?.disconnect(), 2500);
  musicGain = null;
}

function schedule(): void {
  const c = ctx;
  if (!c || !musicGain) return;
  const bpm = mood === "drive" ? 92 : 68;
  const eighth = 60 / bpm / 2;
  while (nextTime < c.currentTime + 0.3) {
    const bar = Math.floor(step / 8) % CHORDS.length;
    const pos = step % 8;
    const ch = CHORDS[bar];
    const barLen = eighth * 8;
    if (pos === 0) {
      ch.pad.forEach((n, i) => pad(midi(n), nextTime, barLen * 1.05, i));
      bass(midi(ch.bass - 12), nextTime, barLen * 0.9);
    }
    if (mood === "drive" && pos === 4) bass(midi(ch.bass - 12), nextTime, barLen * 0.4);
    if (mood === "drive" && pos % 2 === 1) hat(nextTime);
    const chance = mood === "drive" ? 0.42 : 0.24;
    if (pos !== 0 && Math.random() < chance) {
      const pool = SCALE.filter((n) => ch.pad.some((p) => (n - p) % 12 === 0) || Math.random() < 0.35);
      pluck(midi(pool[Math.floor(Math.random() * pool.length)]), nextTime);
    }
    nextTime += eighth;
    step++;
  }
}
function pad(f: number, t: number, dur: number, voice: number): void {
  const c = ctx!;
  const g = c.createGain();
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 900;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.045, t + dur * 0.35);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  for (const det of [-7, 7]) {
    const o = c.createOscillator();
    o.type = "triangle";
    o.frequency.value = f;
    o.detune.value = det + voice * 2;
    o.connect(lp);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  lp.connect(g).connect(musicGain!);
}
function bass(f: number, t: number, dur: number): void {
  const c = ctx!;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "sine";
  o.frequency.value = f;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.11, t + 0.04);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(musicGain!);
  o.start(t);
  o.stop(t + dur + 0.05);
}
function pluck(f: number, t: number): void {
  const c = ctx!;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "sine";
  o.frequency.value = f;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.05, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
  o.connect(g).connect(musicGain!);
  o.start(t);
  o.stop(t + 1.2);
}
function hat(t: number): void {
  const c = ctx!;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = "highpass";
  f.frequency.value = 7000;
  const g = c.createGain();
  g.gain.setValueAtTime(0.012, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  src.connect(f).connect(g).connect(musicGain!);
  src.start(t, Math.random() * 0.5);
  src.stop(t + 0.06);
}
