# La sección Finca: parcelas, cosecha, recolectores y lo que la selección le devuelve — diseño

**Fecha:** 2026-09-18 · **Camino:** arquitectónico · **Estado:** aprobado por partes en conversación, pendiente de revisión escrita · **Medido sobre:** `origin/main` = `0069d86`

**Alcance.** La hermana de la sección Beneficio (#383, fusionado): todo lo de la finca **hasta la cosecha** —parcelas, lo de antes de la cosecha, la cosecha, su rendimiento y la eficiencia de quien recolecta—, y la información que la selección del beneficio le devuelve.

---

## 1. Qué pidió Daniel

Daniel, 2026-09-18 (sus palabras, con erratas de teclado corregidas): *«finca o farm, debajo de éste estaría parcelas y todos los temas relacionados pre cosecha y rendimiento de cosecha, y detalles no relacionados a procesos del beneficio: sólo hasta cosecha y rendimiento, y eficiencia de trabajadores cosechando. En selección de beneficio hay info que aporta a finca, por tema de saber la calidad de la cosecha por calidad de fruta, como igual manejo de finca, y por recolecta, que puede ser error humano, y mantener ciertos controles. Esto es info importante para el farm manager en caso no sea el mismo que el del beneficio o el process manager.»*

## 2. Lo que ya existe — medido

| qué | dónde | qué da, y qué le falta |
|---|---|---|
| la cosecha | `HarvestEvent`: `locationId`, `harvestedAt`, `cherryWeightKg`, Brix, madurez, defectos y limpieza por catálogo, `resultingLotId`; `HarvestEventSource` la reparte entre parcelas | **se registra desde `/lots/new`**, en la sección de lotes, no en la finca |
| rendimiento | `computePlotYield` en `lib/traceability/plantingCohorts.ts`, en la ficha de parcela | kg por hectárea y año; **sin mano de obra ni recolector** |
| mano de obra | `LabourEntry`: `workerCount`, `hours`, colgada de una cosecha, un proceso o una ubicación | **por cuadrilla, sin nombres, a propósito** — ver §3 |
| la selección | `lib/traceability/selection.ts`: una salida aceptada y otras corrientes, **cada una un lote de verdad** que sigue su propio proceso; catálogo `rechazo_categoria` | rastreable a la parcela vía `getLotLineage` / `getLotReport`, **sólo de lote a parcela**: nada lo lleva de vuelta a la ficha de la parcela. «Rechazo» significa **rechazado para primera calidad**, no desechado: esas corrientes siguen procesándose como otra calidad — ver §5.6 |
| quién recolectó | — | **no existe en ninguna tabla**: `operatorPersonId` de la cosecha es quien la **registró** |

## 3. La decisión que se revierte, y por qué

`docs/implementation/20_CAPTURE_OR_LOSE_IT_REPORT.md` §4 y su ADR ponen en la lista de **«deliberadamente no capturado»** la *«identidad individual con nombre por entrada de mano de obra»*, con esta razón: *«ninguna historia de trabajo ni productividad por persona se puede reconstruir después»*.

**Daniel decidió el 2026-09-18 revertirla, sólo para las entregas de cosecha.** Los kilos y los errores de recolección de cada persona son un control de calidad de la finca que él quiere tener. `LabourEntry` **no cambia**: la mano de obra general sigue por cuadrilla.

Lleva **su propio ADR** —el siguiente libre al escribirlo; hoy el último es ADR-158— que cite aquella decisión, la revierta con alcance acotado y deje dicho quién ve los datos.

**Y un aviso que no es asesoría legal:** en Panamá, lo que produce cada trabajador y sus errores, con su nombre, es **dato personal** bajo la Ley 81 de 2019. Por eso el acceso se decide aparte (§6), y conviene que los recolectores sepan que se registra.

## 4. Decisiones de Daniel (2026-09-18)

| pregunta | decisión |
|---|---|
| a qué nivel se mide la recolección | **por persona, con nombre** |
| quién ve los datos con nombre | **dueño, Farm Manager y también el capataz** |
| de dónde sale la calidad de cada persona | **al recibir, por persona** —kilos y una muestra—; **la selección del beneficio vuelve por parcela y día** |
| dónde se anota cada entrega | **en una pantalla de cosecha, con conexión** |
| meliponarios | **entrada propia en el menú**, junto a apiarios |
| qué hace la selección | **rechaza para primera calidad, y lo rechazado no se desecha.** Aclaración de Daniel: *«es un rechazo de cereza óptima para proceso, no apta para primera calidad»*. La cereza madura —roja, «uva»— va por un lado; verdes y pintones, juntos o separados; flotadores aparte. **Cada corriente se pesa y sigue su propio proceso**: los flotadores pueden ir directo a cama, o fermentarse, u oxidarse unos días en bolsa y luego a cama |
| rendimiento: por qué unidad | **por parcela, no por hectárea**, y medible hasta **microparcela, bloque o celda —una planta, `Specimen`—** cuando la cosecha dice que fue de ahí, con esa trazabilidad llegando al lote |
| qué mide el tablero | **el café de especialidad de primera.** Las otras corrientes se procesan y entran como otra calidad u otro uso; se registran, pero **no cuentan** en los indicadores de primera, que son los del manejo prioritario de la finca y del beneficio |

## 5. Diseño

### 5.1 El menú

**«Finca» sustituye a «Parcelas»**, con **exactamente** su regla: `location:manage_attributes`, `lot:view` o `lot:manage`. `/finca` es el índice, sin formularios, como `/beneficio`. Las rutas existentes **no se mueven** (`/plots` sigue donde está); la mudanza, si llega, es su propio PR, como en Beneficio.

El aterrizaje tras iniciar sesión **no cambia**. Y `/plots` entra en `DENTRO_DE_SECCION` de `lib/navigation.ts` bajo `/finca`, para que el invariante de ADR-082 siga pudiendo decir que se vuelve a ella desde el menú.

### 5.2 Las cinco pantallas de la sección

1. **Parcelas** — lo que ya existe.
2. **Cosechas** — la lista de cosechas de la finca y registrar una nueva. El formulario de cosecha **ya existe** (`app/components/traceability/HarvestForm.tsx`); esta pantalla lo ofrece desde la finca en vez de desde lotes. No se duplica.
3. **Recolectores** — la lista de quién recolecta en la finca.
4. **Rendimiento y eficiencia** — kg/ha por parcela y año (lo de hoy), kg por hora por recolector, y por cuadrilla del día.
5. **Calidad de la cosecha** — por recolector (de la muestra al recibir) y por parcela y día (de la selección del beneficio).

### 5.3 Los datos nuevos

**Recolector = `Person`, sin cuenta.** El repositorio prohíbe crear una segunda identidad para el mismo humano, y la mayoría de recolectores no usará la app. `Person` exige `givenName`, `familyName` y `displayName`, y el correo es opcional.

**`FincaRecolector`** — la lista de la finca: `personId`, `fincaLocationId` (un `site`), `desde`, `hasta` anulable. Una persona puede recolectar en dos fincas.

**`EntregaDeCosecha`** — lo que trae cada persona en una cosecha:

| campo | nota |
|---|---|
| `harvestEventId`, `personId` | a qué cosecha y quién |
| `cherryWeightKg` | lo que entregó |
| `horas` | **anulable**: si falta, se dice «sin dato» y **no se calcula eficiencia** para esa persona. Nunca cero |
| `muestraTamano` | cuántas cerezas se revisaron |
| conteos por clase | con el vocabulario de madurez que la cosecha **ya usa**, `cereza_color` —`verde`, `verde_amarillo`, `pinton`, `rojo`, `rojo_intenso`, `sobremaduro`—, más flotadores y materia extraña. Así la muestra del acopio habla el mismo idioma que la cosecha y que la selección |
| `provenanceClass`, `createdBy` | como el resto |

**Reglas que viven en la base, no sólo en TypeScript** (`CHECK` en la migración): kilos y horas no negativos; la suma de los conteos no pasa del tamaño de la muestra.

**Si las entregas no suman los kilos de la cosecha, se avisa y no se bloquea** —«faltan 12 kg por atribuir»—, la misma doctrina que el balance de masas: bloquear obligaría a mentir para poder seguir.

### 5.4 La selección vuelve a la finca

No hace falta modelo nuevo. Un lector que, para cada cosecha de una parcela, sigue `resultingLotId` hacia delante hasta sus selecciones, y suma **cuánto salió en cada corriente**. Es el camino que `getLotLineage` ya recorre **al revés**. Resultado: «Lote 3, cosecha del 12 de octubre: 71 % de primera; el resto, verde y pintón juntos, y flotadores». Las cifras del ejemplo son ilustrativas.

**Cuando un lote junta varias cosechas**, lo separado **no se reparte a ciegas** entre ellas: se dice que ese lote mezcla N cosechas y se enseña al nivel del lote. Repartirlo sería inventar un dato (ADR-080).

### 5.5 Permisos

Un permiso nuevo para ver los datos con nombre. Se concede a **Platform Admin, Farm Manager y Farm Operator** (decisión de Daniel: el capataz también), y **no** a Research, Partner, Sensory ni ningún otro perfil. **No existe hoy ningún recurso `harvest` en el catálogo** (medido), así que el nombre —`harvest:view_pickers` o colgado de `lot`— se decide en el plan contrastándolo con `lib/rbac/catalog.ts`.

**Registrar entregas exige `lot:manage`**, el mismo permiso que `recordHarvestEvent` en `lib/traceability/harvest.ts` ya comprueba para registrar la cosecha: quien puede registrar una cosecha puede registrar quién la trajo.

**Quien no lo tenga ve la eficiencia y la calidad agregadas por cuadrilla y parcela**, nunca por persona.

### 5.6 Lo que importa: café de primera

Daniel, 2026-09-18: lo que la selección separa *«se procesa y entra como otra calidad o uso; no se mide en el dashboard como café de especialidad de primera, que es lo que nos importa para el manejo prioritario y óptimo en la finca y en el beneficio»*.

Así que **cada indicador de la sección se calcula dos veces, y sólo uno es el protagonista**:

| indicador | de primera — **el que se enseña primero** | total, de todas las corrientes |
|---|---|---|
| rendimiento | **kg de primera por parcela**, y bajando hasta microparcela o planta cuando la cosecha lo declaró (§5.7) | kg de cereza por parcela; el kg/ha de hoy queda como dato secundario |
| calidad de una cosecha | % que la selección dejó en primera | kilos por corriente |
| recolector | kg que traería a primera, según su muestra (lo maduro sobre lo muestreado) | kg entregados |
| eficiencia | kg de primera por hora | kg por hora |

**Recoger verde o pintón es exactamente lo que baja la columna de primera**, y por eso es el indicador que el capataz y el Farm Manager necesitan para corregir la recolección. Y los flotadores dicen algo de la **finca** —broca, grano vano, sobremadura— más que del recolector.

**Qué corriente es «de primera» no se deduce del nombre.** Hoy la selección tiene una salida «aceptada» y otras corrientes con categoría; el plan decide si «primera» es exactamente la aceptada o si hace falta marcarla, y **en ningún caso se infiere de un nombre de lote**.

**El nombre `rechazo_categoria` es correcto y se queda.** La primera versión de esta sección proponía renombrarlo; Daniel aclaró que sí es un rechazo —de primera calidad— y que lo rechazado sigue su proceso como otra calidad u otro uso.

**Lo que sí falta en ese vocabulario: «pintón».** Está en `cereza_color`, el de la cosecha, y no en `rechazo_categoria`, el de la selección, aunque Daniel separa verdes y pintones —juntos o por separado—. Ampliarlo toca `docs/beneficio/`, que es normativo, y el beneficio lo trabaja otra sesión: se anota como decisión pendiente, con su palabra ya dicha.

### 5.7 Hasta dónde se puede bajar: parcela, microparcela, planta

Daniel, 2026-09-18: el rendimiento de primera *«por parcela, no por hectárea, y que se pueda medir hasta por microparcela o bloque o celda, siendo un plant specimen; no en cada cosecha, pero sí si se indica en la cosecha que fue específica de tal specimen, o de tal bloque, microparcela o parcela, y si es posible vincular al lote esta trazabilidad»*.

**Los niveles que ya existen — medido sobre `main`:**

| nivel | en el modelo | ¿una cosecha puede apuntar a él hoy? |
|---|---|---|
| parcela — y **bloque**: el comentario del esquema la presenta como la granularidad *«Farm/block»* | `Location` tipo `plot` | **sí**, `HarvestEventSource.locationId` |
| microparcela | `Location` tipo `micro_plot` | **sí**, el mismo campo |
| siembra (cohorte) | `PlantingCohort` | **sí**, `HarvestEventSource.plantingCohortId` |
| **celda: una planta** | `Specimen`, con `locationId`, `plantingCohortId`, `gridRow` y `gridPosition` | **no — es el único enlace que falta** |

**Lo que se añade: `specimenId` anulable en `HarvestEventSource`.** Con su regla **en la base**: la planta tiene que estar en la ubicación de esa misma fuente. Una cosecha de «la planta 14 de la fila 3» que dijera venir de otra parcela es un dato contradictorio, y se rechaza al guardar.

**La regla que no se rompe: se baja hasta donde la cosecha lo declaró, nunca se reparte hacia abajo.** Una cosecha anotada a nivel de parcela **no** se divide entre sus microparcelas ni entre sus plantas: la pantalla dice que esa parte no tiene más detalle. Repartirla sería inventar un dato (ADR-080). Por eso el rendimiento de una microparcela dice **cuánto de él viene declarado a ese nivel**, y no aparenta un total que no tiene.

**Y la trazabilidad llega al lote sin nada nuevo:** el lote ya hereda sus fuentes por `HarvestEvent.resultingLotId`, así que al declarar la planta en la cosecha, el lote puede decir de qué plantas vino. El informe del lote enseña **el origen más fino que se declaró**, no más.

**«Bloque» se toma como la parcela**, que es como el esquema presenta ese nivel (*«Farm/block granularity»*). Si Daniel usa «bloque» para un nivel **entre** la parcela y la microparcela, eso es un tipo de ubicación nuevo y una decisión aparte; no se crea sin preguntarlo.

## 6. Pruebas

- **Permisos, con control positivo:** el capataz ve nombres; un perfil de investigación ve la misma pantalla **sin** nombres, y el control es que sí ve los agregados.
- **Horas que faltan:** la persona aparece con «sin dato» y fuera de la media de eficiencia, no como cero.
- **La muestra:** conteos que suman más que la muestra se rechazan **en la base**, con una sonda que prueba que lo válido sí entra.
- **Entregas que no cuadran:** se avisa con la diferencia y el guardado no falla.
- **Selección de vuelta:** un lote de una cosecha atribuye sus corrientes a esa parcela y día; un lote de dos cosechas **no** reparte y lo dice.
- **Hasta dónde se baja:** una cosecha declarada por planta cuenta en la planta, su microparcela y su parcela; una declarada por parcela **no** aparece repartida en sus microparcelas ni plantas, y la pantalla lo dice. Una planta de otra ubicación se rechaza **en la base**, con sonda que prueba que la válida sí entra.
- **Primera frente a otras calidades:** una corriente de otra calidad cuenta en los kilos de la cosecha y **no** en los kilos de primera; el control es que la corriente de primera sí cuenta en los dos.
- **Flip-tests** con las tres cosas de la casa —sha antes y después, compila, qué prueba cae por su nombre—: tratar horas nulas como cero; conceder el permiso de ver nombres a Research; repartir las corrientes de un lote mezclado; **contar una corriente de otra calidad como primera**; **repartir hacia abajo una cosecha declarada por parcela**.
- `npm run build` en toda tarea que toque TypeScript; al final `npm run verify`, `bash scripts/ci.sh` y `npm test`.

## 7. Orden

1. **Menú «Finca» e índice** (§5.1). Independiente; se puede construir ya.
2. **Recolectores, entregas, el permiso y el ADR** (§5.3, §5.5, §3).
3. **Rendimiento, eficiencia y calidad**, con la selección de vuelta (§5.2 pantallas 4 y 5, §5.4). Incluye `specimenId` en las fuentes de cosecha, con su migración (§5.7).
4. **«Meliponarios» con entrada propia.** Toca la página de apiarios, que lleva otra sesión: se coordina antes de tocarla.
5. Fusiones y despliegues: **decisión de Daniel**.

## 8. Fuera de alcance

Pago a recolectores y precio por lata o kilo · la entrega sin conexión desde el acopio (decidido: con conexión; puede venir después sobre la cola sin conexión que ya existe) · reconstruir quién recolectó en cosechas pasadas · compras de cereza a terceros (`ReceivingEvent`) · un rol nuevo de Process Manager.
