import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Decide } from "../llm/client.ts";
import type { DecideResult } from "../llm/types.ts";
import { GameController } from "./controller.ts";
import type { Dir } from "./engine.ts";

const answer = (choice: Dir, extra: Partial<DecideResult> = {}): DecideResult => ({
  choice,
  probabilities: { [choice]: 1 },
  confidence: null,
  model: "llm-test",
  upstreamMs: 1,
  inputTokens: 1,
  outputTokens: 1,
  estimatedUsd: 0.001,
  ...extra,
});

/** Resolves with `choice` after `delayMs`, rejects if aborted first. */
const delayed =
  (choice: Dir, delayMs: number, extra: Partial<DecideResult> = {}): Decide =>
  (_game, _strategy, signal) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve(answer(choice, extra)), delayMs);
      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(new DOMException("aborted", "AbortError"));
      });
    });

describe("GameController", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("plays the LLM's answer when it beats the deadline", async () => {
    const c = new GameController({ decide: delayed("up", 300), tickMs: 1000, seed: 1, now: Date.now });
    c.start();
    await vi.advanceTimersByTimeAsync(400);
    expect(c.getSnapshot().decision?.phase).toBe("selected");
    expect(c.getSnapshot().game.steps).toBe(0);
    await vi.advanceTimersByTimeAsync(600);
    const s = c.getSnapshot();
    expect(s.game.steps).toBe(1);
    expect(s.game.heading).toBe("up");
    expect(s.history[0]).toMatchObject({
      dir: "up",
      source: "llm",
      confidence: null,
      probabilities: { up: 1 },
      model: "llm-test",
      inputTokens: 1,
      outputTokens: 1,
      estimatedUsd: 0.001,
      error: null,
    });
    expect(s.history[0].options).toContain("up");
    expect(s.history[0].at).toBeGreaterThan(0);
    expect(s.lastModel).toBe("llm-test");
    expect(s.stats).toMatchObject({
      calls: 2,
      answered: 1,
      late: 0,
      totalInputTokens: 1,
      totalOutputTokens: 1,
      totalUsd: 0.001,
    });
    expect(s.seed).toBe(1);
    c.dispose();
  });

  it("keeps going straight and counts a miss when the LLM is late", async () => {
    const c = new GameController({ decide: delayed("up", 5000), tickMs: 1000, seed: 1, now: Date.now });
    c.start();
    await vi.advanceTimersByTimeAsync(1000);
    const s = c.getSnapshot();
    expect(s.game.heading).toBe("right");
    expect(s.history[0]).toMatchObject({ dir: "right", source: "late", probabilities: {}, model: null });
    expect(s.stats.late).toBe(1);
    expect(s.stats.totalUsd).toBe(0);
    c.dispose();
  });

  it("falls back on API errors and ignores answers after pause", async () => {
    const failing: Decide = () => Promise.reject(new Error("boom"));
    const c = new GameController({ decide: failing, tickMs: 1000, seed: 1, now: Date.now });
    c.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(c.getSnapshot().history[0]).toMatchObject({ source: "error", error: "boom" });
    expect(c.getSnapshot().lastError).toBe("boom");
    expect(c.getSnapshot().stats.errors).toBe(1);
    c.pause();
    const steps = c.getSnapshot().game.steps;
    await vi.advanceTimersByTimeAsync(3000);
    expect(c.getSnapshot().game.steps).toBe(steps);
    expect(c.getSnapshot().status).toBe("paused");
    c.dispose();
  });

  it("turns away from walls on its own when the LLM never answers", async () => {
    const c = new GameController({
      decide: delayed("right", 5000),
      tickMs: 100,
      cols: 6,
      rows: 6,
      seed: 1,
      now: Date.now,
    });
    c.start();
    await vi.advanceTimersByTimeAsync(800);
    const s = c.getSnapshot();
    expect(s.game.steps).toBe(8);
    expect(s.game.alive).toBe(true);
    // Corners leave a single legal move, which is played without asking the LLM.
    expect(s.stats.late + s.stats.forced).toBe(8);
    expect(s.stats.forced).toBeGreaterThan(0);
    c.dispose();
  });

  it("tags applied moves with the player name", async () => {
    const c = new GameController({
      decide: delayed("up", 300),
      player: "jev",
      tickMs: 1000,
      seed: 1,
      now: Date.now,
    });
    c.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(c.getSnapshot().player).toBe("jev");
    expect(c.getSnapshot().history[0].source).toBe("jev");
    c.dispose();
  });

  it("restarts from a chosen seed", () => {
    const c = new GameController({ decide: delayed("up", 10), tickMs: 1000, seed: 7, now: Date.now });
    const first = c.getSnapshot().game.food;
    c.setSeed(7);
    expect(c.getSnapshot().game.food).toEqual(first);
    expect(c.getSnapshot().seed).toBe(7);
    expect(c.getSnapshot().status).toBe("idle");
    c.dispose();
  });
});
