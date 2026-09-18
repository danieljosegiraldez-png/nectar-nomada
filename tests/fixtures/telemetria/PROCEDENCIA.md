# Procedencia de estos fixtures

Copiados **sin tocar** del paquete de ingeniería *Smart Hive Node V1* que Daniel
compartió el 2026-09-16 (`outputs/smart-hive-v1 2/schemas/`), el 2026-09-18:

| archivo | sha1 |
|---|---|
| `example-full.json` | `678ae87144b5cddcb9f97e3a84e22178bfc21165` |
| `example-offline.json` | `6e2f30b0c9e9805b27d6b608758781a24a03c190` |

El plan de artefactos lo exige: **no se inventan cargas útiles**. Si una prueba
necesita una variante, la construye a partir de éstos en el propio test, a la vista.

Ojo: los dos comparten `device_id`, `epoch` y `seq` con contenido distinto — son,
entre sí, exactamente el caso «mismo id, contenido distinto» que la ingestión pone
en cuarentena. Las pruebas los aíslan.
