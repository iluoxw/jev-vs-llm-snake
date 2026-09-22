# pending

- **提交时间**：2026-09-22 14:30:00
- **提交类型**：feat
- **提交分支**：main

## 修改摘要

去掉本机 Laya 权重进程和启动脚本，决策列改为只转发远程 `POST /v1/systemone`。

## 影响文件

| 文件路径 | 变更类型 | 说明 |
|----------|----------|------|
| server/index.ts | 修改 | `/api/decide/laya` 改为请求 `LAYA_URL/v1/systemone`，健康检查走 `/healthz` |
| src/game/players.ts | 修改 | 文案改为远程 API，不再提示本机未就绪 |
| src/components/PlayerHud.tsx | 修改 | Laya 与另外两列一样展示 token 和费用 |
| package.json | 修改 | 删除 `dev:all` |
| scripts/dev-all.sh | 删除 | 不再拉起本机 Laya 进程 |
| laya/laya_server.py | 删除 | 去掉本机 FastAPI 决策服务 |
| laya/serve.sh | 删除 | 去掉本机启动脚本 |
| laya/requirements.txt | 删除 | 去掉本机 Python 依赖 |
| .env.example | 修改 | 只保留 `LAYA_URL`、`LAYA_MODEL`、`LAYA_API_KEY` |
| .gitignore | 修改 | 去掉仅为本机虚拟环境准备的 Python 忽略规则 |
| README.md | 修改 | 运行说明改为只通过 API 接入 Laya |
