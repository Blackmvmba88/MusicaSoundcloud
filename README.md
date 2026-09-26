# BlackMamba Music Hub

Sistema local de producción musical para **Iyari Gomez · BlackMamba RECORDS**. Une el catálogo de Suno, el maestro WAV, metadatos, letras, portadas, series visuales, el reproductor y la entrega privada a SoundCloud sin duplicar material.

El repositorio contiene código, documentación y catálogos. El audio maestro permanece fuera de Git en el USB.

## Qué problema resuelve

Cada canción recorre un ciclo trazable:

```text
Suno → detección por ID → WAV maestro → metadata → letra/instrumental
     → portada 1:1 → serie visual/video → SoundCloud privado
     → publicación programada → métricas → siguiente ciclo
```

El ID de Suno, la huella del WAV y las referencias visuales evitan repetir trabajo. Una serie puede compartir personaje y estética de manera intencional; una reutilización no registrada se considera duplicado.

## Estado del sistema

- Reproductor React 19 + Electron operativo.
- Catálogo combinado de archivos locales, Suno y SoundCloud.
- Lectura y reproducción directa del maestro WAV en USB.
- Detección incremental de canciones nuevas de Suno.
- Fichas laterales `.wav.suno.json` por canción.
- Validación estricta de WAV, metadata, letra/instrumental y portada 1:1.
- Carga multipart con audio y portada a SoundCloud.
- Privacidad `private` fijada en código, no delegada a configuración.
- Indicadores visuales de evolución por canción.
- SQLite local para catálogo, conciliación y snapshots métricos de SoundCloud.
- Pruebas centrales y 52 pruebas del reproductor.
- Repositorio privado en GitHub.

Pendiente crítico: ejecutar una canción canario completa y verificar el resultado privado en SoundCloud antes de procesar lotes.

## Requisitos

- macOS Apple Silicon para la aplicación de escritorio actual.
- Node.js 24 o superior.
- npm 10 o superior.
- USB `ADATA SC740` para acceder al maestro oficial.
- Cuenta de SoundCloud autorizada para auditoría o subida.
- Sesión de Suno disponible para detectar y descargar canciones.

Docker es opcional y se usará para validación reproducible; la aplicación Electron y el acceso al USB siguen ejecutándose directamente en macOS.

## Primer arranque

```bash
git clone https://github.com/Blackmvmba88/MusicaSoundcloud.git
cd MusicaSoundcloud
npm run player:install
cp .env.example .env
npm run doctor
npm run player:desktop
```

`npm run doctor` no imprime secretos ni modifica el catálogo. Los avisos describen capacidades opcionales que todavía no están disponibles; los errores indican que una función esencial no puede operar.

## Configuración

Variables principales de `.env`:

| Variable | Propósito |
| --- | --- |
| `PORT` | Puerto de la API web inicial |
| `MUSIC_LIBRARY_ROOT` | Biblioteca local del servidor inicial |
| `BLACKMAMBA_WAV_MASTER` | Ruta alternativa al maestro WAV |
| `SOUNDCLOUD_CLIENT_ID` | Identidad OAuth de SoundCloud |
| `SOUNDCLOUD_CLIENT_SECRET` | Secreto OAuth; nunca se versiona |
| `SOUNDCLOUD_ACCESS_TOKEN` | Token de acceso privado |
| `SOUNDCLOUD_REFRESH_TOKEN` | Renovación de OAuth |
| `SOUNDCLOUD_AUTO_UPLOAD` | Activa o desactiva el observador |
| `SOUNDCLOUD_AUTO_SHARING` | Debe ser `private` |
| `SOUNDCLOUD_REQUIRE_METADATA` | Exige metadata aprobada |
| `SOUNDCLOUD_REQUIRE_COVER` | Exige portada aprobada |

El archivo `.env` está ignorado por Git y debe conservar permisos privados.

## Operación cotidiana

```bash
npm run doctor                       # salud general, solo lectura
npm run doctor -- --json             # salida para automatización
npm run player:desktop               # reproductor Electron
npm run player:dev                   # interfaz React en desarrollo
npm run suno:auto-upload:check       # simulación, no sube
npm run soundcloud:audit             # auditoría remota de solo lectura
npm run soundcloud:metrics:snapshot  # snapshot de contadores públicos; no modifica SoundCloud
npm run soundcloud:match-suno        # cotejo Suno ↔ SoundCloud
```

Los snapshots de métricas guardan los contadores acumulados documentados por la Public API (`playback_count`, likes, comentarios, reposts y descargas). No se presentan como sustituto de los períodos, países, ciudades, top fans o sources de Creator Insights. Ver [el gap audit de métricas](docs/SOUNDCLOUD_METRICS_GAP_AUDIT.md).

El observador real usa `npm run suno:auto-upload:watch`. Solo debe operar después del canario. Aunque se invoque con `--apply`, bloquea canciones incompletas y siempre envía `sharing=private`.

## Contrato de una canción lista

Una canción únicamente puede llegar a SoundCloud cuando:

- El archivo tiene cabecera RIFF/WAVE válida.
- Tiene título definitivo.
- `artist` es `Iyari Gomez`.
- `recordLabel` es `BlackMamba RECORDS`.
- Contiene letra o está marcada `instrumental: true`.
- `metadataStatus` es `ready`.
- La portada es un PNG/JPEG real y exactamente 1:1.
- `coverStatus` es `ready` y `coverPath` existe.
- No coincide con un WAV o ID ya cargado.

Consulta [el ejemplo de ficha](docs/SUNO_TRACK_SIDECAR.example.json).

## Estados visibles

El reproductor representa el avance mediante cinco iconos:

1. Detectada en Suno.
2. WAV disponible.
3. Metadata aprobada.
4. Portada 1:1 aprobada.
5. Subida privada.

Verde significa completado, dorado indica el siguiente paso y gris señala una etapa pendiente.

## Datos y respaldos

La única colección maestra de audio aceptada actualmente es:

```text
/Volumes/ADATA SC740/MÚSICA/WAV_MASTER
```

- El repositorio no almacena WAV ni MP3.
- No se crean respaldos musicales fechados por distintas carpetas.
- `storage/sync` guarda checkpoints locales y no se versiona.
- Las portadas aprobadas pueden versionarse cuando forman parte del sistema creativo.
- SQLite y reportes operativos permanecen locales salvo decisión explícita.

## Seguridad

- No se guardan tokens en Git.
- La interfaz React nunca recibe secretos de SoundCloud.
- La publicación pública no forma parte de la automatización.
- Las operaciones remotas deben comenzar con auditoría o simulación.
- La primera escritura externa se limita a una canción canario privada.
- Los errores de validación conservan el archivo y bloquean la subida.

## Estructura

```text
apps/player/   aplicación React/Electron y servidor multimedia local
apps/server/   API y reproductor web inicial
packages/      base de datos, SoundCloud, métricas y validación del paquete musical
automations/   tareas incrementales e idempotentes
scripts/       doctor, inicialización, auditoría, métricas y consolidación
storage/       base, medios y checkpoints locales no versionados
inbox/         entradas pendientes
portadas/      material visual aprobado o en revisión
reports/       resultados reproducibles
docs/          contexto, arquitectura y roadmap
tests/         contratos centrales
```

## Documentación

- [Contexto operativo](docs/PROJECT_CONTEXT.md)
- [Arquitectura](docs/ARCHITECTURE.md)
- [Roadmap](docs/ROADMAP.md)
- [SoundCloud Metrics — Gap audit](docs/SOUNDCLOUD_METRICS_GAP_AUDIT.md)
- [Arquitectura del reproductor](apps/player/DESKTOP_ARCHITECTURE.md)
- [Seguridad del reproductor](apps/player/SECURITY.md)

## Desarrollo y validación

```bash
npm test
npm test --prefix apps/player
npm run lint --prefix apps/player
npm run typecheck --prefix apps/player
npm run build --prefix apps/player
```

Cuando Docker esté disponible:

```bash
docker build -f Dockerfile.ci -t blackmamba-music-ci .
docker run --rm blackmamba-music-ci
```

La imagen valida el código y el reproductor web. No contiene credenciales, audio maestro ni checkpoints.
