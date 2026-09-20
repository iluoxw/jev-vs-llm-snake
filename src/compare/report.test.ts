import { describe, expect, it } from "vitest";
import type { HistoryEntry, Snapshot } from "../game/controller.ts";
import { PRESETS } from "../llm/prompt.ts";
import { createGame, type Dir } from "../game/engine.ts";
import { buildReport } from "./report.ts";

const entry = (partial: Partial<HistoryEntry> & Pick<HistoryEntry, "step" | "dir" | "source" | "boardKey" | "judged">): HistoryEntry => ({
  confidence: null,
  latencyMs: partial.judged ? 100 : null,
  length: 3,
  at: 1,
  options: ["up", "right"],
  probabilities: {},
  model: partial.judged ? "x" : null,
  inputTokens: null,
  outputTokens: null,
  estimatedUsd: 0,
  error: null,
  facts: [],
  oracle: "up",
  oracleMatch: partial.judged ? partial.dir === "up" : null,
  ...partial,
});

function snap(player: Snapshot["player"], history: HistoryEntry[], extra: Partial<Snapshot> = {}): Snapshot {
  const game = createGame({ seed: 1 });
  return {
    game,
    status: "paused",
    tickMs: 1200,
    tickStartedAt: 0,
    strategy: PRESETS["求稳"],
    seed: 1,
    decision: null,
    history,
    stats: {
      calls: history.length,
      answered: history.filter((e) => e.judged).length,
      late: history.filter((e) => e.source === "late").length,
      errors: 0,
      forced: 0,
      totalLatencyMs: history.filter((e) => e.judged).length * 100,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalUsd: 0,
    },
    best: 0,
    lastModel: null,
    lastError: null,
    player,
    ...extra,
  };
}

describe("buildReport", () => {
  it("treats same-board disagreement as the first fork", () => {
    const a: Dir = "up";
    const b: Dir = "right";
    const jev = snap("jev", [
      entry({ step: 1, dir: a, source: "jev", boardKey: "k1", judged: true, oracleMatch: true }),
      entry({ step: 2, dir: a, source: "jev", boardKey: "k2", judged: true }),
    ]);
    const laya = snap("laya", [
      entry({ step: 1, dir: a, source: "laya", boardKey: "k1", judged: true, oracleMatch: true }),
      entry({ step: 2, dir: b, source: "laya", boardKey: "k2", judged: true, oracleMatch: false }),
    ]);
    const llm = snap("llm", [
      entry({ step: 1, dir: a, source: "late", boardKey: "k1", judged: false }),
      entry({ step: 2, dir: a, source: "late", boardKey: "k2", judged: false }),
    ]);
    const report = buildReport(jev, laya, llm);
    expect(report.fork).toMatchObject({ step: 2, reason: "同局面选向不同" });
    expect(report.pairs[0]).toMatchObject({ a: "jev", b: "laya", sameBoard: 2, sameDir: 1 });
    expect(report.verdict).toContain("尽快吃到食物");
  });

  it("ranks the eater and marks a long zero-score run as failing", () => {
    const eaten = Array.from({ length: 8 }, (_, i) =>
      entry({
        step: i + 1,
        dir: "right",
        source: "jev",
        boardKey: `j${i}`,
        judged: true,
        length: i === 3 ? 4 : i > 3 ? 4 : 3,
      }),
    );
    const idle = Array.from({ length: 8 }, (_, i) =>
      entry({
        step: i + 1,
        dir: "right",
        source: "laya",
        boardKey: `l${i}`,
        judged: true,
        length: 3,
      }),
    );
    const jev = snap("jev", eaten, { game: { ...createGame({ seed: 1 }), score: 1, snake: [{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 0, c: 2 }, { r: 0, c: 3 }] } });
    const laya = snap("laya", idle);
    const llm = snap(
      "llm",
      idle.map((e) => ({ ...e, source: "late" as const, judged: false })),
    );
    const report = buildReport(jev, laya, llm);
    expect(report.scores.jev.firstEat).toBe(4);
    expect(report.scores.laya.firstEat).toBeNull();
    expect(report.verdict).toContain("Jev");
    expect(report.verdict).toContain("不达标");
  });
});
