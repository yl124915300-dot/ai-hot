function normalizeChannel(v) {
  const cleaned = String(v).trim();
  if (!cleaned) return null;
  if (cleaned.startsWith('https://t.me/')) return cleaned.replace('https://t.me/', '');
  if (cleaned.startsWith('@')) return cleaned.slice(1);
  return cleaned;
}

export class TelegramSource {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.client = null;
  }

  async init() {
    if (!this.config.isLive) return;
    let TelegramClient;
    let StringSession;
    try {
      const telegramPkg = await import('telegram');
      const sessionPkg = await import('telegram/sessions/index.js');
      TelegramClient = telegramPkg.TelegramClient;
      StringSession = sessionPkg.StringSession;
    } catch (error) {
      this.logger.error({ error: String(error) }, '[telegram] telegram SDK 不可用，降级 mock');
      this.config.isLive = false;
      this.config.mode = 'mock';
      return;
    }

    this.client = new TelegramClient(
      new StringSession(this.config.tgSessionString),
      this.config.tgApiId,
      this.config.tgApiHash,
      { connectionRetries: 2 }
    );
    await this.client.connect();
    this.logger.info('[telegram] 客户端已连接（API 模式）');
  }

  async fetchLatest(limitPerChannel = 20) {
    if (!this.config.isLive || !this.client) {
      const now = Date.now();
      return [
        {
          id: `mock-${Math.floor(now / 60000)}`,
          channel: 'mock_channel',
          text: 'mock: 本地模式示例消息，含“合作预算”关键词。',
          ts: now,
          rawId: 0,
        },
      ];
    }
    const output = [];
    for (const channelRaw of this.config.tgSourceChannels) {
      const channel = normalizeChannel(channelRaw);
      if (!channel) continue;
      try {
        const messages = await this.client.getMessages(channel, { limit: limitPerChannel });
        for (const msg of messages) {
          if (!msg?.id || !msg?.message) continue;
          output.push({
            id: `${channel}:${msg.id}`,
            channel,
            text: String(msg.message).trim(),
            ts: Number(msg.date) * 1000,
            rawId: msg.id,
          });
        }
      } catch (error) {
        this.logger.error({ channel, error: String(error) }, '[telegram] 抓取频道失败，已跳过该频道');
      }
    }
    return output;
  }
}

export async function sendBotMessage(config, logger, chatId, text) {
  if (!config.tgBotToken || !chatId) return { ok: false, reason: 'missing-config' };
  try {
    const resp = await fetch(`https://api.telegram.org/bot${config.tgBotToken}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    if (!resp.ok) {
      const body = await resp.text();
      logger.error({ status: resp.status, body }, '[bot] sendMessage 失败');
      return { ok: false, reason: 'http-error' };
    }
    return { ok: true };
  } catch (error) {
    logger.error({ error: String(error) }, '[bot] sendMessage 异常');
    return { ok: false, reason: 'exception' };
  }
}
