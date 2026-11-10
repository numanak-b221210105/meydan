// Runs heavy AI searches in a Web Worker so the page never freezes.
// A search can stream progress (depth reached, visit counts...) before it finishes.
type Pending = { resolve: (v: unknown) => void; reject: (e: unknown) => void; progress?: (d: unknown) => void };

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, Pending>();

function spawn(): Worker {
  const w = new Worker(new URL("../ai.worker.ts", import.meta.url), { type: "module" });
  w.onmessage = (e: MessageEvent<{ id: number; type: "progress" | "done" | "error"; data: unknown }>) => {
    const p = pending.get(e.data.id);
    if (!p) return;
    if (e.data.type === "progress") p.progress?.(e.data.data);
    else {
      pending.delete(e.data.id);
      if (e.data.type === "done") p.resolve(e.data.data);
      else p.reject(e.data.data);
    }
  };
  return w;
}

export interface Job<T> { promise: Promise<T>; cancel: () => void }

export function think<T>(task: string, data: unknown, progress?: (d: any) => void): Job<T> {
  worker ??= spawn();
  const id = ++seq;
  const promise = new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject, progress });
    worker!.postMessage({ id, task, data });
  });
  return {
    promise,
    cancel: () => {
      if (!pending.has(id)) return;
      pending.get(id)!.reject(new Error("cancelled"));
      pending.delete(id);
      // Stop a long search immediately by restarting the worker.
      worker?.terminate();
      worker = null;
      for (const [k, p] of pending) { p.reject(new Error("cancelled")); pending.delete(k); }
    },
  };
}
