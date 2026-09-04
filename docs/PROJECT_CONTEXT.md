# Contexto operativo de BlackMamba Music

## Propósito

Administrar el ciclo completo de cada canción de Iyari Gomez y BlackMamba RECORDS sin duplicar audio, imágenes, publicaciones ni trabajo manual.

## Fuente de verdad

Cada canción se identifica primero por su ID de Suno. Su ficha vincula el WAV, metadatos, letra o condición instrumental, portada, serie visual, publicaciones, métricas y enlaces de origen.

## Ciclo

1. Detectar una canción nueva en Suno por ID.
2. Registrar su URL y estado antes de descargarla.
3. Descargar únicamente el WAV al maestro USB.
4. Corregir y aprobar metadatos.
5. Definir una portada o una serie visual original.
6. Usar Pinterest, imágenes de ChatGPT o la biblioteca como referencias registradas, no como copias.
7. Crear cuadros clave e intermedios con continuidad de personaje, escenario y narrativa.
8. Entregar los cuadros para producir video en Meta.
9. Subir audio y portada a SoundCloud siempre en privado.
10. Programar las publicaciones sin concentrarlas todas en un solo momento.
11. Incorporar las métricas de Pinterest y otras plataformas.
12. Usar los resultados para decidir la siguiente canción, serie, horario y variación creativa.

Al terminar el paso 12 se vuelve al paso 1. El aprendizaje acumulado modifica el siguiente recorrido, pero no crea un proyecto separado.

## Continuidad y duplicados

- Una repetición accidental se bloquea por ID, huella de archivo, huella visual o publicación existente.
- Una continuidad intencional comparte `seriesId`, personaje y lenguaje visual.
- Cada cuadro conserva `episode`, `scene`, `frameIndex`, `sourceImage`, `prompt`, `songId` y destino de publicación.
- Reutilizar un personaje dentro de su serie no cuenta como duplicado; reutilizar una pieza sin registrarla sí.

## Trabajo contextual

- El sistema guarda un checkpoint con la última revisión y los IDs ya conocidos.
- Cuando la computadora o la aplicación vuelven a estar disponibles, compara el estado actual contra ese checkpoint y procesa únicamente las diferencias.
- No reconstruye todo el catálogo en cada ejecución.
- Si la computadora está apagada, dormida, sin conexión o sin una sesión válida, no intenta simular actividad ni produce alertas repetidas.
- Al reanudarse, recupera el intervalo pendiente desde `lastSuccessfulCheckAt`.
- Si no existen cambios útiles, permanece en silencio.

## Reglas permanentes

- El audio maestro se conserva en WAV.
- SoundCloud recibe las pistas en privado.
- Ninguna pista se sube sin metadata y portada aprobadas.
- Las imágenes finales de portada son 1:1 e incluyen `Iyari Gomez` y `BlackMamba RECORDS`.
- Las referencias, prompts, archivos finales y URLs publicados quedan vinculados a la ficha de la canción.
