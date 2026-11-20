import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeWorkerScan, checkWorkerHeartbeat } from '../automations/worker-health.mjs';

const heartbeat = { status: 'ok', at: '2026-11-17T19:59:59.000Z' };
const now = Date.parse('2026-11-17T20:00:00Z');

test('healthy scan remains healthy', () => {
  assert.equal(summarizeWorkerScan({ mediaScan: { status: 'scanned', failures: 0 } }).status, 'ok');
});

test('empty volume is a valid completed scan', () => {
  assert.equal(summarizeWorkerScan({ mediaScan: { status: 'empty', failures: 0 } }).status, 'ok');
});

test('missing scan cannot report healthy', () => {
  assert.equal(summarizeWorkerScan({}).status, 'partial');
});

test('unknown scan cannot report healthy', () => {
  assert.equal(summarizeWorkerScan({ mediaScan: { status: 'unknown' } }).status, 'partial');
});

test('missing volume cannot report healthy', () => {
  assert.equal(summarizeWorkerScan({ mediaScan: { status: 'media-not-mounted' } }).status, 'partial');
});

test('invalid heartbeat intervals are rejected', () => {
  for (const interval of [0, -1, NaN, Infinity, undefined]) {
    assert.throws(() => checkWorkerHeartbeat(heartbeat, interval, now), /intervalo/);
  }
});

test('valid heartbeat interval preserves healthy result', () => {
  assert.equal(checkWorkerHeartbeat(heartbeat, 60, now).ok, true);
});
