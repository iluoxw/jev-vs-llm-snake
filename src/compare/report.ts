import type { HistoryEntry, Snapshot } from "../game/controller.ts";
import { namedPreset, type PresetName } from "../game/oracle.ts";
import { PLAYER_META, type Player } from "../game/players.ts";

export const PLAYERS: Player[] = ["jev", "laya", "llm"];

export interface PlayerScore {
  player: Player;
  ticks: number;
  judged: number;
  onTime: number;
  oracleHits: number;
  oracleRate: number | null;
  onTimeRate: number | null;
  avgLatencyMs: number | null;
  late: number;
  errors: number;
  foods: number;
  length: number;
  firstEat: number | null;
}

export interface PairAgree {
  a: Player;
  b: Player;
  sameBoard: number;
  sameDir: number;
  rate: number | null;
}

export interface ForkRow {
  player: Player;
  dir: HistoryEntry["dir"];
  source: HistoryEntry["source"];
  judged: boolean;
  oracle: HistoryEntry["oracle"];
  facts: HistoryEntry["facts"];
}

export interface FirstFork {
  step: number;
  boardKey: string | null;
  reason: "同局面选向不同" | "局面已分叉";
  oracle: HistoryEntry["oracle"];
  rows: ForkRow[];
}

export interface CompareReport {
  preset: PresetName;
  seed: number;
  scores: Record<Player, PlayerScore>;
  pairs: PairAgree[];
  fork: FirstFork | null;
  verdict: string;
  ticks: Array<{
    player: Player;
    step: number;
    boardKey: string;
    dir: HistoryEntry["dir"];
    source: HistoryEntry["source"];
    judged: boolean;
    oracle: HistoryEntry["oracle"];
    oracleMatch: boolean | null;
    latencyMs: number | null;
    length: number;
    eats: boolean;
    facts: HistoryEntry["facts"];
  }>;
}

function scoreOf(s: Snapshot): PlayerScore {
  const judged = s.history.filter((e) => e.judged);
  const oracleHits = judged.filter((e) => e.oracleMatch).length;
  const asked = s.stats.answered + s.stats.late + s.stats.errors;
  return {
    player: s.player,
    ticks: s.history.length,
    judged: judged.length,
    onTime: s.stats.answered,
    oracleHits,
    oracleRate: judged.length > 0 ? oracleHits / judged.length : null,
    onTimeRate: asked > 0 ? s.stats.answered / asked : null,
    avgLatencyMs: s.stats.answered > 0 ? s.stats.totalLatencyMs / s.stats.answered : null,
    late: s.stats.late,
    errors: s.stats.errors,
    foods: s.game.score,
    length: s.game.snake.length,
    firstEat: firstEatStep(s.history),
  };
}

function firstEatStep(history: HistoryEntry[], startLength = 3): number | null {
  const chrono = [...history].sort((a, b) => a.step - b.step);
  let prev = startLength;
  for (const e of chrono) {
    if (e.length > prev) return e.step;
    prev = e.length;
  }
  return null;
}

function pairAgree(a: Snapshot, b: Snapshot): PairAgree {
  const byKey = new Map(b.history.filter((e) => e.judged).map((e) => [e.boardKey, e]));
  let sameBoard = 0;
  let sameDir = 0;
  for (const e of a.history) {
    if (!e.judged) continue;
    const other = byKey.get(e.boardKey);
    if (!other) continue;
    sameBoard += 1;
    if (other.dir === e.dir) sameDir += 1;
  }
  return {
    a: a.player,
    b: b.player,
    sameBoard,
    sameDir,
    rate: sameBoard > 0 ? sameDir / sameBoard : null,
  };
}

function firstFork(snaps: Snapshot[]): FirstFork | null {
  const max = Math.min(...snaps.map((s) => s.history.reduce((m, e) => Math.max(m, e.step), 0)));
  for (let step = 1; step <= max; step++) {
    const rows = snaps.flatMap((s) => {
      const e = s.history.find((x) => x.step === step);
      return e ? [{ player: s.player, e }] : [];
    });
    if (rows.length < 2) continue;
    const keys = new Set(rows.map((r) => r.e.boardKey));
    if (keys.size > 1) {
      return {
        step,
        boardKey: null,
        reason: "局面已分叉",
        oracle: rows[0].e.oracle,
        rows: rows.map(toForkRow),
      };
    }
    const judged = rows.filter((r) => r.e.judged);
    const dirs = new Set(judged.map((r) => r.e.dir));
    if (dirs.size > 1) {
      return {
        step,
        boardKey: rows[0].e.boardKey,
        reason: "同局面选向不同",
        oracle: rows[0].e.oracle,
        rows: rows.map(toForkRow),
      };
    }
  }
  return null;
}

function toForkRow({ player, e }: { player: Player; e: HistoryEntry }): ForkRow {
  return {
    player,
    dir: e.dir,
    source: e.source,
    judged: e.judged,
    oracle: e.oracle,
    facts: e.facts,
  };
}

function eatRank(a: PlayerScore, b: PlayerScore): number {
  if (a.foods !== b.foods) return b.foods - a.foods;
  const ae = a.firstEat ?? 1e9;
  const be = b.firstEat ?? 1e9;
  if (ae !== be) return ae - be;
  if (a.length !== b.length) return b.length - a.length;
  const at = a.onTimeRate ?? -1;
  const bt = b.onTimeRate ?? -1;
  if (at !== bt) return bt - at;
  return (a.avgLatencyMs ?? 1e9) - (b.avgLatencyMs ?? 1e9);
}

function verdictOf(scores: Record<Player, PlayerScore>, pairs: PairAgree[], fork: FirstFork | null, preset: PresetName): string {
  const usable = PLAYERS.map((id) => scores[id]).filter((s) => s.ticks >= 8 || s.judged >= 3);
  const jl = pairs.find((p) => p.a === "jev" && p.b === "laya");
  const agree =
    jl?.rate == null ? "Jev 与 Laya 还没有同局面的按时样本。" : `同局面 Jev/Laya 同向 ${Math.round(jl.rate * 100)}%（${jl.sameDir}/${jl.sameBoard}）。`;
  const forkLine = fork
    ? `首次分叉在第 ${fork.step} 步（${fork.reason}）。`
    : "尚未出现分叉。";
  const goal = "对照目标是尽快吃到食物：分数 > 首食步数 > 长度，然后才是按时率和接口延迟。接口快但没吃到不算达标。";

  if (usable.length === 0) {
    return `${goal} 走得还不够，还不能排名。超时和空回复不计入判断。${agree} ${forkLine}`;
  }

  const ate = usable.filter((s) => s.foods > 0);
  const starved = usable.filter((s) => s.foods === 0 && s.ticks >= 8);
  const starveLine =
    ate.length > 0 && starved.length > 0
      ? `${starved.map((s) => PLAYER_META[s.player].label).join("、")} ${starved.length === 1 ? "走了" : "各走了"}${starved.map((s) => s.ticks).join("/")} 步仍是 0 分，不达标。`
      : "";

  if (ate.length === 0) {
    return `${goal} 三列都还没吃到，不能比谁更优，只能看延迟和超时。建议用「贪吃」再开一局。${agree} ${forkLine}`;
  }

  const ranked = ate.slice().sort(eatRank);
  const top = ranked[0];
  const who = PLAYER_META[top.player].label;
  const eat = top.firstEat == null ? `${top.foods} 分` : `${top.foods} 分，首食第 ${top.firstEat} 步`;
  const presetNote = preset === "贪吃" ? "" : `当前预设是「${preset}」，和吃食物目标不一致，结论仍按吃分算。`;
  return `${goal} 本局更优的是 ${who}（${eat}）。${starveLine} ${presetNote} ${agree} ${forkLine}`.replace(/\s+/g, " ").trim();
}

export function buildReport(jev: Snapshot, laya: Snapshot, llm: Snapshot): CompareReport {
  const snaps = [jev, laya, llm];
  const scores = {
    jev: scoreOf(jev),
    laya: scoreOf(laya),
    llm: scoreOf(llm),
  };
  const pairs = [pairAgree(jev, laya), pairAgree(jev, llm), pairAgree(laya, llm)];
  const fork = firstFork(snaps);
  const preset = namedPreset(jev.strategy);
  const ticks = snaps.flatMap((s) =>
    s.history.map((e) => ({
      player: s.player,
      step: e.step,
      boardKey: e.boardKey,
      dir: e.dir,
      source: e.source,
      judged: e.judged,
      oracle: e.oracle,
      oracleMatch: e.oracleMatch,
      latencyMs: e.latencyMs,
      length: e.length,
      eats: e.facts.some((f) => f.dir === e.dir && f.eats),
      facts: e.facts,
    })),
  );
  ticks.sort((a, b) => a.step - b.step || PLAYERS.indexOf(a.player) - PLAYERS.indexOf(b.player));
  return {
    preset,
    seed: jev.seed,
    scores,
    pairs,
    fork,
    verdict: verdictOf(scores, pairs, fork, preset),
    ticks,
  };
}
