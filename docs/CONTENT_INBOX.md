# Mamba Content Inbox

Mamba deja de esperar a que exista el archivo final para enterarse de una obra. El Content Inbox registra una pieza desde la primera señal disponible y luego va enlazando sus representaciones locales.

## Estados

- `pending`: existe una señal remota o de generación, pero todavía no hay archivo local.
- `local`: ya existe un archivo local estable.
- `processed`: ya pasó por el pipeline de preparación.
- `published`: ya fue publicado.
- `archived`: conservado fuera del flujo activo.
- `error`: requiere revisión.

## Fuentes actuales

### Suno

`apps/suno-bridge/` observa únicamente nuevas tarjetas `/song/<id>` que aparecen en la sesión abierta del usuario. No lee cookies ni tokens y no descarga audio. La canción entra al inbox como `pending`; cuando aparece un WAV con sidecar `.suno.json`, el flujo la enlaza al archivo local.

### Filesystem

`npm run content:watch` vigila las rutas definidas en `CONTENT_INBOX_PATHS` (por defecto `~/Downloads`). Usa eventos del filesystem y espera a que el archivo deje de cambiar antes de registrarlo. No calcula hashes en el camino caliente: usa `dev+inode` cuando el sistema los expone y tamaño+mtime para evitar escrituras repetidas.

Varias rutas se separan con `;`:

```env
CONTENT_INBOX_PATHS=/Users/iyari/Downloads;/Users/iyari/Desktop/Capturas
CONTENT_SETTLE_MS=1200
```

## Comandos

```bash
# Indexar una vez lo que ya existe
npm run content:scan

# Vigilar cambios nuevos con bajo consumo
npm run content:watch

# Ver pendientes nacidos en servicios remotos
npm run content:pending

# Filtros
node scripts/list-content-pending.mjs --status=local --kind=image --limit=50
```

## API local

```text
GET  /api/content/pending
GET  /api/content/stats
POST /api/content/events
```

`POST /api/content/events` acepta hasta 100 eventos por lote. Cada evento puede incluir `source`, `externalId`, `kind`, `title`, `sourceUrl`, `localPath`, `bytes`, `observedAt` y `metadata`.

Ejemplo:

```json
{
  "events": [
    {
      "source": "image-generator",
      "externalId": "generation-42",
      "kind": "image",
      "title": "BlackMamba cover",
      "observedAt": "2026-09-06T07:00:00Z"
    }
  ]
}
```

## Principio

El inbox no publica ni borra automáticamente. Primero observa y conserva procedencia. Las políticas de mover, publicar, archivar o limpiar disco se construyen encima y deben ser explícitas y reversibles.
