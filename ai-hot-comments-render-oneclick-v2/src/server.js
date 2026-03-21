import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { OpenAI } from 'openai';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { AGENT_DEFINITIONS, BUSINESS_BLUEPRINT, CHAT_SCRIPTS, CONTENT_TEMPLATES } from './config/businessBlueprint.js';
import { scoreLead } from './lib/leadScoring.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const CONSULTATIONS_FILE = path.join(DATA_DIR, 'consultations.json');
const GENERATIONS_FILE = path.join(DATA_DIR, 'generations.json');
const TELEGRAM_UPDATES_FILE = path.join(DATA_DIR, 'telegram_updates.json');

const app = express();
const PORT = Number(process.env.PORT || 8080);
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT || '你是一个面向中文社媒与中亚市场的内容生成助手，擅长把资讯或主题改写成可直接使用的评论、标题、钩子、短视频脚本和商机分析。';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const REQUIRE_API_KEY = String(process.env.REQUIRE_API_KEY || 'false').toLowerCase() === 'true';
const APP_API_KEY = process.env.APP_API_KEY || '';
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60000);
const RATE_LIMIT_MAX_REQUESTS = Number(process.env.RATE_LIMIT_MAX_REQUESTS || 20);
const MAX_BATCH_SIZE = Math.max(1, Number(process.env.MAX_BATCH_SIZE || 5));
const LOG_PROMPTS = String(process.env.LOG_PROMPTS || 'false').toLowerCase() === 'true';
const APP_NAME = process.env.PUBLIC_APP_NAME || '乌兹机会情报台';
const APP_TAGLINE = process.env.PUBLIC_APP_TAGLINE || '把“内容引流 + 情报产品 + 高价服务成交”先跑成一个能落地的最小闭环。';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_OWNER_CHAT_ID = process.env.TELEGRAM_OWNER_CHAT_ID || '';
const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || '';
const PUBLIC_TELEGRAM_URL = process.env.PUBLIC_TELEGRAM_URL || '';
const SALES_CTA_TEXT = process.env.SALES_CTA_TEXT || '先看内容样例，再进私聊做诊断 / 定向监控 / 老板简报';

const TRACKS = {
  general: {
    label: '通用',
    angle: '提炼重点、商机和风险，语言直接实用。'
  },
  logistics: {
    label: '物流',
    angle: '突出时效、清关、运费波动、交付风险与备货提醒。'
  },
  policy: {
    label: '政策',
    angle: '突出政策变化、窗口期、准入门槛、税务和合规影响。'
  },
  building_materials: {
    label: '建材',
    angle: '突出项目机会、渠道需求、工程落地和采购信号。'
  },
  electronics: {
    label: '电子',
    angle: '突出选品机会、价格带、渠道空缺和售后竞争力。'
  }
};

const TASK_TYPES = {
  hot_comment: {
    label: '热评',
    instruction: '生成 1 条适合中文社媒发布的热评，口语自然，像真实用户，不要解释。'
  },
  title: {
    label: '标题',
    instruction: '生成 3 条适合短视频或图文封面的标题，突出冲击感和传播性。'
  },
  hook: {
    label: '开头钩子',
    instruction: '生成 3 条适合短视频前 3 秒的开头钩子，要短、狠、直接。'
  },
  short_script: {
    label: '短视频脚本',
    instruction: '生成 1 版 120~220 字的短视频口播脚本，包含开头钩子、主体和结尾 CTA。'
  },
  business_angle: {
    label: '商机分析',
    instruction: '输出结构化分析，至少包含：核心事实、商业机会、风险点、建议动作。'
  },
  traffic_post: {
    label: '引流文案',
    instruction: '生成 1 版适合 Telegram/微信群/朋友圈发布的引流文案，目标是把流量导向私聊咨询或加群。'
  }
};

ensureJsonFile(CONSULTATIONS_FILE);
ensureJsonFile(GENERATIONS_FILE);
ensureJsonFile(TELEGRAM_UPDATES_FILE);

app.use(cors({ origin: CORS_ORIGIN === '*' ? true : CORS_ORIGIN.split(',').map((item) => item.trim()) }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('tiny'));

const apiKey = process.env.OPENAI_API_KEY;
const openai = apiKey ? new OpenAI({ apiKey }) : null;
const rateLimitStore = new Map();

function ensureJsonFile(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, '[]\n', 'utf8');
  }
}

function readJsonArray(filePath) {
  ensureJsonFile(filePath);
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeJsonArray(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function appendJsonItem(filePath, item) {
  const data = readJsonArray(filePath);
  data.unshift(item);
  writeJsonArray(filePath, data.slice(0, 1000));
}

function createId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function nowIso() {
  return new Date().toISOString();
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function requireAppApiKey(req, res, next) {
  if (!REQUIRE_API_KEY) return next();
  const token = req.headers['x-api-key'];
  if (!APP_API_KEY || token !== APP_API_KEY) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  return next();
}

function requireAdmin(req, res, next) {
  const token = req.headers['x-api-key'];
  if (!APP_API_KEY || token !== APP_API_KEY) {
    return res.status(401).json({ error: 'admin_unauthorized' });
  }
  return next();
}

function rateLimit(req, res, next) {
  const ip = getClientIp(req);
  const now = Date.now();
  const current = rateLimitStore.get(ip);

  if (!current || now - current.windowStart >= RATE_LIMIT_WINDOW_MS) {
    rateLimitStore.set(ip, { count: 1, windowStart: now });
    return next();
  }

  if (current.count >= RATE_LIMIT_MAX_REQUESTS) {
    return res.status(429).json({
      error: 'rate_limit_exceeded',
      retryAfterMs: RATE_LIMIT_WINDOW_MS - (now - current.windowStart)
    });
  }

  current.count += 1;
  return next();
}

function normalizeTrack(track) {
  return TRACKS[track] ? track : 'general';
}

function normalizeTaskType(taskType) {
  return TASK_TYPES[taskType] ? taskType : 'hot_comment';
}

function validatePrompt(prompt) {
  if (!prompt || typeof prompt !== 'string') {
    return 'prompt 必填';
  }
  if (prompt.length > 3000) {
    return 'prompt 过长，建议控制在 3000 字以内';
  }
  return null;
}

function sanitizeText(value, maxLength = 1000) {
  if (value === undefined || value === null) return '';
  return String(value).trim().slice(0, maxLength);
}

function buildUserPrompt({ prompt, tone = '直接实用', length = 80, track = 'general', taskType = 'hot_comment' }) {
  const safeTrack = normalizeTrack(track);
  const safeTaskType = normalizeTaskType(taskType);
  const trackConfig = TRACKS[safeTrack];
  const taskConfig = TASK_TYPES[safeTaskType];

  return [
    `赛道：${trackConfig.label}`,
    `赛道要求：${trackConfig.angle}`,
    `任务类型：${taskConfig.label}`,
    `语气：${tone}`,
    `长度参考：${length}`,
    `输入内容：${prompt}`,
    `输出要求：${taskConfig.instruction}`,
    '补充要求：如果信息本身具备机会属性，请优先输出“谁适合做、为什么现在值得关注、第一步动作、风险提醒”。',
    '转化目标：内容最终要服务于引流到私域、咨询成交或企业合作。',
    '如果输出多条，请使用清晰编号；不要写多余说明。'
  ].join('\n');
}

function buildLocalFallback({ prompt, tone, length, track, taskType }) {
  const preview = prompt.slice(0, 36);
  const safeTrack = normalizeTrack(track);
  const safeTaskType = normalizeTaskType(taskType);
  const trackLabel = TRACKS[safeTrack].label;
  const taskLabel = TASK_TYPES[safeTaskType].label;

  return `【本地模式】${trackLabel}｜${taskLabel}｜${tone}｜~${length}字\n${preview}${prompt.length > 36 ? '…' : ''}`;
}

async function generateSingleContent({ prompt, tone = '直接实用', length = 80, track = 'general', taskType = 'hot_comment' }) {
  const payload = { prompt, tone, length, track, taskType };

  if (!openai) {
    return buildLocalFallback(payload);
  }

  const userPrompt = buildUserPrompt(payload);
  const resp = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.7,
    max_tokens: 700
  });

  return resp.choices?.[0]?.message?.content?.trim() || '';
}

function buildDistributionPack({ prompt, track = 'general' }) {
  const safeTrack = normalizeTrack(track);
  const trackLabel = TRACKS[safeTrack].label;
  return {
    publicPost: `【${trackLabel}机会提醒】${prompt.slice(0, 80)}${prompt.length > 80 ? '…' : ''}\n这条不只是新闻，更像一个可验证的窗口。想拿完整拆解、动作建议或老板简报版，私聊我。`,
    paidPreview: ['【付费版会补充】', '1. 这条机会为什么值得推', '2. 谁适合做', '3. 建议第一步', '4. 核心风险点'].join('\n'),
    bossBrief: ['【老板视角】', '结论：值得关注，但先轻验证。', '进入建议：小批量试单 + 本地渠道核验 + 付款条件前置确认。', '我方可协助：定向监控 / 二次验证 / 本地对接。'].join('\n'),
    privateFollowup: '你好，我看你对这个方向感兴趣。我可以先给你一版样例拆解，再判断你更适合周机会包、定向监控，还是直接做机会诊断。',
    salesChecklist: [
      '先确认客户是个人 / 小团队 / 老板',
      '判断客户更需要低价包、诊断会还是定制监控',
      '先发 1 份样例，再推进语音或私聊成交'
    ]
  };
}

function saveGenerationLog({ requestType, prompt, taskType, track, tone, length, count, outputs, source = 'web' }) {
  const item = {
    id: createId('gen'),
    createdAt: nowIso(),
    requestType,
    prompt: sanitizeText(prompt, 3000),
    taskType: normalizeTaskType(taskType),
    track: normalizeTrack(track),
    tone: sanitizeText(tone, 100),
    length: Number(length || 0),
    count: Number(count || 1),
    outputs,
    source
  };
  appendJsonItem(GENERATIONS_FILE, item);
  return item;
}

function createConsultation(payload) {
  const { segment, recommendedOffer } = scoreLead(payload);
  const item = {
    id: createId('consult'),
    createdAt: nowIso(),
    name: sanitizeText(payload.name, 100),
    contact: sanitizeText(payload.contact, 200),
    company: sanitizeText(payload.company, 200),
    demand: sanitizeText(payload.demand, 3000),
    budget: sanitizeText(payload.budget, 100),
    source: sanitizeText(payload.source || 'website', 100),
    track: normalizeTrack(payload.track || 'general'),
    notes: sanitizeText(payload.notes, 1000),
    telegramUserId: sanitizeText(payload.telegramUserId, 100),
    telegramChatId: sanitizeText(payload.telegramChatId, 100),
    status: sanitizeText(payload.status || 'new', 50),
    segment,
    recommendedOffer
  };
  appendJsonItem(CONSULTATIONS_FILE, item);
  return item;
}

function listConsultations() {

  return readJsonArray(CONSULTATIONS_FILE);
}

function listGenerations() {
  return readJsonArray(GENERATIONS_FILE);
}

function updateConsultation(id, patch) {
  const consultations = readJsonArray(CONSULTATIONS_FILE);
  const index = consultations.findIndex((item) => item.id === id);
  if (index === -1) {
    return null;
  }

  consultations[index] = {
    ...consultations[index],
    status: sanitizeText(patch.status || consultations[index].status, 50),
    notes: sanitizeText(patch.notes ?? consultations[index].notes, 1000),
    updatedAt: nowIso()
  };

  writeJsonArray(CONSULTATIONS_FILE, consultations);
  return consultations[index];
}

async function sendTelegramMessage(chatId, text) {
  if (!TELEGRAM_BOT_TOKEN || !chatId || !text) {
    return { ok: false, skipped: true };
  }

  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text.slice(0, 3900)
    })
  });

  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, data };
}

async function notifyOwnerConsultation(consultation) {
  if (!TELEGRAM_OWNER_CHAT_ID) {
    return { ok: false, skipped: true };
  }

  const text = [
    '📥 新咨询线索',
    `ID: ${consultation.id}`,
    `姓名: ${consultation.name || '未填写'}`,
    `联系方式: ${consultation.contact || '未填写'}`,
    `公司: ${consultation.company || '未填写'}`,
    `客户层级: ${consultation.segment || '未识别'}`,
    `推荐产品: ${consultation.recommendedOffer || '未生成'}`,
    `赛道: ${TRACKS[consultation.track]?.label || consultation.track}`,
    `来源: ${consultation.source || 'unknown'}`,
    `预算: ${consultation.budget || '未填写'}`,
    `需求: ${consultation.demand || '未填写'}`
  ].join('\n');

  return sendTelegramMessage(TELEGRAM_OWNER_CHAT_ID, text);
}

function verifyTelegramWebhook(req) {
  if (!TELEGRAM_WEBHOOK_SECRET) {
    return true;
  }
  return req.headers['x-telegram-bot-api-secret-token'] === TELEGRAM_WEBHOOK_SECRET;
}

function parseTelegramConsultation(update) {
  const message = update?.message || update?.edited_message;
  if (!message) return null;

  const text = sanitizeText(message.text || message.caption || '', 3000);
  const from = message.from || {};
  const chat = message.chat || {};

  return {
    name: [from.first_name, from.last_name].filter(Boolean).join(' ') || from.username || 'Telegram用户',
    contact: from.username ? `@${from.username}` : String(from.id || ''),
    company: '',
    demand: text || '用户发送了非文本咨询，请人工查看 Telegram。',
    budget: '',
    source: 'telegram_bot',
    track: 'general',
    telegramUserId: String(from.id || ''),
    telegramChatId: String(chat.id || '')
  };
}

app.get('/healthz', (_req, res) => {
  res.json({
    ok: true,
    service: 'ai-hot-comments',
    model: MODEL,
    openaiConfigured: Boolean(apiKey),
    telegramConfigured: Boolean(TELEGRAM_BOT_TOKEN && TELEGRAM_OWNER_CHAT_ID),
    requireApiKey: REQUIRE_API_KEY,
    supportedTracks: Object.keys(TRACKS),
    supportedTaskTypes: Object.keys(TASK_TYPES),
    dataFiles: {
      consultations: CONSULTATIONS_FILE,
      generations: GENERATIONS_FILE
    },
    rateLimit: {
      windowMs: RATE_LIMIT_WINDOW_MS,
      maxRequests: RATE_LIMIT_MAX_REQUESTS
    },
    time: nowIso()
  });
});

app.get('/api/meta', (_req, res) => {
  res.json({
    appName: APP_NAME,
    tagline: APP_TAGLINE,
    tracks: TRACKS,
    taskTypes: TASK_TYPES,
    salesCtaText: SALES_CTA_TEXT,
    publicTelegramUrl: PUBLIC_TELEGRAM_URL,
    model: MODEL,
    openaiConfigured: Boolean(apiKey),
    telegramConfigured: Boolean(TELEGRAM_BOT_TOKEN)
  });
});

app.get('/api/blueprint', (_req, res) => {
  return res.json({
    ok: true,
    blueprint: BUSINESS_BLUEPRINT,
    agents: AGENT_DEFINITIONS,
    contentTemplates: CONTENT_TEMPLATES,
    chatScripts: CHAT_SCRIPTS
  });
});

app.get('/api/distribution-pack', rateLimit, (req, res) => {
  const prompt = sanitizeText(req.query.prompt, 3000);
  const track = sanitizeText(req.query.track, 100);
  if (!prompt) {
    return res.status(400).json({ error: 'prompt 必填' });
  }

  return res.json({
    ok: true,
    ...buildDistributionPack({ prompt, track })
  });
});

app.get('/', (_req, res) => {
  const taskOptions = Object.entries(TASK_TYPES)
    .map(([value, item]) => `<option value="${value}">${item.label}</option>`)
    .join('');
  const trackOptions = Object.entries(TRACKS)
    .map(([value, item]) => `<option value="${value}">${item.label}</option>`)
    .join('');
  const agentCards = AGENT_DEFINITIONS.map((agent) => `
    <div class="mini-card">
      <h3>${agent.name}</h3>
      <p><strong>${agent.mission}</strong></p>
      <ul>${agent.tasks.map((task) => `<li>${task}</li>`).join('')}</ul>
      <p class="muted">输出：${agent.output}</p>
    </div>
  `).join('');
  const productCards = BUSINESS_BLUEPRINT.productMatrix.map((item) => `
    <div class="mini-card">
      <h3>${item.tier}</h3>
      <p><strong>${item.goal}</strong></p>
      <p>适合：${item.audience.join(' / ')}</p>
      <p>产品：${item.offers.join('；')}</p>
      <p>价格：${item.price}</p>
      <p class="muted">目标：${item.outcome}</p>
    </div>
  `).join('');
  const segmentCards = BUSINESS_BLUEPRINT.customerSegments.map((segment) => `
    <div class="mini-card">
      <h3>${segment.name}</h3>
      <p>特点：${segment.traits.join('；')}</p>
      <p>主卖：${segment.sell.join(' / ')}</p>
    </div>
  `).join('');
  const monthPlanHtml = BUSINESS_BLUEPRINT.firstMonthPlan.map((item) => `
    <div class="mini-card">
      <h3>${item.week}</h3>
      <p><strong>${item.goal}</strong></p>
      <ul>${item.actions.map((action) => `<li>${action}</li>`).join('')}</ul>
    </div>
  `).join('');
  const templateTabs = Object.entries(CONTENT_TEMPLATES).map(([value, item]) => `<option value="${value}">${item.label}</option>`).join('');
  const telegramHtml = PUBLIC_TELEGRAM_URL
    ? `<p><a href="${PUBLIC_TELEGRAM_URL}" target="_blank" rel="noreferrer">👉 直接进 Telegram 私聊/频道</a></p>`
    : '<p class="muted">可在环境变量里配置 PUBLIC_TELEGRAM_URL，展示 Telegram 私域入口。</p>';

  res.type('html').send(`<!doctype html>
  <html lang="zh-CN"><meta charset="utf-8">
  <title>${APP_NAME}</title>
  <style>
    :root{color-scheme:light}
    body{font-family:system-ui,-apple-system;max-width:1180px;margin:32px auto;padding:0 16px;line-height:1.55;background:#fafafa;color:#111}
    textarea,select,input,button{font:inherit}
    textarea,input{width:100%;box-sizing:border-box}
    .row{display:flex;gap:12px;flex-wrap:wrap;margin:12px 0}
    .row > label{flex:1;min-width:180px}
    .card{padding:18px;border:1px solid #ddd;border-radius:16px;margin-bottom:16px;background:#fff;box-shadow:0 6px 24px rgba(0,0,0,.04)}
    .muted{color:#666}
    button{cursor:pointer;padding:10px 16px;border-radius:10px;border:1px solid #111;background:#111;color:#fff}
    .ghost{background:#fff;color:#111}
    .two-col{display:grid;grid-template-columns:1.3fr .9fr;gap:16px}
    .grid-3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
    .grid-4{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}
    .mini-card{padding:16px;border:1px solid #e5e5e5;border-radius:14px;background:#fff}
    .tag{display:inline-flex;padding:4px 10px;border-radius:999px;background:#f2f2f2;margin:4px 8px 0 0;font-size:13px}
    pre{overflow:auto}
    @media (max-width: 960px){.two-col,.grid-3,.grid-4{grid-template-columns:1fr}}
  </style>
  <h1>${APP_NAME}</h1>
  <p>${APP_TAGLINE}</p>

  <div class="card">
    <p><strong>定位：</strong>频道不是终点，频道只是筛客户的漏斗口。这个 MVP 现在把“前端内容引流 + 中端情报产品 + 后端高价服务成交”直接落成同一个页面和 API。</p>
    <p><strong>当前 CTA：</strong>${SALES_CTA_TEXT}</p>
    <div>${BUSINESS_BLUEPRINT.keyMetrics.map((metric) => `<span class="tag">盯 ${metric}</span>`).join('')}</div>
    ${telegramHtml}
  </div>

  <div class="card">
    <h2>业务漏斗</h2>
    <p>${BUSINESS_BLUEPRINT.funnel.join(' → ')}</p>
  </div>

  <div class="card">
    <h2>产品矩阵</h2>
    <div class="grid-4">${productCards}</div>
  </div>

  <div class="card">
    <h2>6 个最小 Agent</h2>
    <div class="grid-3">${agentCards}</div>
  </div>

  <div class="card">
    <h2>客户分层与主卖方案</h2>
    <div class="grid-3">${segmentCards}</div>
  </div>

  <div class="two-col">
    <div>
      <div class="card">
        <h2>内容生成 / 分发包</h2>
        <textarea id="prompt" rows="8" placeholder="输入一条资讯、一个主题，或一段你抓到的市场信息"></textarea>
        <div class="row">
          <label>输出类型：<select id="taskType">${taskOptions}</select></label>
          <label>赛道：<select id="track">${trackOptions}</select></label>
          <label>语气：
            <select id="tone">
              <option>直接实用</option>
              <option>轻松有梗</option>
              <option>走心共鸣</option>
              <option>老板视角</option>
            </select>
          </label>
          <label>长度：<input id="length" type="number" value="120" min="20" max="500"></label>
          <label>变体数：<input id="count" type="number" value="1" min="1" max="5"></label>
        </div>
        <div class="row">
          <button id="generateBtn">生成内容</button>
          <button id="distributionBtn" class="ghost">生成分发包</button>
        </div>
        <pre id="out" class="card" style="white-space:pre-wrap"></pre>
      </div>

      <div class="card">
        <h2>Telegram 内容模板</h2>
        <div class="row">
          <label>模板类型：<select id="templateType">${templateTabs}</select></label>
          <label>示例标题：<input id="templateTitle" value="塔什干某区域建材需求明显上升"></label>
        </div>
        <div class="row"><button id="templateBtn" class="ghost">生成模板示例</button></div>
        <pre id="templateOut" class="card" style="white-space:pre-wrap"></pre>
      </div>
    </div>

    <div>
      <div class="card">
        <h2>预约咨询 / 留资</h2>
        <p class="muted">提交后系统会自动尝试识别客户层级，并给出更适合的产品建议。</p>
        <div class="row">
          <label>姓名<input id="leadName" placeholder="怎么称呼你"></label>
          <label>联系方式<input id="leadContact" placeholder="微信 / Telegram / 手机 / 邮箱"></label>
        </div>
        <div class="row">
          <label>公司/项目<input id="leadCompany" placeholder="公司名 / 项目名"></label>
          <label>预算<input id="leadBudget" placeholder="可选，例：3000-5000/月"></label>
        </div>
        <label>需求<textarea id="leadDemand" rows="6" placeholder="例如：需要乌兹市场资讯日报、建材线索分析、市场进入诊断、本地资源对接"></textarea></label>
        <div class="row"><button id="consultBtn">提交咨询</button></div>
        <pre id="consultOut" class="card muted" style="white-space:pre-wrap"></pre>
      </div>

      <div class="card">
        <h2>私聊成交话术</h2>
        <div id="chatScripts">${CHAT_SCRIPTS.map((item) => `<div class="mini-card"><strong>${item.scene}</strong><p>${item.reply}</p></div>`).join('')}</div>
      </div>
    </div>
  </div>

  <div class="card">
    <h2>第一个月执行清单</h2>
    <div class="grid-4">${monthPlanHtml}</div>
  </div>

  <div class="card">
    <h2>最容易把项目做废的坑</h2>
    <div>${BUSINESS_BLUEPRINT.pitfalls.map((item) => `<span class="tag">${item}</span>`).join('')}</div>
  </div>

  <script>
    const templates = ${JSON.stringify(CONTENT_TEMPLATES)};

    generateBtn.onclick = async () => {
      out.textContent = '生成中...';
      const count = Number(document.getElementById('count').value || 1);
      const payload = {
        prompt: document.getElementById('prompt').value,
        taskType: document.getElementById('taskType').value,
        track: document.getElementById('track').value,
        tone: document.getElementById('tone').value,
        length: Number(document.getElementById('length').value || 120),
        count
      };
      const path = count > 1 ? '/api/generate-batch-content' : '/api/generate-content';
      const response = await fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      out.textContent = data.content || (data.contents ? data.contents.join('\n\n---\n\n') : JSON.stringify(data, null, 2));
    };

    distributionBtn.onclick = async () => {
      out.textContent = '生成分发包中...';
      const prompt = encodeURIComponent(document.getElementById('prompt').value);
      const track = encodeURIComponent(document.getElementById('track').value);
      const response = await fetch('/api/distribution-pack?prompt=' + prompt + '&track=' + track);
      const data = await response.json();
      out.textContent = JSON.stringify(data, null, 2);
    };

    templateBtn.onclick = () => {
      const type = document.getElementById('templateType').value;
      const title = document.getElementById('templateTitle').value.trim();
      const prefix = title ? '标题：' + title + '\n' : '';
      templateOut.textContent = prefix + templates[type].template;
    };
    templateBtn.click();

    consultBtn.onclick = async () => {
      consultOut.textContent = '提交中...';
      const payload = {
        name: document.getElementById('leadName').value,
        contact: document.getElementById('leadContact').value,
        company: document.getElementById('leadCompany').value,
        budget: document.getElementById('leadBudget').value,
        demand: document.getElementById('leadDemand').value,
        track: document.getElementById('track').value,
        source: 'website_form'
      };
      const response = await fetch('/api/consultations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      consultOut.textContent = response.ok
        ? '已提交，我们会尽快联系你。\n' + JSON.stringify({ segment: data.consultation?.segment, recommendedOffer: data.consultation?.recommendedOffer, id: data.consultation?.id }, null, 2)
        : JSON.stringify(data, null, 2);
    };
  </script>`);
});

app.post('/api/generate-content', requireAppApiKey, rateLimit, async (req, res) => {
  try {
    const {
      prompt,
      tone = '直接实用',
      length = 120,
      track = 'general',
      taskType = 'hot_comment'
    } = req.body || {};

    const validationError = validatePrompt(prompt);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    if (LOG_PROMPTS) {
      console.log('[generate-content]', JSON.stringify({
        track,
        taskType,
        tone,
        length,
        promptPreview: prompt.slice(0, 120)
      }));
    }

    const content = await generateSingleContent({ prompt, tone, length, track, taskType });
    saveGenerationLog({
      requestType: 'single',
      prompt,
      taskType,
      track,
      tone,
      length,
      count: 1,
      outputs: [content]
    });

    return res.json({
      content,
      model: MODEL,
      track: normalizeTrack(track),
      taskType: normalizeTaskType(taskType)
    });
  } catch (e) {
    return res.status(500).json({ error: '生成失败', detail: String(e?.message || e) });
  }
});

app.post('/api/generate-batch-content', requireAppApiKey, rateLimit, async (req, res) => {
  try {
    const {
      prompt,
      tone = '直接实用',
      length = 120,
      track = 'general',
      taskType = 'hot_comment',
      count = 3
    } = req.body || {};

    const validationError = validatePrompt(prompt);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const safeCount = Math.min(MAX_BATCH_SIZE, Math.max(1, Number(count || 3)));
    const contents = [];

    for (let i = 0; i < safeCount; i += 1) {
      const content = await generateSingleContent({ prompt, tone, length, track, taskType });
      contents.push(content);
    }

    saveGenerationLog({
      requestType: 'batch',
      prompt,
      taskType,
      track,
      tone,
      length,
      count: safeCount,
      outputs: contents
    });

    return res.json({
      contents,
      count: contents.length,
      model: MODEL,
      track: normalizeTrack(track),
      taskType: normalizeTaskType(taskType)
    });
  } catch (e) {
    return res.status(500).json({ error: '批量生成失败', detail: String(e?.message || e) });
  }
});

app.post('/api/generate-hot-comment', requireAppApiKey, rateLimit, async (req, res) => {
  try {
    const { prompt, tone = '轻松有梗', length = 40, track = 'general' } = req.body || {};
    const validationError = validatePrompt(prompt);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const content = await generateSingleContent({
      prompt,
      tone,
      length,
      track,
      taskType: 'hot_comment'
    });

    saveGenerationLog({
      requestType: 'single',
      prompt,
      taskType: 'hot_comment',
      track,
      tone,
      length,
      count: 1,
      outputs: [content]
    });

    return res.json({ comment: content, model: MODEL, track: normalizeTrack(track) });
  } catch (e) {
    return res.status(500).json({ error: '生成失败', detail: String(e?.message || e) });
  }
});

app.post('/api/generate-batch-comments', requireAppApiKey, rateLimit, async (req, res) => {
  try {
    const { prompt, tone = '轻松有梗', length = 40, track = 'general', count = 3 } = req.body || {};
    const validationError = validatePrompt(prompt);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const safeCount = Math.min(MAX_BATCH_SIZE, Math.max(1, Number(count || 3)));
    const contents = [];

    for (let i = 0; i < safeCount; i += 1) {
      const content = await generateSingleContent({
        prompt,
        tone,
        length,
        track,
        taskType: 'hot_comment'
      });
      contents.push(content);
    }

    saveGenerationLog({
      requestType: 'batch',
      prompt,
      taskType: 'hot_comment',
      track,
      tone,
      length,
      count: safeCount,
      outputs: contents
    });

    return res.json({ comments: contents, count: contents.length, model: MODEL, track: normalizeTrack(track) });
  } catch (e) {
    return res.status(500).json({ error: '批量生成失败', detail: String(e?.message || e) });
  }
});

app.post('/api/consultations', rateLimit, async (req, res) => {
  const consultationPayload = {
    name: req.body?.name,
    contact: req.body?.contact,
    company: req.body?.company,
    demand: req.body?.demand,
    budget: req.body?.budget,
    source: req.body?.source || 'website_form',
    track: req.body?.track || 'general',
    notes: req.body?.notes
  };

  if (!sanitizeText(consultationPayload.contact, 200) && !sanitizeText(consultationPayload.demand, 3000)) {
    return res.status(400).json({ error: '至少填写联系方式或需求说明' });
  }

  const consultation = createConsultation(consultationPayload);
  const notifyResult = await notifyOwnerConsultation(consultation).catch((error) => ({ ok: false, error: String(error) }));

  return res.status(201).json({
    ok: true,
    consultation,
    ownerNotified: Boolean(notifyResult?.ok)
  });
});

app.post('/api/integrations/telegram/webhook', async (req, res) => {
  if (!verifyTelegramWebhook(req)) {
    return res.status(401).json({ error: 'invalid_telegram_secret' });
  }

  const update = req.body || {};
  appendJsonItem(TELEGRAM_UPDATES_FILE, {
    id: createId('tg'),
    createdAt: nowIso(),
    update
  });

  const consultationPayload = parseTelegramConsultation(update);
  if (!consultationPayload) {
    return res.json({ ok: true, ignored: true });
  }

  const consultation = createConsultation(consultationPayload);
  await notifyOwnerConsultation(consultation).catch(() => null);

  if (consultation.telegramChatId) {
    await sendTelegramMessage(
      consultation.telegramChatId,
      `已收到你的咨询。当前识别你更接近【${consultation.segment}】线索，我建议先看【${consultation.recommendedOffer}】。你也可以继续补充行业、需求和预算。`
    ).catch(() => null);
  }

  return res.json({ ok: true, consultationId: consultation.id });
});

app.get('/api/admin/consultations', requireAdmin, (_req, res) => {
  return res.json({ ok: true, items: listConsultations() });
});

app.patch('/api/admin/consultations/:id', requireAdmin, (req, res) => {
  const updated = updateConsultation(req.params.id, {
    status: req.body?.status,
    notes: req.body?.notes
  });

  if (!updated) {
    return res.status(404).json({ error: 'consultation_not_found' });
  }

  return res.json({ ok: true, item: updated });
});

app.get('/api/admin/generations', requireAdmin, (_req, res) => {
  return res.json({ ok: true, items: listGenerations() });
});

app.listen(PORT, () => console.log('Listening on', PORT));
