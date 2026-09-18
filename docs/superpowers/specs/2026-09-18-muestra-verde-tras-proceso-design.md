# Muestra de café verde: sólo tras terminar proceso y en secado/almacenamiento

**Fecha:** 2026-09-18 · **Base:** `origin/main` en `0f19775` · **Camino:** acotado

Regla de Daniel, 2026-09-18, en sus palabras: «a green sample from a process that
hasn't completed is wrong, must pass process and or recipe process(es) and then
drying/storage and any rules that may be defined for process duration and then
samples can be taken during this latter phase». Es decir: una muestra de café
**verde** sólo es válida si el lote ya **terminó** su proceso y/o receta, está en
la fase de **secado o almacenamiento**, y respeta las reglas de **duración**
definidas para esa fase. Este documento es el diseño; no toca código.

---

## 1. A qué muestras aplica, y a cuáles no

`docs/beneficio/20_modelo_ciclo_completo.md` §2 define cinco tipos de muestra
(`SampleKind`): `PROCESS`, `MOISTURE`, `ROAST`, `CUPPING`, `RETENTION`.

| Tipo | Es café verde? | La regla de Daniel aplica |
| :--- | :--- | :--- |
| `PROCESS` (pH, °Bx) | No — se mide *dentro* del proceso, sobre cereza/mucílago/pergamino en curso | **No.** Es justo la muestra legítima a mitad de proceso que Daniel excluyó explícitamente |
| `MOISTURE` | Puede ser verde (humedad de café ya trillado) o de pergamino en secado | **Sí, cuando el material es `GREEN`** |
| `ROAST` | Sí — es la extracción de verde que origina un `RoastBatch` | **Sí** |
| `RETENTION` (testigo) | Sí — testigo sellado del lote vendible | **Sí** |
| `CUPPING` | No es ella misma una extracción de verde: §2 exige que provenga de un `RoastBatch` conforme, que ya se tostó | **No directamente** — pero su origen (`ROAST`) ya quedó cubierto por la fila de arriba |

**El discriminante correcto es `MaterialState`, no `SampleKind`.** `SampleKind`
dice para qué se usa la muestra; `MaterialState` dice de qué material real sale.
El enum ya lo declara así — `prisma/schema.prisma` (`MaterialState.GREEN`,
añadido 2026-09-15): *«El café verde NO pertenece al secado: es post-reposo,
cuando el beneficio ya terminó de transformar»*. Ese comentario, escrito tres
días antes de esta regla, ya es la regla — sólo faltaba aplicarla.

**Por qué no basta con mirar `sampleKind`:** una muestra `MOISTURE` puede
tomarse legítimamente sobre pergamino a mitad de secado (para decidir si ya
llegó a la humedad objetivo) — ahí el material es `PARCHMENT`, no `GREEN`, y la
regla de Daniel no la toca. El guardia debe activarse por `materialState ===
GREEN`, cualquiera que sea el `sampleKind` declarado.

---

## 2. Cómo se evalúa «proceso terminado» — y el problema de fondo

Hay **dos mecanismos independientes** en el código para saber si un lote
terminó de procesarse, y ninguno tiene datos hoy:

### 2.1 `LotProcess` (`prisma/schema.prisma:3757`)

Instancia de proceso por lote, con `startedAt`/`endedAt` (nullable — `endedAt`
nulo = sigue abierto), `processGradeValueId`, `cherryStateValueId` y
`targetMoisturePct`. Es el modelo pensado para responder exactamente esta
pregunta. **Medido en producción: 0 filas sobre 46 lotes.** Nació el 2026-09-07
y nunca se llegó a alimentar desde ninguna pantalla.

### 2.2 `ProcessingStage` vía `TreatmentBatch` (esquema `research`)

`ProcessingStage.completedAt` (`prisma/schema.prisma`, modelo `ProcessingStage`)
vive colgada de `TreatmentBatch.lotId` (nullable), no del lote directamente.
**Medido en producción: 84 filas, 0 con `completedAt`.** Es el camino del
Research OS (protocolos/lotes de tratamiento), pensado para experimentos, no
para el flujo comercial de beneficio. Vincula a un lote sólo cuando el
`TreatmentBatch` declara `lotId`.

### 2.3 El camino que sí tiene señal: `LotTransformation` + `DryingRun`

`lib/beneficio/reposo.ts` ya resuelve una pregunta emparentada —**no** «¿terminó
el proceso?», sino «¿en qué fase está el lote ahora?»— leyendo
`FermentationRun`/`DryingRun` abiertos (`endedAt: null`) enlazados al lote vía la
transformación `stage_change` que los inicia (`lib/traceability/lots.ts:726`,
`getActiveOperations`). `faseDelLote()` (`lib/beneficio/reposo.ts:110`) da
`"fermentacion"`, `"secado"` o `"reposo"` — y **`"reposo"` es exactamente la fase
que la regla de Daniel exige**, con un matiz importante: sólo cuenta si el
secado cerró con `DryingRun.endedOutcome === "target_reached"`; un secado
abandonado o sin desenlace declarado no reposa, no se le inventa una edad.

**Medido en producción: `drying_run` 0 filas, `fermentation_run` 0 filas,
`storage_assignment` 0 filas. `lot_transformation`: 12 filas en total.**

**La consecuencia que hay que decir sin adornos: con los datos de hoy,
`faseDelLote()` devuelve `null` para los 46 lotes de producción**, porque nunca
hubo una corrida de fermentación o secado registrada para ninguno. No es que el
mecanismo esté mal — es que la captura de campo (fermentación, secado,
almacenamiento) no está llegando al sistema todavía. Un guardia que dependa
literalmente de este camino bloquearía **toda** extracción de muestra verde en
producción hoy, no sólo las que de verdad son prematuras.

**Cuál de los dos caminos (§2.1 o §2.2) cuenta para «proceso terminado», o si
cuentan los dos, queda en la sección 6 como pregunta abierta.** Este documento
no lo decide porque ninguno de los dos tiene un solo dato real con el que
probar la distinción, y `03_public_api.md` no declara cuál es autoritativo.

---

## 3. Cómo se evalúa «en secado o almacenamiento»

**Secado:** una `DryingRun` sobre el lote con `endedAt` nulo (en curso) es
secado abierto; una con `endedAt` fijado y `endedOutcome: "target_reached"` es
secado terminado, y **desde ahí arranca el reloj de reposo** — no desde el fin
de la fermentación (`lib/beneficio/reposo.ts` §1).

**Almacenamiento:** el modelo estructural es `StorageAssignment`
(`prisma/schema.prisma:6059` — `lotId`, `locationId`, `startedAt`/`endedAt`,
`endedAt` nulo = asignación vigente). **0 filas en producción.** El diseño de
reposo (`docs/superpowers/specs/2026-09-16-reposo-trilla-y-subproductos-design.md`
§A.3) decidió deliberadamente **no** crear un estado «en reposo» que cierre el
lote — el reposo es una edad calculada, no una fase declarada con su propia
fila — así que hoy «almacenamiento» como fase separada de «reposo» no tiene un
lugar propio en el modelo: `faseDelLote()` sólo distingue
`fermentacion`/`secado`/`reposo`, y `reposo` ya cubre tanto «recién secó» como
«lleva meses guardado». Este documento asume que «secado o almacenamiento» en
las palabras de Daniel corresponde a esa única fase `reposo` del código
existente, no a dos fases distintas — y lo deja marcado como pregunta abierta
por si él quiere separarlas.

---

## 4. Las reglas de duración que ya existen — y las que no

`lib/beneficio/perfiles.ts` y `lib/beneficio/reposo.ts` ya implementan un
umbral de duración por perfil de beneficio: `diasParaMuestra` (30 días,
`[PROVISIONAL]`, decisión de Daniel 2026-09-16) y `diasParaVenta` (60 en
`WASHED_STANDARD`, 45 en `NATURAL`). **Pero el umbral de muestra, por decisión
explícita de Daniel el 2026-09-16 (§A.2 del spec de reposo), sólo AVISA y no
bloquea**: antes de los 30 días, la extracción sigue siendo legítima, sólo
temprana.

**Esto es una compuerta distinta de la que pide esta regla, y no hay que
confundirlas:**

- La compuerta de **edad** (`diasParaMuestra`) responde «¿cuántos días lleva en
  reposo?» y avisa sin bloquear, porque el material verde ya existe y sacar una
  muestra temprana es una decisión operativa legítima.
- La compuerta que pide **esta** regla responde una pregunta anterior y
  binaria: **¿existe siquiera café verde para muestrear?** Antes de que el
  proceso termine y el lote entre en reposo, no hay material verde — la
  pregunta no es «¿cuántos días de edad tiene la muestra?», es «¿de dónde
  saldría esta muestra?». Es un guardia estructural, no un aviso de calendario.

Este documento **no reutiliza** `diasParaMuestra` para la nueva compuerta:
propone una compuerta previa e independiente. Si Daniel quiere que también
avise-y-no-bloquee en vez de impedir, es la pregunta 3 de la sección 6.

---

## 5. Dónde vive hoy el guardia — o más bien, dónde no vive

`lib/traceability/samples.ts` → `createSampleFromLot` (medido antes de este
documento, no se repite la lectura línea por línea) sólo comprueba permiso
(`sample:manage`, ámbito del lote). No consulta `faseDelLote`, `LotProcess`, ni
ningún otro estado del lote. `stageAtExtraction`, `materialState`,
`sampleKind` y `samplingRole` los declara quien crea la muestra, como texto u
opción libre — nada los contrasta contra la realidad del lote.

**Y hay un problema anterior al guardia: la pantalla ni siquiera pide esos
campos.** `app/components/traceability/SampleForm.tsx` (formulario detrás de
`app/lots/[id]/samples/new`) sólo tiene `sampleCode`, `sampleType` (texto libre,
con el placeholder `green_coffee`), `quantity`, `unit` y `notes`.
`materialState`, `sampleKind` y `stageAtExtraction` — los tres campos que un
guardia estructural necesitaría leer — **no están en el formulario** y llegan
`undefined` a `createSampleFromLot` en todo caso creado por esta pantalla. Esto
explica por qué la única muestra de producción los tiene en `null` (§6).

**Dónde debería vivir el guardia:** dentro de `createSampleFromLot`, no sólo en
la UI. Es el mismo principio que ya sigue el resto del módulo — el permiso se
comprueba en el servicio, no confiando en que el formulario oculte el botón —
y la razón práctica es la misma: cualquier llamada futura (una importación, una
acción de servidor distinta, un script de datos) pasaría por encima de una
validación que sólo viviera en `SampleForm.tsx`.

**No hay forma estructural en la base para esto.** No hay `CHECK` posible que
lea el estado de otro lote/`DryingRun` desde una restricción de columna; la
única enforcement real es en la capa de servicio. Esto ya es un patrón conocido
en la casa (`CLAUDE.md` del repositorio, «llamar "estructural" a lo que sólo
comprueba el servicio» — una restricción en TypeScript no existe para la base).
Se anota aquí para que nadie la llame «estructural» más adelante.

---

## 6. La muestra que ya existe en producción

Producción tiene **46 lotes y una sola muestra**: `sample.id = "111"`,
`sampleType = "green_coffee"`, extraída del lote `PE-80` el 2026-08-28.
Medido: `PE-80` no tiene **ningún** `LotProcess` (coincide con el 0/46
general), y en la fila de la muestra `stageAtExtraction` y `materialState`
están en `null` — porque, como dice §5, el formulario que la creó nunca pedía
esos campos.

**No se puede saber, con los datos guardados, si esta muestra violó o no la
regla de Daniel.** `materialState: null` no es evidencia de que el café no
fuera verde — es evidencia de que el sistema nunca preguntó. Y `LotProcess` en
cero para los 46 lotes no significa que ningún lote de producción haya
fermentado o secado de verdad: significa que el sistema nunca capturó esos
pasos para ninguno, cosa que sabemos que ocurrió en la finca porque el café
existe. Aplicar el guardia en retroactivo contra esta fila mediría la
completitud de los datos, no el cumplimiento de la regla.

Qué hacer con esta muestra queda en la sección 7 (pregunta 4): este documento
no decide entre marcarla, retirarla o dejarla con una nota, porque las tres
dependen de si Daniel recuerda si `PE-80` de verdad había terminado su proceso
el 2026-08-28.

---

## 7. Preguntas abiertas para Daniel

1. **¿Cuál de los dos caminos de proceso cuenta como «terminado» — `LotProcess`
   (comercial), `ProcessingStage`/`TreatmentBatch` (investigación), o los dos?**
   Y si un lote tiene un `TreatmentBatch` de investigación pero ningún
   `LotProcess` comercial (o viceversa), ¿el guardia exige los dos o le basta
   uno? Ninguno tiene datos reales hoy con los que decidir por medición.

2. **¿«Secado o almacenamiento» son la misma fase (`reposo`, como ya la
   modela `faseDelLote`) o dos fases que Daniel quiere distinguir?** El diseño
   de reposo del 2026-09-16 decidió a propósito no darle una fila propia al
   almacenamiento. Si Daniel quiere separarlas, hace falta decidir qué las
   distingue (¿una `StorageAssignment` activa, que hoy tiene cero filas?).

3. **La nueva compuerta —¿existe café verde para muestrear?— ¿bloquea o sólo
   avisa?** La doctrina de la casa y la decisión de Daniel del 2026-09-16 para
   la venta temprana fueron «avisa, no bloquea, porque bloquear se esquiva en
   el patio». Esta regla es distinta en naturaleza — no es un juicio comercial
   sobre qué tan pronto es «demasiado pronto», es la ausencia física del
   material — pero antes de construir un bloqueo duro conviene que Daniel lo
   confirme explícitamente, dado que es la primera compuerta dura del módulo de
   muestras.

4. **Qué hacer con la muestra `111` (`PE-80`, 2026-08-28):** ¿marcarla con una
   nota de que se creó antes de que el guardia y sus campos existieran,
   retirarla, o dejarla intacta y documentar la excepción? Ninguna opción se
   puede decidir por medición porque falta el dato de si `PE-80` había
   terminado su proceso ese día.

5. **¿El guardia necesita un permiso de anulación propio** (en el molde de
   `lot:override_balance`, descrito como «debería ser raro»), para el caso real
   de una muestra tomada fuera de proceso con justificación operativa? O
   ¿la ausencia de override es intencional y la única salida es corregir el
   registro del proceso primero?

---

## 8. Fuera de alcance

- Rellenar `LotProcess` o `TreatmentBatch` retroactivamente para los 46 lotes
  existentes — es captura de datos de campo, no diseño.
- Extender `SampleForm.tsx` para pedir `materialState`/`sampleKind`/
  `stageAtExtraction` — depende de que la pregunta 1 y 3 se resuelvan primero,
  para no construir un formulario que el guardia todavía no puede validar.
- Separar «secado» de «almacenamiento» como fases distintas en
  `faseDelLote` — depende de la pregunta 2.
