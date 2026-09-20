import type { HistoryEntry, Source } from "../game/controller.ts";
import { PLAYER_META, type Player } from "../game/players.ts";
import { Badge, Card, type Tone } from "./Card.tsx";
import { ARROW, DIR_LABEL, formatUsd, pct } from "./StatusCard.tsx";

const BADGE: Record<Source, { label: string; tone: Tone }> = {
  jev: { label: "采用", tone: "ok" },
  laya: { label: "采用", tone: "ok" },
  llm: { label: "采用", tone: "ok" },
  forced: { label: "强制", tone: "neutral" },
  late: { label: "超时", tone: "warn" },
  error: { label: "错误", tone: "danger" },
};

const clock = (at: number) => new Date(at).toLocaleTimeString("zh-CN", { hour12: false });

function describe(e: HistoryEntry) {
  switch (e.source) {
    case "jev":
    case "laya":
    case "llm":
      return [
        `${e.latencyMs} ms`,
        e.model ?? e.source,
        e.confidence != null ? `置信 ${Math.round(e.confidence * 100)}%` : null,
        e.inputTokens != null || e.outputTokens != null ? `${e.inputTokens ?? "—"} / ${e.outputTokens ?? "—"} token` : null,
        e.estimatedUsd != null ? formatUsd(e.estimatedUsd) : null,
      ]
        .filter(Boolean)
        .join(" · ");
    case "forced":
      return e.options.length === 0 ? "没有合法方向，蛇撞上去了。" : "只有一个合法方向，由代码直接决定，不打接口。";
    case "late":
      return "截止前没有答复，继续直行。";
    case "error":
      return e.error ?? "接口失败，已走回退方向。";
  }
}

export function DecisionFeed({ history, player }: { history: HistoryEntry[]; player: Player }) {
  return (
    <Card
      eyebrow="决策记录"
      title="采用、强制与超时"
      badge={<Badge tone="accent">{history.length} 条</Badge>}
      className="feed-card"
    >
      <div className="feed">
        {history.length === 0 && <p className="card-sub">{PLAYER_META[player].label} 的每一步都会记在这里。</p>}
        {history.map((e) => (
          <article key={e.step} className={`event ${e.source}`}>
            <div className="event-head">
              <span className="event-time">
                {clock(e.at)} · 第 {e.step} 步
              </span>
              <Badge tone={BADGE[e.source].tone}>{BADGE[e.source].label}</Badge>
            </div>
            <div className="event-title">
              {ARROW[e.dir]} {e.source === player ? "采用" : e.source === "forced" ? "强制" : "回退"} → {DIR_LABEL[e.dir]}
            </div>
            <div className="event-sub">{describe(e)}</div>
            {e.source === player &&
              e.options.map((dir) => (
                <div key={dir} className={`bar-row small ${dir === e.dir ? "picked" : ""}`}>
                  <span className="bar-name">{DIR_LABEL[dir]}</span>
                  <span className="bar">
                    <i style={{ width: `${(e.probabilities[dir] ?? 0) * 100}%` }} />
                  </span>
                  <span className="bar-value">{pct(e.probabilities[dir] ?? 0)}</span>
                </div>
              ))}
          </article>
        ))}
      </div>
    </Card>
  );
}
