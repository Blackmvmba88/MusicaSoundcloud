import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  attachLocalPathToSunoTrack,
  openDatabase,
  upsertLocalTrack,
  upsertSunoTrack,
} from '../packages/database/src/db.mjs';

function temporaryDatabase(fn) {
  const dir = mkdtempSync(resolve(tmpdir(), 'blackmamba-release-'));
  const path = resolve(dir, 'music.sqlite');
  let db;
  try {
    db = openDatabase(path);
    fn({ db, path, reopen() { db.close(); db = openDatabase(path); return db; } });
  } finally {
    db?.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

test('estado y readiness se almacenan separados y los bloqueos explican qué falta', () => {
  temporaryDatabase(({ db }) => {
    const track = upsertLocalTrack(db, { title: 'Prueba', localPath: '/music/release-test.wav' });
    db.prepare(`
      INSERT INTO release_jobs (track_id, job_key, state, readiness, next_action)
      VALUES (?, 'local:release-test', 'preparing', 'incomplete', 'complete_assets')
    `).run(track.id);
    const job = db.prepare('SELECT * FROM release_jobs').get();
    db.prepare(`
      INSERT INTO release_blockers (job_id, code, reason, resolution)
      VALUES (?, 'COVER_16_9_MISSING', 'Falta portada panorámica', 'Generar y aprobar portada 16:9')
    `).run(job.id);
    const overview = db.prepare('SELECT * FROM release_job_overview').get();
    assert.equal(overview.state, 'preparing');
    assert.equal(overview.readiness, 'incomplete');
    assert.equal(overview.blocked, 1);
    assert.equal(overview.blocker_count, 1);
    assert.equal(overview.next_action, 'complete_assets');
    assert.equal(db.prepare('SELECT resolution FROM release_blockers').get().resolution, 'Generar y aprobar portada 16:9');
    db.prepare('DELETE FROM release_blockers WHERE job_id = ?').run(job.id);
    db.prepare("UPDATE release_jobs SET readiness = 'complete' WHERE id = ?").run(job.id);
    assert.equal(db.prepare('SELECT blocked FROM release_job_overview').get().blocked, 0);
  });
});

test('aprobación autenticada e intento incierto sobreviven a la reapertura', () => {
  temporaryDatabase(({ db, reopen }) => {
    const track = upsertLocalTrack(db, { title: 'Prueba', localPath: '/music/approved.wav' });
    db.prepare(`
      INSERT INTO release_jobs (track_id, job_key, state, readiness, package_version)
      VALUES (?, 'local:approved', 'approved', 'complete', 3)
    `).run(track.id);
    const job = db.prepare('SELECT * FROM release_jobs').get();
    const manifestHash = 'a'.repeat(64);
    db.prepare(`
      INSERT INTO release_approvals
        (job_id, package_version, manifest_sha256, actor_id, authentication_method, authorization_evidence_id)
      VALUES (?, 3, ?, 'local-user', 'macos-session', 'approval-event-001')
    `).run(job.id, manifestHash);
    const approval = db.prepare('SELECT * FROM release_approvals').get();
    db.prepare(`
      INSERT INTO release_delivery_attempts
        (job_id, approval_id, idempotency_key, provider, state, reason)
      VALUES (?, ?, 'soundcloud:attempt-001', 'soundcloud', 'uncertain', 'Respuesta perdida')
    `).run(job.id, approval.id);

    db = reopen();
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM release_jobs').get().n, 1);
    assert.equal(db.prepare('SELECT authentication_method FROM release_approvals').get().authentication_method, 'macos-session');
    assert.equal(db.prepare('SELECT state FROM release_delivery_attempts').get().state, 'uncertain');
    assert.throws(() => db.prepare(`
      INSERT INTO release_delivery_attempts (job_id, approval_id, idempotency_key)
      VALUES (?, ?, 'soundcloud:attempt-001')
    `).run(job.id, approval.id), /UNIQUE/);
    assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
  });
});

test('fusión de tracks preserva el trabajo y todos sus registros dependientes', () => {
  temporaryDatabase(({ db }) => {
    const local = upsertLocalTrack(db, { title: 'WAV local', localPath: '/music/job-merge.wav' });
    const suno = upsertSunoTrack(db, { id: 'suno-merge-job-001', title: 'WAV Suno' });
    db.prepare("INSERT INTO release_jobs (track_id, job_key, state, readiness) VALUES (?, 'suno:suno-merge-job-001', 'preparing', 'incomplete')").run(suno.id);
    const job = db.prepare('SELECT * FROM release_jobs').get();
    db.prepare("INSERT INTO release_blockers (job_id, code, reason, resolution) VALUES (?, 'WAV_MISSING', 'Falta WAV', 'Descargar WAV')").run(job.id);
    db.prepare("INSERT INTO release_transitions (job_id, transition_version, from_state, to_state, reason) VALUES (?, 1, 'detected', 'preparing', 'Inicio de preparación')").run(job.id);
    const linked = attachLocalPathToSunoTrack(db, {
      sunoId: 'suno-merge-job-001', localPath: '/music/job-merge.wav', title: 'WAV Suno'
    });
    assert.equal(linked.id, local.id);
    assert.equal(db.prepare('SELECT track_id FROM release_jobs').get().track_id, local.id);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM release_blockers').get().n, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM release_transitions').get().n, 1);
    assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
  });
});
