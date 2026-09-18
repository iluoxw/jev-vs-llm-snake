import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { decideJev, decideLlm } from "../decide/client.ts";
import { GameController } from "../game/controller.ts";

function seedFromUrl(): number | undefined {
  const raw = new URLSearchParams(window.location.search).get("seed");
  if (raw == null || raw === "") return undefined;
  const n = Number(raw);
  return Number.isInteger(n) ? n : undefined;
}

export function useCompare() {
  const [pair] = useState(() => {
    const seed = seedFromUrl() ?? Math.floor(Math.random() * 2 ** 31);
    return {
      jev: new GameController({ decide: decideJev, player: "jev", seed }),
      llm: new GameController({ decide: decideLlm, player: "llm", seed }),
    };
  });

  const jev = useSyncExternalStore(pair.jev.subscribe, pair.jev.getSnapshot);
  const llm = useSyncExternalStore(pair.llm.subscribe, pair.llm.getSnapshot);

  useEffect(
    () => () => {
      pair.jev.pause();
      pair.llm.pause();
    },
    [pair],
  );

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("seed", String(jev.seed));
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, [jev.seed]);

  const session = useMemo(() => {
    const applyBoth = (fn: (c: GameController) => void) => {
      fn(pair.jev);
      fn(pair.llm);
    };
    return {
      setStrategy: (strategy: string) => applyBoth((c) => c.setStrategy(strategy)),
      setTickMs: (tickMs: number) => applyBoth((c) => c.setTickMs(tickMs)),
      setSeed: (seed: number) => applyBoth((c) => c.setSeed(seed)),
      start: () => {
        const j = pair.jev.getSnapshot();
        const l = pair.llm.getSnapshot();
        if (j.status === "over" || l.status === "over") {
          const next = (j.seed + 1) | 0;
          pair.jev.setSeed(next);
          pair.llm.setSeed(next);
        }
        pair.jev.start();
        pair.llm.start();
      },
      pause: () => applyBoth((c) => c.pause()),
      reset: () => {
        const next = (pair.jev.getSnapshot().seed + 1) | 0;
        pair.jev.setSeed(next);
        pair.llm.setSeed(next);
      },
    };
  }, [pair]);

  return { jev, llm, session };
}
