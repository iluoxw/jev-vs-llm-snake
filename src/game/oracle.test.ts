import { describe, expect, it } from "vitest";
import { PRESETS } from "../llm/prompt.ts";
import { analyze } from "./analysis.ts";
import { createGame } from "./engine.ts";
import { boardKey, namedPreset, oracleMove } from "./oracle.ts";

describe("oracle", () => {
  it("names the three presets", () => {
    expect(namedPreset(PRESETS["求稳"])).toBe("求稳");
    expect(namedPreset(PRESETS["贪吃"])).toBe("贪吃");
    expect(namedPreset("随便")).toBe("自定义");
  });

  it("fingerprints the board before a move", () => {
    const game = createGame({ seed: 1, cols: 8, rows: 8 });
    expect(boardKey(game)).toContain(game.heading);
    expect(boardKey(game)).toContain(`${game.snake[0].r},${game.snake[0].c}`);
  });

  it("avoids a marked dead end when another move exists", () => {
    const facts = analyze(createGame({ seed: 1, cols: 8, rows: 8 }));
    const dir = oracleMove(facts, PRESETS["求稳"]);
    expect(dir).not.toBeNull();
    const picked = facts.find((f) => f.dir === dir);
    const safer = facts.filter((f) => !f.deadEnd);
    if (safer.length > 0) expect(picked?.deadEnd).toBe(false);
  });

  it("greedy oracle prefers the closer food when both are safe", () => {
    const facts = [
      {
        dir: "up" as const,
        turn: "left turn" as const,
        target: { r: 0, c: 1 },
        eats: false,
        foodDistance: 8,
        reachable: 40,
        freeTotal: 60,
        deadEnd: false,
        canReachTail: true,
      },
      {
        dir: "right" as const,
        turn: "straight" as const,
        target: { r: 1, c: 2 },
        eats: false,
        foodDistance: 3,
        reachable: 39,
        freeTotal: 60,
        deadEnd: false,
        canReachTail: true,
      },
    ];
    expect(oracleMove(facts, PRESETS["贪吃"])).toBe("right");
    expect(oracleMove(facts, PRESETS["求稳"])).toBe("up");
  });
});
