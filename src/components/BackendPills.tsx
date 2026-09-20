import { PLAYER_META, type Player } from "../game/players.ts";
import type { Health } from "../hooks/useHealth.ts";

const PLAYERS: Player[] = ["jev", "laya", "llm"];

function label(ready: boolean | null) {
  if (ready == null) return "检测中";
  return ready ? "在线" : "未就绪";
}

export function BackendPills({ health }: { health: Health }) {
  return (
    <div className="backend-pills" aria-label="决策后端状态">
      {PLAYERS.map((id) => {
        const ready = health[id];
        const state = ready == null ? "wait" : ready ? "on" : "off";
        return (
          <span key={id} className={`backend-pill ${id} ${state}`} title={ready ? PLAYER_META[id].api : PLAYER_META[id].offline}>
            {PLAYER_META[id].short} {label(ready)}
          </span>
        );
      })}
    </div>
  );
}
