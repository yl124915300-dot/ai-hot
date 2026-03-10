# AI Hot Final Base (可部署稳定版)

这是一个**极简、可真实部署**的 Telegram 线索抓取 + 自动分析 + 审核发布基础工程。

## 关键能力

- Telegram 抓取：**仅 API 客户端方式（GramJS）**，不使用 `https://t.me/s/...` HTML scraping。
- mock/live 双模式：
  - 配置完整时进入 live；
  - 关键配置缺失自动降级 mock，并打印告警。
- 自动化流水线：抓取 → 分析 → 草稿生成 → 审核池入池 → 高风险/高商机提醒 → 日报。
- 审核池状态机：`pending -> approved/rejected -> published`（禁止非法跳转）。
- 发布风控：
  - 未 `approved` 不可发布；
  - `ALLOW_MANUAL_PUBLISH=true` 前默认禁止外发；
  - 发布失败会记录错误原因。
- Bot 命令：`/start /today /risk /digest /run /lead /pending /approve /reject /publish`

## API / 命令

- `GET /health`、`GET /healthz`
- `GET /today`
- `GET /risk`
- `GET /digest`
- `POST /pipeline/run`
- `GET /pending`
- `POST /approve { id }`
- `POST /reject { id }`
- `POST /publish { id }`
- `POST /bot/webhook`（Telegram Webhook 回调）

## 环境变量

### live 必需（用于真实 Telegram 抓取）
- `TG_API_ID`
- `TG_API_HASH`
- `TG_SESSION_STRING`
- `TG_SOURCE_CHANNELS`（逗号分隔，如 `channelA,@channelB`）

### 可选（建议）
- `APP_MODE=mock|live`（不填时自动判断）
- `PORT`（默认 `8080`）
- `OPENAI_API_KEY`（不填则规则化兜底）
- `OPENAI_MODEL`（默认 `gpt-4o-mini`）
- `TG_BOT_TOKEN`（启用 Bot 命令/提醒）
- `ADMIN_CHAT_ID`（管理员提醒和默认发布目标）
- `AUTO_RUN=true|false`（默认 true）
- `POLL_MS`（默认 300000）
- `DIGEST_HOUR`（UTC 小时，默认 9）
- `ALLOW_MANUAL_PUBLISH=true|false`（默认 false）
- `RISK_KEYWORDS`
- `LEAD_KEYWORDS`
- `COMMAND_CHAT_ALLOWLIST`
- `DATA_DIR`（默认 `data`）

## 启动

```bash
npm install
npm start
```

健康检查：`GET /health`

## Telegram 抓取支持范围说明

- 当前实现基于 Telegram 客户端 API（GramJS）抓取 `TG_SOURCE_CHANNELS` 历史消息。
- 对于私有频道/受限频道，需要会话账号本身有访问权限。
- 任一频道抓取失败会记录错误并跳过，不会导致服务崩溃。

## 部署（Render / Replit）

- Node 20+ 即可。
- 无 live 配置时依然可在 mock 模式启动，便于先验收流程。
