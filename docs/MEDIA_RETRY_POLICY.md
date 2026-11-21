# Media discovery: bounded retry and logical quarantine

The release worker does not delete, move, rename, publish, or overwrite source WAV files.

## Policy

- Each WAV discovered with a failing read, Suno sidecar, identity check, or database reconciliation is recorded in `release_worker_media_failures` (filename, failure count, fingerprint, error, timestamp).
- The same unchanged WAV/sidecar is retried up to **3 times**. At the third failure, the checkpoint can move beyond that WAV so later files keep progressing.
- Subsequent scans count the unchanged WAV as quarantined and report a **partial** cycle; it is not silently marked healthy.
- A change in the WAV or its `.suno.json` file's size or mtime permits a new attempt. A successful scan clears the failure record.
- Quarantine is a **database state only**, not a filesystem move. The original file is preserved.

## Operational verification

Run on Node 24 with SQLite available:

```sh
node --test tests/worker-health-pure.test.mjs tests/worker-health.test.mjs
```

Check pending quarantine without changing data:

```sql
SELECT media_name, attempts, last_error, updated_at
FROM release_worker_media_failures
ORDER BY updated_at DESC;
```

A repaired sidecar should be reconsidered once its fingerprint changes and the scan reaches that filename again. Watch `media-discovery-error`, `quarantined`, and `failures` counters. Do not treat CI jobs with zero executed steps as code test results.

## Limitations

- The fingerprint uses file size and modification time; same-size edits with preserved timestamps may not be detected. A content hash or an explicit safe retry command could improve recovery.
- A continuously edited invalid WAV may repeatedly consume retries. A future iteration can add cooldown/backoff and retry prioritization.
- Quarantined records remain visible until a successful scan; no automatic purge is performed.
