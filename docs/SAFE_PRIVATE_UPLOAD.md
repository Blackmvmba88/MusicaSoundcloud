# Subida canario privada y conciliación

El observador guarda el estado en `storage/sync/suno-private-upload.json` y nunca publica pistas visibles al público.

## Comprobación segura

1. Verifica el entorno: `npm run doctor` y `npm test`.
2. Usa una canción WAV terminada con ficha `archivo.wav.suno.json` y portada 1:1 aprobada.
3. Simula sin escritura: `npm run suno:auto-upload:check -- --file="/ruta/canario.wav"`.
4. Revisa las validaciones. Sólo para ejecutar el canario privado, en la Mac autorizada: `node automations/suno-private-upload.mjs --apply --file="/ruta/canario.wav"`.
5. Confirma en SoundCloud que el audio, artista, título, portada, descripción, privacidad **private** y URL sean correctos antes de habilitar el observador de lotes.

## Estados protegidos

- `uploading`: checkpoint escrito **antes** de enviar el POST; podría existir un resultado remoto aún no registrado.
- `uncertain`: respuesta/POST fallido o ambiguo; requiere **conciliación manual** con SoundCloud.
- `needs-reconciliation`: diagnóstico de un WAV coincidente en ruta o SHA-256; **no genera otro POST**.
- `uploaded`: existe ID de pista devuelto por SoundCloud y checkpoint persistido.

Si una ejecución queda en `uploading` o `uncertain`, no borres el checkpoint ni fuerces un nuevo envío. Primero consulta SoundCloud y resuelve la identidad de la pista; sólo después documenta y corrige el estado del catálogo. Si el JSON es ilegible, el proceso se detiene en lugar de reiniciar el inventario.

Sin `--apply`, el comando no abre SQLite ni modifica el checkpoint, incluida la creación de la línea base. Esto no sustituye las pruebas de integración y la validación remota de privacidad.

La primera carga externa requiere acceso desde la Mac al USB maestro y una sesión OAuth SoundCloud autorizada. Este documento no presupone que esas credenciales estén disponibles en GitHub.
