import type { Dir, Point } from "../game/engine.ts";

/** Body of POST /api/decide. The server rebuilds legal moves and facts itself. */
export interface DecidePayload {
  game: {
    cols: number;
    rows: number;
    snake: Point[];
    heading: Dir;
    food: Point | null;
  };
  strategy: string;
}

export interface DecideResult {
  choice: Dir;
  probabilities: Partial<Record<Dir, number>>;
  confidence: number | null;
  model: string;
  /** Round trip to the LLM API as measured on the server. */
  upstreamMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  /** Server-side estimate from configured per-million-token prices. */
  estimatedUsd: number | null;
}

export interface DecideError {
  error: string;
}
