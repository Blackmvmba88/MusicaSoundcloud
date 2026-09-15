# SoundCloud Metrics — Gap audit

Fecha de revisión: 2026-09-15.

## Objetivo

Separar tres cosas que no deben confundirse:

1. métricas disponibles en la **SoundCloud Public API**;
2. métricas visibles únicamente en **Creator / Advanced Insights**;
3. métricas que BLACKMAMBA puede reconstruir hacia adelante mediante snapshots propios.

La fuente técnica autoritativa para endpoints es el OpenAPI oficial de SoundCloud:

- https://developers.soundcloud.com/docs/api/explorer/
- https://github.com/soundcloud/api/blob/master/openapi/api.yaml

La documentación de Insights está en:

- https://help.soundcloud.com/hc/en-us/articles/115003564988-Insights-on-SoundCloud
- https://help.soundcloud.com/hc/en-us/articles/45787456969115-Advanced-SoundCloud-Insights
- https://help.soundcloud.com/hc/en-us/articles/45764984867355-Your-Insights-troubleshooting

## Resultado

| Dato | Public API | Insights UI | BLACKMAMBA ahora | Nota |
| --- | --- | --- | --- | --- |
| plays acumulados por pista | sí: `playback_count` | sí | snapshot tipado | contador de vida de la pista |
| likes acumulados por pista | sí: `favoritings_count` | sí | snapshot tipado | contador de vida de la pista |
| comentarios acumulados | sí: `comment_count` | sí | snapshot tipado | contador de vida de la pista |
| reposts acumulados | sí: `reposts_count` | sí | snapshot tipado | contador de vida de la pista |
| descargas acumuladas | sí: `download_count` | sí | snapshot tipado | puede ser `null`/0 según pista |
| top tracks por vida | derivable | sí | derivable | ordenar `playback_count` |
| plays de hoy / semana / 12 meses | no hay endpoint público documentado | sí | no histórico; delta hacia adelante | los snapshots no reconstruyen el pasado |
| gráfica por hora/día/mes | no hay endpoint público documentado | sí | delta entre snapshots futuros | mide cuándo cambia el contador, no necesariamente el instante real de escucha |
| top 50 fans / listeners | no hay endpoint público documentado | sí, Artist Pro | pendiente de fuente oficial | no sustituir por followers/likers |
| países | no hay endpoint público documentado | sí, Artist Pro | pendiente de fuente oficial | no inferir desde perfiles |
| ciudades | no hay endpoint público documentado | sí, Artist Pro | pendiente de fuente oficial | no inferir desde perfiles |
| websites / apps de origen | no hay endpoint público documentado | sí, Artist Pro | pendiente de fuente oficial | no inventar referrers |
| export de Insights | no | UI sin export oficial | no | SoundCloud indica que actualmente no existe exportación |

## Implementación M0 de métricas

Se agrega un recolector **read-only** que usa exclusivamente recursos documentados de la Public API:

```bash
npm run soundcloud:metrics:snapshot
```

Cada ejecución:

```text
GET /me
GET /users/{user}/tracks (paginado)
        |
        v
normalizar contadores públicos
        |
        +--> SQLite: soundcloud_metric_snapshots
        |
        +--> reports/soundcloud-metrics-latest.json
```

No edita pistas, no publica, no borra y no usa endpoints internos de la web de Insights.

## Semántica de los snapshots

Los campos de la API son contadores acumulados. Por ejemplo:

```text
T0 playback_count = 1000
T1 playback_count = 1040

DELTA(T0,T1) = +40
```

Ese `+40` sirve para construir tendencia propia desde que BLACKMAMBA empieza a capturar snapshots. No equivale necesariamente a "40 plays ocurridos exactamente dentro de la ventana" porque SoundCloud puede registrar actividad con retraso; por ejemplo, la documentación de Insights indica que algunas reproducciones offline pueden aparecer posteriormente.

Por eso el dashboard debe distinguir siempre:

```text
OFFICIAL_PERIOD_INSIGHT   !=   SNAPSHOT_COUNTER_DELTA
```

Ambos pueden coexistir, pero nunca deben etiquetarse como si fueran la misma medición.

## Regla para Advanced Insights

Hasta que SoundCloud publique un endpoint o export oficial para países, ciudades, fans y fuentes:

- no adivinar endpoints privados;
- no depender de llamadas internas capturadas del navegador;
- no hacer scraping frágil como fuente canónica;
- permitir evidencia manual (captura o transcripción) únicamente con `source = manual` y período explícito;
- conservar la separación entre datos oficiales de API, datos oficiales visibles en UI y cálculos derivados por BLACKMAMBA.

## Próxima capa

Cuando existan al menos dos snapshots se puede construir:

```text
metrics delta
metrics top-tracks
metrics velocity
metrics concentration
metrics long-tail
```

Con suficiente historial local:

```text
track velocity
catalog share
top-N concentration
release decay
catalog resurrection
```

Países, ciudades, top fans y sources quedan deliberadamente fuera de esta primera automatización hasta disponer de una fuente soportada.
