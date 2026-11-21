import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeWorkerScan, checkWorkerHeartbeat, checkpointAfterScan, checkpointAfterMediaScan } from '../automations/worker-health.mjs';

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

test('malformed counters never create a healthy scan', () => {
  for (const failures of ['NaN', NaN, -1, Infinity, 1.25, null]) {
    const outcome = summarizeWorkerScan({ mediaScan: { status: 'scanned', failures } });
    assert.equal(outcome.status, 'partial');
    assert.match(outcome.errorMessage, /contadores/);
  }
  for (const trackErrors of ['NaN', NaN, -1, Infinity, 1.25]) {
    const outcome = summarizeWorkerScan({ mediaScan: { status: 'scanned' }, trackErrors });
    assert.equal(outcome.status, 'partial');
  }
});

test('valid error counters are preserved', () => {
  const outcome = summarizeWorkerScan({ mediaScan: { status: 'scanned', failures: 2 }, trackErrors: 3 });
  assert.equal(outcome.errors, 5);
  assert.equal(outcome.trackErrors, 3);
  assert.equal(outcome.mediaFailures, 2);
  assert.equal(outcome.status, 'partial');
});

test('checkpoint retries first failed track without skipping it', () => {
  assert.equal(checkpointAfterScan({ startCursor: 0, trackIds: [2, 4, 8], firstFailedIndex: 1 }), 2);
  assert.equal(checkpointAfterScan({ startCursor: 3, trackIds: [4, 6, 9], firstFailedIndex: 0 }), 3);
  assert.equal(checkpointAfterScan({ startCursor: 0, trackIds: [2, 4, 8] }), 8);
  assert.equal(checkpointAfterScan({ startCursor: 8, trackIds: [] }), 0);
});

test('checkpoint rejects invalid index, unordered IDs and stale cursors', () => {
  assert.throws(() => checkpointAfterScan({ startCursor: 4, trackIds: [4, 6] }), /inválido/);
  assert.throws(() => checkpointAfterScan({ startCursor: 0, trackIds: [3, 3] }), /inválido/);
  assert.throws(() => checkpointAfterScan({ startCursor: 0, trackIds: [3], firstFailedIndex: 2 }), /inválido/);
});

test('checkpoint keeps later failures reachable after retrying earliest failure', () => {
  const ids = [4, 6, 9];
  const firstPass = checkpointAfterScan({ startCursor: 3, trackIds: ids, firstFailedIndex: 2 });
  assert.equal(firstPass, 6);
  const retry = checkpointAfterScan({ startCursor: firstPass, trackIds: [9, 12], firstFailedIndex: 0 });
  assert.equal(retry, 6);
});

test('checkpoint rejects negative, fractional and non-safe failure positions', () => {
  for (const firstFailedIndex of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => checkpointAfterScan({ startCursor: 0, trackIds: [2, 4], firstFailedIndex }), /inválido/);
  }
  assert.throws(() => checkpointAfterScan({ startCursor: -1, trackIds: [] }), /inválido/);
});

test('media checkpoint retries the first failing WAV on the next scan', () => {
  assert.equal(checkpointAfterMediaScan({
    startName: '', fileNames: ['a.wav', 'b.wav', 'c.wav'], firstFailedIndex: 1,
  }), 'a.wav');
  assert.equal(checkpointAfterMediaScan({
    startName: 'a.wav', fileNames: ['b.wav', 'c.wav'], firstFailedIndex: 0,
  }), 'a.wav');
  assert.equal(checkpointAfterMediaScan({
    startName: '', fileNames: ['a.wav', 'b.wav'], firstFailedIndex: null,
  }), 'b.wav');
  assert.equal(checkpointAfterMediaScan({ startName: 'c.wav', fileNames: [] }), 'c.wav');
});

test('media checkpoint rejects malformed batches and failure positions', () => {
  for (const firstFailedIndex of [-1, 1.5, 2, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => checkpointAfterMediaScan({
      startName: '', fileNames: ['a.wav', 'b.wav'], firstFailedIndex,
    }), /inválido/);
  }
  assert.throws(() => checkpointAfterMediaScan({
    startName: '', fileNames: ['b.wav', 'a.wav'],
  }), /inválido/);
  assert.throws(() => checkpointAfterMediaScan({
    startName: '', fileNames: ['a.wav', 'a.wav'],
  }), /inválido/);
});
