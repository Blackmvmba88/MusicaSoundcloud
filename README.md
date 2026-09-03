# BlackMamba Music Hub

Repositorio central para administrar el catalogo musical, reproducir archivos locales y automatizar portadas con SoundCloud.

## Estado actual

- Reproductor web local con cola y controles basicos.
- API local con catalogo persistente en SQLite.
- Importacion de archivos de audio desde una carpeta local.
- Modulo SoundCloud separado, listo para recibir OAuth.
- Automatizacion de portadas en modo `dry-run` por defecto.
- Auditor de metadatos de SoundCloud completamente de solo lectura.
- Respaldo versionado al USB `ADATA SC740`.

## Inicio rapido

```bash
npm run db:init
npm test
npm start
```

Abre <http://127.0.0.1:4173>. Para importar musica, copia archivos a `storage/media` y pulsa **Escanear biblioteca**.

## Orden del repositorio

```text
apps/          servidor e interfaz del reproductor
packages/      base de datos e integraciones externas
automations/   tareas seguras y repetibles
scripts/       diagnostico, inicializacion y respaldo
storage/       datos locales no versionados
inbox/         entradas pendientes, por ejemplo portadas
reports/       resultados de auditorias y automatizaciones
docs/          arquitectura y plan de trabajo
tests/         pruebas automatizadas
```

Consulta [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) y [docs/ROADMAP.md](docs/ROADMAP.md) antes de ampliar el sistema.

## Seguridad

Nunca guardes tokens en Git. Copia `.env.example` como `.env` cuando tengamos las credenciales y conserva el modo de simulacion hasta validar una sola pista.

La prioridad operativa es `npm run soundcloud:audit`: crea un inventario de faltantes sin modificar SoundCloud. Las letras se administran localmente y se pueden incorporar a la descripcion, ya que la pista de SoundCloud no ofrece un campo de letras separado.

La autorizacion inicial se realiza con `npm run soundcloud:authorize`; abre SoundCloud en el navegador y guarda los tokens solamente en el `.env` privado.
