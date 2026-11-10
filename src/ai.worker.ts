/// <reference lib="webworker" />
import { handlers } from "./games/handlers";

self.onmessage = async (e: MessageEvent<{ id: number; task: string; data: unknown }>) => {
  const { id, task, data } = e.data;
  try {
    const fn = handlers[task];
    if (!fn) throw new Error("unknown task " + task);
    const result = await fn(data, (d: unknown) => self.postMessage({ id, type: "progress", data: d }));
    self.postMessage({ id, type: "done", data: result });
  } catch (err) {
    self.postMessage({ id, type: "error", data: String(err) });
  }
};
