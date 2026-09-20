import type { Snapshot } from "../game/controller.ts";
import { PLAYER_META, type Player } from "../game/players.ts";
import { Badge } from "./Card.tsx";
import { Board } from "./Board.tsx";
import { DeadlineBar } from "./DeadlineBar.tsx";
import { PlayerHud } from "./PlayerHud.tsx";

const STATE_BADGE = {
  idle: { label: "就绪", tone: "neutral" as const },
  running: { label: "自动", tone: "accent" as const },
  paused: { label: "暂停", tone: "warn" as const },
  over: { label: "结束", tone: "danger" as const },
};

export function PlayerPane({
  player,
  snapshot,
  ready = null,
}: {
  player: Player;
  snapshot: Snapshot;
  ready?: boolean | null;
}) {
  const meta = PLAYER_META[player];
  const { game, status, tickMs, tickStartedAt, decision, history } = snapshot;
  const running = status === "running";
  const highlight = running && decision && decision.phase !== "deciding" ? decision.dir : null;
  const missed = running && history[0]?.source === "late";
  const state = STATE_BADGE[status];

  return (
    <section className="player-col" data-player={player}>
      <section className="card board-card">
        <div className="player-stack">
          <header className="player-head">
            <div className="player-id">
              <span className="eyebrow">{meta.short}</span>
              <h2>{meta.label}</h2>
            </div>
            <DeadlineBar running={running} tickStartedAt={tickStartedAt} tickMs={tickMs} missed={missed} compact />
            <Badge tone={ready === false ? "warn" : state.tone} live={running && ready !== false}>
              {ready === false ? meta.offline : state.label}
            </Badge>
          </header>

          <div className="board-stage">
            <Board game={game} highlight={highlight} tickMs={tickMs} player={player} />
            {status === "over" && (
              <div className="overlay">
                <div className="eyebrow">{game.won ? "棋盘已满" : "游戏结束"}</div>
                <div className="overlay-title">
                  {game.won ? meta.won : game.deathReason === "wall" ? "撞墙" : "咬到自己"}
                </div>
                <div className="overlay-sub">
                  长度 {game.snake.length} · {game.steps} 步 · 分数 {game.score * 100}
                </div>
              </div>
            )}
          </div>

          <PlayerHud snapshot={snapshot} ready={ready} />
        </div>
      </section>
    </section>
  );
}
