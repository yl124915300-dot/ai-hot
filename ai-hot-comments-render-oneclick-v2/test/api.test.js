import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectDir = path.resolve(__dirname, '..');
const port = 18080 + Math.floor(Math.random() * 1000);
const baseUrl = `http://127.0.0.1:${port}`;

let serverProcess;

async function waitForServer(url, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // retry until timeout
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Server did not become ready within ${timeoutMs}ms`);
}

test.before(async () => {
  serverProcess = spawn(process.execPath, ['src/server.js'], {
    cwd: projectDir,
    env: {
      ...process.env,
      PORT: String(port)
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  serverProcess.stdout.on('data', () => {});
  serverProcess.stderr.on('data', () => {});

  await waitForServer(`${baseUrl}/healthz`);
});

test.after(async () => {
  if (!serverProcess) return;
  serverProcess.kill('SIGTERM');
  await once(serverProcess, 'exit').catch(() => null);
});

test('smoke test: homepage responds with 200', async () => {
  const response = await fetch(`${baseUrl}/`);
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /乌兹机会情报台|<html/i);
});

test('/api/blueprint returns ok true with blueprint and agents', async () => {
  const response = await fetch(`${baseUrl}/api/blueprint`);
  const data = await response.json();

  assert.equal(response.status, 200);
  assert.equal(data.ok, true);
  assert.equal(Array.isArray(data.agents), true);
  assert.equal(data.agents.length, 6);
  assert.equal(Array.isArray(data.blueprint?.productMatrix), true);
});

test('/api/distribution-pack returns the expected sales structure', async () => {
  const response = await fetch(
    `${baseUrl}/api/distribution-pack?prompt=${encodeURIComponent('塔什干建材需求变化')}&track=building_materials`
  );
  const data = await response.json();

  assert.equal(response.status, 200);
  assert.equal(data.ok, true);
  assert.equal(typeof data.publicPost, 'string');
  assert.equal(typeof data.paidPreview, 'string');
  assert.equal(typeof data.bossBrief, 'string');
  assert.equal(Array.isArray(data.salesChecklist), true);
  assert.ok(data.salesChecklist.length >= 1);
});

test('POST /api/consultations returns segment and recommendedOffer', async () => {
  const response = await fetch(`${baseUrl}/api/consultations`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      name: '测试团队',
      company: '跨境项目组',
      demand: '我们团队需要持续监控本地建材线索并每月更新优先级',
      budget: '3000-5000/月',
      contact: '@test-team'
    })
  });

  const data = await response.json();

  assert.equal(response.status, 201);
  assert.equal(data.ok, true);
  assert.equal(data.consultation.segment, '小团队');
  assert.match(data.consultation.recommendedOffer, /定制情报监控/);
});
