# 023 · Una fila de `core.audit_event` no dice de qué LOTE habla

**Estado: decisión de Daniel, medida y sin construir.** Él eligió el 2026-10-05 arreglar
la lectura ahora —hecho, ficha [009](009-el-unico-lector-de-auditevent-no-puede-acertar.md)—
y dejar esta pregunta escrita como decisión de modelo aparte. **No se ha construido nada.**

## La pregunta, en una línea

Una fila de auditoría identifica **la entidad que cambió** (`entity_type`, `entity_id`).
No identifica **el sujeto de negocio al que ese cambio pertenece**. ¿Debería?

## Por qué la pregunta existe

El defecto de 009 fue posible porque las dos cosas se confundieron. Las escrituras
guardan el id del propio evento —`quantityEvent.id`, `measurement.id`— que es lo correcto
para «qué entidad cambió», y la pantalla quería «qué le pasó a este lote». Hoy eso se
resuelve **en la lectura**, resolviendo los ids de los hechos del lote antes de preguntar.

Eso funciona, está medido y no toca ninguna fila histórica. Lo que no resuelve:

- **Un hecho borrado se lleva su auditoría fuera de alcance.** La lectura llega a la
  auditoría *a través* de la entidad, así que si la entidad no existe, sus filas de audit
  —que sí siguen ahí, porque la tabla es de sólo-añadir— dejan de ser alcanzables desde la
  ficha del lote. Medido el 2026-10-05 en `nectar_ci_historial`: de las **1.792** filas de
  los cinco tipos, **122** apuntan a una entidad viva y **1.670** no.

  **Y ese 1.670 NO es una cifra de producción, dicho para que nadie lo cite como tal.**
  Esa base es la compartida de pruebas: la inmensa mayoría de esas filas son de corridas
  cuyas entidades borró la limpieza de los tests. Cuánto vale en producción **no se ha
  medido y no se puede medir desde aquí** — leer Neon está prohibido. Lo que sí es cierto
  con independencia del número es la **forma**: la auditoría sobrevive a su entidad por
  diseño (§35, sólo-añadir), así que una lectura que pasa por la entidad tiene un punto
  ciego estructural.
- **Cada lector nuevo tiene que volver a saber cómo se cuelga cada hecho de un lote.**
  Hoy son seis tipos y dos de ellos se resuelven por tablas puente
  (`lot_transformation_input` / `_output`). El séptimo lo tendrá que descubrir quien lo
  escriba.

## Las dos formas que tendría, con su coste medido

**A · Una columna de sujeto en `core.audit_event`.** Por ejemplo `subject_type` /
`subject_id`, o un `lot_id` nullable con su índice.

- Toca **290** llamadas a `recordAuditEvent` (medido con control positivo y negativo), o
  al menos las que pertenecen a un lote.
- Las **1.792** filas existentes quedarían con la columna vacía salvo un relleno
  retroactivo. **Y ese relleno es el punto que lo hace decisión tuya, no tarea:** rellenar
  es escribir en filas de auditoría históricas un dato **derivado** de la entidad a la que
  apuntan. `CLAUDE.md` §35 y la rúbrica `21_rubrica_veracidad.md` están escritas contra
  exactamente eso. Se puede hacer bien —marcando la procedencia del relleno— pero es una
  decisión sobre el registro, no un detalle de implementación.
- `core.audit_event.entity_id` es **un uuid sin clave ajena, a propósito**, porque apunta
  a cualquier entidad (lo dice el comentario de `scripts/consolidar-persona-duplicada.ts`).
  Una columna de sujeto heredaría la misma propiedad y el mismo problema.

**B · Dejarlo en la lectura, como está hoy, y que un solo sitio sepa resolverlo.** Hoy ese
sitio es el bloque de sujetos de `getLotDetail`. Si aparece un segundo lector —la ficha de
una parcela, un reporte—, se extrae a una función en vez de copiarse.

- Coste cero hoy, y los históricos funcionan.
- El punto ciego de arriba se queda.
- Y **el guardia que lo vigila existe desde hoy**: si alguien añade un `entityType` al
  bloque de sujetos con el id equivocado, `tests/traceability/historialDelLote.test.ts`
  no lo caza —sólo mira sus dos hechos— pero sí lo cazaría una extensión suya. Eso es
  trabajo pendiente, no decisión.

## Qué lo desbloquea

**Tu respuesta a una sola pregunta:** ¿una fila de auditoría debe poder decir a qué lote
pertenece sin consultar la entidad a la que apunta?

- **Si no**, esta ficha se cierra y la respuesta es B: extraer la resolución a una función
  el día que haya un segundo lector.
- **Si sí**, hay que decidir además **qué se hace con las 1.792 filas que ya están**, y eso
  es lo que ninguna sesión debe decidir sola.

## Lo que NO es

No es un fallo vivo. El panel «Historial» funciona desde el 2026-10-05 y está medido: 104
de 108 lotes estrenan historial con lo ya escrito, máximo 9 filas en un lote. Esta ficha
existe para que la pregunta de modelo no se pierda, no porque algo esté roto.
