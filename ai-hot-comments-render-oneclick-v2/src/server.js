import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { OpenAI } from 'openai';
import { config, validateConfig } from './config.js';
import { JsonStore } from './store.js';
import { TelegramSource, sendBotMessage } from './telegram.js';

const logger = {
  info: (obj, msg) => console.log(msg || obj, msg ? obj : ''),
  warn: (obj, msg) => console.warn(msg || obj, msg ? obj : ''),
  error: (obj, msg) => console.error(msg || obj, msg ? obj : ''),
};

validateConfig(logger);

const openai = config.openaiApiKey ? new OpenAI({ apiKey: config.openaiApiKey }) : null;
const store = new JsonStore(config.dataDir, logger);
store.init();

const tgSource = new TelegramSource(config, logger);
await tgSource.init().catch((error) => {
  logger.error({ error: String(error) }, '[telegram] 初始化失败，自动降级 mock');
  config.mode = 'mock';
  config.isLive = false;
});
logger.info(`[mode] current=${config.mode} live=${config.isLive}`);

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(morgan('tiny'));

function runAnalyze(text) {
  const riskScore = config.riskKeywords.some((k) => text.includes(k)) ? 0.92 : 0.12;
  const leadScore = config.leadKeywords.some((k) => text.includes(k)) ? 0.91 : 0.15;
  return {
    riskScore,
    leadScore,
    tags: [...config.riskKeywords.filter((k) => text.includes(k)), ...config.leadKeywords.filter((k) => text.includes(k))],
  };
}

async function generateDraft(message) {
  const fallback = `【草稿】围绕“${message.text.slice(0, 40)}”输出观点 + 行动建议。`;
  if (!openai) return fallback;
  try {
    const resp = await openai.chat.completions.create({
      model: config.model,
      messages: [
        { role: 'system', content: config.systemPrompt },
        { role: 'user', content: `请对以下线索生成一条可发布中文短内容：\n${message.text}` },
      ],
      temperature: 0.4,
      max_tokens: 180,
    });
    return resp.choices?.[0]?.message?.content?.trim() || fallback;
  } catch (error) {
    logger.error({ error: String(error) }, '[llm] 生成失败，使用兜底草稿');
    return fallback;
  }
}

function canTransition(from, to) {
  const allowed = {
    pending: new Set(['approved', 'rejected']),
    approved: new Set(['published', 'rejected']),
    rejected: new Set([]),
    published: new Set([]),
  };
  return allowed[from]?.has(to) || false;
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

async function runPipeline(trigger = 'manual') {
  if (store.state.meta.pipelineRunning) {
    return { ok: true, skipped: true, reason: 'already-running' };
  }
  const lockWindowMs = 30_000;
  const now = Date.now();
  const lastRunAt = store.state.meta.lastRunAt || 0;
  if (now - lastRunAt < lockWindowMs) {
    return { ok: true, skipped: true, reason: 'run-throttled' };
  }
  store.state.meta.pipelineRunning = true;
  store.state.meta.lastRunAt = now;

  const run = { id: `run-${now}`, trigger, ts: now, status: 'running' };
  store.state.runs.unshift(run);
  try {
    const messages = await tgSource.fetchLatest(25);
    const { added, addedIds } = store.upsertMessages(messages);
    const addedSet = new Set(addedIds);
    const newMsgs = messages.filter((m) => addedSet.has(m.id));

    const insights = [];
    const reviewCandidates = [];
    for (const msg of newMsgs) {
      if (!msg.text) continue;
      const analysis = runAnalyze(msg.text);
      const insightId = `insight-${msg.id}`;
      if (store.state.insights.some((i) => i.id === insightId)) continue;
      const insight = {
        id: insightId,
        messageId: msg.id,
        channel: msg.channel,
        ts: msg.ts,
        ...analysis,
      };
      store.state.insights.unshift(insight);
      insights.push(insight);
      if (analysis.leadScore >= 0.85) {
        const leadId = `lead-${msg.id}`;
        if (!store.state.leads.some((x) => x.id === leadId)) {
          store.state.leads.unshift({ id: leadId, messageId: msg.id, ts: Date.now(), status: 'open' });
        }
      }
      if (analysis.riskScore >= 0.8 || analysis.leadScore >= 0.85) {
        const draft = await generateDraft(msg);
        reviewCandidates.push({
          id: `review-${msg.id}`,
          messageId: msg.id,
          status: 'pending',
          draft,
          riskScore: analysis.riskScore,
          leadScore: analysis.leadScore,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          publishError: null,
        });
      }
    }
    const reviewAdded = store.upsertReviewItems(reviewCandidates);

    const dedupeKey = `${todayDate()}-${Math.floor(now / 3600000)}`;
    const highRiskCount = insights.filter((x) => x.riskScore >= 0.8).length;
    const highLeadCount = insights.filter((x) => x.leadScore >= 0.85).length;
    if ((highRiskCount > 0 || highLeadCount > 0) && !store.state.alerts.some((a) => a.key === dedupeKey)) {
      store.state.alerts.unshift({ key: dedupeKey, highRiskCount, highLeadCount, ts: now });
      if (config.adminChatId) {
        await sendBotMessage(config, logger, config.adminChatId, `提醒：高风险 ${highRiskCount} 条，高商机 ${highLeadCount} 条。`);
      }
    }

    if (config.autoRun && Number(new Date().getUTCHours()) === config.digestHour) {
      const date = todayDate();
      if (store.state.meta.lastDigestDate !== date) {
        store.state.meta.lastDigestDate = date;
        if (config.adminChatId) {
          await sendBotMessage(config, logger, config.adminChatId, `日报 ${date}：新增消息 ${added}，待审核 ${reviewAdded}。`);
        }
      }
    }

    run.status = 'ok';
    run.result = { added, reviewAdded };
    store.state.meta.pipelineRunning = false;
    await store.flush();
    return { ok: true, added, reviewAdded };
  } catch (error) {
    run.status = 'failed';
    run.error = String(error);
    store.state.meta.pipelineRunning = false;
    await store.flush();
    logger.error({ error: String(error) }, '[pipeline] 执行失败');
    return { ok: false, error: String(error) };
  }
}

async function publishReviewItem(item) {
  if (item.status !== 'approved') {
    return { ok: false, error: 'only-approved-can-publish' };
  }
  if (!config.allowManualPublish) {
    return { ok: false, error: 'publish-disabled' };
  }
  if (!config.adminChatId) {
    return { ok: false, error: 'missing-admin-chat-id' };
  }
  const result = await sendBotMessage(config, logger, config.adminChatId, `发布内容：\n${item.draft}`);
  if (!result.ok) {
    item.publishError = result.reason;
    item.updatedAt = Date.now();
    return { ok: false, error: result.reason };
  }
  item.status = 'published';
  item.updatedAt = Date.now();
  return { ok: true };
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, mode: config.mode, live: config.isLive, ts: new Date().toISOString() });
});
app.get('/healthz', (_req, res) => res.json({ ok: true }));

app.get('/today', (_req, res) => {
  const date = todayDate();
  const todayMessages = store.state.messages.filter((x) => new Date(x.ts).toISOString().slice(0, 10) === date);
  res.json({ date, count: todayMessages.length, items: todayMessages.slice(0, 30) });
});

app.get('/risk', (_req, res) => {
  const items = store.state.insights.filter((x) => x.riskScore >= 0.8).slice(0, 30);
  res.json({ count: items.length, items });
});

app.get('/digest', (_req, res) => {
  res.json({
    messages: store.state.messages.length,
    insights: store.state.insights.length,
    pending: store.state.reviewItems.filter((x) => x.status === 'pending').length,
    published: store.state.reviewItems.filter((x) => x.status === 'published').length,
  });
});

app.post('/pipeline/run', async (_req, res) => {
  const result = await runPipeline('api');
  res.status(result.ok ? 200 : 500).json(result);
});

app.get('/pending', (_req, res) => {
  const items = store.state.reviewItems.filter((x) => x.status === 'pending').slice(0, 50);
  res.json({ count: items.length, items });
});

function parseId(raw) {
  if (!raw) return null;
  const id = String(raw).trim();
  return id ? id : null;
}

async function updateReviewStatus(id, nextStatus) {
  const item = store.state.reviewItems.find((x) => x.id === id);
  if (!item) return { ok: false, error: 'not-found' };
  if (!canTransition(item.status, nextStatus)) return { ok: false, error: 'invalid-transition' };
  item.status = nextStatus;
  item.updatedAt = Date.now();
  await store.flush();
  return { ok: true, item };
}

app.post('/approve', async (req, res) => {
  const id = parseId(req.body?.id);
  if (!id) return res.status(400).json({ error: 'id required' });
  const result = await updateReviewStatus(id, 'approved');
  res.status(result.ok ? 200 : 400).json(result);
});

app.post('/reject', async (req, res) => {
  const id = parseId(req.body?.id);
  if (!id) return res.status(400).json({ error: 'id required' });
  const result = await updateReviewStatus(id, 'rejected');
  res.status(result.ok ? 200 : 400).json(result);
});

app.post('/publish', async (req, res) => {
  const id = parseId(req.body?.id);
  if (!id) return res.status(400).json({ error: 'id required' });
  const item = store.state.reviewItems.find((x) => x.id === id);
  if (!item) return res.status(404).json({ error: 'not-found' });
  const result = await publishReviewItem(item);
  await store.flush();
  res.status(result.ok ? 200 : 400).json(result);
});

function commandAllowed(chatId) {
  if (config.commandChatAllowlist.length === 0) return true;
  return config.commandChatAllowlist.includes(String(chatId));
}

async function handleBotCommand(text, chatId) {
  const [cmd, arg] = String(text || '').trim().split(/\s+/, 2);
  if (!cmd) return '空命令';
  if (!commandAllowed(chatId)) return '当前 chat 未授权执行命令。';

  try {
    if (cmd === '/start') return `服务运行中，模式：${config.mode}`;
    if (cmd === '/today') return JSON.stringify({ count: store.state.messages.length });
    if (cmd === '/risk') return JSON.stringify(store.state.insights.filter((x) => x.riskScore >= 0.8).slice(0, 5));
    if (cmd === '/digest') return JSON.stringify({ pending: store.state.reviewItems.filter((x) => x.status === 'pending').length });
    if (cmd === '/run') return JSON.stringify(await runPipeline('bot'));
    if (cmd === '/lead') return JSON.stringify(store.state.leads.slice(0, 10));
    if (cmd === '/pending') return JSON.stringify(store.state.reviewItems.filter((x) => x.status === 'pending').slice(0, 10));
    if (cmd === '/approve') {
      if (!arg) return '用法: /approve review-xxx';
      return JSON.stringify(await updateReviewStatus(arg, 'approved'));
    }
    if (cmd === '/reject') {
      if (!arg) return '用法: /reject review-xxx';
      return JSON.stringify(await updateReviewStatus(arg, 'rejected'));
    }
    if (cmd === '/publish') {
      if (!arg) return '用法: /publish review-xxx';
      const item = store.state.reviewItems.find((x) => x.id === arg);
      if (!item) return 'not-found';
      const result = await publishReviewItem(item);
      await store.flush();
      return JSON.stringify(result);
    }
    return '未知命令，支持: /start /today /risk /digest /run /lead /pending /approve /reject /publish';
  } catch (error) {
    logger.error({ error: String(error), cmd }, '[bot] 命令处理失败');
    return `命令处理失败: ${String(error)}`;
  }
}

app.post('/bot/webhook', async (req, res) => {
  const message = req.body?.message;
  const text = message?.text;
  const chatId = message?.chat?.id;
  if (!text || !chatId) return res.json({ ok: true, ignored: true });
  const reply = await handleBotCommand(text, String(chatId));
  await sendBotMessage(config, logger, String(chatId), reply);
  res.json({ ok: true });
});

setInterval(async () => {
  if (!config.autoRun) return;
  const result = await runPipeline('timer');
  if (!result.ok) logger.error({ result }, '[timer] pipeline 失败');
}, config.pollMs);

app.listen(config.port, () => {
  logger.info(`[boot] listening=${config.port} mode=${config.mode} channels=${config.tgSourceChannels.length}`);
});
