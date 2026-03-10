import fs from 'fs';
import path from 'path';

const EMPTY = {
  messages: [],
  insights: [],
  reviewItems: [],
  alerts: [],
  leads: [],
  runs: [],
  meta: { lastDigestDate: null, lastRunAt: null, pipelineRunning: false },
};

export class JsonStore {
  constructor(dataDir, logger) {
    this.logger = logger;
    this.dataDir = dataDir;
    this.file = path.join(dataDir, 'state.json');
    this.state = structuredClone(EMPTY);
    this.saveQueue = Promise.resolve();
  }

  init() {
    fs.mkdirSync(this.dataDir, { recursive: true });
    if (!fs.existsSync(this.file)) {
      fs.writeFileSync(this.file, `${JSON.stringify(EMPTY, null, 2)}\n`);
      return;
    }
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      const parsed = JSON.parse(raw);
      this.state = { ...structuredClone(EMPTY), ...parsed };
      this.rebuildIndexes();
    } catch (error) {
      const backup = `${this.file}.corrupt.${Date.now()}.bak`;
      fs.copyFileSync(this.file, backup);
      this.logger.error({ error: String(error), backup }, '[store] 状态文件损坏，已备份并重置');
      this.state = structuredClone(EMPTY);
      this.flushSync();
    }
  }

  rebuildIndexes() {
    const byId = new Map();
    this.state.messages = this.state.messages.filter((m) => {
      if (!m?.id || byId.has(m.id)) return false;
      byId.set(m.id, true);
      return true;
    });
  }

  flushSync() {
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(this.state, null, 2)}\n`);
    fs.renameSync(tmp, this.file);
  }

  flush() {
    this.saveQueue = this.saveQueue
      .then(async () => {
        this.flushSync();
      })
      .catch((error) => {
        this.logger.error({ error: String(error) }, '[store] 保存失败');
      });
    return this.saveQueue;
  }

  upsertMessages(incoming) {
    let added = 0;
    const addedIds = [];
    const byId = new Map(this.state.messages.map((m) => [m.id, m]));
    for (const message of incoming) {
      if (!message?.id) continue;
      if (byId.has(message.id)) continue;
      byId.set(message.id, message);
      this.state.messages.push(message);
      addedIds.push(message.id);
      added += 1;
    }
    if (added > 0) {
      this.state.messages.sort((a, b) => b.ts - a.ts);
    }
    return { added, addedIds };
  }

  upsertReviewItems(items) {
    let added = 0;
    const known = new Set(this.state.reviewItems.map((x) => x.id));
    for (const item of items) {
      if (known.has(item.id)) continue;
      this.state.reviewItems.push(item);
      known.add(item.id);
      added += 1;
    }
    return added;
  }
}
