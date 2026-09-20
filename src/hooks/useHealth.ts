import { useEffect, useState } from "react";
import type { Player } from "../game/players.ts";

export type Health = Record<Player, boolean | null>;

const EMPTY: Health = { jev: null, laya: null, llm: null };

export function useHealth(intervalMs = 2000) {
  const [health, setHealth] = useState<Health>(EMPTY);

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      try {
        const res = await fetch("/api/health");
        const data = (await res.json()) as Partial<Record<Player, boolean>>;
        if (!cancelled) {
          setHealth({
            jev: Boolean(data.jev),
            laya: Boolean(data.laya),
            llm: Boolean(data.llm),
          });
        }
      } catch {
        if (!cancelled) setHealth({ jev: false, laya: false, llm: false });
      }
    };

    void tick();
    const id = setInterval(() => void tick(), intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [intervalMs]);

  return health;
}
