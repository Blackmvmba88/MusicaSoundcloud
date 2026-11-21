# Media discovery: bounded retry and logical quarantine

The release worker does not delete, move, rename, publish, or overwrite source WAV files.

## Policy

- Each WAV discovered with a failing read, Suno sidecar, identity check, or database reconciliation is recorded in `release_worker_media_failures` (filename, failure count, fingerprint, error, timestamp).
- The same unchanged WAV/sidecar is retried up to **3 times**. At the third failure, the checkpoint can move beyond that WAV so later files keep progressing.
- Subsequent scans count the unchanged WAV as quarantined and report a **partial** cycle; it is not silently marked healthy.
- A change in the WAV size or mtime, or a change in the SHA-256 digest of `.suno.json` bytes, permits a new attempt. A successful scan clears the failure record.
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

A repaired sidecar should be reconsidered once its content SHA-256 changes and the scan reaches that filename again. Watch `media-discovery-error`, `quarantined`, and `failures` counters. Do not treat CI jobs with zero executed steps as code test results.

## Limitations

- WAV changes are detected via size and modification time, not a full audio hash. Changes to WAV bytes that preserve those attributes may go undetected; a manual safe retry or an optional streaming audio digest could address this later.
- Sidecar content is hashed with SHA-256 on each inspected file, so metadata-only repairs with preserved size and mtime are detected. Sidecars are bounded to 1 MiB before hashing and parsing; oversized files are recorded as failures and logically quarantined after the retry budget, without reading their complete contents or modifying the source WAV.
- A continuously edited invalid WAV may repeatedly consume retries. A future iteration can add cooldown/backoff and retry prioritization.
- Quarantined records remain visible until a successful scan; no automatic purge is performed.
