import type { Decision, Snapshot } from "../game/controller.ts";
import type { Dir } from "../game/engine.ts";
import type { GameState } from "../game/engine.ts";
import { PLAYER_META, type Player } from "../game/players.ts";
import { Badge, Card, type Tone } from "./Card.tsx";

export const ARROW = { up: "↑", down: "↓", left: "←", right: "→" } as const;

export const DIR_LABEL: Record<Dir, string> = { up: "上", down: "下", left: "左", right: "右" };

export const pct = (n: number | null | undefined) => (n == null ? "—" : `${Math.round(n * 100)}%`);

export function formatUsd(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n === 0) return "$0";
  if (n < 0.000001) return `$${n.toExponential(2)}`;
  if (n < 0.01) return `$${n.toFixed(6)}`;
  return `$${n.toFixed(4)}`;
}

function headline(
  decision: Decision | null,
  status: Snapshot["status"],
  game: GameState,
  player: Player,
): { title: string; badge: string; tone: Tone; live?: boolean } {
  if (status === "over") {
    if (game.won) return { title: `棋盘已满，${PLAYER_META[player].won}`, badge: "胜利", tone: "ok" };
    return { title: game.deathReason === "wall" ? "撞墙" : "咬到自己", badge: "结束", tone: "danger" };
  }
  if (status === "paused") return { title: "已暂停", badge: "暂停", tone: "neutral" };
  if (!decision) return { title: "等待开始", badge: "空闲", tone: "neutral" };
  switch (decision.phase) {
    case "deciding":
      return { title: `正在 ${decision.options.length} 个合法方向里选`, badge: "决策中", tone: "accent", live: true };
    case "selected":
      return { title: `已选 ${ARROW[decision.dir!]} ${DIR_LABEL[decision.dir!]}`, badge: "已选定", tone: "ok" };
    case "forced":
      return {
        title: decision.options.length === 0 ? "无路可走" : `唯一合法方向 ${ARROW[decision.dir!]}`,
        badge: "强制",
        tone: "neutral",
      };
    case "late":
      return { title: "超时，继续直行", badge: "超时", tone: "warn" };
    case "error":
      return { title: "接口出错，已回退", badge: "错误", tone: "danger" };
  }
}

function Row({ label, value, tone }: { label: string; value: string; tone?: Tone }) {
  return (
    <div className="kv">
      <span>{label}</span>
      <strong className={tone ?? ""} title={value}>
        {value}
      </strong>
    </div>
  );
}

export function StatusCard({ snapshot }: { snapshot: Snapshot }) {
  const { game, status, tickMs, decision, stats, lastModel, lastError, player } = snapshot;
  const h = headline(decision, status, game, player);
  const avg = stats.answered > 0 ? `${Math.round(stats.totalLatencyMs / stats.answered)} ms` : "—";
  const cadence = 1000 / tickMs;
  const usdEach = stats.answered > 0 ? formatUsd(stats.totalUsd / stats.answered) : "—";
  const usdPoint = game.score > 0 ? formatUsd(stats.totalUsd / game.score) : "—";
  const usdStep = game.steps > 0 ? formatUsd(stats.totalUsd / game.steps) : "—";

  return (
    <Card
      eyebrow="实时决策"
      title={h.title}
      badge={
        <Badge tone={h.tone} live={h.live}>
          {h.badge}
        </Badge>
      }
    >
      <div className="kv-list">
        <Row label="请求频率" value={`≤ ${cadence >= 1 ? cadence.toFixed(1) : cadence.toFixed(2)} 次/秒`} />
        <Row label="调用次数" value={String(stats.calls)} />
        <Row label="平均往返" value={avg} />
        <Row label="超时次数" value={String(stats.late)} tone={stats.late > 0 ? "warn" : undefined} />
        <Row label="强制步数" value={String(stats.forced)} />
        <Row label="接口错误" value={String(stats.errors)} tone={stats.errors > 0 ? "danger" : undefined} />
        <Row label="输入 token" value={String(stats.totalInputTokens)} />
        <Row label="输出 token" value={String(stats.totalOutputTokens)} />
        <Row label="估算费用" value={formatUsd(stats.totalUsd)} />
        <Row label="每步费用" value={usdEach} />
        <Row label="每分费用" value={usdPoint} />
        <Row label="每存活步费用" value={usdStep} />
        <Row label="上次模型" value={lastModel ?? "—"} />
        <Row label="上次错误" value={lastError ?? "无"} tone={lastError ? "danger" : undefined} />
      </div>
      <p className="card-sub">费用只统计按时返回的调用。超时或中断的请求上游仍可能计费。</p>
    </Card>
  );
}
