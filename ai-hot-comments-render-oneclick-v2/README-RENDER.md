# 一键部署到 Render（适合半自动化运营）

这是一个适合快速上线验证的 **中亚资讯内容生成器 + 咨询转化 MVP**。

它现在已经包含：
- 内容生成（热评 / 标题 / 开头钩子 / 短视频脚本 / 商机分析 / 引流文案）
- 网站留资咨询
- Telegram 私域入口展示
- Telegram 咨询接收（Webhook）
- 线索落盘保存
- 管理接口查看咨询和生成记录

## 部署步骤
1. 把项目上传到 GitHub。
2. 去 Render 创建 Blueprint，选择本仓库。现在仓库根目录 `render.yaml` 已可直接识别，默认会部署 `ai-hot-comments-render-oneclick-v2` 这个子目录服务。
3. 在环境变量里至少填写：
   - `OPENAI_API_KEY`
   - `APP_API_KEY`（建议填写，作为后台接口和企业调用口令）
4. 如果你要接 Telegram 咨询：
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_OWNER_CHAT_ID`
   - `TELEGRAM_WEBHOOK_SECRET`
   - `PUBLIC_TELEGRAM_URL`（可选，用于首页展示你的私域入口）
5. 部署完成后，把 Telegram Bot webhook 指到：
   - `https://你的域名/api/integrations/telegram/webhook`

## 关键接口
- `GET /healthz`
- `GET /api/meta`
- `GET /api/distribution-pack?prompt=...&track=...`
- `POST /api/generate-content`
- `POST /api/generate-batch-content`
- `POST /api/consultations`
- `POST /api/integrations/telegram/webhook`
- `GET /api/admin/consultations`（需要 `X-API-Key`）
- `GET /api/admin/generations`（需要 `X-API-Key`）
- `PATCH /api/admin/consultations/:id`（需要 `X-API-Key`）

## 运营建议
### 适合现在就做的
- 用首页跑广告或私域引流；
- 用咨询表单收集线索；
- 把 Telegram 设成你的人工成交入口；
- 用 `distribution-pack` 生成公开引流文案，把流量导进私聊；
- 人工成交，不急着先做硬支付系统。

### 最小成交路径
1. 公域内容引流；
2. 用户进站试用或直接 Telegram 联系；
3. 咨询记录自动保存，并同步提醒到你的 Telegram；
4. 你人工沟通、发样例、报价、成交。

## 本地调试
```bash
cp .env.example .env
npm ci || npm install
npm run dev
# http://localhost:8080
```


## 数据持久化提醒
当前咨询与生成记录默认写本地 JSON 文件，适合 MVP 验证。若你要长期运营，建议下一步改成 Postgres / Supabase，或在支持的付费套餐上挂持久化磁盘。
