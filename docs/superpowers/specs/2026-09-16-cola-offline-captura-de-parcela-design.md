# La captura de parcela sobrevive sin señal

**Fecha:** 2026-09-16 · **Encargo de Daniel** · Estado: diseño aprobado por
secciones, pendiente de plan de implementación.

## El problema, medido

`docs/arquitectura/auditoria-campo-apiario-y-parcela.md` (#342) contó, sobre
`origin/main`, qué formularios sobreviven a la falta de cobertura:

| dominio | formularios | encolan |
|---|---|---|
| apiario (zootecnia) | 12 | **4** |
| trazabilidad (café **y tierra**) | 27 | **1** |

De la parcela, **ninguno**. El control es que `InspectionForm` de apiario sí usa
la cola, así que el detector distingue.

**Por qué importa más aquí que en otras pantallas.** Una muestra de suelo se toma
en la parcela, que es justo donde no hay cobertura, y **no se puede repetir a la
vuelta**: el punto, la profundidad, la hora y el árbol ya pasaron. La pantalla
abre sin señal —comprobado en la fuente, `public/sw.js:37`:
`OPERATOR_ROUTE_PREFIXES = ["/apiaries", "/field-sessions", "/lots", "/plots"]`—
así que el sistema promete algo que el botón no cumple: el operador ve su parcela, pulsa «registrar» y
pierde el dato.

## Alcance: cuatro creaciones de campo

| tipo de mutación | modelo | lo que el servidor exige hoy |
|---|---|---|
| `soil_sample` | `SoilSample` | `locationId`, `sampleCode`, `sampledAt`, `provenanceClass` |
| `foliar_sample` | `FoliarSample` | ídem + protocolo de campo (par de hojas, altura de copa, fenología, rama con fruto) |
| `soil_profile` | `SoilProfile` | `locationId`, `describedAt`, `provenanceClass` |
| `planting_cohort` | `PlantingCohort` | `locationId`, `status`, `provenanceClass` |

Los nombres siguen la convención existente (`colony_event`, `varroa_count`):
minúsculas con guión bajo.

### Lo que queda FUERA, y no por difícil

Esto es la corrección que hizo Daniel al leer el alcance anterior, y es la que
ordena todo el diseño: **el análisis de laboratorio no es trabajo de campo.**

- **Subir el resultado del laboratorio.** El informe llega en papel o en PDF y se
  teclea o se adjunta después, sentado y con señal. Y el esquema ya lo separa:
  `SoilSample.measurements → Measurement[]` — el resultado cuelga de la muestra,
  no es la muestra. El campo `SoilSample.laboratory` sólo dice a cuál se mandó.
- **Editar atributos de la parcela** (`updateLocationAttributes`), **editar una
  cohorte** y **editar un perfil** ya creados. Corregir un dato es trabajo de
  oficina.

Encolar una edición además abre un problema que hoy no existe: dos operadores
editan la misma parcela sin señal, sincronizan por la tarde y **el segundo pisa
al primero sin que nadie lo vea**. Los tres modelos llevan `updatedAt`, así que
el día que la edición en campo resulte necesaria se puede rechazar la que llegue
tarde —`baseUpdatedAt` en la mutación y `rejected` con motivo— sin inventar una
pantalla de conflictos. **Hoy no se construye eso.**

## Cómo se evita el duplicado

Ninguno de los cuatro modelos tiene `clientDraftId`. Sin él, un reintento **crea
la muestra dos veces**, y una muestra duplicada envenena un promedio sin que
nadie lo note: es peor que perderla.

`Inspection` ya resuelve esto y es el patrón a copiar:

```prisma
clientDraftId String? @unique @map("client_draft_id")
```

El replay pregunta por esa columna antes de crear; si ya estaba devuelve
`duplicate` en vez de `applied`, que es lo que `syncFieldEvents` espera para
descartar el borrador sin contarlo como aplicado.

**Lo que NO sirve como clave**: `@@unique([locationId, sampleCode])`, que ya
existe en las dos tablas de muestra. Es una clave **del operador**, no del
aparato: dos tomas legítimas con el mismo código chocarían, y una reintentada con
el código corregido se duplicaría igual.

`SoilProfile` y `PlantingCohort` no tienen ninguna clave natural —comprobado: cero
`@@unique`—, así que para ellas `clientDraftId` es la única defensa.

## Por dónde viaja: se extiende lo que hay

**Ni cola nueva ni endpoint nuevo.** La cabecera de `lib/sync/offlineQueue.ts`
deja escrita la deuda de unificar las dos colas y dice cuándo toca: «cuando
apiario pase a push por lotes». No es hoy, y mezclarlo sería otra revisión.

1. **Cliente** — los cuatro formularios reciben el `onSubmit` de
   `FieldSessionForms`, copiado: `navigator.onLine` decide, y sin señal se llama
   a `queueFieldEvent` en vez de dejar correr la Server Action.

   Se decide por `navigator.onLine` y no intentando la petición primero porque
   `onLine === false` es una certeza, mientras que un `fetch` que tarda es
   indistinguible de un servidor lento y deja al operador mirando un botón girar
   en mitad de un cafetal. Lo que `onLine === true` no garantiza es que haya
   internet —una wifi de finca sin salida da `true`—; ese caso lo recoge la otra
   mitad, porque la acción del servidor falla y el operador lo ve.

   **El `try` no es decorativo.** Tras `preventDefault()` la Server Action ya está
   cancelada, así que un fallo al encolar dejaría la anotación en ninguna parte.
   Ya ocurrió una vez con el desfase horario, y la pantalla seguía diciendo
   «guardado en este dispositivo».

2. **Parseo** — cuatro ramas nuevas en `lib/sync/parsearMutaciones.ts`, cada una
   exigiendo `clientDraftId`, `locationId` y su fecha obligatoria. Vive ahí y no
   en la ruta porque importar la ruta arrastra `next-auth`, que vitest no
   resuelve: mientras el parseo estuvo dentro no tuvo ni una prueba, y se quedó
   sin la rama de `colony_end` toda la A9.5.

3. **Aplicación** — cuatro ramas en `lib/sync/pushFieldEvents.ts` que consultan
   `clientDraftId`, y si no estaba llaman a `createSoilSample`,
   `createFoliarSample`, `createSoilProfile` y `createPlantingCohort` **tal cual**,
   con su `AuditEvent` en la misma transacción. Las validaciones de dominio
   —código obligatorio, profundidad coherente, submuestras ≥ 1— no se duplican:
   un `SampleValidationError` se traduce a `rejected` con su motivo, como ya hace
   la rama de apiario.

## El `kind` desconocido, que hoy bloquea la cola entera

`parsearMutaciones` devuelve `{ ok: false }` ante un `kind` que no reconoce, y la
ruta responde **400 para el lote completo**. Su propio comentario lo dice: «un
solo borrador con un `kind` que la ruta no conoce bloquea la cola entera», y ya
pasó con `colony_end`.

**Decisión:** un `kind` desconocido pasa a rechazarse **por mutación**, no por
lote — `{ clientDraftId, status: "rejected", reason: "unknown_kind" }`. El lote
sigue, las demás mutaciones se aplican, y ese borrador queda en la cola con su
error a la vista. Lo malformado —sin `clientDraftId`, sin ids— **sigue siendo 400
de lote**, porque sin `clientDraftId` no hay a quién atribuir el rechazo.

Alcance real de esta protección, dicho sin inflarlo: cliente y servidor se
despliegan juntos, así que «cliente nuevo contra servidor viejo» sólo ocurre con
un bundle cacheado por el service worker durante un despliegue. Es estrecho, pero
el coste de no cubrirlo es una cola atascada que el operador no puede desatascar.

## Cómo se comprueba

- **Parseo**: las cuatro formas buenas, y una malformada por tipo. Más el caso
  del `kind` desconocido, que ahora debe rechazar sólo esa mutación y dejar pasar
  las otras del mismo lote.
- **Replay**: aplicar una vez → `applied`; repetir el mismo `clientDraftId` →
  `duplicate` y **una sola fila en la tabla**; un `SampleValidationError` →
  `rejected` con su motivo y sin fila.
- **Flip-test de la columna**: quitando `@unique` de `clientDraftId`, el caso del
  duplicado tiene que **caer**. Si pasa igual, la prueba no estaba midiendo la
  idempotencia sino el azar del orden.
- **Cliente**: con `navigator.onLine === false` no se llama a la Server Action y
  sí a `queueFieldEvent`; con un `queueFieldEvent` que lanza, la pantalla dice
  error y **no** dice «guardado».
- **Control positivo obligatorio en cada prueba de conteo**: afirmar primero
  cuántas mutaciones se parsearon o cuántas filas hay, porque un cero se lee como
  «limpio» cuando significa «no miré».

> **Dos documentos citan una lista vieja de ese mismo array** —
> `docs/arquitectura/auditoria-ux-campo.md` y
> `docs/implementation/48_A9_CAPTURA_DE_CAMPO_REPORTE.md` dicen
> `["/apiaries", "/lots"]`, sin `/field-sessions` ni `/plots`—. Se señala y no
> se corrige aquí: son de otra revisión. Pero conviene no leerlos como fuente.

## Lo que esto NO resuelve

- **Las fotos de parcela.** `LandPhotoUploadForm` sigue sin cola; los medios
  tienen su propio endpoint (`/api/v1/sync/field-media`) y su propia forma.
- **La edición en campo**, por la decisión de arriba.
- **Apiario sigue con su cola aparte.** Las dos colapsan cuando apiario pase a
  lotes, no antes.
- **Nada de esto se ha visto en un teléfono en una parcela.** La auditoría que lo
  originó fue de código, no de pantalla: no se midió viewport, ni áreas táctiles
  renderizadas, ni contraste al sol.
