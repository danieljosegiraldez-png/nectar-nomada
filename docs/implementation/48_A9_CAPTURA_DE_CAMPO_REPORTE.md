# A9 — Captura de campo en el apiario: informe de alcance

Respuesta a `48_A9_CAPTURA_DE_CAMPO_PROMPT.md` (versión del 2026-09-07, con
D7–D9). Levantado el 2026-09-07 leyendo el esquema, `lib/`, `app/`,
`prisma/migrations/` y `docs/architecture/` — no de memoria.

**Nada de este informe toca el esquema ni escribe código.** Es lo que se pidió.

---

## 0. Cómo leer esto, y qué se midió

**Cuatro estados, nunca dos** (§5 del prompt):

- **CÓDIGO** — existe en `prisma/schema.prisma`, `lib/`, `app/` o
  `prisma/migrations/`, y algo lo llama.
- **CÓDIGO SIN USO** — existe y ninguna ruta lo ejercita, o lo ejercita mal.
  Es el estado que más caro sale de confundir, porque se lee igual que CÓDIGO.
- **DOCUMENTO** — especificado en `docs/`, sin código.
- **SIN DIRECCIÓN** — nadie lo escribió ni lo decidió.

**Qué midió cada afirmación.** Toda cifra de abajo lleva el comando o el
archivo del que salió. Donde afirmo una ausencia, va con su control positivo:
«no encontré X» no vale hasta enseñar que la misma búsqueda sí encuentra Y.

Base de la lectura: `prisma/schema.prisma` (202 `model`/`enum`), 95 sitios de
llamada a `recordAuditEvent` fuera de `lib/audit.ts`, `docs/architecture/`
(43 archivos), `docs/implementation/` (50).

**Nota sobre el Anexo D.** Cuando empecé a leer, `48_A9_ANEXO_D_CAPTURA_ASISTIDA.md`
no existía en disco y este informe llevaba aquí un aviso diciéndolo. **Apareció
mientras se escribía y está leído entero**; D8 lo incorpora y lo contradice en
un punto. `protocolos/apiario-campo-v1.json` es material aparte —el contenido de
las listas de chequeo, entrada de D2— y también está leído.

---

## 1. Las correcciones — dónde el repositorio tiene mejor respuesta que los anexos

Esto va primero porque cambia de dónde parten cuatro de las nueve decisiones.
Están ordenadas por cuánto mueven la aguja, no por número de anexo.

### 1.1 El único lector de `AuditEvent` en pantalla que existe está roto, en silencio

Esta es la corrección más cara del informe, porque D3 se apoya justo en ella.

`lib/traceability/lots.ts:728` es **el único sitio del repositorio** que lee
`AuditEvent` para mostrarlo:

```
prisma.auditEvent.findMany({ where: { entityType: "Lot", entityId: lotId }, ... })
```

**Nada escribe nunca `entityType: "Lot"`.** Los 95 sitios de escritura usan
`snake_case` sin excepción — `inspection`, `colony_event`,
`apiary_harvest_event`, `lot_transformation`, `lot_roast_profile`,
`quantity_event`, `measurement`, `harvest_event`… La única aparición de la
cadena `"Lot"` en todo `lib/` y `app/` es esa consulta.

```bash
grep -rhn 'entityType: "' lib app --include="*.ts" --include="*.tsx" \
  | sed 's/.*entityType: "\([^"]*\)".*/\1/' | sort | uniq -c | sort -rn
#   … 66 valores, todos snake_case … y una sola línea:  1 Lot
grep -rn 'entityType: "Lot"' lib app --include="*.ts" --include="*.tsx"
# lib/traceability/lots.ts:728   ← el lector. Ningún escritor.
```

Consecuencia: el panel «Historial» de `app/lots/[id]/page.tsx:973` renderiza
**siempre vacío**, y dice `noHistory` — «este lote no tiene historial», que es
una afirmación sobre el lote hecha por una consulta que no puede acertar nunca.
Es la forma exacta que `CLAUDE.md` de este repositorio llama guardia falso:
un cero que se lee como «limpio» y significa «no miré».

Y el comentario que lo explica **ya no es cierto**. `lib/traceability/lots.ts:684-688`
dice:

> `auditEvents` is intentionally queried even though no Phase 1 write path has
> ever populated `core.AuditEvent` for a traceability entity yet — the section
> renders correctly empty, which is an honest reflection of unbuilt
> instrumentation, not a bug in this query.

Eso era verdad cuando se escribió. Hoy `lots.ts:333` escribe
`lot_transformation`, `roasting.ts:375` escribe `lot_roast_profile`, y
`measurements`, `harvest`, `quantity`, `samples`, `drying`, `fermentation` y
`plantingCohorts` escriben lo suyo. La instrumentación se construyó; la
consulta se quedó atrás. **Una instrucción vieja es peor que ninguna**, y ésta
lleva meses certificando que el panel vacío está bien.

*Aviso de alcance: no he corregido nada. Es un hallazgo, y arreglarlo no es de
este alcance — pero D3 no se puede contestar sin saberlo.*

### 1.2 El apiario sí audita — y por eso `before` está siempre vacío

El prompt (D3) pregunta «si `AuditEvent` se escribe hoy en las acciones de
apiario». Sí: ocho llamadas, en `lib/apiary/colonyEvents.ts:101`,
`lib/apiary/inspections.ts:82`, `lib/apiary/harvest.ts:118` y
`lib/apiary/hives.ts:141`.

Pero las ocho son `.create`, y **no existe ninguna función de actualización en
todo el módulo `lib/apiary/`**:

```bash
grep -n "operation:" lib/apiary/*.ts
# colony.create · inspection.create · colony_event.create · apiary_harvest_event.create
```

Control positivo: la misma forma de búsqueda sobre `lib/traceability/locations.ts`
sí encuentra un `update` con `before`/`after` (`locations.ts:146-147`).

Esto reencuadra D3 por completo. **No es «mostrar en pantalla lo que ya se
guarda»**: hoy no hay nada que mostrar, porque nada se edita. La enmienda es
un **camino de escritura que no existe**, y `AuditEvent` ya tiene exactamente
la forma para registrarlo (`before`/`after`/`reason`/`sourceInterface`,
`schema.prisma:431-447`, índice `@@index([entityType, entityId])` (`:444`) — lectura por
entidad a coste indexado, que es la otra mitad de lo que D3 pregunta).

**Y una brecha suelta que ningún anexo nombra:** `lib/apiary/media.ts` no
escribe `AuditEvent` en ninguna de sus dos funciones
(`requestApiaryAssetUpload`, `finalizeApiaryAssetUpload`), mientras que
`lib/traceability/media.ts` y `lib/sync/fieldMedia.ts` sí lo hacen. Subir una
foto al apiario no deja rastro; subirla al café, sí.

### 1.3 D1 no cuesta columnas. Cuesta RBAC — y deja fuera justo a quien se quiere entrenar

El Anexo A §1 y D1 plantean la pregunta como «¿caben los campos del apiario en
`FieldSession` sin que la mitad queden nulos?». Esa es la pregunta barata. La
cara es ésta:

| | `FieldSession` (café) | Apiario |
|---|---|---|
| Compuerta | `requireLocationAttributeAccess` (`lib/traceability/fieldSessions.ts:20`, usada en `startFieldSession` y `recordFieldEvent`) | `requireApiaryAccess` (`lib/apiary/hives.ts:33`) |
| Permiso | `location:manage_attributes` (`lib/traceability/locations.ts:102`) | `apiary:manage` / `apiary:view`, o el más estrecho `colony_event:manage` |
| Ámbitos que prueba | **sólo `location`** (`locations.ts:101`) | **`project` y después `location`** (`hives.ts:25-31`) |

Tres consecuencias, todas verificables en `lib/rbac/catalog.ts`:

1. **Farm Operator ya puede.** Tiene `apiary:manage` y `location:manage_attributes`
   (`catalog.ts:288-293`). Para Daniel y para Kenneth, extender `FieldSession`
   al apiario cuesta **cero** trabajo de permisos.
2. **Apiary Colony Event Recorder no puede, y es el caso que motiva el ticket.**
   Ese perfil tiene `apiary:view`, `colony_event:manage` y
   `classification:clear_internal` — y **ni `apiary:manage` ni
   `location:manage_attributes`** (`catalog.ts:339-360`; los permisos, en `:346-360`). Es literalmente el
   perfil del residente entrenado que el dueño quiere para no pagar ~$62 de
   viaje desde Parita. Con `FieldSession` tal como está hoy, **no puede abrir
   una visita**.
3. **El arreglo barato es el arreglo malo.** Concederle
   `location:manage_attributes` para que abra la visita le da autoridad para
   reescribir los atributos de terruño del sitio (sol, sombra, altitud,
   pendiente, suelo, espaciamiento — la descripción del permiso está en
   `catalog.ts:95`). Eso es **ensanchar**, y `CLAUDE.md` §10 dice que una
   asignación contextual normalmente estrecha. El comentario de ADR-069 en
   `catalog.ts:349-355` se cuidó explícitamente de no hacerlo: «esto concede la
   habilitación para ver sitios internos, no la autoridad para hacer más en
   ellos».

**El trabajo real de D1 es una compuerta nueva**, no columnas. Lo digo aquí
porque una estimación que sólo cuente campos va a fallar por el lado que
importa.

### 1.4 «`FieldEvent` fue diseñado para café» — media verdad

Anexo A §1: *«No hay FK a `Inspection`, `ColonyEvent`, `Hive` ni `Colony` en
ninguna parte del esquema. Fue diseñado y construido para café.»*

La primera frase es cierta y la verifiqué (`schema.prisma:3824-3905`: seis FK
anulables, ninguna del apiario). **La segunda no.** El audit que especificó
`FieldEvent` nombra la colonia entre los padres que debía indexar:

> `docs/architecture/COFFEE_FIELD_OS_AUDIT.md:347-348` — *«The existing event
> tables are each anchored to their own domain parent (a run, **a colony**, a
> stage), never to a visit.»*

Las FK del apiario **faltan, no están excluidas**. La diferencia importa: no es
deformar una tabla de otro dominio, es terminar el diseño que el audit ya
describió. Eso mueve D1 bastante.

### 1.5 La deuda de las dos colas ya está escrita, y este ticket es su disparador nombrado

`lib/sync/offlineQueue.ts:1-18` — cabecera literal, no paráfrasis:

> *«**Por qué existe habiendo ya `lib/apiary/offlineQueue.ts`, dicho para que no
> parezca un descuido.** Aquella cola sincroniza de una en una […]. El de P4 es
> por lotes con resultado por mutación […]. **La deuda queda escrita:** el audit
> §18 dice "generalize it rather than replacing it" […]. **El momento es cuando
> apiario pase a push por lotes; entonces las dos colapsan en ésta y
> `lib/apiary/` pasa a ser un envoltorio.**»*

Hoy hay dos pilas offline completas y separadas:

| | `lib/apiary/offlineQueue.ts` | `lib/sync/offlineQueue.ts` + `/api/v1/sync/*` |
|---|---|---|
| Almacén IndexedDB | `nectar-apiary-offline` | `nectar-field-offline` |
| Tipos de borrador | `"inspection" \| "colonyEvent"` (`:20`) | payload genérico de `FieldEvent` |
| Protocolo | uno a uno, vía server action | lote, con resultado por mutación |
| Autenticación | cookie de sesión web | token de `Device` (`/api/v1/auth/token`) |
| Cubre foto / cosecha / visita | **no** | media sí (`/api/v1/sync/field-media`) |

Ninguno de los anexos menciona que existan dos. Es el argumento estructural
más fuerte a favor de extender en vez de crear: **una entidad de visita nueva
haría tres.**

### 1.6 D4 ya tiene modelo escrito, y no es ninguna de las tres opciones del prompt

D4 ofrece: `closedAt` en la visita, estado por registro, o vista derivada. Hay
una cuarta, especificada, y ni el prompt ni el Anexo A la citan:

`docs/architecture/GUIDED_FIELD_STUDY_TOOL.md:48-49` y `:65-72`:

```
field_study.study(… status [draft|completed|locked], completed_at (nullable),
  edit_window_expires_at (nullable — completed_at + 48h) …)
```

> *«**Editing**: completed studies stay editable for 48 hours, then lock.
> Corrections after locking follow the same superseded-version pattern […].
> This is deliberately looser than formal Sensory Assessments (immutable
> immediately) — field data entry is more correction-prone in the field than a
> formal lab/panel submission, and a same-day/next-day grace window reflects
> that honestly.»*

Ese razonamiento es **exactamente** el del dueño: se captura frente a la caja y
se termina en el carro o en la casa. Ya está decidido, argumentado y sin
construir. Volver a derivarlo sería la tercera vez.

Y el mismo documento trae algo que `FieldSession` **no** tiene y el dueño sí
pidió: `study_contributor(study_id, person_id, role_in_session)` —
**varios operadores por sesión**. `FieldSession.operatorPersonId` es uno solo,
obligatorio (`schema.prisma:3671-3672`). El Anexo B §1 pide «Operadores» en
plural y lo marca «parcial». No es parcial: es **uno**.

### 1.7 D7 ya está especificado, con otro nombre, y aprobado como arquitectura

D7 propone renderizar el PDF «desde `contentSnapshot`». La cadena
`contentSnapshot` / `content_snapshot` **no aparece en el esquema**
(control: `grep -n "snapshot" prisma/schema.prisma` devuelve una única línea,
`:1335`, sobre precios de pedido). Pero el concepto sí está escrito:

`docs/architecture/COMMERCE_OPERATIONS_TOOLS_ARCHITECTURE.md:501-507`:

```
reporting.report            (id, report_type[lot|experiment|farm|consulting|
                              sensory], subject_entity_type, subject_entity_id,
                              status, created_by)
reporting.report_version    (id, report_id, version, generated_at,
                              generation_query jsonb, rendered_snapshot jsonb,
                              generated_by)
reporting.report_publication (id, report_version_id, surface[web|pdf|
                              client_portal|download], published_at)
```

`rendered_snapshot` **es** el `contentSnapshot` de D7. `report_type` ya incluye
`consulting` y `farm`. `surface` ya incluye `pdf`, `client_portal` y `download`.
Y `generation_query` añade algo que D7 no pidió y vale: qué consulta produjo
esa versión, para poder **regenerarla y compararla** en vez de sólo re-teclearla.
El documento razona la versión con la misma regla de siempre —«un reporte
histórico de cliente no debe cambiar porque el dato de abajo se corrigió
después»— y `DECISIONS.md` lo aprobó como arquitectura y secuencia (ADR-020).

Además, la limitación ya está escrita en el reporte que sí existe:
`lib/traceability/reports.ts:18-27` — *«This function always computes the report
fresh from current data […] not that a historical version is preserved across
future corrections — that's the deferred `report_version` concern, not built
here.»*

**Estado: DOCUMENTO, no SIN DIRECCIÓN.** Cualquier tabla nueva de reporte de
visita que no se llame `reporting.report_version` está creando el cuarto
mecanismo de versionado de este repositorio.

### 1.8 El clima **sí** es tabla nueva — el Anexo C §4.1 se equivoca

Anexo C §4.1: *«Entra por el camino de medición con fuente externa que ya
existe; no es tabla nueva.»*

`MeasurementSourceType` sí tiene `external_context` (`schema.prisma:2919`). Pero
`Measurement` **no tiene `locationId`**:

```bash
awk '/^model Measurement \{/,/^\}/' prisma/schema.prisma | grep -c ""      # 125 líneas
awk '/^model Measurement \{/,/^\}/' prisma/schema.prisma | grep -c lotId   # 6  ← control positivo
awk '/^model Measurement \{/,/^\}/' prisma/schema.prisma | grep locationId # vacío
```

Sus once sujetos son `lot`, `sample`, `fermentationRun`, `dryingRun`,
`storageAssignment`, `roastSession`, `treatmentBatch`, `processingStage`,
`biocharBatch`, `soilSample`, `foliarSample`. **Ninguno es una `Location`.** Una
lluvia diaria del apiario no tiene dónde colgarse.

Y el propio esquema nombra la casa correcta, dos veces:

- `schema.prisma:607` — *«Rainfall deliberately does NOT live here — it's a
  daily measurement (`EnvironmentalObservation`, specified §6, not built)»*.
- `schema.prisma:6` — *«environmental schema is still correctly absent; that
  module isn't built yet.»*

Lo que el Anexo A §7 sí acierta: los proveedores están decididos
(`EXTERNAL_DATA_ARCHITECTURE.md:139-140`, Open-Meteo y NASA POWER como CORE) y
no hay una línea de ingesta (`grep -rn "open-meteo\|NASA POWER" lib app` →
vacío). Lo que falta no es proveedor **ni** enganche: es **el esquema
`environmental` entero**.

### 1.9 Sí hay campo de hectáreas — el Anexo A §10 se pasa de frenada

Anexo A §10: *«No hay campo de hectáreas comprometidas, contrato, ni densidad
objetivo en todo el esquema.»*

`Location.areaHectares` existe (`schema.prisma:633`, `Decimal(10,4)`, añadido en
P1 §3 precisamente para poder calcular rendimiento por hectárea). Y
`PlantingCohort.densityPerHectare` existe (`:3940`) — pero es **plantas** por
hectárea, no colmenas.

Lo que genuinamente no existe: **hectáreas comprometidas bajo contrato** (que no
es lo mismo que el área del lote), **densidad objetivo de colmenas/ha**, y
cualquier noción de contrato. El cociente de D6 —17 ha × 4–6 colmenas/ha =
68–102 contra 3— necesita dos números nuevos, no cuatro. Es más barato de lo
que el anexo dice.

### 1.10 Correcciones menores, con su línea

| Dice el anexo | Dice el repositorio |
|---|---|
| Anexo C §1.1: «hoy, sin A9.1, la última visita sólo se puede aproximar con un máximo sobre las inspecciones» | `getApiaryList` (`lib/apiary/hives.ts:224-253`) devuelve `Location` + `hives` y **ninguna fecha de ningún tipo**. Hoy la pantalla no aproxima nada: no muestra tiempo |
| Anexo C §4.1: «`Location` ya guarda latitud, longitud y punto PostGIS» | Cierto, pero `geoPoint` es `Unsupported("geography(Point,4326)")` (`schema.prisma:595`) y **cero líneas de aplicación lo referencian** (`grep -rn geoPoint lib app` → vacío; el propio esquema lo dice en `:629`). Para el mapa sirven `latitude`/`longitude`, que son `Float?` legibles |
| Anexo A §5: «no existe un `DASHBOARDS.md`» | **Confirmado.** `ls docs/architecture/ \| grep -i dash` → vacío |
| Anexo A §12: «no se encontró ninguna librería de generación de PDF» | **Confirmado.** Ni `pdfkit`, `jspdf`, `puppeteer`, `playwright`, `@react-pdf` ni `pdf-lib` en `package.json` (control: el archivo sí tiene 81 líneas con comillas, o sea la búsqueda mira donde debe) |
| Anexo C §1: la entrada es el mapa | El mapa está **especificado entero** (`MAP_AND_TERRITORY.md`, Mapbox + PostGIS, ADR-001/ADR-009) y tiene **cero código**: ni `mapbox`, ni `maplibre`, ni `leaflet` en `package.json`, `app/` ni `lib/` |
| Anexo D §1: «QR / NFC» como una sola pieza | No lo son: Web NFC no existe en iOS Safari. Ver **D8** |
| Anexo D §3: «ya hay PostGIS para resolver el más cercano» | La extensión está (`schema.prisma:20`) pero `geoPoint` es `Unsupported(...)` (`:595`) y **Prisma no lo consulta**. Es `$queryRaw` o distancia sobre `latitude`/`longitude`. Ver **D8** |
| Anexo C §1.2: umbrales «alerta» | No existe modelo `Notification` **en absoluto** (`DOMAIN_MODEL.md:316-318`, `[DEFERRED]`). Pero lo que el anexo describe es el **color del borde de una tarjeta**, que es una consulta derivada y no necesita tabla. Ver **D9** en §2 |

---

## 2. Las nueve decisiones

Formato de cada una: **veredicto**, por qué, y **qué se pierde si me equivoco**
—recuperable o no— en la forma de `22_APIARY_V1_SCOPING_REPORT.md` §5.

### D1 — La visita es `FieldSession` extendida. Con una compuerta nueva, no con `location:manage_attributes`.

**Veredicto: extender.** Y la razón decisiva no es la economía de tablas.

Tres cosas empujan en la misma dirección, y ninguna es «reutilizar es más
barato»:

1. **El audit ya nombró la colonia** como uno de los padres que `FieldEvent`
   debía indexar (`COFFEE_FIELD_OS_AUDIT.md:347-348`, §1.4 de este informe).
   Las FK faltan; no se excluyeron.
2. **Una entidad nueva crea la tercera cola offline**, y la deuda de tener dos
   ya está escrita con su disparador: *«el momento es cuando apiario pase a push
   por lotes»* (`lib/sync/offlineQueue.ts:12-15`). Este ticket **es** ese
   momento. Una `ApiaryVisit` propia lo desperdicia y deja tres protocolos de
   sincronización que mantener.
3. **El precedente de extender un sujeto ya está pagado y medido.**
   `TreatmentBatch` pasó de un sujeto (`lotId`) a dos (`+ locationId`) por
   decisión del dueño el 2026-09-01, con un CHECK en base
   (`treatment_batch_un_solo_sujeto`, `prisma/migrations/20260901090000_s1_amendment_application/migration.sql:39`)
   y el coste escrito a la vista en el esquema (`:5270-5272`): *«`TreatmentBatch`
   significa dos cosas según a qué apunte.»* Sabemos cuánto cuesta esta jugada
   porque ya se hizo.

**Contra el argumento de D1 a favor de entidad nueva** («la mitad de las
columnas nulas siempre»): los tres hechos que D1 dice que no caben —conteo de
colonias vivas del sitio, condición del emplazamiento, compromiso con el
cliente— **no son campos de la sesión**. Son:

- **Conteo de colonias vivas**: un `FieldEvent` con su propio `eventKind`, del
  sitio y no de una caja. Encaja hoy en la tabla sin columna nueva salvo el
  sujeto (ver abajo). Un conteo es un hecho fechado, no un atributo de la
  jornada — y como `FieldEvent`, se puede corregir sin tocar la visita.
- **Condición del sitio**: `FieldSession.notes` ya existe (`schema.prisma:3690`).
- **Compromiso con el cliente**: es del **contrato de polinización**, no de la
  visita. Ponerlo en la sesión sería duplicarlo en cada una.

Lo que sí hay que añadir a `FieldSession`, y es poco:

| Añadir | Por qué no cabe hoy |
|---|---|
| `FieldEvent.inspectionId`, `.colonyEventId`, `.apiaryHarvestEventId` | las tres FK que faltan; `Asset` ya aplica este patrón quince veces (ADR-020 dec. 8) |
| operadores en plural | `FieldSession.operatorPersonId` es **uno**, obligatorio (`:3671`). El modelo está escrito: `study_contributor` (`GUIDED_FIELD_STUDY_TOOL.md:51`) |
| propósito de la jornada | `eventKind` describe el evento, no la visita. Es un `VariableCatalog` más, no un enum (precedente P1) |
| ciclo de cierre | ver **D4** |

**Lo que hay que construir aparte, y es el grueso del trabajo:** una compuerta
que acepte a quien el apiario ya autoriza. `requireLocationAttributeAccess`
prueba **sólo ámbito `location`** y exige `location:manage_attributes`
(`lib/traceability/locations.ts:101-103`); `requireApiaryAccess` prueba
**`project` y después `location`** (`lib/apiary/hives.ts:25-31`). Sin eso, el
Apiary Colony Event Recorder —el residente entrenado que motiva el ticket— no
puede abrir una visita, y toda asignación de A7 con ámbito de proyecto queda
fuera (§1.3).

**Si me equivoco:** el modo de fallo es que dentro de dos temporadas
`FieldSession` sea una tabla que significa tres cosas —jornada de café,
visita de apiario, estudio floral— y ninguna bien; el mismo coste que el
esquema ya paga por `TreatmentBatch`, multiplicado. **Recuperable, con dolor
medio:** separar después es una migración de datos que sí existen, no un
rediseño — la jornada de apiario se distingue por `Location.locationType =
apiary_site`, que es una consulta, no una adivinanza. Lo irreversible sería lo
contrario: nacer con entidad propia y tres colas de sincronización.

### D2 — Protocolo versionado reutilizando Research OS. Pero el sujeto es la **visita**, no la `Colony`.

**Veredicto: reutilizar `Protocol`/`ProtocolVersion`/`ProtocolVariable`. No
construir el tercer motor, y no meter la lista en columnas de `Inspection`.**

Por qué no columnas: la exigencia del dueño es que la lista cambie por
actividad y por cliente, y que **cambiarla después no reinterprete lo ya
respondido**. Eso es versionado, y una columna no versiona. `§7` del prompt
además prohíbe tocar la separación `Inspection`/`ColonyEvent`, protegida a
nivel de base (`schema.prisma:4790-4796`: no existe valor `feeding` ni
`treatment` en `InspectionOutcome`, así que el colapso original es imposible
por esquema y no por convención).

Por qué no un motor nuevo: ya está juzgado, y no por mí.
`43_P2_OPERATOR_CORE.md:107-111` — *«**Deliberately not a second protocol
system.** `ProtocolVersion` already declares required measurements per stage
(RO1). A `TaskTemplate` that executes a protocol should point at it, not
restate it.»* Y RO1 lo dice más corto (`schema.prisma:5079`): *«no inventes un
quinto mecanismo de versionado.»*

**Ahora la parte que D2 plantea mal.** D2 pregunta «qué cuesta que un protocolo
de Research OS se ejecute contra una `Colony` en vez de un `Lot`». La respuesta
es que **no debe ejecutarse contra una `Colony`**, y el propio esquema explica
por qué:

- Una ejecución de protocolo es un `TreatmentBatch`, y su sujeto ya son dos
  (`lotId` o `locationId`, con CHECK excluyente). Añadir `colonyId` lo lleva a
  **tres significados en una tabla**, pagando otra vez el coste que
  `schema.prisma:5270-5272` ya declara.
- Y no encaja con lo que la lista de chequeo es. En
  `protocolos/apiario-campo-v1.json` hay **cinco actividades** —visita,
  inspección, alimentación, tratamiento, cosecha— que ocurren **en la misma
  visita, sobre colonias distintas**. Un `TreatmentBatch` por colonia y por
  actividad convierte una visita de doce cajas en sesenta filas de ejecución de
  protocolo. Eso no es reutilizar: es deformar.

**Lo que sí encaja:** el sujeto de la ejecución es la **`FieldSession`** —una
visita ejecuta una `ProtocolVersion`— y cada respuesta es un `FieldEvent`, o
una columna existente cuando el ítem lleva `coversExistingColumn`. El JSON del
dueño ya tiene ese campo y ya distingue los dos casos, lo cual es la parte
difícil y está resuelta:

```json
{ "key": "outcome", …, "coversExistingColumn": "Inspection.outcome" }
{ "key": "colonies_alive_count", … }   ← sin coversExistingColumn: fila nueva
```

De los 44 ítems del JSON, **16 llevan `coversExistingColumn`** y 28 no. O sea:
casi el 40 % de la lista de chequeo del dueño ya es columna existente y el
protocolo sólo declara **cómo se muestra y en qué orden**. Eso es exactamente
lo que `ProtocolVariable` hace (`schema.prisma:5181-5211`: `name`, `valueType`,
`unit`, `catalogId`, `enumValues`, `displayOrder`).

**Dónde `ProtocolVariable` sí se queda corta, dicho sin adornos.** Le faltan
tres cosas que el JSON usa y que hoy no tiene columna:

| El JSON usa | `ProtocolVariable` tiene | Falta |
|---|---|---|
| `stage: "field" \| "close"` | — | la etapa. Es **el corazón del ticket** (D4) |
| `required`, `requiredWith`, `showWhen` | `isControlled` (otra cosa) | obligatoriedad y condicionalidad |
| `coversExistingColumn` | — | si la respuesta escribe una columna o crea fila |
| `multi_enum` | `closed_enum` (uno solo) | selección múltiple |

Son cuatro columnas en `ProtocolVariable`, no un motor. Y `multi_enum` es la
única que da que pensar: `pestDiseaseFlags` es hoy un `String?`
(`schema.prisma:4809`), y el Anexo B §2.3 tiene razón en que una cadena no se
puede contar. Pero eso es un cambio de **`Inspection`**, no del motor de
protocolos, y es el único cambio de `Inspection` que este informe recomienda.

**Si me equivoco:** el riesgo es que `ProtocolVersion` acabe con columnas que
sólo el apiario usa, y que Research OS cargue con una noción de «etapa de
captura» que no le sirve. **Recuperable:** las cuatro columnas son anulables y
aditivas; si en un año resulta que la lista de campo y el protocolo científico
no son la misma cosa, se separan sin tocar los datos ya respondidos, que es
justo la propiedad que el versionado garantiza. **Lo irreversible sería lo
contrario:** empezar con columnas en `Inspection`, porque entonces las
respuestas de 2026 y las de 2027 significan cosas distintas y nada lo dice.

### D3 — Ni entidad nueva ni «sólo pantalla». Es un camino de escritura que no existe.

**Veredicto: la pregunta está mal hecha, y las dos ramas son falsas.**

D3 dice: *«Si la respuesta es sí a las dos, la entidad nueva sobra y el trabajo
es de pantalla.»* Las respuestas son sí y sí —el apiario audita (§1.2), y
`@@index([entityType, entityId])` hace la lectura por entidad barata
(`schema.prisma:444`)— y aun así **el trabajo no es de pantalla**, por dos
razones medidas:

1. **No hay nada que mostrar.** Las ocho auditorías del apiario son `.create`.
   `before` es `null` en las ocho, siempre. Una pantalla de enmiendas sobre eso
   muestra «se creó», que ya se ve en la fila misma.
2. **El único precedente de mostrar `AuditEvent` en pantalla está roto**
   (§1.1) y lleva meses certificándose como correcto por un comentario que
   envejeció. Copiarlo sin mirar reproduce el fallo: una lista vacía que se lee
   como «no hubo cambios».

**Lo que sí hay que construir, y es poco:**

- **Un camino de actualización auditado** para los campos de etapa `close`:
  `updateFieldSession` / `updateInspectionAssessment`, cada uno pasando
  `before` y `after` y un `sourceInterface` que **distinga campo de cierre**
  (`"apiary.field"` vs `"apiary.close"`). Esa columna ya existe y es NOT NULL
  (`schema.prisma:442`) — hoy el apiario escribe siempre lo mismo. Con dos
  valores, «lo capturado frente a la caja» y «lo completado en la casa» son
  distinguibles **sin ninguna tabla nueva**, que es exactamente lo que el dueño
  pidió.
- **Un lector genérico por entidad**, escrito una vez y con un test que
  **falle si nadie escribió** ese `entityType` — el guardia que a `lots.ts:728`
  le faltó. Sin ese test, esto se repite.
- **Auditar `lib/apiary/media.ts`**, que hoy no audita nada (§1.2).

**Y la regla que resuelve el miedo del dueño sin ninguna de las dos cosas:**
un campo de etapa `field` **no se edita desde el cierre**. Se enmienda: se
escribe el valor nuevo con su `reason`, y el original queda en `before`. Eso es
política de servicio, no esquema.

**Si me equivoco:** si dentro de un año hace falta consultar «todas las
enmiendas de esta temporada» y `AuditEvent` tiene millones de filas de todo el
sistema, la consulta se vuelve cara y habrá que materializar. **Recuperable:**
el dato está completo en `before`/`after`; una tabla derivada se puede rellenar
desde ahí. Lo que **no** sería recuperable es empezar sin `reason` y sin
`sourceInterface` diferenciado — ahí la información no está en ningún sitio y
no se puede reconstruir. Por eso esos dos son innegociables y la tabla no.

### D4 — Estado en la visita, con el modelo que ya está escrito. La vista derivada no basta, y digo por qué.

**Veredicto: `status draft|completed|locked` + `completedAt` +
`editWindowExpiresAt` en `FieldSession`**, calcado de
`GUIDED_FIELD_STUDY_TOOL.md:48-49,65-72` (§1.6). No es una cuarta invención:
es la única versión escrita, razonada y sin construir.

**Evalué en serio la vista derivada, como pide D4, y falla por tres sitios:**

1. **No sabe distinguir «no aplica» de «sin responder».** «Esta visita tiene
   campos de etapa *cierre* sin responder» es cierto de una visita cerrada
   donde no hubo costo de viaje, no hubo interpretación y no hubo
   recomendación. Sin un acto explícito de cierre, esa visita queda
   marcada como incompleta para siempre, y la alerta «visita sin cerrar con más
   de 72 horas» (Anexo C §1.2) dispara sobre trabajo terminado. Una alerta que
   grita sobre lo correcto se aprende a ignorar.
2. **No tiene dónde aterrizar el veredicto.** Es la regla de `CLAUDE.md`: *«una
   decisión cuya respuesta no cambia ningún artefacto necesita un sitio nombrado
   donde aterrice el veredicto […] o ninguna búsqueda distinguirá "sin hacer" de
   "hecho y sin rastro"».* «Terminé de cerrar esta visita» es exactamente esa
   decisión.
3. **`nextVisitDueAt` la contradice sola.** El Anexo C §1.1 calcula «próxima
   visita» desde *«la última visita **cerrada**»*. Una vista derivada no tiene
   «cerrada»; tiene «sin huecos», que es otra cosa.

Pero la vista derivada **sí gana en un punto**, y hay que conservarlo: no debe
existir un estado «incompleto» **por registro**. Un `Inspection` o un
`ColonyEvent` está escrito o no está; su completitud la juzga el protocolo de
la visita, no una columna en cada tabla de captura. Eso mantiene
`Inspection`/`ColonyEvent` como están, que §7 del prompt exige.

**Lo que sí conviene copiar tal cual, y no negociar:** la ventana de 48 horas y
el bloqueo. Después de `locked`, corregir es enmendar (D3), no editar. La
alerta del Anexo C debería colgar de **`status = draft` con más de 72 h**, no
de «tiene huecos» — y entonces 72 h contra una ventana de 48 h es coherente:
la ventana se cierra antes de que la alerta grite.

**Si me equivoco:** si 48 horas resulta corto para una visita de sábado que se
cierra el lunes, la gente cerrará de memoria o pedirá desbloquear.
**Recuperable y barato:** es un número, y el propio Anexo C dice que los
umbrales son parámetros por sitio y no constantes. Lo caro sería no tener
estado ninguno: entonces «cerrada» no existe, y `nextVisitDueAt`, el reporte y
la alerta se apoyan en una propiedad que nadie declaró.

### D5 — `AssetAnnotation` una vez, para los dos dominios. Y la mitad del problema no es esa tabla.

**Veredicto: una vez, fuera del alcance del apiario.**

El audit del café lo tiene catalogado desde el 2026-08-27 con prioridad y
forma: `COFFEE_FIELD_OS_AUDIT.md:256` («Media annotation | MISSING | New
`AssetAnnotation` | low | Offline-created | P2») y `:1056-1058` («comments,
tags, severity on media. Relations: `Asset`, `Person`, optional catalog value.
Why not reuse: `Asset` has no annotation surface. **Needed: Phase 3.**»). Está
en la lista de lo que le falta a la Fase 3 (`:1370`). Resolverlo dentro del
apiario significaría construir la Fase 3 del café por la puerta de atrás y sin
su revisión.

**Pero D5 sólo describe la mitad del problema de los 18 archivos del 2 de
septiembre.** La otra mitad, que ningún anexo nombra:

- **La cola offline del apiario no acepta fotos.**
  `lib/apiary/offlineQueue.ts:20` — `DraftKind = "inspection" | "colonyEvent"`.
  Una foto tomada sin señal **no entra en la cola**: o se sube en el momento o
  se queda en el carrete. Ahí es donde nace el archivo huérfano, no en la falta
  de pie de foto. La pila de P4 sí tiene camino
  (`/api/v1/sync/field-media/route.ts`) — otro argumento para D1.
- **Subir una foto de apiario no deja `AuditEvent`** (§1.2).
- **`AssetAnnotation` no resuelve «quién aparece».** El Anexo B §7 quiere
  etiquetar personas («Chayanne es el de manga larga celeste»). Eso es una
  relación `Asset ↔ Person` con implicaciones de privacidad —`CLAUDE.md` §10 y
  la clasificación de `Asset`, que por defecto es `internal`
  (`schema.prisma:1574`)— y **no es lo mismo** que un pie de foto. El audit
  especifica «comments, tags, severity», no identificación de personas.
  Recomiendo **separarlo y no construirlo en este alcance**: un dato biométrico
  blando sobre un empleado, guardado sin política, es peor que no tenerlo.

**Lo que sí cabe aquí, y es lo que de verdad hacía falta el 2 de septiembre:**
que una foto se pueda **ligar después, desde el cierre**, a la colmena o al
evento correctos. Las FK ya existen (`schema.prisma:1617-1624`). Es una
pantalla, no un esquema.

**Si me equivoco:** si el café tarda seis meses en llegar a su Fase 3, el
apiario acumula otra temporada de fotos sin significado. **Recuperable:** un
pie de foto se puede escribir después mirando la imagen — es de las pocas cosas
de este informe que **no** son capture-or-lose-it, porque la evidencia sigue
ahí. La coordenada y la hora sí se perderían, y ésas ya están resueltas
(`Asset.latitude/longitude/accuracyM`, P2 §6, `schema.prisma:1565-1567`).

### D6 — Orden: **visita → polinización → reina**. Y polinización es más barata de lo que dice el Anexo A.

**Veredicto: la visita primero, polinización inmediatamente después, reina
tercera.** No sigo la sugerencia de D6 de que polinización pueda ir primera, y
digo por qué con números.

**Por qué la visita primero.** No es que «desbloquee» las otras dos en abstracto:
es que las dos siguientes producen datos que necesitan una visita donde
colgarse. Una ficha de reina se levanta **durante una visita**; un conteo de
colonias contra el compromiso se hace **al salir del sitio**. Construir
polinización primero da una tabla de contrato y un cociente cuyo numerador
—colonias vivas— **hoy no se puede consultar** (§1.10: `getApiaryList` no
devuelve ni una fecha, menos un conteo). El número saldría de contar filas
`Colony` con `status = active`, que es el conteo del sistema, no el de la
visita — y en Toabré esos dos números llevan divergiendo desde diciembre.

**Cuánto cuesta polinización, corregido.** El Anexo A §10 dice que no hay nada;
`Location.areaHectares` sí existe (§1.9). Lo que falta:

| Falta | Dónde |
|---|---|
| hectáreas **comprometidas** (≠ área del lote) | tabla nueva de compromiso |
| densidad objetivo colmenas/ha | ídem |
| a qué cliente / contrato responde | ídem, referenciando `Organization` |

Es **una tabla con cinco columnas**, y el cociente es una división. El Anexo A
acierta en que es barato; se equivoca en el punto de partida.

**Cuánto cuesta reina, y qué se pierde cada semana.** El razonamiento de agosto
sigue en pie y lo suscribo: `22_APIARY_V1_SCOPING_REPORT.md:731-740` — el
**hecho** del origen cuesta una columna (`Colony.originType`/`originNote`, que
existen, `schema.prisma:4761-4762`), la **mecánica** de la división cuesta un
grafo. Lo que cambió no es el argumento: es que ahora hay dos orígenes
genéticos en un sitio y `originNote` es texto libre, así que «compará Parita
contra Santa Fe» no es una consulta, es leer prosa.

**Y aquí una precisión que evita construir de más:** para sostener esa
comparación **no hace falta el grafo de genealogía**. Hace falta que el origen
sea agrupable — un `VariableCatalog` en vez de texto libre, que es el
mecanismo que este repositorio ya usa para vocabularios que crecen
(`schema.prisma:5122`, precedente P1: «un vocabulario que crece es una entrada
de catálogo más un re-seed, nunca una migración»). Eso es **una FK**, no un
grafo, y no reabre lo que `DOMAIN_MODEL.md:205` aplazó.

**Si me equivoco en el orden:** el escenario que me preocupa es que Kiva pida
el número de déficit antes de que la visita esté construida y no lo tengamos.
**Recuperable en una tarde**, porque el cociente se puede calcular a mano con
tres colonias y 17 ha — es una conversación, no un sistema. El escenario
inverso no es recuperable: cada colonia instalada sin origen agrupable es una
comparación que no se puede hacer después, y en septiembre ya se instalaron
tres.

### D7 — No inventar `contentSnapshot`: es `reporting.report_version`, ya especificado. Y el PDF, hoja de impresión.

**Veredicto en tres partes.**

**(a) La inmutabilidad ya tiene esquema escrito y no se llama así.**
`COMMERCE_OPERATIONS_TOOLS_ARCHITECTURE.md:501-507` define
`reporting.report` / `report_version(… generation_query jsonb,
rendered_snapshot jsonb)` / `report_publication(surface[web|pdf|client_portal|
download])`, con `report_type` incluyendo ya `consulting` y `farm`, aprobado
como arquitectura y secuencia por ADR-020 (§1.7). **`rendered_snapshot` es
`contentSnapshot`.** Un reporte de visita que estrene tabla propia sería el
cuarto mecanismo de versionado del repositorio, después de `ProtocolVersion`,
`SensoryProtocolVersion` y `ProcessRecipeVersion`.

La propuesta de D7 —renderizar desde el snapshot, nunca de datos vivos— es
correcta y no hace falta evaluarla contra alternativas: es la misma regla que
`CLAUDE.md` §3 aplica a protocolos, aplicada a un documento de cliente. Lo
único que añado es que **`generation_query` vale la pena y D7 no lo pidió**: sin
él, un reporte congelado es un documento suelto; con él, se puede regenerar y
comparar con lo que dicen los datos hoy, que es la pregunta que un cliente hace
de verdad («¿esto sigue siendo así?»).

**(b) El mecanismo: hoja de impresión (`@media print` + `window.print()`).**

No hay librería de PDF (§1.10). Las tres opciones cuestan así:

| Camino | Dependencia nueva | Riesgo real |
|---|---|---|
| `@media print` + `window.print()` | **ninguna** | saltos de página y consistencia entre navegadores |
| navegador headless en servidor | Puppeteer/Playwright + un Chromium en el build | `scripts/vercel-build.sh` y el tamaño de función; es una dependencia pesada en la ruta de despliegue |
| librería con plantilla propia | `pdfkit`/`@react-pdf` | **dos plantillas que mantener**, y se separan con cada cambio |

Elijo la primera por el argumento que D7 ya adelanta y que me parece el
decisivo: **la página web es la plantilla**. Este reporte lo va a leer un
cliente de finca en un teléfono; que se vea igual en pantalla y en papel es la
propiedad que importa, y una plantilla de PDF aparte la rompe en el primer
cambio. El riesgo de saltos de página es real pero es de maquetación, no de
arquitectura, y se acota diseñando el reporte por secciones con
`break-inside: avoid`.

**Un matiz que D7 no menciona y que decide esto:** el proyecto ya tiene un
reporte pensado para imprimirse. `lib/traceability/reports.ts:8-10` — *«the
report is designed to be printed and read without clicking through the app»*, y
por eso usa códigos de lote legibles en vez de UUID. La disciplina ya existe;
esto la continúa.

**Si me equivoco:** si Kiva rechaza el PDF por maquetación, hay que volver a
headless. **Recuperable:** el snapshot y el contenido no cambian; cambia el
renderizador. La decisión de guardar `rendered_snapshot` es la que **no** es
recuperable después, porque un reporte emitido sin snapshot no se puede
reconstruir.

**(c) Cómo abre el enlace Luis Sotillo: enlace firmado con caducidad.**

Las dos opciones de D7 son «membresía de organización» o «enlace firmado». El
repositorio ya usa el segundo patrón para medios en R2
(`lib/integrations/storage/r2.ts:35,43`, `presign` con `expiresIn`), y RBAC.md
manda: dar cuenta y asignación a un cliente externo lo mete en el modelo de
permisos con una clasificación que hay que decidir, y `ADR-029` ya se cuidó de
mantener a los partners externos **por debajo** de `internal` — un reporte de
visita lleva costos y recomendaciones internas.

**Recomendación: enlace firmado con caducidad, y el snapshot decide qué
contiene.** El «sólo si el contrato lo pide» de la sección de costos (Anexo C
§3.1) deja de ser una regla de pantalla y pasa a ser **qué se congela en el
snapshot**: si los costos no van al cliente, no entran al snapshot que se le
firma. Eso es más seguro que filtrarlos al renderizar.

Y una consecuencia que hay que aceptar en voz alta: **con enlace firmado, Kiva
no tiene histórico.** Si algún día debe verlo, es membresía de organización, y
eso es un ticket distinto que este alcance no debe abrir.

### D8 — QR sí, audio sí con disciplina, AI sólo en el cierre. Video y NFC, no.

**Veredicto por pieza, ordenado por toques ahorrados por peso de construcción.**

| Pieza | Veredicto | Por qué |
|---|---|---|
| **QR en cada caja** | **Sí, primero** | Es lo más barato del ticket entero: una ruta que ya existe (`/apiaries/[id]/hives/[hiveId]`) y calcomanías. Funciona sin señal porque el service worker ya precachea `/apiaries` (`public/sw.js:29`, `OPERATOR_ROUTE_PREFIXES = ["/apiaries", "/lots"]`). No necesita esquema. D8 tiene razón en que el GPS no sirve para esto |
| **NFC** | **No — y aquí contradigo al Anexo D** | El Anexo D §1 los agrupa («QR / NFC») y los pone primeros juntos. **No son la misma pieza:** Web NFC no existe en iOS Safari, así que NFC obliga a mantener dos caminos para el mismo ahorro y uno de ellos no funciona en la mitad de los teléfonos. QR primero, solo; NFC cuando alguien **mida** que el QR no se lee con guantes |
| **GPS de sitio y de visita** | **Sí** | Ya está construido: `FieldSession.startLatitude/startLongitude/startAccuracyM` (`schema.prisma:3686-3688`) y `FieldEvent` igual (`:3834-3836`). Es **CÓDIGO SIN USO para apiario**, no algo por construir |
| **Audio como evidencia** | **Sí, con la disciplina que D8 propone** | Es la única entrada que funciona con guantes y velo. La disciplina —audio es evidencia, transcripción derivada, campos extraídos son propuesta— la sostiene el modelo de procedencia tal cual: el audio es `direct_observation`, la transcripción `derived`, la propuesta de la AI es `ai_suggestion` (`schema.prisma:2576-2586`), y `AI_GOVERNANCE.md` exige revisión humana |
| **Video** | **No en este alcance** | D8 lo dice solo: pesa y la cola lo sufre. Y hay un dato duro: la cola del apiario **no acepta medios de ningún tipo** hoy (`lib/apiary/offlineQueue.ts:20`). Antes de video hay que resolver foto |
| **AI: transcribir y proponer campos al cerrar** | **Sí** | En el cierre, no en el campo. Un humano confirma. Precedente exacto en `GUIDED_FIELD_STUDY_TOOL.md` (identificación de especies asistida, pendiente de confirmación humana) |
| **AI: revisar coherencia al cerrar** | **Sí, y es lo más valioso de todo D8** | «Reservas nulas y ninguna alimentación registrada» es exactamente el modo de fallo de Toabré entre julio y septiembre. Y **no necesita AI**: es una regla sobre las respuestas del protocolo. Constrúyela como regla; si después la AI añade algo, que lo añada |
| **AI: diagnosticar enfermedad por foto, contar varroa** | **No** | D8 tiene razón y el argumento es el correcto: en campo un falso negativo cuesta una colonia. Además `CLAUDE.md` §32 lo prohíbe: la AI no infiere mediciones que faltan |

**Dos detalles del Anexo D que hay que corregir antes de construir:**

- **El código QR no puede llevar sólo el identificador de la caja.** El Anexo D
  §2 lo intuye y acierta: `Hive.identifier` es único **dentro de su apiario**,
  no globalmente (`schema.prisma:4718`, `@@unique([locationId, identifier])`).
  «N-01» existe en Toabré y puede existir en Los Asientos. El código lleva UUID,
  o sitio + caja. No es un detalle de implementación: decide qué se imprime en
  cien calcomanías que después no se cambian.
- **«Ya hay PostGIS para resolver el más cercano» es optimista.** La extensión
  está declarada (`schema.prisma:20`, `extensions = [postgis]`) y la columna
  existe, pero `geoPoint` es `Unsupported("geography(Point,4326)")`
  (`schema.prisma:595`): **Prisma no la puede consultar**, y cero líneas de
  aplicación la tocan. Resolver el sitio más cercano es `$queryRaw` —que el
  repositorio ya usa, `lib/traceability/lots.ts:360`— o una distancia calculada
  sobre `latitude`/`longitude`, que son `Float?` legibles. Es media hora, no una
  llamada que ya existe.

**Dos paredes reales que hay que entregar a `47_P5`, no resolver aquí:**

1. **Captura de audio largo sin señal.** El service worker de A5.5 tiene alcance
   deliberadamente angosto y excluye explícitamente Background Sync
   (`28_A5.5_SERVICE_WORKER_OFFLINE.md` §1: «No construir: Background Sync API,
   […] caché de teselas de mapa, notificaciones push»). Una nota de voz de tres
   minutos en IndexedDB compite con el problema que ADR-093 ya nombró: **el
   navegador puede descartar el almacén bajo presión de espacio sin preguntar**
   (`OFFLINE_FIELD_CAPABILITY.md:29-31`), «survivable for a cache and
   disqualifying for days of unsynced field work». Audio corto (segundos) cabe;
   días de audio sin sincronizar, no.
2. **El mapa no funciona sin señal.** El mapa que el dueño pide para la pantalla
   de sitios está especificado (`MAP_AND_TERRITORY.md`, Mapbox) y **A5.5 excluyó
   la caché de teselas a propósito**. Llegar a Calovébora y ver el mapa es
   `47_P5`, no esto.

**Si me equivoco en QR:** los adhesivos se despegan con sol y lluvia, o la
cámara no lee con guantes. **Recuperable al instante:** la navegación normal
sigue existiendo; el QR es un atajo, no un camino único. Ésa es justamente la
razón de ponerlo primero: es la pieza cuyo fallo no cuesta nada.

### D9 — «Temporada» no entra en este alcance. Y la razón es que el sistema **sí** puede alertar sin ella.

**Veredicto: aplazar el calendario, y decir qué se pierde.** D9 tiene razón en
que el sistema no sabe qué es temporada —lo verifiqué: no hay calendario de
floración, ni de época seca, ni por región, en ningún sitio del esquema— y
tiene razón en que eso deja la mitad de los umbrales del Anexo C sin evaluar.

Pero la conclusión no es construir el calendario ahora, por dos razones:

1. **Es conocimiento del dueño, no un derivado**, como D9 mismo dice. Escribirlo
   una vez es barato **cuando hay a quién preguntarle por cuatro regiones**
   —Veraguas, Los Santos, Coclé y Cerro Azul— y eso es una conversación, no un
   ticket. Bloquear la visita detrás de ella la retrasa por algo que no la
   necesita.
2. **Los tres umbrales que de verdad importan no son estacionales.** De las
   siete reglas del Anexo C §1.2, las tres críticas —pérdida de colonias sin
   reposición, visita programada vencida más de 14 días, `coverageUntil` vencido
   sin nueva alimentación— **no mencionan temporada**. Se calculan contra
   `nextVisitDueAt` y `coverageUntil`, que son declaraciones de una persona en
   el cierre. La estacionalidad la aporta quien pone la fecha, que sabe en qué
   mes está.

**Y ahí está el hallazgo:** el Anexo C tiene dos umbrales redundantes. «Visita
programada vencida por más de 14 días» (crítico) y «sin visita en 45 días en
temporada» (aviso) son la misma pregunta con dos fuentes distintas. La primera
usa una fecha que alguien declaró; la segunda intenta adivinarla desde un
calendario que no existe. **La primera es mejor y no necesita D9.** La segunda
sólo aporta algo en el caso «nadie declaró próxima visita» — que es
precisamente el caso que `nextVisitDueAt` obligatorio en el cierre elimina
(`protocolos/apiario-campo-v1.json`, `next_visit_due_at`, `"required": true`).

**Lo que se pierde aplazándolo, dicho concretamente:** la ventana de escasez de
néctar que obliga a alimentar **antes** de que las reservas lo digan (Anexo C
§4.2, uso 2) no se puede predecir. Se seguirá reaccionando a `storesLevel` y a
`coverageUntil`, que es reaccionar a lo observado. Es peor que predecir y mejor
que hoy.

**Y una distinción que D9 plantea bien y conviene dejar clavada:** un
calendario declarado y una floración observada no son lo mismo —uno predice,
el otro registra— y `SpecimenObservation` con `bloom_start`/`bloom_peak`/
`bloom_end` es lo segundo. Enganchar floración al apiario (Anexo A §8) **no
resuelve D9** y no debe venderse como que lo hace.

**Si me equivoco:** si la cadencia de visita resulta ser lo que más se
incumple, la falta de estacionalidad hará que la alerta de 45 días sea ruido en
seco y silencio en lluvia. **Recuperable:** el calendario es una tabla de
declaración; añadirlo después no reinterpreta ningún dato ya guardado, porque
las alertas se calculan al mirarlas, no se persisten.

---

### D10 — Dos decisiones, y sólo una es aplazable. El argumento que aplazó las notificaciones **falla para la bitácora**.

**Veredicto: (a) la preferencia de canal se aplaza sin coste; (b) la bitácora
no, y la razón no es que sea más urgente, es que es la única de las dos que
pierde algo por esperar.**

D10 pide no colapsar las dos mitades. Estoy de acuerdo, y al separarlas resulta
que caen de lados distintos de una decisión que este repositorio ya tomó.

**Lo que existe, medido.** Nada, y conviene decir en qué estado exacto:

```bash
grep -icE "notification|whatsapp|push" prisma/schema.prisma   # 0 modelos
grep -riEl "whatsapp" lib app scripts --include="*.ts" --include="*.tsx" | wc -l   # 0
grep -riEl "notification" lib app --include="*.tsx" --include="*.ts" | wc -l       # 0
# control positivo del mismo grep, sobre algo que sí existe:
grep -rl "recordAuditEvent" lib --include="*.ts" | wc -l                          # 42
```

Estado: **SIN DIRECCIÓN** en código, **DOCUMENTO** en `CLAUDE.md` §34 —que lista
doce categorías y dice «in-app primero»— y **decidido en contra** para v1 en
`INTEGRATIONS.md:112-116`, que nombra mensajería y push como extensiones futuras
«not built or adapter-stubbed in v1».

**Corrección al planteamiento de D10: dos de los cuatro canales ya tienen
interfaz escrita.** El prompt los presenta como cuatro adaptadores por
construir. No lo son:

| Canal | Estado real |
|---|---|
| App (in-app) | **DOCUMENTO**, y es la prioridad declarada de §34 |
| Correo | **DOCUMENTO con interfaz ya definida**: `EmailProvider.send(template, recipient, data)` (`INTEGRATIONS.md:56`), plantillas versionadas en git, no en la UI del proveedor |
| Google Calendar | **DOCUMENTO con interfaz ya definida**: `CalendarProvider.createEvent / updateEvent / sendInvite` (`INTEGRATIONS.md:89`), descrita como aditiva y que no bloquea nada |
| WhatsApp | **SIN DIRECCIÓN.** Es el único genuinamente nuevo |

Y la convención de cómo se añade cualquiera de ellos también está escrita
(`INTEGRATIONS.md:13-22`): `lib/integrations/<capacidad>/` con `types.ts`, un
archivo por proveedor e `index.ts` como fábrica por variable de entorno, y la
lógica de negocio **nunca** importa un proveedor concreto. Eso no hay que
decidirlo; hay que obedecerlo.

**El hallazgo, y es el que cambia la respuesta.** Las notificaciones no están
sin construir por olvido: **ADR-039 las aplazó y ADR-044 confirmó el
aplazamiento con un argumento explícito** (`DECISIONS.md:2597`, cuerpo en
2616-2620):

> *ADR-039's deferral list (T11, Notification, Research OS migration, etc.)
> shares one property: none of it forecloses anything by waiting. A
> notification system built in v1.1 works exactly as well as one built in v1.*

Ese argumento es correcto para la mitad (a) y **es falso para la mitad (b)**.

- **La entrega es un derivado.** Un aviso que hoy se ve en la app y mañana llega
  por WhatsApp avisa de lo mismo. Construirlo en v1.1 funciona igual que en v1,
  tal cual dice ADR-044. **Se aplaza sin perder nada.**
- **La bitácora es un registro con fecha de inicio.** El dueño la pidió «ahora y
  de forma indefinida». Un hilo que empieza en marzo **no puede contener
  febrero**: lo que no se espejó mientras se esperaba no se espeja después.
  Esperar sí cierra una puerta, que es exactamente la propiedad que ADR-044
  daba por ausente en toda su lista.

**Pero la consecuencia no es construir WhatsApp ahora.** Es que lo que no se
puede aplazar es *que exista el registro*, y el registro **ya existe**:
`AuditEvent` guarda actor, operación, entidad, `before`, `after`, `reason` y
`sourceInterface` para las 95 escrituras del sistema, apiario incluido (§1.2).
El hilo de WhatsApp es un **espejo** de eso, y D10 mismo lo dice mejor de lo que
yo lo diría: *si algo existe sólo en el chat, no existe*.

Entonces lo que hay que asegurar hoy no es el canal: es que **el evento que el
canal espejaría quede escrito hoy**. Eso ya pasa. Cuando WhatsApp se construya,
podrá emitir un resumen retroactivo desde `AuditEvent` —«esto es lo que pasó
mientras el canal no existía»— y la bitácora no tendrá agujero. **Con una
condición, y es la que hay que escribir ahora:** que el emisor lea de
`AuditEvent` y no de una tabla propia. Si la bitácora se construye con su propia
cola de mensajes, el retroactivo es imposible y el aplazamiento sí cuesta.

**El volumen, medido, porque el prompt pide medirlo antes de elegir la opción
literal.** `protocolos/apiario-campo-v1.json` tiene **44 ítems en 5
actividades** —`visit` 9, `inspection` 17, `feeding` 5, `treatment` 9,
`harvest` 4— y los reparte por etapa en **34 de campo y 10 de cierre**:

```bash
python3 -c "import json;d=json.load(open('protocolos/apiario-campo-v1.json'));
print(sum(len(a['items']) for a in d['activities']))"   # 44
```

Sólo los 9 de `visit` son por visita. Los otros 35 son por colonia o por
aplicación. Un sitio de quince cajas en el que cada una se inspecciona produce
**9 + 17 × 15 = 264 ítems respondidos**, antes de alimentación, tratamiento o
cosecha. La lectura literal de «toda acción se registra» son 264 mensajes por
visita. La cifra del prompt —«decenas»— se queda corta por un orden de
magnitud.

**Y la frontera del resumen ya está en los datos.** El propio protocolo separa
`stage: "field"` de `stage: "close"` (34 y 10). El corte natural no hay que
inventarlo: **alerta al instante para lo crítico, resumen al cerrar la visita**,
que es el momento que el protocolo ya nombra. Con eso, una visita de quince
cajas son **dos mensajes**, no 264, y el detalle va por enlace profundo —que
además pesa menos y no saca datos del sistema, como D10 pide.

**Lo que no verifiqué, y lo digo.** La premisa de costo y plantillas aprobadas
de la Cloud API de Meta la tomo del prompt y de conocimiento general; **no la
contrasté contra la documentación de Meta en esta sesión**. Es precondición del
ticket, no un detalle de implementación: si el costo por conversación iniciada
por el negocio resulta prohibitivo a la cadencia real, la bitácora cambia de
canal —correo a una dirección propia cumple la misma función de espejo— y eso
es una decisión distinta con la misma forma.

**RBAC.** El canal no puede ser una puerta lateral alrededor de los ámbitos, y
aquí hay un caso concreto que conviene no dejar implícito: la bitácora va a un
**teléfono**, no a una cuenta. Quien lo tenga en la mano lee todo lo que llegue,
sin que RBAC intervenga. Por eso el mensaje debe llevar **enlace profundo y no
contenido**: el enlace vuelve a pasar por la compuerta al abrirse; el contenido
no. Eso convierte una restricción incómoda en la opción que además resuelve el
volumen.

**Si me equivoco.** Si el dueño necesita la bitácora funcionando antes que la
visita —porque el valor está en no depender de abrir la aplicación—, entonces
(b) sube al camino crítico y arrastra la integración entera, plantillas
incluidas. **Recuperable a medias:** el modelo de preferencias y el emisor se
construyen igual, pero el orden habría retrasado A9.2 sin que la visita ganara
nada.

**Fuera de alcance, como D10 mismo acota:** los cuatro adaptadores. Lo que sí
entra aquí es el modelo de preferencias, la separación entre entrega y
bitácora, y la condición de que el emisor lea de `AuditEvent`.

---

## 3. Qué datos conviene acumular — la revisión honesta que se pidió

El dueño pidió *«una revisión honesta de qué datos conviene acumular para
manejar mejor el proyecto, no de qué campos se pueden agregar»* (§2 del
prompt). Ésta es esa sección, y por eso empieza por lo que **no** conviene.

**El criterio que uso:** un dato conviene acumular si (a) se pierde si no se
anota en el momento, y (b) cambia una decisión que alguien toma de verdad.
Ambas. Un dato que cumple sólo (a) es un archivo; uno que cumple sólo (b) se
puede reconstruir después y no urge.

### 3.1 Los cinco que valen, y por qué exactamente

| Dato | Se pierde | Qué decisión cambia |
|---|---|---|
| **Conteo de colonias vivas del sitio, al salir** | Sí, total. En un sitio ausentado, `Colony.status` cuenta lo que el sistema cree, no lo que hay | Es el numerador del déficit de polinización y la única serie que reconstruye una supervivencia. Hoy, en Toabré, no existe entre diciembre y junio |
| **`coverageUntil` del alimento** | Sí. Es una estimación de quien alimenta, frente a la caja | **Es el modo de fallo exacto del 2 de septiembre.** El alimento del 22 de julio cubría seis semanas y venció cerca del día en que se encontró todo vacío. Con este campo el aviso llega antes |
| **Período de carencia del tratamiento** | Sí. Está en la etiqueta, en la mano, en ese momento | Bloquea una cosecha. Sin él, se puede cosechar en carencia y el sistema no lo sabe |
| **Origen de la colonia, agrupable** | Sí, en el momento de instalar | Sostiene «Parita contra Santa Fe». Hoy `originNote` es texto libre y no agrupa (§D6) |
| **Fecha y hora de la visita, con quién fue** | Sí | «Última visita» y «próxima visita», que son las dos preguntas con las que el dueño abre la pantalla |

Nótese que **cuatro de los cinco son de etapa `field`** y el quinto —quién
fue— se precarga. Ninguno pide interpretación de pie al sol.

### 3.2 Los que el Anexo B propone y yo recortaría

No porque estén mal, sino porque su columna «sirve para» no aguanta el criterio
de arriba:

- **Cuadros por caja** (Anexo B §2.4, etapa cierre). Es el denominador de
  «cuadros cubiertos», y es un atributo de la caja que casi nunca cambia. Va en
  `Hive` cuando exista una razón, no en el protocolo de visita.
- **Clima observado** (Anexo B §1, `despejado|nublado|viento|lluvia`). Su
  «sirve para» es «explicar una inspección corta y contrastar con la capa
  externa». La capa externa lo dará mejor y sin toques. Recomiendo **no
  preguntarlo en campo**: es un toque por visita a cambio de un dato que la
  ingesta de Open-Meteo entrega con más precisión. Si sirve para algo es para
  el caso «la app dice que no llovió y yo me mojé», que es una discrepancia
  interesante — pero eso justifica **una casilla al cerrar**, no un campo de
  campo.
- **Cajas presentes** (Anexo B §1). Su justificación —distinguir «cero
  colonias» de «cero cajas»— es buena, pero `Hive.status` ya tiene
  `active|empty|retired` (`schema.prisma:4683-4689`) y las cajas están
  registradas una a una. El conteo es derivable. **Es un campo que duplica una
  consulta.**
- **Eficacia observada del tratamiento** (Anexo B §4, cierre). Se escribe
  semanas después, no al cerrar la visita. Si se pide en el cierre, se
  contestará vacío siempre. Es un conteo de varroa posterior ligado al
  tratamiento anterior — o sea, una relación entre dos visitas, no un campo.

### 3.3 Lo que ya se acumula y no se está usando

Esto es lo que más rinde por unidad de trabajo, porque el dato ya está:

- **`recordedAt` / `syncedAt` / `clockOffsetMs`** en `Inspection` y
  `ColonyEvent` (`schema.prisma:4826`, `:4891`). Distinguen la hora
  del aparato de la del servidor. **Ninguna pantalla los muestra.** «Esto se
  anotó en el campo a las 09:14 y llegó al servidor a las 19:40» es
  precisamente la distinción campo/cierre que el dueño quiere ver, y ya está
  guardada.
- **`provenanceClass`** en todo. `interpretation` ya es un valor del enum. La
  regla del Anexo C §3.2 —observación e interpretación no se mezclan en el
  reporte— **no necesita nada nuevo**: necesita que el reporte lea la columna.
- **`Asset.latitude/longitude/accuracyM`** (P2 §6). Una foto de apiario ya
  puede llevar coordenada. Nada la escribe todavía.
- **`dataQuality`** con nueve valores (`schema.prisma:2591-2600`). El «no se ha
  medido» que el Anexo C pide como tercer estado ya tiene vocabulario.

### 3.4 Lo que no conviene acumular, y conviene decirlo

- **Peso de la colmena estimado a mano.** El Anexo B §8 ya lo descartó y estoy
  de acuerdo con su argumento.
- **Quién aparece en cada foto.** Ver D5: es un dato sobre un empleado, con
  implicaciones que este alcance no está preparado para decidir.
- **Cualquier campo cuyo «sirve para» sea «para tenerlo».** El Anexo B se
  disciplina bien en esto y hay que mantenerlo al construir, no sólo al
  escribir.

---

## 4. La prueba de aceptación — crítica, y qué propongo

### 4.1 Qué tiene de bueno la propuesta

La prueba retrospectiva del prompt §6 —reconstruir entera la visita del 2 de
septiembre— tiene dos virtudes que no hay que perder: **es falsable hoy**, sin
esperar a octubre, y **falla por el sitio correcto**, porque exige que el
reporte salga de los registros y no de que alguien vuelva a escribirlo.

### 4.2 Dos problemas, y el segundo es grave

**(a) Es una prueba de carga de datos, no de diseño.** Se puede pasar
insertando las filas del 2 de septiembre a mano desde la laptop, en un
formulario de escritorio, en marzo. Eso demostraría que el **esquema** aguanta
la visita, que es la mitad del ticket. No demuestra nada sobre la otra mitad —
que la captura frente a la caja sea posible y barata — que es de lo que trata
todo el prompt.

**(b) Repite el error que este proyecto ya cometió y documentó.** ADR-107 y
`43_P2_OPERATOR_CORE.md` §0 cuentan que la Fase 2 se iba a construir sobre un
`Task` con **cero filas**, para operadores sin cuenta, en un flujo que nadie
había recorrido. La respuesta fue: *«§7 (aceptación) sigue sin cumplirse, y no
puede cumplirse hoy: exige que una persona que no sea Daniel reciba una tarea y
recorra un bloque. Sigue siendo el criterio correcto.»* Una prueba
retrospectiva que Daniel puede pasar solo, desde la casa, es exactamente el
criterio flojo que ADR-095 y ADR-107 rechazaron dos veces.

### 4.3 Lo que propongo: las dos, y en este orden

**Compuerta 1 — retrospectiva, para cerrar el esquema.** La del prompt §6, tal
cual, **con dos añadidos**:

> …y además: (i) el reporte **nombra los datos que faltan** —«no se contaron
> colonias en Finca 1»— en vez de omitir la sección; y (ii) volver a generarlo
> un mes después, con datos corregidos de por medio, produce **el mismo
> documento** que la primera vez.

El (ii) es lo que prueba D7, y sin él el snapshot es una columna que nadie
ejercita. El (i) es la regla del Anexo C §3.2 convertida en algo que puede
fallar.

**Compuerta 2 — prospectiva, para cerrar el ticket.** La que el prompt sugiere,
con una precisión que la vuelve mucho más dura:

> La visita de octubre a Toabré la captura **Chayanne**, sin señal, sin que
> Daniel esté, **con el perfil `Apiary Colony Event Recorder` y nada más**. La
> visita queda abierta al salir del sitio, se cierra esa noche desde el
> teléfono con señal, y el reporte al cliente sale sin que nadie reescriba una
> frase.

El «con ese perfil y nada más» es la parte que importa, y sale de §1.3: hoy ese
perfil **no puede abrir una `FieldSession`**, y el arreglo tentador
—concederle `location:manage_attributes`— le daría autoridad para reescribir
los atributos del sitio. Sin esa cláusula, la prueba se pasa dándole
`apiary:manage` a Chayanne, que es justo la decisión que el modelo de permisos
tomó al revés a propósito.

**Y una tercera, que sale del Anexo D §7 y es mejor que nada que yo hubiera
propuesto.** Su medida —*«una fila de quince cajas se inspecciona sin sacarse
los guantes ni una sola vez»*— es la única de las tres que juzga si la captura
sirve, en vez de si el dato cabe. La adopto como **criterio de la compuerta 2**,
no como nota al margen: se observa y se cuenta cuántas veces hubo que
descalzarse la mano, y ese número va en el informe de la corrida. Cero es el
objetivo; cualquier otra cifra dice exactamente qué pantalla arreglar.

**Y una advertencia sobre cómo medir la compuerta 2, porque este proyecto ya se
quemó con esto:** «no falló» no es el veredicto. La corrida tiene que decir
**qué midió** — cuántas colonias se inspeccionaron, con qué perfil, con qué
`recordedAt` frente a qué `syncedAt`, y cuál fue la primera pantalla que no
abrió sin señal. Una visita que no produce filas se lee igual que una visita
perfecta si sólo se mira que no hubo error.

---

## 5. Borrador de enmienda de ADR — **borrador, no añadido a `DECISIONS.md`**

El último ADR del repositorio es **ADR-109**
(`grep -o "ADR-[0-9]\{3\}" docs/architecture/DECISIONS.md | sort -u | tail -1`).
Este borrador sería el **ADR-110**. No lo he añadido, por §5 del prompt.

---

**ADR-DRAFT-110 — La visita de apiario es una `FieldSession`, y la compuerta
de una jornada de campo deja de ser `location:manage_attributes`**

*Enmienda a ADR-098/099/101 (P2: `FieldSession`/`FieldEvent`) y a la parte de
ADR-039 que ADR-DRAFT de `22_APIARY_V1_SCOPING_REPORT.md` §6 ya tocó.*

**Contexto.** P2 construyó `FieldSession`/`FieldEvent` como «la envoltura de una
visita» y el audit que los especificó nombró la colonia entre los padres que
`FieldEvent` debía indexar (`COFFEE_FIELD_OS_AUDIT.md:347-348`). Las FK del
apiario nunca se añadieron. Mientras tanto el apiario desarrolló su propia cola
offline (A5/A5.5) y P4 desarrolló una segunda, dejando escrita la deuda y su
disparador: *«el momento es cuando apiario pase a push por lotes»*
(`lib/sync/offlineQueue.ts:12-15`).

**Decisión.**

1. **`FieldSession` es la visita de apiario.** No se crea una entidad
   `ApiaryVisit`. `FieldEvent` gana tres FK anulables —`inspectionId`,
   `colonyEventId`, `apiaryHarvestEventId`— siguiendo el patrón ADR-020
   decisión 8 que `Asset` ya aplica quince veces.
2. **La autorización de una jornada deja de ser `location:manage_attributes`.**
   Se introduce una compuerta que resuelve por **el dominio de la
   `Location`**: en `apiary_site` acepta lo que el apiario ya acepta
   (`apiary:manage`, y `colony_event:manage` para los eventos que ese perfil ya
   puede registrar), probando ámbito `project` **y** `location` como hace
   `requireApiaryAccess`. La razón no es comodidad: `location:manage_attributes`
   es la autoridad para reescribir los atributos de terruño de un sitio, y
   concederla para poder registrar una visita ensancha el permiso en la
   dirección que `CLAUDE.md` §10 y ADR-069 evitaron a propósito.
3. **`FieldSession` gana ciclo de cierre**, con el modelo ya escrito en
   `GUIDED_FIELD_STUDY_TOOL.md:48-49,65-72`: `status draft|completed|locked`,
   `completedAt`, `editWindowExpiresAt = completedAt + 48 h`. Después del
   bloqueo se enmienda, no se edita.
4. **`FieldSession` admite varios operadores**, con la forma de
   `study_contributor`. `operatorPersonId` se conserva como el responsable de la
   jornada; los demás son contribuyentes.
5. **La lista de chequeo es una `ProtocolVersion` de Research OS**, ejecutada
   contra la **`FieldSession`**, no contra la `Colony`. No se crea un tercer
   motor de protocolo y no se añade `colonyId` a `TreatmentBatch`.
6. **La enmienda de un campo capturado en el campo es un `AuditEvent`** con
   `before`, `reason` y un `sourceInterface` que distingue campo de cierre. No
   se crea una entidad `FieldAmendment`.

**Consecuencias que se aceptan.**

- `FieldSession` pasa a significar dos cosas según el `locationType` de su
  `Location` — el mismo coste que `TreatmentBatch` ya paga por tener dos
  sujetos (`schema.prisma:5270-5272`), y por la misma razón: la alternativa era
  una entidad paralela que duplicaría estado, sincronización y costeo.
- La compuerta nueva es un punto de decisión de RBAC más. Se acota exigiendo
  que **resuelva por el tipo de la `Location`** y no por un parámetro que el
  llamador elija, para que no se pueda pedir la compuerta laxa desde el sitio
  equivocado.
- Las dos colas offline colapsan en la de P4 y `lib/apiary/offlineQueue.ts`
  pasa a ser un envoltorio, como su propia cabecera anticipa. Esto es trabajo
  real y va en su propio ticket, no de rebote.

**Alternativas rechazadas.**

- *Entidad `ApiaryVisit` propia.* Rechazada: crea la tercera cola offline y
  duplica costeo, operadores y sincronización. El argumento de «la mitad de las
  columnas nulas» no se sostiene — los tres hechos que se le atribuían son un
  `FieldEvent`, un `notes` existente y un contrato.
- *Conceder `location:manage_attributes` al perfil de apiario.* Rechazada por
  ensanchar el permiso; es el arreglo de una línea que rompe la propiedad que
  ADR-069 se cuidó de conservar.
- *Motor de protocolo de campo nuevo.* Rechazada: sería el tercero, y P2 §2 ya
  falló contra ella.

**Cómo se falsifica esta decisión.** Si al construir se descubre que **más de la
mitad** de las columnas nuevas de `FieldSession` sólo tienen sentido en un
`apiary_site`, la decisión 1 estaba mal y toca entidad propia. Ese es el
número, y hay que contarlo, no estimarlo.

---

**ADR-DRAFT-111 — El registro de lo que pasa no se aplaza; el canal por el que
sale, sí**

*Enmienda a la cláusula de `ADR-044` que confirmó el aplazamiento de
`Notification` (`DECISIONS.md:2597`, cuerpo en 2616-2620), y a
`INTEGRATIONS.md:112-116`. Sería el **ADR-111**; el 110 de arriba tiene que
entrar primero porque A9.12 depende de A9.3.*

**Contexto.** ADR-039 aplazó `Notification` y ADR-044 lo confirmó con una
propiedad declarada: *«none of it forecloses anything by waiting»*. La
propiedad se sostiene para la entrega y **no** para una bitácora que el dueño
pidió «ahora y de forma indefinida»: un hilo que empieza en marzo no puede
contener febrero. Es la primera vez que un elemento de esa lista de
aplazamientos falla su propio criterio.

**Decisión.**

1. **El aplazamiento de la entrega se mantiene**, y con él
   `INTEGRATIONS.md:112-116`. In-app primero, según `CLAUDE.md` §34. Los cuatro
   adaptadores siguen fuera de v1.
2. **Se acota qué era lo que no podía esperar, y ya está construido.** Lo que
   una bitácora espejaría es `AuditEvent`, que desde 2026-09-06 se escribe en la
   misma transacción que su hecho en todo `lib/`, `app/` y `scripts/`. El
   registro existe; no hay agujero que rellenar.
3. **Condición vinculante para cuando se construya:** el emisor de bitácora
   **lee de `AuditEvent`**. No lleva cola de mensajes propia ni tabla de
   pendientes. Es lo único que hace posible un espejo retroactivo del periodo en
   que el canal no existía, y es una decisión de hoy porque después ya no se
   puede tomar.
4. **El hilo es espejo, nunca fuente.** Un mensaje lleva **enlace profundo, no
   contenido**. Esto no es sólo economía de bytes: el enlace vuelve a pasar por
   RBAC al abrirse y el contenido no, y la bitácora llega a un teléfono, no a
   una cuenta.
5. **Cadencia: alerta al instante para lo crítico, resumen al cerrar la
   visita.** El corte no se inventa — `protocolos/apiario-campo-v1.json` ya
   separa `stage: "field"` de `stage: "close"`.

**Consecuencias que se aceptan.**

- La bitácora no existirá hasta que exista su adaptador, y el dueño no verá
  mensajes entre tanto. Se acepta **porque el registro sí se está escribiendo**;
  lo que se pospone es la vista, no el hecho.
- El resumen retroactivo tendrá que decir explícitamente que es retroactivo, o
  parecerá que el sistema estuvo callado y de pronto habló de meses atrás.

**Alternativas rechazadas.**

- *Construir WhatsApp ahora para no perder el histórico.* Rechazada: el
  histórico no se pierde, vive en `AuditEvent`. Lo que se ganaría es
  inmediatez, y cuesta una integración con plantillas aprobadas y costo por
  conversación que nadie ha verificado.
- *Una tabla `NotificationOutbox` propia desde ya.* Rechazada por la cláusula 3:
  es justo la forma que hace imposible el retroactivo, y añade una segunda
  fuente de verdad sobre lo que pasó.
- *Registrar «toda acción» literalmente.* Rechazada con número: 264 mensajes
  para una visita de quince cajas. Un canal ilegible no registra nada.

**Cómo se falsifica esta decisión.** Si al construir el emisor resulta que
`AuditEvent` no basta para redactar un mensaje legible —porque `after` guarda la
fila y no la frase—, la cláusula 3 obliga a una capa de redacción, no a una cola
propia. Si esa capa necesitara persistir estado, la decisión 3 estaba mal.

---

## 6. Desglose de tickets

Con dependencias reales, no orden de deseo. La columna **Esquema** dice si toca
`prisma/schema.prisma`; la de **Bloquea a** es lo que no puede empezar antes.

### Camino crítico

| # | Ticket | Esquema | Depende de | Bloquea a | Por qué está aquí |
|---|---|---|---|---|---|
| **A9.0** | **Compuerta de jornada por dominio de `Location`** | no | — | A9.1 | §1.3. Sin esto el perfil que motiva el ticket no puede abrir una visita, y el atajo rompe ADR-069. Va **antes** que el esquema a propósito: es la decisión que puede invalidar D1 |
| **A9.1** | `FieldEvent` gana `inspectionId`, `colonyEventId`, `apiaryHarvestEventId`; `FieldSession` gana `status`/`completedAt`/`editWindowExpiresAt` y contribuyentes | **sí** | A9.0 | todo lo demás | D1 + D4. Una migración, aditiva |
| **A9.2** | Pantalla de visita: abrir, registrar, salir. Una visita agrupa las inspecciones y eventos que ya se registran hoy | no | A9.1 | A9.4, A9.6 | Es la mitad que la prueba retrospectiva **no** cubre |
| **A9.3** | Cierre auditado: `updateFieldSession` con `before`/`reason`/`sourceInterface` diferenciado, bloqueo a las 48 h, y lector genérico de enmiendas por entidad | no | A9.1 | A9.6 | D3. Incluye **arreglar `lots.ts:728`** y auditar `lib/apiary/media.ts`, porque son el mismo trabajo |
| **A9.4** | Protocolo de campo: cuatro columnas en `ProtocolVariable` (`stage`, `required`, `coversExistingColumn`, condicionalidad) + `multi_enum`; carga de `protocolos/apiario-campo-v1.json` como `ProtocolVersion` v1 | **sí** | A9.1 | A9.5, A9.6 | D2. Incluye pasar `Inspection.pestDiseaseFlags` de `String?` a algo contable |
| **A9.5** | Colapsar las dos colas offline: `lib/apiary/` pasa a envoltorio de `lib/sync/`; la visita y las fotos entran en la cola por lotes | no | A9.4 | compuerta 2 | §1.5. La deuda ya escrita, con su disparador. **Incluye añadir la ruta de visita a `OPERATOR_ROUTE_PREFIXES`** (`public/sw.js:29`) o la pantalla no abre sin señal |
| **A9.6** | Reporte de visita: `reporting.report`/`report_version`/`report_publication` **con el esquema ya especificado**, render por hoja de impresión, enlace firmado con caducidad | **sí** | A9.2, A9.3, A9.4 | — | D7 |

### En paralelo, sin bloquear el camino crítico

| # | Ticket | Esquema | Depende de | Notas |
|---|---|---|---|---|
| **A9.7** | QR por colmena | no | — | Se puede hacer hoy. Cero esquema, cero dependencias, y probablemente el mayor ahorro de toques por unidad de trabajo (D8) |
| **A9.8** | Pantalla de sitios con vitales y mapa | no | A9.1 (para «última visita») | El mapa es dependencia nueva (Mapbox, ADR-001/009 ya decidido, cero código). Las alertas son consultas derivadas, no `Notification` (§1.10 y D9) |
| **A9.9** | Compromiso de polinización: hectáreas comprometidas, densidad objetivo, contrato | **sí** | A9.1 (para el numerador) | D6. Cinco columnas y una división |
| **A9.10** | Origen de colonia agrupable: `Colony.originType` a `VariableCatalog` | **sí** | — | D6. **Una FK, no un grafo.** No reabre `Queen` `[DEFERRED]` |
| **A9.11** | Preferencia de canal por persona: modelo de preferencias + `lib/integrations/messaging/types.ts` **sin proveedor concreto** | **sí** | — | D10(a). Es el contrato, no la integración. Obedece `INTEGRATIONS.md:13-22`; correo y calendario ya tienen interfaz escrita y no se rehacen |
| **A9.12** | Emisor de bitácora que **lee de `AuditEvent`**, con resumen al cierre y alerta al instante para lo crítico | no | A9.3 | D10(b). El ticket es la **forma**, no el canal: sin adaptador, escribe a un destino de prueba. Lo que compra es que el retroactivo sea posible después |

### Fuera de este alcance, con su destino nombrado

| Qué | A dónde va | Por qué no aquí |
|---|---|---|
| `AssetAnnotation` | Fase 3 del café (`COFFEE_FIELD_OS_AUDIT.md:1370`) | D5. Resolverlo aquí es construir la Fase 3 del café sin su revisión |
| Etiquetar personas en fotos | ninguna parte, hasta que haya política | D5. Dato sobre un empleado sin política es peor que no tenerlo |
| Ingesta de clima | esquema `environmental`, no `Measurement` | §1.8. Es tabla nueva, y el esquema mismo lo dice (`schema.prisma:607`) |
| Audio largo sin señal, mapa offline | `47_P5` | D8. ADR-093 ya nombró el motivo: el navegador puede descartar IndexedDB sin preguntar |
| Calendario de temporada | conversación con el dueño, después | D9 |
| Genealogía de división | sigue `[DEFERRED]` (`DOMAIN_MODEL.md:205`) | El razonamiento de agosto sigue en pie; A9.10 cubre el hecho sin el grafo |
| Los cuatro adaptadores de canal | `lib/integrations/`, cuando un ADR levante `INTEGRATIONS.md:112-116` | D10 lo acota así. WhatsApp además exige plantilla aprobada y costo por conversación, ninguno verificado en esta sesión |

### Dos cosas del camino crítico que la estimación suele olvidar

1. **A9.5 no es refactor cosmético.** Cambia el protocolo de sincronización de
   la única superficie de captura que hoy funciona en producción. Si algo de
   este plan se va a partir en dos, es éste — y el criterio de partirlo es que
   la compuerta 2 se puede pasar con la cola vieja si la visita entra por ella.
2. **A9.3 arrastra un arreglo ajeno.** `lots.ts:728` es del café, no del
   apiario. Va aquí porque es el mismo código y porque dejarlo roto mientras se
   construye un segundo lector encima garantiza que el segundo herede el fallo.

---

## 7. Lo que este informe deliberadamente no resuelve

Con su consecuencia, en la forma de `22_APIARY_V1_SCOPING_REPORT.md` §5.

- **La forma de la pantalla de visita.** D1 dice explícitamente que no se
  decide aquí. *Consecuencia:* A9.2 llega sin diseño y va a necesitar una
  vuelta de decisión del dueño. Recuperable; es lo normal.
- **Qué umbral concreto lleva cada sitio.** El Anexo C tiene números y son de
  él. *Consecuencia:* si se construyen como constantes, la primera vez que Los
  Asientos y Toabré necesiten cadencias distintas habrá que migrarlos.
  Recuperable y barato **si nacen como parámetro por sitio**, que es lo que el
  propio anexo pide.
- **Si Kiva necesita histórico.** D7(c) elige enlace firmado. *Consecuencia:*
  el cliente ve cada reporte al recibirlo y no tiene dónde volver. Recuperable,
  pero implica meterlo en el modelo de permisos, que es otro ticket.
- **Si `FieldSession` aguantará un tercer dominio.** El estudio floral de
  `GUIDED_FIELD_STUDY_TOOL.md` es la siguiente cosa con forma de sesión.
  *Consecuencia:* si llega y no cabe, esta decisión se revisa con el contador
  del ADR-DRAFT-110 en la mano —«más de la mitad de las columnas nuevas sólo
  sirven en un dominio»—. Es recuperable **porque el criterio quedó escrito**;
  sin él no lo sería.
- **La visita del 2 de septiembre no se ha cargado.** Este informe no tocó la
  base. *Consecuencia:* la compuerta 1 sigue sin ejercitarse, y todo lo de
  arriba es un plan, no un hecho verificado.

---

## 8. Resumen de veredictos

| | Decisión | Veredicto |
|---|---|---|
| **D1** | ¿Visita = `FieldSession`? | **Extender.** El coste real es RBAC, no columnas |
| **D2** | ¿Dónde vive la lista? | **`ProtocolVersion` de Research OS**, ejecutada contra la **visita**, no contra la `Colony`. Cuatro columnas nuevas, ningún motor |
| **D3** | ¿Enmienda = entidad o pantalla? | **Ninguna de las dos.** Es un camino de escritura que no existe. `AuditEvent` basta; `sourceInterface` hace el trabajo |
| **D4** | ¿«Cierre» = estado? | **Estado**, con el modelo ya escrito en `GUIDED_FIELD_STUDY_TOOL.md`. La vista derivada no distingue «no aplica» de «sin responder» |
| **D5** | ¿Medios: apiario o una vez? | **Una vez, y fuera de aquí.** Y la mitad del problema es que la cola no acepta fotos |
| **D6** | ¿Orden? | **Visita → polinización → reina.** Polinización es más barata de lo que dice el Anexo A; reina no necesita el grafo |
| **D7** | ¿Reporte? | **`reporting.report_version` ya especificado**, hoja de impresión, enlace firmado |
| **D8** | ¿Tecnología del teléfono? | **QR sí y primero. Audio sí con disciplina. AI sólo al cerrar. Video y NFC no** — el Anexo D agrupa QR con NFC y ahí lo contradigo. Audio largo y mapa offline → `47_P5` |
| **D9** | ¿Temporada? | **Aplazar.** Los tres umbrales críticos no la necesitan, y dos reglas del Anexo C son redundantes entre sí |
| **D10** | ¿Canal de aviso? | **Dos decisiones.** La entrega se aplaza sin coste —ADR-044 tiene razón para ella—; la bitácora **no**, porque un registro «desde ahora» sí pierde lo que no espejó. Pero lo que no se puede aplazar ya existe: `AuditEvent`. Condición a escribir hoy: el emisor lee de ahí, no de una cola propia |

**Lo que este informe cambiaría de opinión.** Tres mediciones, y ninguna es
cara: (1) contar cuántas columnas nuevas de `FieldSession` sólo sirven en
`apiary_site` — si pasan de la mitad, D1 estaba mal; (2) intentar describir los
44 ítems de `protocolos/apiario-campo-v1.json` con `ProtocolVariable` más las
cuatro columnas propuestas, y ver cuántos no entran — si son más de cinco, D2
estaba mal; (3) preguntarle a Chayanne si el QR se lee con guantes — si no, D8
puso primero lo que no era; (4) contar los mensajes que produciría una visita
real bajo la lectura literal de D10 — si son decenas y no cientos, el resumen al
cierre es optimización prematura y la opción literal era viable.
