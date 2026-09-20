import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { decideJev, decideLaya, decideLlm } from "../decide/client.ts";
import { GameController } from "../game/controller.ts";
import type { Player } from "../game/players.ts";

function seedFromUrl(): number | undefined {
  const raw = new URLSearchParams(window.location.search).get("seed");
  if (raw == null || raw === "") return undefined;
  const n = Number(raw);
  return Number.isInteger(n) ? n : undefined;
}

export function useCompare() {
  const [trio] = useState(() => {
    const seed = seedFromUrl() ?? Math.floor(Math.random() * 2 ** 31);
    return {
      jev: new GameController({ decide: decideJev, player: "jev", seed }),
      laya: new GameController({ decide: decideLaya, player: "laya", seed }),
      llm: new GameController({ decide: decideLlm, player: "llm", seed }),
    };
  });

  const jev = useSyncExternalStore(trio.jev.subscribe, trio.jev.getSnapshot);
  const laya = useSyncExternalStore(trio.laya.subscribe, trio.laya.getSnapshot);
  const llm = useSyncExternalStore(trio.llm.subscribe, trio.llm.getSnapshot);

  useEffect(
    () => () => {
      trio.jev.pause();
      trio.laya.pause();
      trio.llm.pause();
    },
    [trio],
  );

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("seed", String(jev.seed));
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, [jev.seed]);

  const logged = useRef<Record<Player, number>>({ jev: 0, laya: 0, llm: 0 });
  useEffect(() => {
    logged.current = { jev: 0, laya: 0, llm: 0 };
  }, [jev.seed]);
  useEffect(() => {
    for (const snap of [jev, laya, llm]) {
      const e = snap.history[0];
      if (!e || e.step <= logged.current[snap.player]) continue;
      logged.current[snap.player] = e.step;
      console.log("[compare]", {
        seed: snap.seed,
        player: snap.player,
        step: e.step,
        boardKey: e.boardKey,
        dir: e.dir,
        source: e.source,
        judged: e.judged,
        oracle: e.oracle,
        oracleMatch: e.oracleMatch,
        latencyMs: e.latencyMs,
        facts: e.facts,
      });
    }
  }, [jev, laya, llm]);

  const session = useMemo(() => {
    const applyAll = (fn: (c: GameController) => void) => {
      fn(trio.jev);
      fn(trio.laya);
      fn(trio.llm);
    };
    return {
      setStrategy: (strategy: string) => applyAll((c) => c.setStrategy(strategy)),
      setTickMs: (tickMs: number) => applyAll((c) => c.setTickMs(tickMs)),
      setSeed: (seed: number) => applyAll((c) => c.setSeed(seed)),
      start: () => {
        const snapshots = [trio.jev, trio.laya, trio.llm].map((c) => c.getSnapshot());
        if (snapshots.some((s) => s.status === "over")) {
          const next = (snapshots[0].seed + 1) | 0;
          applyAll((c) => c.setSeed(next));
        }
        applyAll((c) => c.start());
      },
      pause: () => applyAll((c) => c.pause()),
      reset: () => {
        const next = (trio.jev.getSnapshot().seed + 1) | 0;
        applyAll((c) => c.setSeed(next));
      },
    };
  }, [trio]);

  return { jev, laya, llm, session };
}
