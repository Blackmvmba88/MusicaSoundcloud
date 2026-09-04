# Roadmap de BlackMamba Music

Este roadmap sigue el ciclo real de una canción. Una fase se considera terminada cuando tiene evidencia verificable, no solamente código escrito.

## Ahora — endurecimiento y canario

- [x] Consolidar el repositorio privado.
- [x] Documentar propósito, arquitectura, operación y reglas permanentes.
- [x] Crear un doctor general de solo lectura con salida humana y JSON.
- [x] Validar cabecera WAV, metadata, letra/instrumental y portada 1:1.
- [x] Forzar `sharing=private` dentro del cliente de SoundCloud.
- [x] Adjuntar portada y audio en una sola solicitud multipart.
- [x] Mostrar el avance de cada canción mediante iconos evolutivos.
- [ ] Elegir una canción canario con título, letra/instrumental y portada definitivos.
- [ ] Ejecutar la carga privada del canario.
- [ ] Confirmar en SoundCloud audio, título, descripción, portada, privacidad y enlace.
- [ ] Registrar el resultado y habilitar lotes pequeños.

## Siguiente — ficha única y editor

- [ ] Definir el esquema versionado de la ficha de canción.
- [ ] Migrar fichas laterales hacia el índice central sin perder su trazabilidad.
- [ ] Editar título, género, estilo, letra, condición instrumental y enlaces desde el reproductor.
- [ ] Seleccionar y aprobar portada desde la interfaz.
- [ ] Mostrar errores exactos que bloquean cada etapa.
- [ ] Registrar historial de cambios y restauración.
- [ ] Distinguir borrador, aprobado, listo, subido y publicado.

## Catálogo y deduplicación

- [x] Detectar canciones de Suno por ID aunque repitan nombre.
- [x] Conservar duración y enlaces de origen.
- [x] Usar huella SHA-256 para impedir cargas WAV duplicadas.
- [ ] Añadir huella acústica para detectar audio equivalente en archivos distintos.
- [ ] Añadir huella perceptual para imágenes iguales o casi iguales.
- [ ] Cotejar forma de onda y duración como evidencia auxiliar.
- [ ] Crear una cola explícita de posibles duplicados para revisión humana.
- [ ] Ejecutar verificación programada de `WAV_MASTER` sin crear respaldos dispersos.

## Portadas y continuidad visual

- [x] Definir portada original 1:1 con `Iyari Gomez` y `BlackMamba RECORDS`.
- [x] Registrar URL de inspiración y prompt en la ficha.
- [ ] Construir el módulo `artwork` dentro del mismo repositorio.
- [ ] Importar referencias desde Pinterest, imágenes de ChatGPT y biblioteca local.
- [ ] Crear series con `seriesId`, episodio, escena y orden de cuadro.
- [ ] Mantener personaje, vestuario, escenario, iluminación y paleta.
- [ ] Generar cuadros clave e intermedios para producir video en Meta.
- [ ] Registrar el video final y su relación con canción, serie y publicaciones.

## Publicación y aprendizaje

- [x] Incorporar el primer resumen de Pinterest Analytics.
- [ ] Importar métricas detalladas por Pin, tablero, fecha y hora.
- [ ] Registrar cada publicación para evitar material repetido.
- [ ] Diseñar un experimento de horarios y frecuencia.
- [ ] Separar continuidad intencional de repetición accidental.
- [ ] Recomendar calendario sin publicar todo de golpe.
- [ ] Alimentar el siguiente ciclo creativo con resultados reales.

## Operación confiable

- [x] Checkpoint incremental para no reconstruir todo el catálogo.
- [x] Recuperación después de suspensión, desconexión o USB ausente.
- [x] Silencio cuando no existen cambios útiles.
- [ ] Reintentos con espera progresiva y límite por canción.
- [ ] Cola de errores recuperables y errores que requieren decisión.
- [ ] Registro estructurado de cada ejecución sin secretos.
- [ ] Resumen de salud visible dentro del reproductor.
- [ ] Prueba de restauración desde GitHub y USB en una carpeta limpia.

## Infraestructura

- [x] Repositorio privado en GitHub.
- [x] Pruebas, lint, tipos, compilación y cobertura locales.
- [x] Especificar un contenedor de validación reproducible.
- [ ] Instalar Docker o un runtime compatible en la Mac.
- [ ] Construir y ejecutar `Dockerfile.ci` localmente.
- [ ] Registrar un runner ARM64 dedicado al repositorio.
- [ ] Ejecutar la validación de GitHub en el runner propio.
- [ ] Documentar actualización, detención y recuperación del runner.

## Después del sistema estable

- [ ] Búsqueda, filtros y playlists guardadas.
- [ ] Calendario editorial para Pinterest, TikTok y otras plataformas.
- [ ] Versiones de portada por formato: 1:1, 9:16 y panorámica.
- [ ] Comparación de rendimiento por canción, serie y lenguaje visual.
- [ ] Paquete instalable firmado y estrategia de actualizaciones.

## Criterios permanentes

- El maestro musical conserva WAV únicamente.
- No se crean copias de respaldo dispersas.
- Suno es el origen creativo, no la única evidencia operativa.
- SoundCloud recibe automáticamente solo contenido privado.
- Ninguna canción avanza sin cumplir el contrato de su etapa.
- Las métricas orientan decisiones; no sustituyen el criterio artístico.
