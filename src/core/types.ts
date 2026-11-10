import type { Host } from "./shell";

export interface GameDef {
  id: string;
  kind: "board" | "arcade";
  /** Neon accent colour of the cabinet. */
  accent: string;
  /** Inline SVG artwork for the cabinet screen. */
  art: string;
  name: () => string;
  blurb: () => string;
  /** The AI technique, e.g. "Alpha-beta minimax". */
  tech: () => string;
  /** One paragraph explaining how the AI works. */
  how: () => string;
  load: () => Promise<{ mount: (host: Host) => void }>;
}
