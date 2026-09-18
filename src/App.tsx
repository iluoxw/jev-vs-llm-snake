import { CompareStrip } from "./components/CompareStrip.tsx";
import { PlayerPane } from "./components/PlayerPane.tsx";
import { StrategyBar } from "./components/StrategyBar.tsx";
import { useCompare } from "./hooks/useCompare.ts";

const SPEEDS = [
  { label: "0.5 步/秒", tickMs: 2000 },
  { label: "0.8 步/秒", tickMs: 1200 },
  { label: "1 步/秒", tickMs: 1000 },
  { label: "1.5 步/秒", tickMs: 660 },
  { label: "2 步/秒", tickMs: 500 },
  { label: "3 步/秒", tickMs: 330 },
];

export function App() {
  const { jev, llm, session } = useCompare();
  const running = jev.status === "running" || llm.status === "running";
  const eitherOver = jev.status === "over" || llm.status === "over";
  const bothPaused = jev.status === "paused" && llm.status === "paused";
  const startLabel = bothPaused ? "继续" : eitherOver && !running ? "再来一局" : "开始";

  return (
    <main className="compare">
      <header className="topbar">
        <div className="brand">
          <div className="eyebrow">并行对照</div>
          <h1>Jev 对 LLM</h1>
        </div>
        <CompareStrip jev={jev} llm={llm} />
      </header>

      <div className="control-row">
        <StrategyBar strategy={jev.strategy} onChange={session.setStrategy} />
        <div className="toolbar compare-toolbar">
          <button className="primary" disabled={running} onClick={session.start}>
            {startLabel}
          </button>
          <button disabled={!running} onClick={session.pause}>
            暂停
          </button>
          <button onClick={session.reset}>重置</button>
          <label className="speed">
            <span className="eyebrow">速度</span>
            <select
              name="speed"
              value={jev.tickMs}
              disabled={running}
              onChange={(e) => session.setTickMs(Number(e.target.value))}
            >
              {SPEEDS.map((s) => (
                <option key={s.tickMs} value={s.tickMs}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="speed">
            <span className="eyebrow">种子</span>
            <input
              type="number"
              name="seed"
              value={jev.seed}
              disabled={running}
              onChange={(e) => {
                const next = Number(e.target.value);
                if (Number.isInteger(next)) session.setSeed(next);
              }}
            />
          </label>
        </div>
      </div>

      <div className="compare-grid">
        <PlayerPane player="jev" snapshot={jev} />
        <PlayerPane player="llm" snapshot={llm} />
      </div>
    </main>
  );
}
