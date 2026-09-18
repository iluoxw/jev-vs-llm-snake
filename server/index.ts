import { serve } from "@hono/node-server";
import { TypeSafeClient, choice } from "@typesafe-ai/sdk";
import { Hono } from "hono";
import { analyze } from "../src/game/analysis.ts";
import { DIRS, type Dir, type GameState, type Point, inBounds } from "../src/game/engine.ts";
import { completionsUrl as resolveCompletionsUrl, loadDotEnv } from "../src/llm/env.ts";
import { estimateUsd, parseChoice, probabilitiesFor } from "../src/llm/parse.ts";
import { buildRequest, toChatMessages } from "../src/llm/prompt.ts";
import type { DecidePayload, DecideResult } from "../src/llm/types.ts";

loadDotEnv();

const openaiKey = process.env.OPENAI_API_KEY;
const openaiModel = process.env.OPENAI_MODEL;
const openaiBase = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
const openaiInputUsd = Number(process.env.OPENAI_INPUT_USD_PER_MTIME ?? 0);
const openaiOutputUsd = Number(process.env.OPENAI_OUTPUT_USD_PER_MTIME ?? 0);
const jevKey = process.env.TYPESAFE_API_KEY;
const jevInputUsd = Number(process.env.TYPESAFE_INPUT_USD_PER_MTIME ?? 0.042);
const jevOutputUsd = Number(process.env.TYPESAFE_OUTPUT_USD_PER_MTIME ?? 0);

const completionsUrl = resolveCompletionsUrl(openaiBase);

const typesafe = jevKey ? new TypeSafeClient() : null;

if (!jevKey)   console.warn("未配置 TYPESAFE_API_KEY，/api/decide/jev 将返回 503。");
if (!openaiKey || !openaiModel) console.warn("未配置 OPENAI_API_KEY / OPENAI_MODEL，/api/decide/llm 将返回 503。");

const app = new Hono();

const isPoint = (p: unknown): p is Point =>
  typeof p === "object" && p !== null && Number.isInteger((p as Point).r) && Number.isInteger((p as Point).c);

function parseGame(body: unknown): GameState | null {
  const game = (body as DecidePayload | null)?.game;
  if (!game || !Number.isInteger(game.cols) || !Number.isInteger(game.rows)) return null;
  if (game.cols < 4 || game.cols > 40 || game.rows < 4 || game.rows > 40) return null;
  if (!Array.isArray(game.snake) || game.snake.length === 0 || !game.snake.every(isPoint)) return null;
  if (!DIRS.includes(game.heading)) return null;
  if (game.snake.length > game.cols * game.rows) return null;
  if (!game.snake.every((p) => inBounds(p, game.cols, game.rows))) return null;
  if (game.food !== null && !isPoint(game.food)) return null;
  if (game.food !== null && !inBounds(game.food, game.cols, game.rows)) return null;
  return {
    cols: game.cols,
    rows: game.rows,
    snake: game.snake,
    heading: game.heading,
    food: game.food,
    score: 0,
    steps: 0,
    alive: true,
    won: false,
    deathReason: null,
    rngState: 0,
  };
}

function mergeSignals(user: AbortSignal, timeoutMs: number): AbortSignal {
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any([user, AbortSignal.timeout(timeoutMs)]);
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const onAbort = () => {
    clearTimeout(timer);
    ctrl.abort();
  };
  if (user.aborted) onAbort();
  else user.addEventListener("abort", onAbort, { once: true });
  return ctrl.signal;
}

function readStrategy(body: unknown): string {
  return typeof (body as DecidePayload | null)?.strategy === "string"
    ? (body as DecidePayload).strategy.slice(0, 600)
    : "";
}

app.get("/api/health", (c) =>
  c.json({
    ok: true,
    jev: Boolean(jevKey),
    llm: Boolean(openaiKey && openaiModel),
  }),
);

app.post("/api/decide/jev", async (c) => {
  if (!typesafe) return c.json({ error: "未配置 TYPESAFE_API_KEY" }, 503);
  const body = await c.req.json().catch(() => null);
  const game = parseGame(body);
  if (!game) return c.json({ error: "棋盘状态无效" }, 400);

  const facts = analyze(game);
  if (facts.length < 2) return c.json({ error: "合法方向不足两个，由代码决定" }, 400);
  const legal = facts.map((f) => f.dir);

  let request;
  try {
    request = buildRequest(game, facts, readStrategy(body));
  } catch {
    return c.json({ error: "棋盘状态无效" }, 400);
  }
  const started = performance.now();
  try {
    const res = await typesafe.systemOne(
      {
        state: request.state as never,
        questions: { move: choice(request.instructions, request.criteria as Record<string, string>) },
      },
      { signal: c.req.raw.signal, timeout: 5000, retry: { maxRetries: 0 } },
    );
    const answer = res.answers.move;
    const chosen = answer.choice as Dir;
    if (!legal.includes(chosen)) return c.json({ error: "返回了非法方向" }, 502);
    const inputTokens = res.usage?.input_tokens ?? null;
    const result: DecideResult = {
      choice: chosen,
      probabilities: answer.probabilities as Partial<Record<Dir, number>>,
      confidence: answer.confidence,
      model: res.model,
      upstreamMs: Math.round(performance.now() - started),
      inputTokens,
      outputTokens: null,
      estimatedUsd: estimateUsd(inputTokens, null, jevInputUsd, jevOutputUsd),
    };
    return c.json(result);
  } catch (err) {
    if (c.req.raw.signal.aborted) return c.body(null, 499 as never);
    const message = err instanceof Error ? err.message : String(err);
    console.error("[decide/jev]", message);
    return c.json({ error: "Jev 决策失败" }, 502);
  }
});

app.post("/api/decide/llm", async (c) => {
  if (!openaiKey || !openaiModel) return c.json({ error: "未配置 OPENAI_API_KEY / OPENAI_MODEL" }, 503);
  const body = await c.req.json().catch(() => null);
  const game = parseGame(body);
  if (!game) return c.json({ error: "棋盘状态无效" }, 400);

  const facts = analyze(game);
  if (facts.length < 2) return c.json({ error: "合法方向不足两个，由代码决定" }, 400);
  const legal = facts.map((f) => f.dir);

  let request;
  try {
    request = buildRequest(game, facts, readStrategy(body));
  } catch {
    return c.json({ error: "棋盘状态无效" }, 400);
  }
  const started = performance.now();
  try {
    const res = await fetch(completionsUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: openaiModel,
        messages: toChatMessages(request),
        temperature: 0,
        max_tokens: 64,
        stream: false,
      }),
      signal: mergeSignals(c.req.raw.signal, 5000),
    });

    const payload = (await res.json().catch(() => null)) as {
      error?: { message?: string };
      model?: string;
      choices?: { message?: { content?: unknown } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    } | null;

    if (!res.ok) {
      throw new Error(payload?.error?.message ?? `upstream HTTP ${res.status}`);
    }

    const content = payload?.choices?.[0]?.message?.content;
    const text = typeof content === "string" ? content : "";
    const chosen = parseChoice(text, legal);
    if (!chosen) throw new Error(`无法解析或非法方向 ${JSON.stringify(text)}`);

    const inputTokens = typeof payload?.usage?.prompt_tokens === "number" ? payload.usage.prompt_tokens : null;
    const outputTokens = typeof payload?.usage?.completion_tokens === "number" ? payload.usage.completion_tokens : null;
    const result: DecideResult = {
      choice: chosen,
      probabilities: probabilitiesFor(chosen, legal),
      confidence: null,
      model: typeof payload?.model === "string" ? payload.model : openaiModel,
      upstreamMs: Math.round(performance.now() - started),
      inputTokens,
      outputTokens,
      estimatedUsd: estimateUsd(inputTokens, outputTokens, openaiInputUsd, openaiOutputUsd),
    };
    return c.json(result);
  } catch (err) {
    if (c.req.raw.signal.aborted) return c.body(null, 499 as never);
    const message = err instanceof Error ? err.message : String(err);
    console.error("[decide/llm]", message);
    return c.json({ error: "LLM 决策失败" }, 502);
  }
});

app.post("/api/decide", (c) => {
  const url = new URL(c.req.url);
  url.pathname = "/api/decide/llm";
  return app.request(url.toString(), c.req.raw);
});

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, () => {
  console.log(`jev-vs-llm-snake proxy listening on http://127.0.0.1:${port} · llm ${completionsUrl} · model ${openaiModel ?? "(unset)"}`);
});
