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
  Hoy son **nueve** tipos, y **uno** de ellos —`lot_transformation`— se resuelve por **dos**
  tablas puente (`lot_transformation_input` / `_output`). El décimo lo tendrá que descubrir
  quien lo escriba.

  **CORREGIDO EL 2026-10-05, y lo encontró la revisión de Codex:** esta línea decía «seis
  tipos y dos de ellos se resuelven por tablas puente». Eran dos cosas mal a la vez — son
  nueve tipos desde esa misma revisión, y lo de las tablas puente es **un** tipo por **dos**
  tablas, no dos tipos. Se comprueba en `lots.ts`, en el bloque de sujetos.

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

---

## Los tipos auditados que el historial del lote NO muestra — medido 2026-10-05

**Esta sección existe porque la revisión de Codex objetó, con razón, que presentar el
arreglo como «el historial del lote» sin nombrar lo que falta es la omisión de siempre.**
Tras ella entraron tres tipos más —`sample`, `receiving_event`, `apiary_harvest_event`,
los que `getLotDetail` ya consultaba y nadie leía— y quedan cuatro fuera, cada uno con su
razón escrita.

Medido en `nectar_ci_historial` (copia desechable de la compartida). «Vivas» = filas de
auditoría que apuntan a una entidad que todavía existe **y** cuelga de un lote: es lo que
la ficha podría mostrar hoy.

| tipo | filas de audit | vivas y ligadas a un lote | por qué queda fuera |
|---|---|---|---|
| `treatment_batch` | 519 | **44** | Módulo de **investigación**: exige protocolo. Mezclar la historia de un ensayo con la del lote es decisión de producto, y es la omisión más grande de la tabla. |
| `lot_process` | 62 | 0 | **No es un añadido libre.** Leer el proceso por `lotId` lo rechaza `tests/arquitectura/proceso-por-el-resolvedor.test.ts`: el proceso se abre sobre la cereza y **cubre a sus descendientes**, así que preguntarlo por el lote pierde la primera generación en silencio. Entrar aquí obliga a pasar por `procesoQueCubre`, y entonces la pregunta es otra: **¿el historial de un lote incluye el de sus ancestros?** |
| `asset` | 108 | 0 | Adjuntar evidencia no es un hecho del proceso, y la ficha ya tiene su sección de medios. |
| `store_allocation` | **0** | 0 | No hay ninguna fila de auditoría de ese tipo todavía. |
| `drying_tray_weighing` | **0** | 0 | Igual: cero filas, aunque `capacidadDeBandeja.ts` tenga el escritor. |

**Control del método:** los tipos que SÍ entran dan vivas distintas de cero donde se
espera —medición 38, cosecha 35, transformación 31, cantidad 18— así que un 0 en esta
tabla significa «no hay nada que mostrar», no «no miré». Y el `0` de `store_allocation` y
`drying_tray_weighing` es de la primera columna, que no depende de ninguna unión: ahí no
hay auditoría de ninguna clase.

**Las dos preguntas que esto añade a la de arriba, y las dos son tuyas:**

1. ¿La historia de un **ensayo** (`treatment_batch`) pertenece al historial del lote, o es
   historia de investigación y vive en su propia pantalla?
2. ¿El historial de un lote incluye el del **proceso que lo cubre**, que puede haberse
   abierto en un ancestro? Si sí, el sujeto entra por `procesoQueCubre` y no por `lotId`.

Mientras no se respondan, `getLotDetail` **nombra las cinco exclusiones en el propio
bloque de sujetos**, para que quien añada el décimo las vea donde se escribe el código y
no en esta ficha.
