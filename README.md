# Jev · Laya · LLM

同一页对照：左侧 Jev，中间本机 Laya，右侧 OpenAI 兼容 LLM。

这不是更强的自动蛇。合法方向和事实（距食物距离、洪水填充、死胡同）仍由代码算出。每个模型每拍只选一个方向。超过截止时间就走代码回退（能直行则直行）。

唯一变量是决策后端。三侧共用种子、策略和节拍。这里比的是延迟、超时、费用和同局里方向是否一致，不是 router 金标分档。

## 运行

```sh
cp .env.example .env
# Jev：TYPESAFE_API_KEY
# LLM：OPENAI_API_KEY、OPENAI_BASE_URL、OPENAI_MODEL
pnpm install
pnpm dev               # 网页 http://localhost:5188，代理 http://127.0.0.1:8787
```

密钥只放在 Hono 代理里。浏览器分别请求 `/api/decide/jev`、`/api/decide/laya` 和 `/api/decide/llm`。缺某一侧时该列返回 503，其余列仍可跑。

本机加 Laya（Node 跑不了权重）。脚本在 `laya/`，本仓库转发 `127.0.0.1:8790`。权重仍走 Hugging Face 缓存；虚拟环境需已装 `laya` 包（`.env` 里设 `LAYA_VENV`，或放到 `laya/.venv`）：

```sh
# .env 里可选：LAYA_VENV=/path/to/.venv
pnpm dev:all           # 先起 Laya:8790，再 pnpm dev
```

或自己：

```sh
./laya/serve.sh
```

本机 macOS 默认 `LAYA_DEVICE=cpu`。走 MPS 时 Metal 可能直接把进程断言杀掉（`IOGPUMetalCommandBuffer`）。纯 CPU 大约几百毫秒到一两秒。缺 Laya 进程时该列 503，另两列照常。

## 看什么

顶部对照条：分数、长度、步数、超时次数、按时返回的平均延迟、估算费用（顺序 Jev / Laya / LLM）。带下划线的一侧更好。

对齐一局：

- 同一个 `seed`（工具栏或 `?seed=1`）
- 同一个策略预设（先「求稳」，再「贪吃」）
- 同一个节拍（先 1200 ms，再试 500 / 2000）

本局结论的对照目标是尽快吃到食物：分数、首食步数、长度优先；接口快但没吃到算不达标。按时率和延迟只作并列。建议用「贪吃」开局。逐步日志在控制台 `[compare]`，也可下载 JSONL。

Jev 参考单价可用 `TYPESAFE_INPUT_USD_PER_MTIME` 覆盖。LLM 费用用 `OPENAI_INPUT_USD_PER_MTIME` 和 `OPENAI_OUTPUT_USD_PER_MTIME`。费用只统计按时返回的调用。

## 目录

- `src/game/engine.ts` — 纯蛇引擎（带种子的随机数）
- `src/game/analysis.ts` — 合法方向和事实
- `src/game/controller.ts` — 固定时钟循环；玩家是 `jev`、`laya` 或 `llm`
- `src/game/oracle.ts` — 策略裁判
- `src/compare/report.ts` — 同局面同向、首次分叉、本局结论
- `src/llm/prompt.ts` — 三侧共用同一套状态和事实
- `server/index.ts` — `/api/decide/jev`、`/api/decide/laya`、`/api/decide/llm`
- `laya/laya_server.py` — 本机 Laya `POST /decide`
- `src/components/` — 共享控件加三列玩家面板

`pnpm test` 与 `pnpm typecheck`。
