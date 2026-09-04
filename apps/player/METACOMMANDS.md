# Metacomandos de BlackMamba Music

Órdenes cortas para trabajar con Codex sobre este repositorio. Cada una implica inspección, ejecución, validación y reporte; no autoriza publicación, push ni distribución externa salvo que se indique expresamente.

## Aplicación

### `ejecuta reproductor`

Ejecuta `npm run doctor`, inicia la WebUI y abre `/music`. Reporta catálogo cargado, USB detectada, confianza y advertencias.

### `abre app`

Ejecuta `npm run desktop:dev`, comprueba que Electron abra `/music` y valida los controles principales.

### `valida reproductor`

Prueba búsqueda, reproducción, timeline, seek, pausa, stop, shuffle, estrellas, ordenamiento, historial, editor y canción activa centrada. Después ejecuta tipos, pruebas y build.

### `optimiza reproductor`

Mide primero; reduce renders, carga inicial y trabajo visual sin eliminar layouts, animaciones ni compatibilidad con el catálogo.

### `construye dmg privado`

Ejecuta `npm run desktop:dmg:private`, confirma arquitectura arm64 y comprueba que el artefacto no contenga `.mp3` ni `.wav`.

### `release privado`

Ejecuta doctor, lint, tipos, pruebas, build y DMG privado. No publica ni sube artefactos sin autorización explícita.

## Biblioteca y búsqueda

### `busca: <texto>`

Busca sobre el catálogo completo, sin dejar que un filtro previo oculte resultados. Reporta coincidencias, número de catálogo, disponibilidad local y formato.

### `coteja canción: <título>`

Compara USB, SoundCloud y Suno usando título, duración, fuente y evidencia. No descarga ni sustituye archivos hasta tener una coincidencia suficiente.

### `audita fuentes`

Ejecuta `npm run library:audit-sources`. Produce estados local/recuperable, MP3/WAV y candidatos exactos de Suno. La prioridad es WAV desde Suno y SoundCloud queda como recuperación secundaria.

### `marca propiedad neocyber`

Ejecuta `npm run library:ownership` y marca como pertenecientes los registros cuyo artista o metadatos contienen `neocyber`.

### `exporta vitrina`

Exporta decisiones y estrellas desde la interfaz para revisión. No modifica la USB.

## Ingesta USB

### `consolida downloads`

Ejecuta `npm run library:usb`. Copia MP3 desde Downloads a la biblioteca canónica, deduplica por SHA-256 y verifica cada copia. Conserva los originales.

### `importa colección usb`

Ejecuta `npm run library:import-usb`. Importa MP3 de Arsenal/Vault que no existan por hash. Conserva las ubicaciones históricas.

### `actualiza vitrina local`

Ejecuta `npm run library:vitrine`. Reconstruye `public/player` desde la USB. Este comando copia MP3 al checkout para uso local; no debe incluirse en el DMG.

### `finaliza downloads`

Comando destructivo: ejecuta `npm run library:finalize`. Verifica la copia USB por SHA-256, elimina los MP3 coincidentes de Downloads y mueve imágenes a `00_COVER_INBOX`. Requiere confirmación explícita en la solicitud.

### `libera duplicados usb`

Comando destructivo: ejecuta `npm run library:cleanup-usb`. Sólo borra copias históricas cuyo hash coincide con el canónico y genera auditoría. Requiere confirmación explícita.

### `deduplica acústicamente`

Comando destructivo: ejecuta `npm run library:dedupe-acoustic`. Usa título normalizado, duración y Chromaprint; conserva la variante de mayor calidad. Requiere respaldo y confirmación explícita.

### `aplica decisiones: <archivo>`

Comando destructivo: ejecuta `npm run library:apply-reviews -- <archivo>`. Valida IDs y hashes, aplica estrellas y elimina rechazadas. Requiere confirmación explícita.

## Metadatos

### `edita ficha: <canción>`

Abre o modifica la ficha existente. Mantiene fijos:

```text
Artista: Iyari Gomez
Autor: Iyari Cancino Gomez
Sello: BlackMamba RECORDS
```

### `agrega hashtags: <lista>`

Ancla géneros y estilos a la canción sin reemplazar etiquetas existentes salvo que se pida. Incluye EDM y ramas electrónicas.

### `asigna portada: <canción>`

Coteja evidencia antes de asignar imagen. Conserva espacios independientes 1:1 y 16:9.

### `agrega letra: <canción>`

Guarda la letra en la ficha y marca su disponibilidad. No inventa texto faltante.

## Ingeniería

### `valida`

Ejecuta:

```bash
npm run lint
npm run typecheck
npm test -- --run
npm run build
```

Corrige fallos atribuibles al cambio hasta dejar la cadena verde o demostrar un bloqueo externo.

### `diagnostica: <problema>`

Reproduce sin cambiar comportamiento, identifica la capa responsable y entrega confianza, evidencia, advertencias y fallback.

### `limpia build`

Ejecuta únicamente `npm run clean`. No toca USB, audios, metadatos ni preferencias del navegador.

### `robustece api`

Conserva el servidor local existente. Añade validación, errores estructurados, confianza, evidencia, advertencias y fallback. No crea un backend paralelo.

### `persistencia usb`

Implementa escritura segura desde el editor a `metadata.json`, con backup, validación de esquema y actualización atómica de `library.json`.

## Modificadores

- `sólo diagnóstico`: no modifica archivos ni estado.
- `con tests`: añade o actualiza pruebas conductuales.
- `con docs`: actualiza README, roadmap y migración relevante.
- `sin dependencias nuevas`: usa la plataforma y paquetes existentes.
- `sin borrar`: prohíbe cualquier eliminación.
- `dry-run`: genera plan y evidencia, sin mutaciones destructivas.
- `hasta que pase`: corrige iterativamente hasta validar o demostrar bloqueo.
- `sin publicar`: prohíbe deploy, upload, push y distribución externa.

## Ejemplos

```text
busca: Fire
valida reproductor con tests hasta que pase
coteja canción: Moon Light, sólo diagnóstico
consolida downloads sin borrar
audita fuentes con docs
construye dmg privado sin publicar
persistencia usb con tests y migración
deduplica acústicamente dry-run
```
