# Arquitectura

El sistema usa una sola fuente de verdad: `storage/database/music.sqlite`. Los archivos de audio y portadas permanecen en disco; SQLite conserva sus rutas, metadatos y estado de sincronizacion.

Las reglas consolidadas y el ciclo creativo completo están en `docs/PROJECT_CONTEXT.md`.

## Flujo

1. Un archivo de audio entra en `storage/media`.
2. El escaner lo registra o actualiza en SQLite sin duplicarlo.
3. La API entrega el catalogo al reproductor web.
4. Una portada entra en `inbox/covers` y se vincula por nombre normalizado.
5. La automatizacion genera primero un reporte `dry-run`.
6. La detección por ID en la biblioteca de Suno ocurre antes e independientemente de la descarga.
7. Cada canción nueva entra primero en `storage/sync/suno-new-tracks.json` con estado `detected`.
8. Al llegar el WAV se registra su huella y se crea su ficha lateral `.wav.suno.json`.
9. Se corrigen y aprueban título, género, letra o condición instrumental y demás metadatos.
10. Se crea una portada original 1:1, usando la referencia o el prompt de Pinterest solo como dirección visual.
11. La composición final lleva el texto exacto `Iyari Gomez` y `BlackMamba RECORDS`.
12. Solo con `metadataStatus: ready`, `coverStatus: ready` y una portada existente se habilita la carga.
13. La carga automática a SoundCloud siempre usa visibilidad privada e incluye la portada.
14. Publicar una pista es una acción distinta, manual y posterior a la revisión.

## Limites de seguridad

- La interfaz nunca recibe secretos de SoundCloud.
- La base y los medios no se versionan en Git.
- Las automatizaciones externas deben ser idempotentes y producir reporte.
- Todo cambio remoto debe probarse primero con una pista canario.
- Ninguna automatización puede convertir una pista en pública. `sharing=private` es una regla fija del cargador.
- Una pista sin metadata aprobada o portada terminada queda en espera y no llega a SoundCloud.
- La huella del WAV y el ID de Suno evitan cargas duplicadas aunque cambie el título.
