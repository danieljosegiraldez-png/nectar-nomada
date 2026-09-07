# A9 · Anexo A — Inventario de lo que ya existe

Levantado el 2026-09-07 leyendo el repositorio, no de memoria. Anexo de
`48_A9_CAPTURA_DE_CAMPO_PROMPT.md`, y el primero que hay que leer.

**Para qué existe este anexo.** Los anexos B y C fueron redactados antes de
leer `docs/architecture/` completo, y dan por faltante cosas que están
construidas, y por nuevas cosas que ya se decidieron con argumento. Este
inventario corrige eso. Cuando B o C digan «no existe» y aquí diga otra cosa,
**manda este anexo**.

**Cuatro estados, no dos:**

- **CÓDIGO** — está en `prisma/schema.prisma`, `lib/` o `app/`.
- **DOCUMENTO** — está especificado en `docs/`, sin código.
- **DECIDIDO NO** — se evaluó y se aplazó o descartó con razonamiento escrito.
- **SIN DIRECCIÓN** — nadie lo ha escrito ni decidido. Son pocos, y son los que
  de verdad piden trabajo de diseño.

---

## 1. Visita / jornada / sesión de campo — **CÓDIGO, pero no para apiario**

`prisma/schema.prisma:3666` (`FieldSession`) y `:3824` (`FieldEvent`).
Especificados en `COFFEE_FIELD_OS_AUDIT.md` §6 y construidos en
`43_P2_OPERATOR_CORE.md` (cerrado 2026-09-04, ADR-098/099/101).

El audit lo plantea así: *«Nothing today groups "Kenneth went to Las Nubes
block 3 on Tuesday morning and did these eleven things"»*. Es exactamente la
forma del problema del apiario.

**Pero:** los FK nullable de `FieldEvent` apuntan sólo a `Measurement`,
`QuantityEvent`, `SpecimenObservation`, `Asset`, `HarvestEvent` y
`LotTransformation`. **No hay FK a `Inspection`, `ColonyEvent`, `Hive` ni
`Colony` en ninguna parte del esquema.** Fue diseñado y construido para café.

→ Es la decisión **D1** del prompt. No está resuelta en ninguno de los dos
sentidos.

---

## 2. Captura en dos etapas — **SIN DIRECCIÓN**, con una mitad ya construida

Lo construido: la cola offline del apiario. `Inspection.clientDraftId` y
`ColonyEvent.clientDraftId` son únicos y se verifican en servidor antes de
insertar, así que reintentar la sincronización no duplica (A0/A5, más el
service worker de A5.5). `recordedAt`, `syncedAt`, `captureDeviceId` y
`clockOffsetMs` ya distinguen hora del aparato de hora del servidor (P2 §5).

Lo que no existe: un estado **«sincronizado pero incompleto»**. Hoy un registro
está escrito o no está. No hay noción de que a un registro le falte la mitad
que se escribe fuera del campo.

→ Decisión **D4**. La opción más barata —una vista derivada sin columna nueva—
no está evaluada en ninguna parte.

---

## 3. Listas de chequeo guiadas por protocolo — **CÓDIGO ×2, ninguno de campo**

Existen dos motores de protocolo versionado en este repositorio:

- Research OS: `Protocol` (`:5058`), `ProtocolVersion` (`:5088`),
  `ProtocolVariable` (`:5181`), `VariableCatalog` (`:5122`),
  `ProtocolRequiredMeasurement` (`:5227`) — esquema `research`.
- Sensorial: `SensoryProtocol` (`:1824`), `SensoryProtocolVersion` (`:1855`).

Ninguno está ligado al apiario, y ninguno describe hoy una casilla de campo.

→ Decisión **D2**. Un tercer motor es deuda; deformar uno de los dos también
puede serlo. Hay que argumentarlo, no elegirlo por gusto.

---

## 4. Inmutabilidad de la evidencia de campo — **CÓDIGO genérico, sin uso en pantalla**

`AuditEvent` está construido con `before`, `after`, `reason` y
`sourceInterface`, cumpliendo `CLAUDE.md` §35.

Lo que falta no es la tabla: es que la corrección hecha desde el cierre sea
**visible como enmienda** y no como un `UPDATE` silencioso.

→ Decisión **D3**. Antes de proponer entidad nueva, verifica si las acciones
del apiario escriben `AuditEvent` hoy y a qué costo se leen por entidad.

---

## 5. Tableros — **SIN DIRECCIÓN**

`CLAUDE.md` §47 dice, entero: tableros por rol y no uno universal, y enumera
ocho ejemplos (ejecutivo, proyecto, socio, investigación, comercio,
experiencia, sensorial, competencia, calidad de dato). Sin métricas, sin
reglas, sin disposición. **No existe un `DASHBOARDS.md`.**

Es de lo poco que está genuinamente sin escribir. El Anexo C es entrada del
dueño sobre esto, y es donde su aporte vale más — pero sigue siendo entrada.

---

## 6. Alertas y umbrales — **DOCUMENTO parcial**

`CLAUDE.md` §34 enumera categorías de notificación —tarea vencida, dato
faltante, aprobación pendiente, alerta de sensor, inventario bajo— y fija que
las notificaciones en-app van primero, con la arquitectura permitiendo correo o
push después. Sin lógica de umbral.

Los umbrales del Anexo C §1.2 son propuesta del dueño. Su única parte
estructural es que **son parámetros por sitio, no constantes**: un apiario de
producción y uno bajo contrato de polinización no alertan igual.

---

## 7. Clima externo — **DECIDIDO, sin ingesta**

`EXTERNAL_DATA_ARCHITECTURE.md` (líneas ~140–147) ya clasificó proveedores:
**Open-Meteo (CORE)**, «best default», y **NASA POWER (CORE)**, descrita como
hecha para agroclimatología, «the variables coffee/apiary work actually needs».
Meteostat, Visual Crossing, Tomorrow.io, Copernicus CDS e IMHPA quedaron
DEMAND / NOT-NOW / SEC.

`CLAUDE.md` §7 ya exige que todo registro ambiental declare tipo de fuente
—API, estación, IoT, manual, importado— y no mezcle procedencias.

→ **La elección de proveedor no es una decisión abierta.** Lo que falta es
ingesta y el enganche al sitio del apiario. Cualquier informe que vuelva a
comparar proveedores está gastando trabajo ya hecho.

---

## 8. NDVI, satélite, floración — **DECIDIDO NO** (satélite) + **CÓDIGO** (floración)

- Satélite y NDVI están catalogados en `NECTAR_NOMADA_EXTERNAL_DATA_SOURCES.md`
  §3 y **clasificados a propósito** SEC/DEMAND/NOT-NOW; de Google Earth Engine
  se dice que se use «only when a specific derived-index need (NDVI time
  series) justifies it». No es un olvido.
- Floración sí tiene máquina: `SpecimenObservationType` incluye `bloom_start`,
  `bloom_peak`, `bloom_end`, y `SPECIMEN_AND_MATERIAL_TRACEABILITY.md` dice que
  eso «connects a bloom event to a honey batch».
- Pero `DOMAIN_MODEL.md` §4 marca `Bloom/Flora` **`[DEFERRED]` para apiario**.
  La máquina existe y el apiario no la usa.

→ Enganchar floración al apiario es **conectar**, no construir. Cuesta mucho
menos de lo que el Anexo C supone.

---

## 9. Reina, división, genealogía — **DECIDIDO NO, con razón escrita**

`DOMAIN_MODEL.md` §4: `Queen` `[DEFERRED — not a separate entity]`.
`22_APIARY_V1_SCOPING_REPORT.md` lo razona así: registrar el **hecho** del
origen cuesta una columna; registrar la **mecánica** de la división cuesta un
grafo. Aplazar el grafo es correcto; aplazar el hecho no lo sería. Por eso
`Colony.originType` y `originNote` existen (`:4751`) y la genealogía no.

Ese razonamiento sigue siendo bueno. Lo que cambió es el precio: desde
septiembre de 2026 Toabré tiene dos orígenes genéticos distintos y la
comparación no se puede sostener.

→ No es una brecha. Es una decisión cuyo costo subió, y hay que decir cuánto.

---

## 10. Polinización — **DECIDIDO NO, con razón escrita**

`22_APIARY_V1_SCOPING_REPORT.md` la dejó fuera de v1: «no relationship to
"inspection to honey batch to sensory result" at all… zero time-boxed data at
risk, unrelated workflow». Cierto para lo que se estaba probando entonces.

Hoy hay un contrato vivo —Lote 1 de 10 ha y Lote 2 de 7 ha, densidad de trabajo
4–6 colmenas/ha— y ninguna tabla donde ponerlo. No hay campo de hectáreas
comprometidas, contrato, ni densidad objetivo en todo el esquema.

→ Decisión **D6**. Es barato y desbloquea la única cifra que vuelve verificable
la conversación con el cliente.

---

## 11. Medios — **CÓDIGO para el padre, faltante para el significado**

`Asset` está construido, con metadatos, checksum, procedencia y quince FK
nullable, entre ellos colmena, colonia, inspección y evento. Una foto **sí**
puede colgar de la caja correcta hoy.

Lo que falta es lo que el audit del café llamó `AssetAnnotation` y marcó como
faltante con prioridad P2: pie de foto, qué afirma la imagen, quién aparece.
Es la misma carencia en los dos dominios.

Aviso de lectura: `MEDIA_INTELLIGENCE_PIPELINE.md` **no trata de esto**. Trata
de ingerir imágenes de marca y expedición desde Drive hacia `core.Asset` para
generación de contenido. No menciona pies de foto ni etiquetado de personas.

→ Decisión **D5**: resolverlo una vez para los dos dominios, o dentro del
alcance del apiario.

---

## 12. Reportes al cliente y exportación — **DOCUMENTO genérico, código parcial**

`CLAUDE.md` §46 dice que los usuarios autorizados puedan exportar, enumera
formatos (CSV, XLSX, PDF, datasets de investigación, resultados sensoriales) y
exige que la exportación respete permisos.

Construido: `lib/traceability/export.ts` (CSV y JSON de datos de productor,
con permiso `lot:export`), y una ruta `app/lots/[id]/report/page.tsx` que es un
reporte en pantalla. **No se encontró ninguna librería de generación de PDF en
el repositorio.**

→ Si el reporte de visita tiene que salir en PDF, eso es una dependencia nueva
y hay que nombrarla como tal, no darla por hecha.

---

## Dos documentos que conviene leer completos

**`GUIDED_FIELD_STUDY_TOOL.md`.** Especifica una herramienta de estudio de campo
guiado de recursos florales y biodiversidad, **compartida entre apiario y café,
un solo motor y no dos**, con `Specimen` con GPS para árboles, categorías de
abundancia para cobertura, índice de diversidad aproximado, identificación de
especies asistida por IA pendiente de confirmación humana, y transcripción de
notas de voz. Aplaza expresamente el cruce polinización abeja↔café. **No está
construido.** Es el documento más cercano a lo que el dueño pide y no aparecía
en la versión anterior de estos anexos.

**`COFFEE_FIELD_OS_AUDIT.md`** (78 KB, 2026-08-27). Audit de todo el
repositorio contra una especificación de «Field OS». Su hallazgo central: el
modelo de datos está mucho más cerca de la especificación de lo que se suponía
—y cita **la cola de borradores offline del apiario** como una de las fortalezas
probadas—, mientras que la arquitectura de entrega móvil está mucho más lejos.
Es el ancestro directo de P0–P4.

---

## Lo que este inventario cambia en los anexos B y C

| Dice el anexo | Dice el repositorio |
|---|---|
| «la visita no existe» | existe como `FieldSession`, para café; la pregunta es si se extiende |
| «hay que crear un motor de protocolo» | ya hay dos; hay que argumentar por qué no sirven |
| «hay que crear `FieldAmendment`» | `AuditEvent` ya guarda antes, después y motivo |
| «las fotos quedan huérfanas» | huérfanas de significado, no de padre; `Asset` ya liga a la colonia |
| «capa externa de clima sin integrar» | proveedores ya elegidos; falta ingesta, no decisión |
| «floración va después» | la máquina ya existe en `SpecimenObservation`; falta conectarla |
| «reina y polinización son brechas» | son decisiones documentadas cuyo costo cambió |

Ninguna de estas correcciones invalida el problema que los anexos describen.
Cambian de dónde hay que partir para resolverlo.
