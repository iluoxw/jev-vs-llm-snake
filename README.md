# Jev 对 LLM

同一页对照：左侧 Jev，右侧 OpenAI 兼容 LLM。

这不是更强的自动蛇。合法方向和事实（距食物距离、洪水填充、死胡同）仍由代码算出。每个模型每拍只选一个方向。超过截止时间就走代码回退（能直行则直行）。

唯一变量是决策后端。两侧共用种子、策略和节拍。

## 运行

```sh
cp .env.example .env
# Jev：TYPESAFE_API_KEY
# LLM：OPENAI_API_KEY、OPENAI_BASE_URL、OPENAI_MODEL
pnpm install
pnpm dev               # 网页 http://localhost:5188，代理 http://127.0.0.1:8787
```

密钥只放在 Hono 代理里。浏览器分别请求 `/api/decide/jev` 和 `/api/decide/llm`。缺某一侧密钥时该侧返回 503，另一侧仍可跑。

## 看什么

顶部对照条：分数、长度、步数、超时次数、按时返回的平均延迟、估算费用。带下划线的一侧更好（分数/长度更高，超时/延迟/费用更低）。

每列：棋盘、截止条、状态、当前决策、记录。

对齐一局：

- 同一个 `seed`（工具栏或 `?seed=1`）
- 同一个策略预设（先「求稳」，再「贪吃」）
- 同一个节拍（先 1200 ms，再试 500 / 2000）

Jev 参考单价（TypeSafe 2026-09 公开标价）：**每百万输入 token $0.042**，输出不计。可用 `TYPESAFE_INPUT_USD_PER_MTIME` 覆盖。

LLM 费用用 `OPENAI_INPUT_USD_PER_MTIME` 和 `OPENAI_OUTPUT_USD_PER_MTIME`，按你实际调用的模型填写。

费用只统计**按时返回**的调用。超时或中断的请求上游仍可能计费。

Jev 会返回校准后的概率和置信度。LLM 侧把选中方向画成 1.0，置信度留空。对比看选择、超时率、延迟和花费，不要看概率条。

## 目录

- `src/game/engine.ts` — 纯蛇引擎（带种子的随机数）
- `src/game/analysis.ts` — 合法方向和事实
- `src/game/controller.ts` — 固定时钟循环；玩家是 `jev` 或 `llm`
- `src/llm/prompt.ts` — 两侧共用同一套状态和事实
- `server/index.ts` — `/api/decide/jev` 走 TypeSafe，`/api/decide/llm` 走 chat completions
- `src/components/` — 共享控件加两列玩家面板

`pnpm test` 与 `pnpm typecheck`。
