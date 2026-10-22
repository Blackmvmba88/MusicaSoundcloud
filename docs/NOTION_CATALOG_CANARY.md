# Notion catalog bridge (read-only canary)

This slice connects the existing Electron player with **BlackMamba Songs / Catalog** without changing SQLite's operational ownership. The catalog is currently read-only; no Notion edits, public uploads, or music publication can be triggered here.

## Requirements
- Node.js with native `fetch` and `AbortSignal.timeout`.
- Electron desktop (the React web preview has no Notion bridge and shows an offline banner).
- A Notion integration shared with the catalog database.
- `NOTION_TOKEN` configured in the **Electron main process environment** (never in Vite variables, renderer code, browser localStorage, or Git).
- Optional: `NOTION_CATALOG_DATA_SOURCE_ID`. Default: `64dfaf42-e95e-44c6-bf85-83783bc43a80`.

## Test and inspect

```bash
node --test apps/player/electron/catalog-readonly.test.mjs
node --check apps/player/electron/main.cjs
node --check apps/player/electron/preload.cjs
npm run typecheck --prefix apps/player
npm run lint --prefix apps/player
npm run build --prefix apps/player
```

Launch Electron with the token set in its process environment and open `/music`. The read-only panel above the navigation displays the catalog count and, for an unequivocally matched current song, its lifecycle and missing assets.

### Identity
Matching uses a Suno UUID, ISRC, or SoundCloud URL. Song title alone is *never* accepted as identity. Two matches are presented as ambiguous and never automatically merged. The `Refresh` button explicitly repeats the read; there are no background writes or polling.

### Canario
1. Validate six unit tests and Electron player typecheck/build.
2. Enable the Notion integration for the catalog data source; launch desktop with credentials.
3. Verify the known Suno canary `b68bd223-5bcb-413b-8fb1-002d11d38ecf` matches one song when it exists locally.
4. Confirm lifecycle `Curating` and all four asset indicators reflect Notion values.
5. Disconnect integration or unset token and confirm the player remains usable and reports `Sin configurar / no disponible`.
6. Check that no Notion page, SQLite record, or SoundCloud publication changed.

## Next phase (separate from the read-only canary)
Backend outbox for review edits, conflict detection using `last_edited_time`, incremental dedupe, explicit Notion Rating/Review schema, and independent readiness gate. The existing local player rating controls remain separate until the two-way contract is reviewed.

**Never merge this PR as fully validated before real canary and CI/local checks pass.**
