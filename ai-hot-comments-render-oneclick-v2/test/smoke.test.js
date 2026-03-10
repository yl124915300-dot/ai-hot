import test from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../src/config.js';

test('mode should be mock or live', () => {
  assert.ok(['mock', 'live'].includes(config.mode));
});
