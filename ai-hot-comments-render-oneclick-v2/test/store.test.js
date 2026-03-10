import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { JsonStore } from '../src/store.js';

const logger = { info() {}, warn() {}, error() {} };

test('upsertMessages is idempotent and returns added ids', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-hot-test-'));
  const store = new JsonStore(dir, logger);
  store.init();

  const a = { id: 'c:1', text: 'hello', ts: 1 };
  const b = { id: 'c:2', text: 'world', ts: 2 };

  const first = store.upsertMessages([a, b]);
  assert.equal(first.added, 2);
  assert.deepEqual(first.addedIds.sort(), ['c:1', 'c:2']);

  const second = store.upsertMessages([a]);
  assert.equal(second.added, 0);
  assert.deepEqual(second.addedIds, []);
});
