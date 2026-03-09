# ai-hot

## 用 ChatGPT 账号快速使用 Codex（推荐 CLI）

最省事的调用方式是 **CLI**。官方支持使用 ChatGPT 账号登录 Codex，并在 **CLI、IDE 扩展、Web、Codex app** 中使用。

> 提示：Codex Web 需要先把 ChatGPT 账号连接到 GitHub。

### 1）先确认账号可用

根据官方说明，Codex 可通过 ChatGPT 账号使用（不同计划可用性会随时间调整，请以帮助中心页面为准）。

### 2）安装 CLI

```bash
npm i -g @openai/codex
```

如果你以前使用 API Key 登录过 Codex，建议先执行：

```bash
codex logout
codex
```

这样可切换到 ChatGPT 订阅登录流程。

### 3）进入项目并登录

```bash
cd uzbiz_agent
codex
```

启动后按提示登录你的 ChatGPT 账号。

### 4）给出明确任务（可直接复制）

```text
目标：
为乌兹商机 agent 增加真实 Telegram 抓取、自动化规则引擎、审核池和管理员提醒。

范围：
允许修改整个项目，但保持目录尽量精简。

约束：
1. 保留 /health /today /risk /digest
2. 保留 Telegram Bot 命令
3. 继续支持 mock 模式
4. 代码尽量简单，避免过度抽象

验收标准：
1. 支持 TG_API_ID、TG_API_HASH、TG_SOURCE_CHANNELS
2. 支持定时抓取和规则处理
3. 支持审核池 pending/approved/rejected/published
4. 支持管理员提醒
5. 项目可启动，无语法错误

输出：
1. 直接修改代码
2. 给出改动摘要
3. 给出运行命令
4. 列出新增环境变量
```

### 5）其他可选入口

- **IDE 扩展**（VS Code、Cursor、Windsurf 等）
- **Web**（需要连接 GitHub）
- **Codex app**（适合并行任务）
- **SDK / Slack**（适合程序化或协作触发）

---

参考：

- [Using Codex with your ChatGPT plan | OpenAI Help Center](https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan/)
- [Codex in ChatGPT / clients overview | OpenAI Help Center](https://help.openai.com/en/articles/11369540-icodex-in-chatgpt)
