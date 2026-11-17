# BlackMamba RECORDS — Descargas como punto de entrada redundante

## Objetivo
El nuevo agente observa **Descargas de macOS** y mantiene un segundo punto de arranque independiente
del worker Docker. Usa eventos nativos de carpeta y **reconciliación periódica** para detectar
archivos incluso si se perdió un evento o se reinició el sistema.

**Importante:** no elimina originales, no necesita credenciales de Suno, no modifica la SQLite
directamente y **nunca sube o publica canciones automáticamente**.

## Flujo
- WAV estable: copia inmutable a la **raíz** de WORKER_MEDIA_DIR, nombre con SHA-256.
  El worker de PR #10 lo descubre, registra y valida en la SQLite existente.
  Falta de datos o portada -> bloqueo, no publicación.
- MP3, M4A y FLAC: ingresan en media/pending-import, estado awaiting-wav-conversion.
  **La conversión todavía no está implementada**.
- Ficha nombre.wav.suno.json: se anexa si aparece junto al WAV descargado;
  no se sobreescribe una ficha existente.
- Archivos temporales .part, .crdownload, etc., enlaces simbólicos y formatos ajenos
  al audio no se importan.
- SHA-256 evita copias múltiples del mismo audio aunque cambie de nombre.
  Un archivo modificado es una versión distinta y no destruye la anterior.

## Redundancia
1. fs.watch recibe eventos de Descargas para reaccionar rápido.
2. Escaneo periódico cada 30 s detecta descargas omitidas.
3. Journal local, atómico y persistente en storage/sync/download-ingest-state.json.
   Si se corrompe, se detiene el procesamiento para no perder la protección antduplicados.
4. El worker Docker conserva su escaneo propio de /music y su SQLite canónica.
   Son dos procesos con responsabilidades independientes, no dos publicadores.

## Arranque e instalación en macOS
Requiere Node.js >=22 y una sesión macOS con permiso para leer Descargas.
Elige la misma carpeta física de medios que montará Docker. Al mover el repositorio,
se debe volver a instalar el servicio desde la nueva ubicación.

~~~bash
cd /ruta/al/repositorio/MusicaSoundcloud
export BLACKMAMBA_DOWNLOADS_DIR="$HOME/Downloads"
export WORKER_MEDIA_DIR="$PWD/media"
node --test tests/download-ingest-agent.test.mjs
node automations/download-ingest-agent.mjs --once
node scripts/download-agent-service.mjs install
node scripts/download-agent-service.mjs status
tail -f storage/logs/download-ingest.log
~~~

Desinstalación sin borrar archivos ni checkpoint:

~~~bash
node scripts/download-agent-service.mjs uninstall
~~~

El script instala un LaunchAgent del usuario, con RunAtLoad y KeepAlive, sin privilegios
de administrador y sin abrir puertos. Solo se instala cuando el usuario ejecuta ese
comando. En macOS puede ser necesario conceder acceso a Descargas al Node utilizado.

## Docker y host remoto
El compose.worker.yml existente monta los medios en /music:ro. En la misma Mac,
WORKER_MEDIA_DIR debe apuntar a la carpeta que Docker monta. El agente escribe en la
carpeta del host; Docker solo lee el contenido.

Si Docker opera en **otra computadora**, es imprescindible sincronizar la carpeta de
medios a ese host por un canal seguro: la Mac apagada no puede detectar descargas nuevas.
Este PR no instala sincronización remota ni demuestra despliegue siempre encendido.

## Pruebas
~~~bash
node --check automations/download-ingest-agent.mjs
node --check scripts/download-agent-service.mjs
node --test tests/download-ingest-agent.test.mjs
~~~

Este módulo es independiente de las migraciones de SQLite, pero el procesamiento
completo sigue condicionado a integrar y probar en orden los PR #7, #8, #9 y #10.

**Pendiente:** canario de descarga real en macOS, validación de LaunchAgent,
integración Node 24 / SQLite y Docker, y conversión de formatos no WAV.
