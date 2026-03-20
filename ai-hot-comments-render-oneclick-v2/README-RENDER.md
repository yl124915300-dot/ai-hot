# 一键部署到 Render（适合半自动化运营）

这是一个适合快速上线验证的 **乌兹/中亚机会情报内容台 + 咨询转化 MVP**。

这次已经把业务骨架直接砸进产品里，核心思路不是“做一个资讯站”，而是：

> 前端内容引流 + 中端情报产品 + 后端高价服务成交。

频道不是终点，频道只是筛客户的漏斗口。

## 现在包含什么
- 内容生成（热评 / 标题 / 开头钩子 / 短视频脚本 / 商机分析 / 引流文案）
- 分发包生成（免费版、付费版预览、老板视角、私聊跟进要点）
- 首页直接展示业务漏斗、产品矩阵、客户分层、6 个最小 Agent、首月执行清单
- Telegram 内容模板示例（免费快讯 / 机会卡 / 老板简报）
- 网站留资咨询
- 咨询自动分层（个人用户 / 小团队 / 老板公司）
- 推荐产品自动回填（低价包 / 定制监控 / 进入诊断等）
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
- `GET /api/blueprint`
- `GET /api/distribution-pack?prompt=...&track=...`
- `POST /api/generate-content`
- `POST /api/generate-batch-content`
- `POST /api/consultations`
- `POST /api/integrations/telegram/webhook`
- `GET /api/admin/consultations`（需要 `X-API-Key`）
- `GET /api/admin/generations`（需要 `X-API-Key`）
- `PATCH /api/admin/consultations/:id`（需要 `X-API-Key`）

## 新的落地方式
### 首页新增的产品化模块
- **业务漏斗**：把“信息源 → 成交 → 案例沉淀”完整展现出来；
- **产品矩阵**：免费层、低价层、中价层、高价层直接给出定位和价格区间；
- **6 个 Agent**：把侦察、清洗、分类、判断、拆解、分发做成清晰分工；
- **客户分层**：个人用户、小团队、老板/公司分别对应不同产品；
- **首月执行清单**：按周显示，适合直接拿去跑前 30 天；
- **私聊话术**：首页可直接拿来成交使用。

### 咨询自动分层
提交咨询时，系统会基于公司、预算、需求关键词，给线索自动打一个最小客户层级：
- 个人用户
- 小团队
- 老板/公司

并同步生成推荐产品，方便你在私聊里更快报价和推进。

## 最小成交路径
1. 公域内容引流；
2. 用户进站看产品结构、内容样例和 Telegram 模板；
3. 用户提交咨询或直接进 Telegram；
4. 系统自动落盘，并尝试生成客户层级与推荐产品；
5. 你人工沟通、发样例、报价、成交。

## 本地调试
```bash
cd ai-hot-comments-render-oneclick-v2
npm ci || npm install
npm run dev
# http://localhost:8080
```

## 数据持久化提醒
当前咨询与生成记录默认写本地 JSON 文件，适合 MVP 验证。若你要长期运营，建议下一步改成 Postgres / Supabase，或在支持的付费套餐上挂持久化磁盘。

## 下一步建议
如果你后面要继续往下砸，优先顺序建议是：
1. 把真实信息源接入侦察 Agent；
2. 给分类/判断 Agent 增加标签体系与评分字段；
3. 把低价包、诊断会、定制监控做成可复制的报价模板；
4. 再补自动化分发和平台感。
