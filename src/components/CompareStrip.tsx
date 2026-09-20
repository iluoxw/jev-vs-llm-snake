import type { Snapshot } from "../game/controller.ts";
import { PLAYER_META, type Player } from "../game/players.ts";
import { formatUsd } from "./StatusCard.tsx";

const pad = (n: number, width: number) => String(n).padStart(width, "0");
const PLAYERS: Player[] = ["jev", "laya", "llm"];

type Better = "higher" | "lower" | "none";

function lead(values: Record<Player, number>, better: Better): Player | "tie" {
  if (better === "none") return "tie";
  let best = PLAYERS[0];
  for (const id of PLAYERS) {
    if (better === "higher" ? values[id] > values[best] : values[id] < values[best]) best = id;
  }
  return PLAYERS.filter((id) => values[id] === values[best]).length === 1 ? best : "tie";
}

function Metric({
  label,
  values,
  better,
  format,
}: {
  label: string;
  values: Record<Player, number>;
  better: Better;
  format: (n: number) => string;
}) {
  const winner = lead(values, better);
  return (
    <div className={`vs-cell lead-${winner}`}>
      <div className="eyebrow">{label}</div>
      <div className="vs-triple">
        {PLAYERS.map((id) => (
          <b key={id} className={`${id} ${winner === id ? "ahead" : ""}`}>
            <small>{PLAYER_META[id].short}</small>
            {format(values[id])}
          </b>
        ))}
      </div>
    </div>
  );
}

function avgLatency(s: Snapshot) {
  return s.stats.answered > 0 ? s.stats.totalLatencyMs / s.stats.answered : Number.POSITIVE_INFINITY;
}

export function CompareStrip({ jev, laya, llm }: { jev: Snapshot; laya: Snapshot; llm: Snapshot }) {
  return (
    <div className="vs-strip">
      <Metric
        label="分数"
        values={{ jev: jev.game.score * 100, laya: laya.game.score * 100, llm: llm.game.score * 100 }}
        better="higher"
        format={(n) => pad(n, 4)}
      />
      <Metric
        label="长度"
        values={{ jev: jev.game.snake.length, laya: laya.game.snake.length, llm: llm.game.snake.length }}
        better="higher"
        format={(n) => pad(n, 2)}
      />
      <Metric
        label="步数"
        values={{ jev: jev.game.steps, laya: laya.game.steps, llm: llm.game.steps }}
        better="none"
        format={(n) => pad(n, 3)}
      />
      <Metric
        label="超时"
        values={{ jev: jev.stats.late, laya: laya.stats.late, llm: llm.stats.late }}
        better="lower"
        format={(n) => String(n)}
      />
      <Metric
        label="平均延迟"
        values={{ jev: avgLatency(jev), laya: avgLatency(laya), llm: avgLatency(llm) }}
        better="lower"
        format={(n) => (Number.isFinite(n) ? `${Math.round(n)} ms` : "—")}
      />
      <Metric
        label="估算费用"
        values={{ jev: jev.stats.totalUsd, laya: laya.stats.totalUsd, llm: llm.stats.totalUsd }}
        better="lower"
        format={(n) => formatUsd(n)}
      />
    </div>
  );
}
