import { analyze } from "../game/analysis.ts";
import type { Decision, Snapshot } from "../game/controller.ts";
import { PLAYER_META } from "../game/players.ts";
import { describeMove } from "../llm/prompt.ts";
import { ARROW, DIR_LABEL, formatUsd, pct } from "./StatusCard.tsx";

function copy(decision: Decision | null, snapshot: Snapshot, ready: boolean | null) {
  const { status, player } = snapshot;
  const meta = PLAYER_META[player];
  if (ready === false && status !== "over" && status !== "running") {
    return {
      title: meta.offline,
      sub: meta.api,
    };
  }
  if (status === "over") {
    return snapshot.game.won
      ? { title: meta.won, sub: `长度 ${snapshot.game.snake.length} · ${snapshot.game.steps} 步` }
      : {
          title: snapshot.game.deathReason === "wall" ? "撞墙" : "咬到自己",
          sub: `长度 ${snapshot.game.snake.length} · ${snapshot.game.steps} 步`,
        };
  }
  if (status === "paused") return { title: "已暂停", sub: "事实仍按当前棋盘计算，继续后接着比" };
  if (!decision) return { title: "等待开始", sub: "下面是这一步的合法方向和代码算好的事实" };
  switch (decision.phase) {
    case "deciding":
      return { title: meta.ask, sub: `${decision.options.length} 个合法方向 · ${meta.wait}` };
    case "selected":
      return {
        title: decision.dir ? `${ARROW[decision.dir]} ${DIR_LABEL[decision.dir]}` : "已选定",
        sub: [
          decision.latencyMs != null ? `往返 ${decision.latencyMs} ms` : null,
          decision.upstreamMs != null ? `接口 ${decision.upstreamMs} ms` : null,
          decision.inputTokens != null || decision.outputTokens != null
            ? `入 ${decision.inputTokens ?? "—"} / 出 ${decision.outputTokens ?? "—"}`
            : null,
          decision.confidence != null ? `置信 ${Math.round(decision.confidence * 100)}%` : null,
          player === "llm" ? "概率非校准" : null,
          decision.estimatedUsd != null ? formatUsd(decision.estimatedUsd) : null,
        ]
          .filter(Boolean)
          .join(" · "),
      };
    case "forced":
      return {
        title: decision.dir ? `${ARROW[decision.dir]} ${DIR_LABEL[decision.dir]}` : "强制",
        sub: decision.options.length === 0 ? "没有合法方向" : "只有一个合法方向，由代码直接决定，不打接口",
      };
    case "late":
      return { title: "超时回退", sub: meta.late };
    case "error":
      return { title: "接口出错", sub: decision.error ?? "已回退" };
  }
}

export function PlayerHud({ snapshot, ready = null }: { snapshot: Snapshot; ready?: boolean | null }) {
  const { decision, game, player } = snapshot;
  const { title, sub } = copy(decision, snapshot, ready);
  const options = decision?.options ?? analyze(game);
  const settled = decision !== null && decision.phase !== "deciding";
  const showProb = player !== "llm";

  return (
    <footer className="player-hud">
      <div className="hud-copy">
        <strong>{title}</strong>
        <span>{sub}</span>
      </div>
      <div className="hud-options">
        {options.length === 0 && <p className="hud-empty">这一步没有合法方向。</p>}
        {options.map((o) => {
          const p = decision?.probabilities[o.dir];
          const picked = settled && decision?.dir === o.dir;
          return (
            <div key={o.dir} className={`hud-option ${picked ? "picked" : ""} ${o.deadEnd ? "danger" : ""}`}>
              <div className="bar-row">
                <span className="bar-name">
                  {ARROW[o.dir]} {DIR_LABEL[o.dir]}
                </span>
                <span className="bar">
                  <i style={{ width: `${showProb ? (p ?? 0) * 100 : picked ? 100 : 0}%` }} />
                </span>
                <span className="bar-value">{decision ? (showProb ? pct(p) : picked ? "采用" : "—") : "—"}</span>
              </div>
              <div className="option-facts">{describeMove(o)}</div>
            </div>
          );
        })}
      </div>
    </footer>
  );
}
