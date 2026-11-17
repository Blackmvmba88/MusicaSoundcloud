# BlackMamba Music — vigilante persistente Docker

## Alcance real

Worker de larga duración para el mismo repositorio y la misma SQLite del orquestador (PR #9).
**No** es un servicio de Suno ni publica canciones. Detecta pistas ya importadas del catálogo
Suno y WAV locales, lee el WAV y su ficha `.wav.suno.json` cuando están accesibles, valida portada
y metadatos, mantiene bloqueos y transiciones en `release_jobs`, y deja las obras
aprobables en `ready_for_review`. El escaneo de /music registra WAV nuevos y los asocia por ID cuando la ficha lo permite.\nLas obras ya aprobadas/entregadas no se retroceden.

La biblioteca de Suno incluida en el repositorio es un **snapshot**, no una conexión en tiempo
real. Para detectar nuevos temas desde un servidor externo hay que actualizar el archivo
del catálogo mediante un exportador autorizado; el worker importa las identidades nuevas por
ID y guarda SHA-256 del snapshot. No inventa una API ni intenta descargar Suno con cookies.

## Arranque

Requiere un host con Docker Engine y Compose v2, acceso a medios y a un snapshot Suno.
Un host remoto puede seguir activo cuando la Mac se apague **sólo si los datos se
sincronizan previamente a ese host**.

```sh
cp .env.worker.example .env.worker
# Edita WORKER_MEDIA_DIR y WORKER_CATALOG_FILE para apuntar a carpetas reales del host.
docker compose --env-file .env.worker -f compose.worker.yml build
docker compose --env-file .env.worker -f compose.worker.yml up -d
docker compose --env-file .env.worker -f compose.worker.yml ps
docker compose --env-file .env.worker -f compose.worker.yml logs -f release-worker\ndocker compose --env-file .env.worker -f compose.worker.yml exec release-worker \\\n  node scripts/release-worker-status.mjs
```

Prueba controlada de una única pasada sin servicio permanente:

```sh
docker compose --env-file .env.worker -f compose.worker.yml run --rm release-worker \
  node automations/release-worker.mjs --once
```

## Persistencia y recuperación

- `release_worker_storage` es un volumen Docker permanente; contiene `music.sqlite`,
  checkpoints y heartbeat. No desaparece con `down`; **no ejecutar `down -v`**.
- `restart: unless-stopped` reinicia el proceso al iniciar el motor Docker.
- El checkpoint `last_track_id` permite recorrer catálogos grandes por lotes
  sin volver a evaluar todas las pistas en cada ciclo. Cuando termina una vuelta, inicia otra.
- La importación por `suno_id`, las claves `job_key` y las transiciones son idempotentes.
- Los fallos de una pista no detienen el resto del lote; aparecen en los logs.
- El heartbeat se guarda en `storage/sync/release-worker-health.json` del volumen.
- Un `docker compose down` normal conserva el volumen; respaldar SQLite con la
  API de backup de SQLite, no copiando una base activa sin su WAL.

## Seguridad y acceso desde fuera

- Sin puertos publicados ni API pública; revisar por SSH/Tailscale/VPN al host.
- Imagen sin root, medios y catálogo de sólo lectura, filesystem raíz de sólo lectura,
  capacidades Linux eliminadas y `no-new-privileges`.
- No montar `.env` de SoundCloud ni credenciales de Suno en este servicio.
- Ninguna entrega remota ocurre automáticamente: requiere aprobación, canario
  y habilitación separada de un adaptador de publicación.
- El volumen de medios debe contener WAV y fichas laterales; si las rutas originales
  apuntan a la Mac, `WORKER_SOURCE_AUDIO_PREFIX` permite remapearlas a `/music`.
- El monitor no sustituye la sincronización de medios ni un host siempre encendido.

## Operación y pruebas

```sh
node --test tests/release-worker.test.mjs
npm test
docker compose --env-file .env.worker -f compose.worker.yml config
```

La integración requiere la secuencia **PR #7 → PR #8 → PR #9 → PR de worker**.
No desplegar contra la SQLite de producción sin copia aislada y tests completos.
