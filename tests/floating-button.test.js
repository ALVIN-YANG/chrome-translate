import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFloatingPosition } from '../src/floating-button.js';

test('悬浮位置只保存有效比例坐标，不携带额外配置', () => {
  assert.deepEqual(normalizeFloatingPosition({ x: 0, y: 1, provider: 'other', key: 'fixture' }), { x: 0, y: 1 });
  assert.deepEqual(normalizeFloatingPosition({ x: 0.3, y: 0.7 }), { x: 0.3, y: 0.7 });
  for (const value of [null, {}, { x: '0.5', y: 0 }, { x: -1, y: 0 }, { x: 1.1, y: 0 }, { x: NaN, y: 0 }, { x: 0, y: Infinity }]) assert.equal(normalizeFloatingPosition(value), null);
});
