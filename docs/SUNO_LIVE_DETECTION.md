# Suno Live Detection

Music Hub puede registrar una canción **antes de que exista un WAV local**.

La detección v0 usa un bridge local de navegador. No lee cookies, no intercepta requests de Suno y no descarga audio: observa únicamente enlaces de canción (`/song/<id>`) que aparecen en la sesión de Suno abierta por el usuario y manda metadata mínima al servidor local de Music Hub.

## Flujo

```text
Suno web abierto
  -> aparece una nueva tarjeta de canción
  -> Mamba Suno Bridge detecta su song id
  -> POST http://127.0.0.1:4173/api/suno/events
  -> tracks.suno_id / suno_url / suno_observed_at
  -> sync_status = pending
  -> después llega el WAV + .suno.json
  -> el watcher enlaza local_path al registro existente
  -> deja de aparecer en suno:pending
```

## Arranque

1. Inicia Music Hub:

```bash
npm start
```

2. En Chrome/Chromium abre `chrome://extensions`, activa Developer mode y usa **Load unpacked** sobre:

```text
apps/suno-bridge
```

3. Abre Suno normalmente. Las canciones ya visibles cuando carga la página se toman como baseline de esa sesión. Las tarjetas nuevas que aparezcan después se registran en Music Hub.

4. Consulta canciones vistas en Suno que todavía no tienen archivo local:

```bash
npm run suno:pending
```

También existe:

```text
GET /api/suno/pending
```

## Privacidad y alcance

El bridge envía solamente:

- `suno_id`
- título visible cuando está disponible
- URL canónica de la canción
- timestamp de observación
- pathname de la página

No envía cookies, tokens, prompts, letras completas, audio ni tráfico de red de Suno.

El servidor escucha únicamente en `127.0.0.1`. Los endpoints del bridge rechazan orígenes web normales y aceptan llamadas locales/directas o desde extensiones de navegador.

## Relación con el watcher WAV

`automations/suno-private-upload.mjs` sigue siendo el responsable de observar `BLACKMAMBA_WAV_MASTER`, validar el paquete y subir a SoundCloud en privado cuando se usa `--apply`.

La diferencia es que ahora el registro puede nacer antes:

```text
Suno detected -> pending -> WAV arrives -> validated -> private upload
```

Además, `.env` se carga antes de resolver `BLACKMAMBA_WAV_MASTER`, por lo que la ruta configurada en `.env` sí controla el watcher.

## Limitación deliberada de v0

La detección ocurre mientras una pestaña de Suno está abierta y la nueva tarjeta aparece en el DOM. No depende de endpoints privados/indocumentados de Suno.

Una integración futura puede añadir un adaptador para la API oficial de Suno cuando el acceso de cuenta/biblioteca requerido esté disponible para este flujo, manteniendo el bridge web como fallback.
