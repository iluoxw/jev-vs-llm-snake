import type { Snapshot } from "../game/controller.ts";
import { formatUsd } from "./StatusCard.tsx";

const pad = (n: number, width: number) => String(n).padStart(width, "0");

type Better = "higher" | "lower" | "none";

function lead(jev: number, llm: number, better: Better): "jev" | "llm" | "tie" {
  if (better === "none" || jev === llm) return "tie";
  if (better === "higher") return jev > llm ? "jev" : "llm";
  return jev < llm ? "jev" : "llm";
}

function Metric({
  label,
  jev,
  llm,
  better,
  format,
}: {
  label: string;
  jev: number;
  llm: number;
  better: Better;
  format: (n: number) => string;
}) {
  const winner = lead(jev, llm, better);
  return (
    <div className={`vs-cell lead-${winner}`}>
      <div className="eyebrow">{label}</div>
      <div className="vs-pair">
        <b className={`jev ${winner === "jev" ? "ahead" : ""}`}>{format(jev)}</b>
        <span>对</span>
        <b className={`llm ${winner === "llm" ? "ahead" : ""}`}>{format(llm)}</b>
      </div>
    </div>
  );
}

export function CompareStrip({ jev, llm }: { jev: Snapshot; llm: Snapshot }) {
  const jevAvg = jev.stats.answered > 0 ? jev.stats.totalLatencyMs / jev.stats.answered : Number.POSITIVE_INFINITY;
  const llmAvg = llm.stats.answered > 0 ? llm.stats.totalLatencyMs / llm.stats.answered : Number.POSITIVE_INFINITY;

  return (
    <div className="vs-strip">
      <Metric label="分数" jev={jev.game.score * 100} llm={llm.game.score * 100} better="higher" format={(n) => pad(n, 4)} />
      <Metric label="长度" jev={jev.game.snake.length} llm={llm.game.snake.length} better="higher" format={(n) => pad(n, 2)} />
      <Metric label="步数" jev={jev.game.steps} llm={llm.game.steps} better="none" format={(n) => pad(n, 3)} />
      <Metric label="超时" jev={jev.stats.late} llm={llm.stats.late} better="lower" format={(n) => String(n)} />
      <Metric
        label="平均延迟"
        jev={jevAvg}
        llm={llmAvg}
        better="lower"
        format={(n) => (Number.isFinite(n) ? `${Math.round(n)} ms` : "—")}
      />
      <Metric label="估算费用" jev={jev.stats.totalUsd} llm={llm.stats.totalUsd} better="lower" format={(n) => formatUsd(n)} />
    </div>
  );
}
