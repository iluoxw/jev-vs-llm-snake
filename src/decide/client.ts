import type { GameState } from "../game/engine.ts";
import type { DecidePayload, DecideResult } from "../llm/types.ts";

export type Decide = (game: GameState, strategy: string, signal: AbortSignal) => Promise<DecideResult>;

export function createDecide(path: string): Decide {
  return async (game, strategy, signal) => {
    const payload: DecidePayload = {
      game: {
        cols: game.cols,
        rows: game.rows,
        snake: game.snake,
        heading: game.heading,
        food: game.food,
      },
      strategy,
    };
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error ?? `HTTP ${res.status}`);
    }
    return (await res.json()) as DecideResult;
  };
}

export const decideJev = createDecide("/api/decide/jev");
export const decideLlm = createDecide("/api/decide/llm");
