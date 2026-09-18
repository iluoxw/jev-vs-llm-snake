export type Player = "jev" | "llm";

export const PLAYER_META: Record<
  Player,
  {
    id: Player;
    label: string;
    short: string;
    ask: string;
    wait: string;
    late: string;
    won: string;
    api: string;
  }
> = {
  jev: {
    id: "jev",
    label: "Jev",
    short: "JEV",
    ask: "正在询问 Jev",
    wait: "等待 Jev 回复",
    late: "Jev 超过截止时间才回复",
    won: "Jev 赢了",
    api: "TYPESAFE 实时接口",
  },
  llm: {
    id: "llm",
    label: "LLM",
    short: "LLM",
    ask: "正在询问 LLM",
    wait: "等待 LLM 回复",
    late: "LLM 超过截止时间才回复",
    won: "LLM 赢了",
    api: "OpenAI 兼容接口",
  },
};
