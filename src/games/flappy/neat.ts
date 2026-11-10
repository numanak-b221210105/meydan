// A tiny neural network and a genetic algorithm (neuroevolution).
// No gradients: networks that fly further get to have children.

export const IN = 5, HID = 6;
export interface Net { w1: Float32Array; b1: Float32Array; w2: Float32Array; b2: number }

const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
export function randomNet(): Net {
  return { w1: Float32Array.from({ length: IN * HID }, gauss), b1: Float32Array.from({ length: HID }, () => gauss() * 0.5), w2: Float32Array.from({ length: HID }, gauss), b2: gauss() * 0.5 };
}
export function forward(n: Net, x: number[]): { out: number; hidden: number[] } {
  const hidden: number[] = [];
  for (let j = 0; j < HID; j++) {
    let s = n.b1[j];
    for (let i = 0; i < IN; i++) s += n.w1[j * IN + i] * x[i];
    hidden.push(Math.tanh(s));
  }
  let o = n.b2;
  for (let j = 0; j < HID; j++) o += n.w2[j] * hidden[j];
  return { out: 1 / (1 + Math.exp(-o)), hidden };
}
export const cloneNet = (n: Net): Net => ({ w1: n.w1.slice(), b1: n.b1.slice(), w2: n.w2.slice(), b2: n.b2 });

function crossover(a: Net, b: Net): Net {
  const pick = (x: Float32Array, y: Float32Array) => x.map((v, i) => (Math.random() < 0.5 ? v : y[i]));
  return { w1: pick(a.w1, b.w1), b1: pick(a.b1, b.b1), w2: pick(a.w2, b.w2), b2: Math.random() < 0.5 ? a.b2 : b.b2 };
}
function mutate(n: Net, rate: number, power: number): Net {
  const m = (x: Float32Array) => x.map((v) => (Math.random() < rate ? v + gauss() * power : v));
  return { w1: m(n.w1), b1: m(n.b1), w2: m(n.w2), b2: Math.random() < rate ? n.b2 + gauss() * power : n.b2 };
}

/** Builds the next generation from networks and their fitness. */
export function nextGeneration(pop: { net: Net; fitness: number }[], size: number): Net[] {
  const sorted = [...pop].sort((a, b) => b.fitness - a.fitness);
  const elite = sorted.slice(0, 4).map((x) => cloneNet(x.net));
  const pool = sorted.slice(0, Math.max(6, Math.floor(size * 0.25)));
  const pickParent = () => { const a = pool[Math.floor(Math.random() * pool.length)], b = pool[Math.floor(Math.random() * pool.length)]; return a.fitness > b.fitness ? a.net : b.net; };
  const out = [...elite];
  while (out.length < size) out.push(mutate(crossover(pickParent(), pickParent()), 0.15, 0.5));
  return out;
}
