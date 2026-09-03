# Arquitectura

El sistema usa una sola fuente de verdad: `storage/database/music.sqlite`. Los archivos de audio y portadas permanecen en disco; SQLite conserva sus rutas, metadatos y estado de sincronizacion.

## Flujo

1. Un archivo de audio entra en `storage/media`.
2. El escaner lo registra o actualiza en SQLite sin duplicarlo.
3. La API entrega el catalogo al reproductor web.
4. Una portada entra en `inbox/covers` y se vincula por nombre normalizado.
5. La automatizacion genera primero un reporte `dry-run`.
6. Solo una ejecucion explicita futura podra escribir en SoundCloud.

## Limites de seguridad

- La interfaz nunca recibe secretos de SoundCloud.
- La base y los medios no se versionan en Git.
- Las automatizaciones externas deben ser idempotentes y producir reporte.
- Todo cambio remoto debe probarse primero con una pista canario.

