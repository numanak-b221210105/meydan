// SoundKit: small, dependency-free interface sound engine.
//
// Every sound is synthesized once into an AudioBuffer (physical-style models:
// mallet/marimba partials, Risset bell, modal wood block, Karplus-Strong string,
// filtered noise) and then replayed through one master chain:
//   voice -> pan -> master gain -> soft compressor -> destination
//                \-> reverb send (small room)
// That keeps sounds consistent, cheap to play and identical on every device.
//
// iOS: audio can only start inside a user gesture (touchend / click / keydown),
// and a silent buffer has to be played in that gesture to unlock the context.
// `navigator.audioSession` (Safari 17+) chooses whether the ring/silent switch
// mutes us ("ambient", the default here, mixes with other apps) or not ("playback").

export type Synth = (sr: number) => Float32Array;
export interface PlayOpts { vol?: number; pan?: number; rate?: number; when?: number; send?: number }
export interface KitOptions { storageKey: string; volume?: number; session?: "ambient" | "playback"; reverb?: number }

export class SoundKit {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private verb!: GainNode;
  private buffers = new Map<string, AudioBuffer>();
  private synths = new Map<string, Synth>();
  private last = new Map<string, number>();
  private unlocked = false;
  enabled: boolean;
  onUnlock: (() => void) | null = null;

  constructor(private opts: KitOptions) {
    let v = true;
    try { v = localStorage.getItem(opts.storageKey) !== "0"; } catch { /* private mode */ }
    this.enabled = v;
    const gesture = () => this.unlock();
    // touchend/click/keydown count as user activation on iOS; pointerdown/touchstart do not always.
    for (const ev of ["touchend", "click", "keydown", "pointerup"]) window.addEventListener(ev, gesture, { capture: true, passive: true });
    document.addEventListener("visibilitychange", () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend().catch(() => {});
      else if (this.enabled) void this.ctx.resume().catch(() => {});
    });
  }

  define(name: string, synth: Synth): this { this.synths.set(name, synth); this.buffers.delete(name); return this; }

  setEnabled(v: boolean): void {
    this.enabled = v;
    try { localStorage.setItem(this.opts.storageKey, v ? "1" : "0"); } catch { /* ignore */ }
    if (v) this.unlock();
  }

  setSession(type: "ambient" | "playback"): void {
    this.opts.session = type;
    const s = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (s) try { s.type = type; } catch { /* unsupported */ }
  }

  /** Creates and unlocks the context. Must run inside a user gesture on iOS. */
  unlock(): void {
    if (!this.enabled) return;
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.setSession(this.opts.session ?? "ambient");
      try { this.ctx = new AC({ latencyHint: "interactive" }); } catch { return; }
      this.build();
    }
    const c = this.ctx;
    if (!this.unlocked) {
      // iOS needs a source started inside the gesture.
      const b = c.createBuffer(1, 1, c.sampleRate);
      const s = c.createBufferSource();
      s.buffer = b; s.connect(c.destination); s.start(0);
    }
    if (c.state !== "running") void c.resume().then(() => this.ready()).catch(() => {});
    else this.ready();
  }
  private ready() {
    if (this.unlocked || this.ctx?.state !== "running") return;
    this.unlocked = true;
    this.onUnlock?.();
  }

  private build() {
    const c = this.ctx!;
    this.master = c.createGain();
    this.master.gain.value = this.opts.volume ?? 0.8;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 2.5; comp.attack.value = 0.004; comp.release.value = 0.2;
    this.master.connect(comp).connect(c.destination);
    const conv = c.createConvolver();
    conv.buffer = roomIR(c, 1.4);
    const verbTone = c.createBiquadFilter();
    verbTone.type = "lowpass"; verbTone.frequency.value = 3800;
    this.verb = c.createGain();
    this.verb.gain.value = this.opts.reverb ?? 0.18;
    this.verb.connect(conv).connect(verbTone).connect(comp);
  }

  /** Destination for continuous sources (music). */
  get out(): GainNode | null { return this.ctx ? this.master : null; }
  get send(): GainNode | null { return this.ctx ? this.verb : null; }
  get running(): boolean { return !!this.ctx && this.ctx.state === "running" && this.enabled; }

  buffer(name: string): AudioBuffer | null {
    const c = this.ctx;
    if (!c) return null;
    let b = this.buffers.get(name);
    if (!b) {
      const s = this.synths.get(name);
      if (!s) return null;
      const data = s(c.sampleRate);
      b = c.createBuffer(1, data.length, c.sampleRate);
      b.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
      this.buffers.set(name, b);
    }
    return b;
  }

  /** Plays a defined sound. `gapMs` stops rapid repeats from turning into a buzz. */
  play(name: string, o: PlayOpts = {}, gapMs = 35): void {
    if (!this.enabled) return;
    if (!this.ctx) this.unlock();
    const c = this.ctx;
    if (!c || c.state !== "running") return;
    const now = performance.now();
    if (now - (this.last.get(name) ?? -1e9) < gapMs) return;
    this.last.set(name, now);
    const b = this.buffer(name);
    if (!b) return;
    const src = c.createBufferSource();
    src.buffer = b;
    src.playbackRate.value = o.rate ?? 1;
    const g = c.createGain();
    g.gain.value = o.vol ?? 1;
    let node: AudioNode = src.connect(g);
    if (o.pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = o.pan; node = node.connect(p); }
    node.connect(this.master);
    if ((o.send ?? 1) > 0) { const sg = c.createGain(); sg.gain.value = o.send ?? 1; node.connect(sg).connect(this.verb); }
    src.start(c.currentTime + (o.when ?? 0));
  }

  /** Like play(), but first waits for the context to be running (first tap on iOS). */
  async playSoon(name: string, o: PlayOpts = {}): Promise<void> {
    if (!this.enabled) return;
    this.unlock();
    const c = this.ctx;
    if (!c) return;
    if (c.state !== "running") await Promise.race([c.resume(), new Promise((r) => setTimeout(r, 300))]).catch(() => {});
    this.play(name, o, 0);
  }

  /** Pre-renders sounds so the first play has no delay. */
  warm(names: string[]): void { for (const n of names) this.buffer(n); }
}

// ---------------------------------------------------------------------------
// Synthesis helpers (all mono, return Float32Array at the context sample rate)

function roomIR(c: BaseAudioContext, sec: number): AudioBuffer {
  const len = Math.floor(c.sampleRate * sec);
  const b = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      lp += 0.35 * ((Math.random() * 2 - 1) - lp); // darker tail
      d[i] = lp * Math.pow(1 - t, 2.6) * (i < c.sampleRate * 0.008 ? i / (c.sampleRate * 0.008) : 1);
    }
  }
  return b;
}

let seed = 12345;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;

/** Sum of exponentially decaying sine partials: [freqRatio, amp, decaySeconds]. */
export function modal(f: number, partials: [number, number, number][], dur: number, attack = 0.002): Synth {
  return (sr) => {
    const n = Math.floor(dur * sr), out = new Float32Array(n);
    for (const [r, a, d] of partials) {
      const w = (2 * Math.PI * f * r) / sr;
      if (f * r > sr / 2.2) continue;
      const k = Math.exp(-1 / (d * sr));
      let env = a;
      for (let i = 0; i < n; i++) { out[i] += env * Math.sin(w * i); env *= k; }
    }
    const att = Math.max(1, Math.floor(attack * sr));
    for (let i = 0; i < att && i < n; i++) out[i] *= i / att;
    return normalize(out, 0.9);
  };
}

/** Mallet (marimba-like): fundamental + the bar's 4th and 10th harmonic modes. */
export const mallet = (f: number, len = 0.6) => modal(f, [[1, 1, len * 0.45], [3.93, 0.32, len * 0.09], [9.9, 0.1, len * 0.03], [2, 0.08, len * 0.2]], len, 0.0015);

/** Risset-style bell (inharmonic partials). */
export const bell = (f: number, len = 1.4) => modal(f, [
  [0.56, 0.55, len * 0.55], [0.92, 0.35, len * 0.4], [1, 0.6, len * 0.35], [1.19, 0.4, len * 0.25],
  [1.71, 0.3, len * 0.2], [2, 0.25, len * 0.15], [2.74, 0.2, len * 0.12], [3, 0.15, len * 0.1], [3.76, 0.1, len * 0.08],
], len, 0.001);

/** Wooden knock: short inharmonic modes plus a filtered noise click. */
export function wood(f: number, len = 0.12, click = 0.5): Synth {
  const body = modal(f, [[1, 1, len * 0.45], [2.57, 0.45, len * 0.22], [4.21, 0.22, len * 0.12], [6.3, 0.08, len * 0.06]], len, 0.0005);
  return (sr) => mix(body(sr), noiseBurst(0.012, f * 3.2, 2.5)(sr), click);
}

/** Band-passed noise burst with exponential decay (clicks, rattles, air). */
export function noiseBurst(dur: number, freq: number, q = 1, sweepTo?: number, type: "bp" | "lp" | "hp" = "bp"): Synth {
  return (sr) => {
    const n = Math.floor(dur * sr), out = new Float32Array(n);
    const f = new Biquad();
    for (let i = 0; i < n; i++) {
      const t = i / n;
      if (i % 32 === 0) f.set(type, sweepTo ? freq * Math.pow(sweepTo / freq, t) : freq, q, sr);
      out[i] = f.run(rnd()) * Math.pow(1 - t, 2.2) * Math.min(1, i / (sr * 0.0008));
    }
    return normalize(out, 0.9);
  };
}

/** Karplus-Strong plucked string. `bright` 0..1 */
export function pluck(f: number, len = 1.2, bright = 0.5, decay = 0.996): Synth {
  return (sr) => {
    const n = Math.floor(len * sr), out = new Float32Array(n);
    const p = Math.max(2, Math.round(sr / f));
    const buf = new Float32Array(p);
    let lp = 0;
    for (let i = 0; i < p; i++) { lp += (1 - bright * 0.8) * (rnd() - lp); buf[i] = lp; }
    let idx = 0;
    for (let i = 0; i < n; i++) {
      const a = buf[idx], b = buf[(idx + 1) % p];
      const v = decay * 0.5 * (a + b);
      buf[idx] = v;
      out[i] = a;
      idx = (idx + 1) % p;
    }
    // remove DC and fade the tail
    let m = 0;
    for (let i = 0; i < n; i++) m += out[i];
    m /= n;
    for (let i = 0; i < n; i++) out[i] = (out[i] - m) * (i > n - 2000 ? (n - i) / 2000 : 1);
    return normalize(out, 0.8);
  };
}

/** Sine with a pitch glide (bubbles, drops, thumps). */
export function glide(f0: number, f1: number, dur: number, decay = dur / 3, harm = 0): Synth {
  return (sr) => {
    const n = Math.floor(dur * sr), out = new Float32Array(n);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const f = f0 * Math.pow(f1 / f0, i / n);
      ph += (2 * Math.PI * f) / sr;
      const env = Math.exp(-t / decay) * Math.min(1, i / (sr * 0.002));
      out[i] = env * (Math.sin(ph) + harm * Math.sin(2 * ph));
    }
    return normalize(out, 0.9);
  };
}

/** Plays several synths in sequence/overlap: [synth, startSeconds, gain]. */
export function seq(parts: [Synth, number, number][]): Synth {
  return (sr) => {
    const rendered = parts.map(([s, at, g]) => [s(sr), Math.floor(at * sr), g] as const);
    const n = Math.max(...rendered.map(([d, at]) => at + d.length));
    const out = new Float32Array(n);
    for (const [d, at, g] of rendered) for (let i = 0; i < d.length; i++) out[at + i] += d[i] * g;
    return normalize(out, 0.9);
  };
}

export function mix(a: Float32Array, b: Float32Array, gb = 1): Float32Array {
  const out = new Float32Array(Math.max(a.length, b.length));
  for (let i = 0; i < a.length; i++) out[i] += a[i];
  for (let i = 0; i < b.length; i++) out[i] += b[i] * gb;
  return normalize(out, 0.9);
}

/** Gentle low-pass on a rendered sound (removes harshness). */
export function soften(s: Synth, cutoff: number): Synth {
  return (sr) => {
    const d = s(sr), f = new Biquad();
    f.set("lp", cutoff, 0.7, sr);
    for (let i = 0; i < d.length; i++) d[i] = f.run(d[i]);
    return normalize(d, 0.9);
  };
}

function normalize(d: Float32Array, peak: number): Float32Array {
  // Short fade at the end so a cut-off tail never clicks.
  const fade = Math.min(d.length >> 2, 900);
  for (let i = 0; i < fade; i++) d[d.length - 1 - i] *= i / fade;
  let m = 0;
  for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i]));
  if (m > 0) for (let i = 0; i < d.length; i++) d[i] *= peak / m;
  return d;
}

class Biquad {
  private b0 = 1; private b1 = 0; private b2 = 0; private a1 = 0; private a2 = 0;
  private x1 = 0; private x2 = 0; private y1 = 0; private y2 = 0;
  set(type: "bp" | "lp" | "hp", f: number, q: number, sr: number) {
    const w = (2 * Math.PI * Math.min(f, sr * 0.45)) / sr, cs = Math.cos(w), al = Math.sin(w) / (2 * q);
    let b0, b1, b2;
    if (type === "lp") { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = (1 - cs) / 2; }
    else if (type === "hp") { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = (1 + cs) / 2; }
    else { b0 = al; b1 = 0; b2 = -al; }
    const a0 = 1 + al;
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = (-2 * cs) / a0; this.a2 = (1 - al) / a0;
  }
  run(x: number) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

export const note = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

/** The shared interface palette used by the tool apps. */
export function uiSounds(kit: SoundKit): SoundKit {
  return kit
    .define("tap", (sr) => mix(noiseBurst(0.006, 3200, 1.2)(sr), glide(2400, 2100, 0.03, 0.008)(sr), 0.45))
    .define("select", mallet(note(88), 0.25))
    .define("success", seq([[mallet(note(84), 0.7), 0, 0.9], [mallet(note(91), 0.9), 0.085, 0.8], [bell(note(103), 0.9), 0.085, 0.12]]))
    .define("error", soften(seq([[mallet(note(64), 0.5), 0, 1], [mallet(note(60), 0.6), 0.11, 0.9]]), 1800))
    .define("notify", seq([[bell(note(96), 1.2), 0, 0.7], [mallet(note(84), 0.6), 0, 0.5]]))
    .define("start", seq([[mallet(note(79), 0.4), 0, 0.9], [mallet(note(86), 0.5), 0.07, 0.9]]))
    .define("stop", seq([[mallet(note(86), 0.4), 0, 0.9], [mallet(note(79), 0.6), 0.07, 0.9]]))
    .define("upload", (sr) => mix(noiseBurst(0.18, 600, 0.9, 4200)(sr), mallet(note(91), 0.3)(sr), 0.4));
}
