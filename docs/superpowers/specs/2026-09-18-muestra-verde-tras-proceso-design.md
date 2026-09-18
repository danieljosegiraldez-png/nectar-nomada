# Muestra de café verde: sólo tras terminar proceso y en secado/almacenamiento

**Fecha:** 2026-09-18 · **Base:** `origin/main` en `0f19775` · **Camino:** acotado

Regla de Daniel, 2026-09-18, en sus palabras: «a green sample from a process that
hasn't completed is wrong, must pass process and or recipe process(es) and then
drying/storage and any rules that may be defined for process duration and then
samples can be taken during this latter phase». Es decir: una muestra de café
**verde** sólo es válida si el lote ya **terminó** su proceso y/o receta, está en
la fase de **secado o almacenamiento**, y respeta las reglas de **duración**
definidas para esa fase. Este documento es el diseño; no toca código.

**Actualizado el mismo día:** Daniel respondió las cinco preguntas que este
documento dejaba abiertas. Sus respuestas están incorporadas abajo como
decisiones, no como preguntas — y donde ya existía una respuesta escrita en
`docs/beneficio/` que esta primera versión no citó, se dice aquí cuál era y si
coincide o contradice lo que él acaba de decidir.

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

**Ya normativo, y esta versión no lo citaba:** `docs/beneficio/13_drying_moisture.md`
§4 dice, con todas sus letras, *«el medidor de humedad lee sobre **pergamino**,
no sobre cereza ni sobre café verde. Escala distinta, no intercambiable»* y fija
`sample_point = PARCHMENT_BED` para toda medición durante `DRYING`. Es la misma
distinción que esta sección hace con `MaterialState`, dicha tres versiones de
documento antes (v3.1) para la humedad — sólo faltaba extenderla al resto de
tipos de muestra.

**Por qué no basta con mirar `sampleKind`:** una muestra `MOISTURE` puede
tomarse legítimamente sobre pergamino a mitad de secado (para decidir si ya
llegó a la humedad objetivo) — ahí el material es `PARCHMENT`, no `GREEN`, y la
regla de Daniel no la toca. El guardia debe activarse por `materialState ===
GREEN`, cualquiera que sea el `sampleKind` declarado.

---

## 2. Cómo se evalúa «proceso terminado» — decisión de Daniel

**Decisión de Daniel, 2026-09-18, en sus palabras:** *«processing before drying
and storage could be one or more treatments or processes and can change and
until manually defined as completed does not leave that process treatment and
into the next, so there could be process 1 or many more, and then a
lotprocesscompleted, one of all of these are process phase which could be
prefermentative, fermentative consecutive and or simultaneous interventions»*.

Es decir: la fase de proceso (antes de secado/almacenamiento) puede ser **uno o
varios** tratamientos/procesos — prefermentativos, fermentativos, consecutivos
y/o simultáneos — y **no se sale de ella hacia la siguiente hasta que alguien
la marca manualmente como terminada** («a lot process completed»). No hay
número fijo de pasos ni un cierre automático por tiempo o por lectura.

**Esto ya tenía precedente normativo, sólo que en otra pieza del texto.**
`docs/beneficio/01_lot_lifecycle.md` §2 regla 3: *«Ninguna transición
automática puede ordenar una acción destructiva. Un `TERMINATION_READY` de
Brix o un `OVER_FERMENTED_CRITICAL` de pH recomiendan; el paso a `WASHING`
siempre lo confirma una persona. El sistema es asesor, no autónomo»*. Es el
mismo principio que Daniel acaba de aplicar a la salida de todo el bloque de
proceso: una lectura o un motor puede sugerir que ya se puede pasar a
secado/almacenamiento, pero el cierre lo firma una persona.

**Cuál campo de datos representa ese cierre manual:** el nombre que usa Daniel
— «a lot process completed» — nombra literalmente el modelo que ya existe,
`LotProcess.endedAt` (`prisma/schema.prisma:3757`, nullable, `endedAt` nulo =
sigue abierto). Es una lectura de sus palabras, no una cita suya sobre el
nombre del campo, pero la coincidencia es exacta y el modelo ya admite «uno o
varios» porque `LotProcess` es una fila por **instancia** de proceso —
`sequenceOrder` por lote — no una columna única: un lote puede tener varias
filas de `LotProcess` en secuencia, cada una con su propio `startedAt`/`endedAt`,
que es justo la forma «proceso 1, proceso 2, … n» que él describe.

**El otro camino de datos, `ProcessingStage`/`TreatmentBatch` (esquema
`research`), queda fuera.** Es el mecanismo del Research OS para protocolos y
lotes de tratamiento experimentales — un concepto distinto, no el flujo
comercial de beneficio que esta regla gobierna. La respuesta de Daniel describe
el dominio del beneficio («prefermentative, fermentative… interventions» sobre
un lote real vendible), no un experimento, así que este documento fija
`LotProcess.endedAt` como la señal de «proceso terminado» y deja
`ProcessingStage` fuera del guardia — salvo que un lote tenga además un
`TreatmentBatch` de investigación, en cuyo caso ese es un dato de otro módulo y
no sustituye al cierre comercial.

**Lo que sigue siendo cierto y hay que decir sin adornos:** `LotProcess` tiene
**0 filas sobre 46 lotes** en producción. Nadie ha cerrado un proceso todavía
porque nadie ha abierto uno en el sistema — la captura de campo (fermentación,
tratamientos, cierre manual) no está llegando hoy. Un guardia que dependa de
`LotProcess.endedAt` bloqueará **toda** extracción de muestra verde en
producción mientras esa captura no exista, lo cual es exactamente lo que la
regla de Daniel pide (§3 abajo: bloquea, no avisa) — no es un defecto del
guardia, es el estado real de los datos.

---

## 3. Cómo se evalúa «en secado o almacenamiento» — decisión de Daniel

**Decisión de Daniel, 2026-09-18, en sus palabras:** *«two phases, has to
finish one to go into other, some people even have recipe where it dries to a
certain point H% 50 or 30% and then goes back into prior phase and can be
infused coinfused cofermented or even put back into its own fermented must
thats still active and stay a few more days or whichever treatments are
considered and then back to drying again to finish the process and once at
optimal H% goes to storage»*.

Dos fases, **secuenciales**: primero secado, luego almacenamiento — hay que
terminar una para entrar en la otra. Y el secado puede **interrumpirse** a una
humedad intermedia (su ejemplo: 50 % o 30 %) para volver a una fase anterior
(infusión, coinfusión, cofermentación, o reingreso a su propio mosto todavía
activo) unos días, y luego **retomar el secado** hasta terminar. Sólo al llegar
a la humedad óptima el lote pasa a almacenamiento.

**Esto ya estaba escrito, casi con las mismas palabras, en el documento
normativo — y esta primera versión no lo había citado.** `docs/beneficio/01_lot_lifecycle.md`
§1 define la máquina de estados con **exactamente esa secuencia**:

```
… ─▶ DRYING ─▶ RESTING ─▶ MILLED
```

con `RESTING` (reposo/almacenamiento en pergamino) **después** de `DRYING`, no
la misma fase. Y la misma tabla ya trae, desde la v3.0, el criterio de salida
de `DRYING`: `TARGET_REACHED`. `docs/beneficio/13_drying_moisture.md` §2, en su
bloque de integración, lo precisa más de lo que la primera versión de este
documento decía: *«`water_activity`, no sólo humedad porcentual, gobierna la
aptitud para bodega. `TARGET_REACHED` exige ambos criterios»* — humedad **y**
actividad de agua, no sólo la humedad.

**Y aquí hay una contradicción real entre lo que Daniel acaba de decidir y lo
que el mismo documento normativo dice dos reglas más abajo — hay que decirlo,
no callarlo.** `01_lot_lifecycle.md` §2 regla 4: *«Una transición hacia atrás
está prohibida. Un error de etapa se corrige con `REJECTED` + lote nuevo, o con
un evento de corrección que supersede»*. Daniel acaba de describir exactamente
una transición hacia atrás — de `DRYING` de vuelta a una fase de fermentación/
infusión — como un flujo **legítimo y esperado**, no un error de etapa. Su
decisión de hoy manda sobre el documento (`CLAUDE.md` del repositorio: «cuando
una decisión suya contradiga un documento normativo, manda él y se anota en el
documento»), pero la regla 4 de `01_lot_lifecycle.md` §2 queda **desactualizada**
tal como está escrita hoy y alguien tendrá que corregirla — este spec no lo
hace porque no es su alcance, sólo lo deja anotado para que no se lea como
vigente.

**Lo que falta construir, y no es una pregunta:** ninguno de los dos mecanismos
de código que existen hoy (`faseDelLote()` en `lib/beneficio/reposo.ts`, que
sólo distingue `"fermentacion" | "secado" | "reposo"` sin ciclos; y el propio
`LotState`/`RESTING` de `01_lot_lifecycle.md`, que es una máquina de estados
descrita en la documentación normativa pero que **no existe como código** —
`grep` de `RESTING`/`FERMENTING`/`DEPULPING` en `lib/` y `prisma/schema.prisma`
no encuentra ese enum, sólo nombres de estado que dos motores de pH/Brix usan
como etiqueta de su propio resultado) modela el ir-y-volver que Daniel describe.
Construirlo es trabajo de implementación posterior a este spec, no una decisión
pendiente.

**Para el guardia de esta regla, lo que importa es más simple que modelar el
ciclo completo:** el guardia sólo necesita saber si el lote **ya llegó** a
almacenamiento (secado terminado, `TARGET_REACHED` con humedad y actividad de
agua dentro de banda) — no necesita entender ni prohibir las idas y vueltas
dentro de la fase de secado, que son asunto del motor de secado, no del guardia
de muestras. Mientras el lote esté en cualquier punto de esa fase —incluyendo
un regreso a fermentación/infusión de los que Daniel describe— el guardia lo
trata igual: no está en almacenamiento todavía, así que no hay café verde que
muestrear.

**Almacenamiento, en código:** el modelo estructural es `StorageAssignment`
(`prisma/schema.prisma:6059` — `lotId`, `locationId`, `startedAt`/`endedAt`,
`endedAt` nulo = asignación vigente). **0 filas en producción**, igual que
`DryingRun` y `FermentationRun` (0 cada uno). Con los datos de hoy, ningún lote
tiene cómo demostrar que está en almacenamiento — la misma consecuencia de §2:
el guardia bloqueará todo mientras la captura de campo no llegue al sistema.

---

## 4. Bloquea, no avisa — decisión de Daniel

**Decisión de Daniel, 2026-09-18, en sus palabras:** *«it should block a green
sample that isn't even dry yet or isn't even in storage»*. **Bloquea**, no
avisa. Distinta de la compuerta de venta temprana (`docs/superpowers/specs/2026-09-16-reposo-trilla-y-subproductos-design.md`
§A.2), que sólo avisa por decisión suya del 2026-09-16 — «depende el arreglo»
con el comprador. Aquí no hay arreglo posible: si el café no llegó a
almacenamiento, no existe café verde, y no hay negociación que lo haga existir.

**Esto también tiene precedente normativo ya escrito**, aunque en otra sección
del mismo documento: `01_lot_lifecycle.md` §3, sobre la aplicabilidad de los
motores: *«Invocar un motor fuera de su estado aplicable devuelve
`NOT_APPLICABLE`, nunca una evaluación»*. Es el mismo principio — una operación
que no corresponde a la fase actual del lote no se degrada a una advertencia,
se rechaza — aplicado ahí a los motores de pH/Brix/humedad y aquí a la
extracción de una muestra.

`lib/beneficio/perfiles.ts`/`lib/beneficio/reposo.ts` sí implementan
`diasParaMuestra` (30 días, `[PROVISIONAL]`, decisión de Daniel 2026-09-16),
pero esa compuerta responde una pregunta distinta y posterior — *«¿cuántos
días de edad tiene una muestra verde que ya existe?»* — y por su propia
decisión de esa fecha, sólo avisa. La compuerta de esta regla es anterior y
binaria — *«¿existe siquiera café verde?»* — y bloquea. No se reutiliza
`diasParaMuestra` para esto; son dos compuertas distintas, con dos criterios de
severidad distintos, decididos en dos fechas distintas.

**Sin permiso de anulación.** Daniel no reconoció la pregunta sobre un permiso
de anulación en el molde de `lot:override_balance`, y su decisión sobre bloquear
sin excepción resuelve el punto de todos modos: el bloqueo es absoluto. Una
muestra tomada a mitad de proceso **no es una muestra verde tomada temprano** —
es una muestra de humedad o de proceso, con su propio `SampleKind` (§1). No hay
caso legítimo de «muestra verde antes de tiempo, autorizada por alguien»: si el
material no es verde todavía, la muestra no puede declararse `MaterialState.GREEN`,
punto. Este documento no propone ningún permiso nuevo.

---

## 5. Dónde vive hoy el guardia — o más bien, dónde no vive

`lib/traceability/samples.ts` → `createSampleFromLot` (medido antes de este
documento, no se repite la lectura línea por línea) sólo comprueba permiso
(`sample:manage`, ámbito del lote). No consulta `LotProcess`, `faseDelLote`, ni
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
lea el estado de otro lote/`LotProcess`/`DryingRun` desde una restricción de
columna; la única enforcement real es en la capa de servicio. Esto ya es un
patrón conocido en la casa (`CLAUDE.md` del repositorio, «llamar "estructural"
a lo que sólo comprueba el servicio» — una restricción en TypeScript no existe
para la base). Se anota aquí para que nadie la llame «estructural» más
adelante.

---

## 6. La muestra que ya existe en producción — decisión de Daniel

Producción tiene **46 lotes y una sola muestra**: `sample.id = "111"`,
`sampleType = "green_coffee"`, extraída del lote `PE-80` el 2026-08-28.
Medido: `PE-80` no tiene **ningún** `LotProcess` (coincide con el 0/46
general), y en la fila de la muestra `stageAtExtraction` y `materialState`
están en `null` — porque, como dice §5, el formulario que la creó nunca pedía
esos campos.

**Decisión de Daniel, 2026-09-18: «retire it».** Se retira, con rastro —no se
borra—, siguiendo el mismo principio de baja lógica que el resto del módulo
(`LotTransformation` es append-only; una corrección nunca edita, siempre añade
un evento). **Daniel se encarga de ejecutarlo en producción**; este documento
sólo refleja la decisión, no toca la base de datos ni ejecuta el retiro.

---

## 7. Fuera de alcance

- Rellenar `LotProcess`, `DryingRun` o `StorageAssignment` retroactivamente
  para los 46 lotes existentes — es captura de datos de campo, no diseño.
- Extender `SampleForm.tsx` para pedir `materialState`/`sampleKind`/
  `stageAtExtraction`, e implementar el guardia dentro de `createSampleFromLot`
  — es código; este documento es el diseño que lo autoriza, no la
  implementación.
- Modelar en código el ir-y-vuelta entre secado y una fase anterior que
  describe la §3 — es una extensión de `faseDelLote()` (o de lo que la
  sustituya), y es trabajo de implementación, no una decisión pendiente.
- Corregir `01_lot_lifecycle.md` §2 regla 4 («transición hacia atrás
  prohibida»), que la decisión de Daniel en §3 deja desactualizada — es un
  documento normativo que Daniel cierra, y este spec sólo señala la
  contradicción.
- Ejecutar el retiro de la muestra `111` en producción — Daniel lo hace él
  mismo (§6).
