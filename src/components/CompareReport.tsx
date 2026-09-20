import { buildReport } from "../compare/report.ts";
import type { Snapshot } from "../game/controller.ts";
import { PLAYER_META, type Player } from "../game/players.ts";
import { DIR_LABEL } from "./StatusCard.tsx";

const pct = (n: number | null) => (n == null ? "—" : `${Math.round(n * 100)}%`);
const ms = (n: number | null) => (n == null ? "—" : `${Math.round(n)} ms`);

function download(report: ReturnType<typeof buildReport>) {
  const lines = report.ticks.map((t) => JSON.stringify(t));
  const blob = new Blob([`${lines.join("\n")}\n`], { type: "application/x-ndjson" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `compare-seed-${report.seed}-${report.preset}.jsonl`;
  a.click();
  URL.revokeObjectURL(url);
}

export function CompareReport({ jev, laya, llm }: { jev: Snapshot; laya: Snapshot; llm: Snapshot }) {
  const report = buildReport(jev, laya, llm);

  return (
    <section className="judge">
      <div className="judge-copy">
        <div className="eyebrow">本局结论 · 目标 尽快吃到食物 · 预设 {report.preset}</div>
        <p>{report.verdict}</p>
      </div>
      <div className="judge-grid">
        {(["jev", "laya", "llm"] as Player[]).map((id) => {
          const s = report.scores[id];
          return (
            <div key={id} className={`judge-col ${id}`}>
              <strong>{PLAYER_META[id].short}</strong>
              <span>分数 {s.foods} · 长 {s.length}</span>
              <span>首食 {s.firstEat == null ? "未吃到" : `第 ${s.firstEat} 步`}</span>
              <span>按时 {pct(s.onTimeRate)} · {ms(s.avgLatencyMs)}</span>
            </div>
          );
        })}
      </div>
      <div className="judge-meta">
        {report.pairs.map((p) => (
          <span key={`${p.a}-${p.b}`}>
            {PLAYER_META[p.a].short}/{PLAYER_META[p.b].short} 同向 {pct(p.rate)}
          </span>
        ))}
        {report.fork && (
          <span>
            分叉 第 {report.fork.step} 步 {report.fork.reason}
            {report.fork.rows.map((r) => ` · ${PLAYER_META[r.player].short}${DIR_LABEL[r.dir]}`).join("")}
            {report.fork.oracle ? ` · 裁判${DIR_LABEL[report.fork.oracle]}` : ""}
          </span>
        )}
      </div>
      <div className="judge-actions">
        <button type="button" disabled={report.ticks.length === 0} onClick={() => download(report)}>
          下载本局日志
        </button>
        <details className="judge-log">
          <summary>逐步日志（{report.ticks.length}）</summary>
          <ol>
            {report.ticks.map((t) => (
              <li key={`${t.player}-${t.step}`}>
                第 {t.step} 步 {PLAYER_META[t.player].short} {DIR_LABEL[t.dir]}
                {t.judged ? "" : ` · ${t.source}`}
                {t.eats ? " · 吃到" : ""}
                {t.oracle ? ` · 裁判${DIR_LABEL[t.oracle]}` : ""}
                {t.oracleMatch == null ? "" : t.oracleMatch ? " · 贴" : " · 偏"}
                {t.latencyMs != null ? ` · ${t.latencyMs}ms` : ""}
                {t.facts.length > 0
                  ? ` · ${t.facts.map((f) => `${DIR_LABEL[f.dir]}${f.deadEnd ? "死" : ""}${f.reachable}`).join(" ")}`
                  : ""}
              </li>
            ))}
          </ol>
        </details>
      </div>
    </section>
  );
}
