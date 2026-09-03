# Roadmap

## Prioridad 1 — completar el catalogo de SoundCloud

- [ ] Autorizar la cuenta por OAuth.
- [ ] Importar y auditar todas las pistas en modo lectura.
- [ ] Detectar metadatos, portadas y descripciones/letras faltantes.
- [ ] Preparar propuestas revisables por pista.
- [ ] Aplicar un canario y verificar el resultado remoto.
- [ ] Completar el resto por lotes con reporte y reintentos.

> SoundCloud no expone un campo independiente para letras en el modelo actual de pista. Se conservaran localmente y, cuando se apruebe, se publicaran dentro de la descripcion con un formato consistente.

## Fase 2 — base local

- [x] Estructura del repositorio.
- [x] SQLite y API del catalogo.
- [x] Reproductor web inicial.
- [x] Escaneo de biblioteca local.
- [x] Respaldo al USB.

## Fase 3 — operacion

- [ ] Editor de metadatos y letras.
- [ ] Historial de cambios y restauracion.
- [ ] Busqueda, filtros y playlists.
- [ ] Respaldo programado y verificacion de integridad.
