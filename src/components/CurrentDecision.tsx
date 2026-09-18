import type { Decision } from "../game/controller.ts";
import { PLAYER_META, type Player } from "../game/players.ts";
import { describeMove } from "../llm/prompt.ts";
import { Badge, Card } from "./Card.tsx";
import { ARROW, DIR_LABEL, formatUsd, pct } from "./StatusCard.tsx";

export function CurrentDecision({ decision, player }: { decision: Decision | null; player: Player }) {
  const meta = PLAYER_META[player];
  const settled = decision !== null && decision.phase !== "deciding";
  const sub =
    decision?.phase === "selected"
      ? [
          `往返 ${decision.latencyMs} ms`,
          `接口 ${decision.upstreamMs} ms`,
          decision.inputTokens != null || decision.outputTokens != null
            ? `入 ${decision.inputTokens ?? "—"} / 出 ${decision.outputTokens ?? "—"}`
            : null,
          decision.confidence != null ? `置信 ${Math.round(decision.confidence * 100)}%` : null,
          decision.estimatedUsd != null ? formatUsd(decision.estimatedUsd) : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : decision?.phase === "forced"
        ? decision.options.length === 0
          ? "没有合法方向"
          : "只有一个合法方向，由代码直接决定，不打接口"
        : decision?.phase === "late"
          ? meta.late
          : decision?.phase === "error"
            ? (decision.error ?? "")
            : decision
              ? meta.wait
              : "每个合法方向的事实会出现在这里";

  return (
    <Card
      eyebrow="当前决策"
      title={
        decision?.phase === "forced" && decision.options.length === 0
          ? "无路可走"
          : settled && decision.dir
            ? `${ARROW[decision.dir]} ${DIR_LABEL[decision.dir]}`
            : decision
              ? meta.ask
              : "暂无决策"
      }
      badge={<Badge>{decision ? `${decision.options.length} 个合法` : "—"}</Badge>}
    >
      <p className="card-sub">{sub}</p>
      <div className="options">
        {decision?.options.map((o) => {
          const p = decision.probabilities[o.dir];
          const picked = settled && decision.dir === o.dir;
          return (
            <div key={o.dir} className={`option ${picked ? "picked" : ""} ${o.deadEnd ? "danger" : ""}`}>
              <div className="bar-row">
                <span className="bar-name">
                  {ARROW[o.dir]} {DIR_LABEL[o.dir]}
                </span>
                <span className="bar">
                  <i style={{ width: `${(p ?? 0) * 100}%` }} />
                </span>
                <span className="bar-value">{pct(p)}</span>
              </div>
              <div className="option-facts">{describeMove(o)}</div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
