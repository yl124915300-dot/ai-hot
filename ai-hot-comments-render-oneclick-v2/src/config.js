import dotenv from 'dotenv';

dotenv.config();

function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function toInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function csv(value) {
  return String(value || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

const TG_API_ID = process.env.TG_API_ID;
const TG_API_HASH = process.env.TG_API_HASH;
const TG_SESSION_STRING = process.env.TG_SESSION_STRING || '';
const TG_SOURCE_CHANNELS = csv(process.env.TG_SOURCE_CHANNELS || '');

const BOT_TOKEN = process.env.TG_BOT_TOKEN || '';
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || '';

const mode =
  process.env.APP_MODE || (TG_API_ID && TG_API_HASH && TG_SESSION_STRING && TG_SOURCE_CHANNELS.length > 0 ? 'live' : 'mock');
const isLive = mode === 'live';

export const config = {
  mode,
  isLive,
  port: toInt(process.env.PORT, 8080),
  model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  systemPrompt:
    process.env.SYSTEM_PROMPT ||
    '你是一个产业情报助手。请输出结构化、可执行、简洁的中文内容。',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  tgApiId: TG_API_ID ? Number(TG_API_ID) : null,
  tgApiHash: TG_API_HASH || '',
  tgSessionString: TG_SESSION_STRING,
  tgSourceChannels: TG_SOURCE_CHANNELS,
  tgBotToken: BOT_TOKEN,
  adminChatId: ADMIN_CHAT_ID,
  dataDir: process.env.DATA_DIR || 'data',
  pollMs: Math.max(30_000, toInt(process.env.POLL_MS, 300_000)),
  digestHour: Math.min(23, Math.max(0, toInt(process.env.DIGEST_HOUR, 9))),
  autoRun: toBool(process.env.AUTO_RUN, true),
  allowManualPublish: toBool(process.env.ALLOW_MANUAL_PUBLISH, false),
  riskKeywords: csv(process.env.RISK_KEYWORDS || '投诉,违法,封号,危机,合规,风险'),
  leadKeywords: csv(process.env.LEAD_KEYWORDS || '采购,预算,合作,招标,代理,咨询'),
  commandChatAllowlist: csv(process.env.COMMAND_CHAT_ALLOWLIST || ''),
};

export function validateConfig(logger) {
  if (config.isLive) {
    const missing = [];
    if (!config.tgApiId) missing.push('TG_API_ID');
    if (!config.tgApiHash) missing.push('TG_API_HASH');
    if (!config.tgSessionString) missing.push('TG_SESSION_STRING');
    if (config.tgSourceChannels.length === 0) missing.push('TG_SOURCE_CHANNELS');
    if (missing.length > 0) {
      logger.warn({ missing }, '[config] live 模式配置缺失，已降级为 mock');
      config.mode = 'mock';
      config.isLive = false;
    }
  } else {
    logger.warn('[config] 运行在 mock 模式（缺少 live 配置或显式指定 APP_MODE=mock）');
  }

  if (!config.tgBotToken) logger.warn('[config] TG_BOT_TOKEN 未配置，Bot 命令与提醒功能将禁用');
  if (!config.adminChatId) logger.warn('[config] ADMIN_CHAT_ID 未配置，管理员提醒将禁用');
  if (!config.openaiApiKey) logger.warn('[config] OPENAI_API_KEY 未配置，将使用规则化兜底生成');
}
