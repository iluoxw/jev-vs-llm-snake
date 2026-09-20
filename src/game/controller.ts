import type { Decide } from "../decide/client.ts";
import { PRESETS } from "../llm/prompt.ts";
import { type MoveFacts, analyze, fallbackMove } from "./analysis.ts";
import { type Dir, type GameState, createGame, step } from "./engine.ts";
import { boardKey, oracleMove } from "./oracle.ts";
import type { Player } from "./players.ts";

export type Status = "idle" | "running" | "paused" | "over";

/** How the move for one tick was chosen. */
export type Source = Player | "late" | "error" | "forced";

export interface Decision {
  phase: "deciding" | "selected" | "late" | "error" | "forced";
  options: MoveFacts[];
  dir: Dir | null;
  probabilities: Partial<Record<Dir, number>>;
  confidence: number | null;
  model: string | null;
  latencyMs: number | null;
  upstreamMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedUsd: number | null;
  error: string | null;
}

export interface HistoryEntry {
  step: number;
  dir: Dir;
  source: Source;
  confidence: number | null;
  latencyMs: number | null;
  length: number;
  /** Wall-clock time the move was played (ms since epoch). */
  at: number;
  /** Directions the model could pick from on this tick. */
  options: Dir[];
  probabilities: Partial<Record<Dir, number>>;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedUsd: number | null;
  error: string | null;
  /** Board fingerprint before this move. Same key = still the same position. */
  boardKey: string;
  facts: Array<{
    dir: Dir;
    reachable: number;
    deadEnd: boolean;
    foodDistance: number | null;
    eats: boolean;
  }>;
  oracle: Dir | null;
  /** null when the move was forced / late / error — not a model judgment. */
  oracleMatch: boolean | null;
  judged: boolean;
}

export interface Stats {
  calls: number;
  answered: number;
  late: number;
  errors: number;
  forced: number;
  totalLatencyMs: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalUsd: number;
}

export interface Snapshot {
  game: GameState;
  status: Status;
  tickMs: number;
  tickStartedAt: number;
  strategy: string;
  seed: number;
  decision: Decision | null;
  history: HistoryEntry[];
  stats: Stats;
  best: number;
  lastModel: string | null;
  lastError: string | null;
  player: Player;
}

const EMPTY_STATS: Stats = {
  calls: 0,
  answered: 0,
  late: 0,
  errors: 0,
  forced: 0,
  totalLatencyMs: 0,
  totalInputTokens: 0,
  totalOutputTokens: 0,
  totalUsd: 0,
};
const HISTORY_LIMIT = 60;

export interface ControllerOptions {
  decide: Decide;
  player?: Player;
  seed?: number;
  cols?: number;
  rows?: number;
  tickMs?: number;
  now?: () => number;
}

/**
 * Fixed-clock game loop. At the start of every tick the model is asked for a move; whatever has
 * arrived when the tick ends is played, otherwise the snake keeps going straight.
 */
export class GameController {
  private snapshot: Snapshot;
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inflight: AbortController | null = null;
  private epoch = 0;
  private pending: { dir: Dir; source: Source } | null = null;
  private seed: number;
  private readonly decide: Decide;
  private readonly player: Player;
  private readonly now: () => number;
  private readonly size: { cols?: number; rows?: number };

  constructor(options: ControllerOptions) {
    this.decide = options.decide;
    this.player = options.player ?? "llm";
    this.now = options.now ?? (() => performance.now());
    this.seed = options.seed ?? Math.floor(Math.random() * 2 ** 31);
    this.size = { cols: options.cols, rows: options.rows };
    this.snapshot = {
      game: createGame({ ...this.size, seed: this.seed }),
      status: "idle",
      tickMs: options.tickMs ?? 1200,
      tickStartedAt: 0,
      strategy: PRESETS["贪吃"],
      seed: this.seed,
      decision: null,
      history: [],
      stats: EMPTY_STATS,
      best: 0,
      lastModel: null,
      lastError: null,
      player: this.player,
    };
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.snapshot;

  private set(patch: Partial<Snapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }

  setStrategy(strategy: string) {
    this.set({ strategy });
  }

  setTickMs(tickMs: number) {
    this.set({ tickMs });
  }

  setSeed(seed: number) {
    this.cancelTick();
    this.seed = seed | 0;
    this.set({
      game: createGame({ ...this.size, seed: this.seed }),
      status: "idle",
      seed: this.seed,
      decision: null,
      history: [],
      stats: EMPTY_STATS,
      lastError: null,
    });
  }

  start() {
    if (this.snapshot.status === "running") return;
    if (this.snapshot.status === "over") this.reset();
    this.set({ status: "running" });
    this.beginTick();
  }

  pause() {
    if (this.snapshot.status !== "running") return;
    this.cancelTick();
    this.set({ status: "paused", decision: null });
  }

  toggle() {
    if (this.snapshot.status === "running") this.pause();
    else this.start();
  }

  reset() {
    this.cancelTick();
    this.seed = (this.seed + 1) | 0;
    this.set({
      game: createGame({ ...this.size, seed: this.seed }),
      status: "idle",
      seed: this.seed,
      decision: null,
      history: [],
      stats: EMPTY_STATS,
      lastError: null,
    });
  }

  dispose() {
    this.cancelTick();
    this.listeners.clear();
  }

  private cancelTick() {
    this.epoch++;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.inflight?.abort();
    this.inflight = null;
    this.pending = null;
  }

  private beginTick() {
    const epoch = ++this.epoch;
    const { game, tickMs, strategy } = this.snapshot;
    const options = analyze(game);
    const startedAt = this.now();
    const blank: Decision = {
      phase: "deciding",
      options,
      dir: null,
      probabilities: {},
      confidence: null,
      model: null,
      latencyMs: null,
      upstreamMs: null,
      inputTokens: null,
      outputTokens: null,
      estimatedUsd: null,
      error: null,
    };
    this.pending = null;

    if (options.length < 2) {
      // Nothing to decide: one way out, or none at all.
      const dir = options[0]?.dir ?? game.heading;
      this.pending = { dir, source: "forced" };
      this.set({ tickStartedAt: startedAt, decision: { ...blank, phase: "forced", dir } });
    } else {
      this.set({
        tickStartedAt: startedAt,
        decision: blank,
        stats: { ...this.snapshot.stats, calls: this.snapshot.stats.calls + 1 },
      });
      const controller = new AbortController();
      this.inflight = controller;
      this.decide(game, strategy, controller.signal).then(
        (result) => {
          if (epoch !== this.epoch || this.pending) return;
          const legal = options.some((o) => o.dir === result.choice);
          if (!legal) return this.fail(epoch, blank, `illegal choice "${result.choice}"`);
          const latencyMs = Math.round(this.now() - startedAt);
          this.pending = { dir: result.choice, source: this.player };
          this.set({
            lastModel: result.model,
            lastError: null,
            decision: {
              ...blank,
              phase: "selected",
              dir: result.choice,
              probabilities: result.probabilities,
              confidence: result.confidence,
              model: result.model,
              latencyMs,
              upstreamMs: result.upstreamMs,
              inputTokens: result.inputTokens,
              outputTokens: result.outputTokens,
              estimatedUsd: result.estimatedUsd,
            },
          });
        },
        (err: unknown) => {
          if (controller.signal.aborted) return;
          this.fail(epoch, blank, err instanceof Error ? err.message : String(err));
        },
      );
    }

    this.timer = setTimeout(() => this.endTick(epoch), tickMs);
  }

  private fail(epoch: number, blank: Decision, error: string) {
    if (epoch !== this.epoch || this.pending) return;
    const dir = fallbackMove(this.snapshot.game);
    this.pending = { dir, source: "error" };
    this.set({ lastError: error, decision: { ...blank, phase: "error", dir, error } });
  }

  private endTick(epoch: number) {
    if (epoch !== this.epoch) return;
    const { game, decision, stats, history } = this.snapshot;
    this.inflight?.abort();
    this.inflight = null;

    const played = this.pending ?? { dir: fallbackMove(game), source: "late" as const };
    const answered = played.source === this.player;
    const latencyMs = answered ? (decision?.latencyMs ?? null) : null;
    const facts = decision?.options ?? analyze(game);
    const oracle = oracleMove(facts, this.snapshot.strategy);
    const next = step(game, played.dir);
    const entry: HistoryEntry = {
      step: next.steps,
      dir: played.dir,
      source: played.source,
      confidence: answered ? (decision?.confidence ?? null) : null,
      latencyMs,
      length: next.snake.length,
      at: Date.now(),
      options: facts.map((o) => o.dir),
      probabilities: answered ? (decision?.probabilities ?? {}) : {},
      model: answered ? (decision?.model ?? null) : null,
      inputTokens: answered ? (decision?.inputTokens ?? null) : null,
      outputTokens: answered ? (decision?.outputTokens ?? null) : null,
      estimatedUsd: answered ? (decision?.estimatedUsd ?? null) : null,
      error: played.source === "error" ? (decision?.error ?? null) : null,
      boardKey: boardKey(game),
      facts: facts.map((o) => ({
        dir: o.dir,
        reachable: o.reachable,
        deadEnd: o.deadEnd,
        foodDistance: o.foodDistance,
        eats: o.eats,
      })),
      oracle,
      oracleMatch: answered && oracle != null ? played.dir === oracle : null,
      judged: answered,
    };
    const over = !next.alive || next.won;
    this.set({
      game: next,
      status: over ? "over" : "running",
      best: Math.max(this.snapshot.best, next.score),
      history: [entry, ...history].slice(0, HISTORY_LIMIT),
      stats: {
        ...stats,
        answered: stats.answered + (answered ? 1 : 0),
        late: stats.late + (played.source === "late" ? 1 : 0),
        errors: stats.errors + (played.source === "error" ? 1 : 0),
        forced: stats.forced + (played.source === "forced" ? 1 : 0),
        totalLatencyMs: stats.totalLatencyMs + (latencyMs ?? 0),
        totalInputTokens: stats.totalInputTokens + (answered ? (decision?.inputTokens ?? 0) : 0),
        totalOutputTokens: stats.totalOutputTokens + (answered ? (decision?.outputTokens ?? 0) : 0),
        totalUsd: stats.totalUsd + (answered ? (decision?.estimatedUsd ?? 0) : 0),
      },
      decision:
        played.source === "late" && decision ? { ...decision, phase: "late", dir: played.dir } : decision,
    });
    if (over) {
      this.cancelTick();
      return;
    }
    this.beginTick();
  }
}
