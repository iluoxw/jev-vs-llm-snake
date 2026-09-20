import { PRESETS } from "../llm/prompt.ts";
import type { MoveFacts } from "./analysis.ts";
import type { Dir, GameState } from "./engine.ts";

export type PresetName = "求稳" | "贪吃" | "混乱" | "自定义";

export function namedPreset(strategy: string): PresetName {
  for (const [name, text] of Object.entries(PRESETS)) {
    if (strategy === text) return name as PresetName;
  }
  return "自定义";
}

export function boardKey(game: GameState): string {
  const snake = game.snake.map((p) => `${p.r},${p.c}`).join(";");
  const food = game.food ? `${game.food.r},${game.food.c}` : "-";
  return `${game.heading}|${food}|${snake}`;
}

function pool(facts: MoveFacts[]): MoveFacts[] {
  if (facts.length === 0) return [];
  const safe = facts.filter((f) => !f.deadEnd);
  return safe.length > 0 ? safe : facts;
}

function turnRank(f: MoveFacts): number {
  return f.turn === "straight" ? 0 : f.turn === "left turn" ? 1 : 2;
}

function pick(facts: MoveFacts[], cmp: (a: MoveFacts, b: MoveFacts) => number): MoveFacts {
  return facts.slice().sort(cmp)[0];
}

/**
 * Code referee for the written preset. Uses the same facts the models see.
 * Ties break toward more space (求稳), then not eating, then going straight.
 */
export function oracleMove(facts: MoveFacts[], strategy: string): Dir | null {
  const name = namedPreset(strategy);
  const cand = pool(facts);
  if (cand.length === 0) return null;
  if (cand.length === 1) return cand[0].dir;

  if (name === "贪吃") {
    return pick(cand, (a, b) => {
      const da = a.foodDistance ?? 1e9;
      const db = b.foodDistance ?? 1e9;
      if (da !== db) return da - db;
      if (a.reachable !== b.reachable) return b.reachable - a.reachable;
      if (a.eats !== b.eats) return a.eats ? -1 : 1;
      return turnRank(a) - turnRank(b);
    }).dir;
  }

  if (name === "混乱") {
    return pick(cand, (a, b) => {
      const da = a.foodDistance ?? -1;
      const db = b.foodDistance ?? -1;
      if (da !== db) return db - da;
      if (a.reachable !== b.reachable) return b.reachable - a.reachable;
      return turnRank(a) - turnRank(b);
    }).dir;
  }

  return pick(cand, (a, b) => {
    if (a.reachable !== b.reachable) return b.reachable - a.reachable;
    if (a.eats !== b.eats) return a.eats ? 1 : -1;
    return turnRank(a) - turnRank(b);
  }).dir;
}
