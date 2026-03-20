# ai-hot

## One-click deploy

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/yl124915300-dot/ai-hot)

点击上面的按钮后，Render 会直接读取仓库根目录的 `render.yaml`，并部署 `ai-hot-comments-render-oneclick-v2` 服务。

## 当前版本重点

当前这个仓库已经不只是“内容生成器”，而是一个更明确的 MVP：

- 前端：展示业务漏斗、产品矩阵、客户分层、内容模板与私聊话术；
- 中端：生成内容、引流分发包、老板简报样式模板；
- 后端：接咨询、自动分层、推荐对应产品，并把线索沉淀到管理接口。

详细说明见：`ai-hot-comments-render-oneclick-v2/README-RENDER.md`。


## 工程补强

- 业务蓝图已拆到独立配置模块；
- 线索分层逻辑已抽到独立库并补了最小单测；
- 新增 GitHub Actions CI，至少会跑 `node --check src/server.js` 和 `npm test`。
