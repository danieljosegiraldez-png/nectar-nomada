# La sección Finca: parcelas, cosecha, recolectores y lo que la selección le devuelve — diseño

**Fecha:** 2026-09-18 · **Camino:** arquitectónico · **Estado:** aprobado por partes en conversación, pendiente de revisión escrita · **Medido sobre:** `origin/main` = `0069d86`; **revisado el 2026-09-18** sobre `4bdc7da` con el muestreo y la auditoría de Codex (§4, §5.3, §5.4, §5.6, §5.7, §6)

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

Lleva **su propio ADR** —el número se toma al escribirlo, no ahora: mientras se escribía esta spec ya pasó de ADR-158 a ADR-159— que cite aquella decisión, la revierta con alcance acotado y deje dicho quién ve los datos.

**Y un aviso que no es asesoría legal:** en Panamá, lo que produce cada trabajador y sus errores, con su nombre, es **dato personal** bajo la Ley 81 de 2019. Por eso el acceso se decide aparte (§6), y conviene que los recolectores sepan que se registra.

## 4. Decisiones de Daniel (2026-09-18)

| pregunta | decisión |
|---|---|
| a qué nivel se mide la recolección | **por persona, con nombre** |
| quién ve los datos con nombre | **dueño, Farm Manager y también el capataz** |
| de dónde sale la calidad de cada persona | **al recibir, por persona** —kilos y una o más muestras—; **la selección del beneficio vuelve por parcela y día** |
| cómo se muestrea (2026-09-18) | *«en finca es común hacer muestreo: una o más muestras; se estudian las cerezas recolectadas estadísticamente y se registra para ver si hay un patrón, y luego se correlaciona con la selección posterior completa y vemos quién recolectó mejor»*. **Sólo al recibir la entrega.** De esas ~50 cerezas también se mide **Brix** y se exprime el jugo para medirlo con **hidrómetro**: *«medidas que pueden ser directamente relacionadas a un plant specimen, un bloque, microparcela y/o parcela entera»* |
| si una entrega mezcla orígenes | **una muestra por origen**; si no se puede separar, la muestra queda en el nivel común y **nunca se reparte hacia abajo** |
| cómo se compara a los recolectores | **lado a lado**: lo medido en sus muestras junto a la selección del lote, **sin convertir cerezas en kilos ni repartir la selección entre personas** |
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
| `provenanceClass`, `createdBy` | como el resto |

**`MuestraDeEntrega`** — una o más por entrega, de unas 50 cerezas. **Es su propia evidencia**, no un factor que se aplica a los kilos:

| campo | nota |
|---|---|
| `entregaId` | de qué entrega salió: dice **quién** recolectó |
| origen | **exactamente uno**: `locationId` (parcela, bloque o microparcela) **o** `specimenId` (una planta). Tiene que estar entre los orígenes de la cosecha de esa entrega |
| `tamano` | cuántas cerezas se revisaron |
| **eje color** | conteos con el vocabulario que la cosecha **ya usa**, `cereza_color` —`verde`, `verde_amarillo`, `pinton`, `rojo`, `rojo_intenso`, `sobremaduro`—. **Categorías excluyentes**: cada cereza cae en una |
| **eje flotadores** | su propio conteo. Una cereza roja puede flotar: por eso no comparte suma con el color |
| **eje materia extraña** | su propio conteo de piezas |
| `provenanceClass`, `createdBy` | como el resto |

**Las mediciones de la muestra** —**Brix** y la **densidad del jugo con hidrómetro**— van como filas de `Measurement`, la tabla que ya existe, con instrumento, unidad y la muestra como sujeto. `brix` ya es una `MeasurementVariable`; **la densidad no existe** y se añade, con su unidad, contrastando el nombre en `docs/beneficio/03_public_api.md`. Varias lecturas por muestra son válidas; se guardan todas, no un promedio.

**Reglas que viven en la base, no sólo en TypeScript** (`CHECK` en la migración): kilos y horas no negativos; **la suma del eje color no pasa del tamaño**; flotadores tampoco; exactamente uno de `locationId` o `specimenId`. Lo no clasificado queda visible como «sin clasificar», no se reparte.

**Por qué ejes y no una sola suma:** la primera versión sumaba madurez, flotadores y materia extraña contra un único límite, y una cereza madura que flota obligaba a elegir. La auditoría de Codex lo señaló el 2026-09-18.

**Si las entregas no suman los kilos de la cosecha, se avisa y no se bloquea** —«faltan 12 kg por atribuir»—, la misma doctrina que el balance de masas: bloquear obligaría a mentir para poder seguir.

### 5.4 La selección vuelve a la finca

No hace falta modelo nuevo. Un lector que, para cada cosecha de una parcela, sigue `resultingLotId` hacia delante hasta sus selecciones, y suma **cuánto salió en cada corriente**. Es el camino que `getLotLineage` ya recorre **al revés**. Resultado: «Lote 3, cosecha del 12 de octubre: 71 % de primera; el resto, verde y pintón juntos, y flotadores». Las cifras del ejemplo son ilustrativas.

**Cuando un lote junta varias cosechas**, lo separado **no se reparte a ciegas** entre ellas: se dice que ese lote mezcla N cosechas y se enseña al nivel del lote. Repartirlo sería inventar un dato (ADR-080).

**Y lo mismo dentro de una sola cosecha.** Una cosecha puede tener varias fuentes —dos parcelas, dos cohortes, varias plantas—, así que «un lote de una cosecha» **no basta** para atribuir la selección a un origen: hace falta que la cosecha tenga **un único origen al nivel que se pide**. Si no, la selección se enseña en el nivel común. Pesar lo que aportó cada fuente tampoco lo resuelve: los kilos de entrada no dicen qué parte de la primera salió de cada una.

**La selección se recorre sin contar dos veces:** se toma la **primera selección** del lote que nace de la cosecha, con sus kilos evaluados; una selección parcial dice cuánto quedó sin seleccionar, y una cosecha sin selección dice «sin selección», no cero.

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
| recolector | **lado a lado, sin convertir**: lo medido en sus muestras —% por color, flotadores, Brix y densidad, con cuántas muestras y cuántas cerezas— junto a la **selección del lote** en que entró su cereza, **marcada como del lote** | kg entregados |
| eficiencia | kg por hora, con sus muestras al lado | kg por hora |

**Se quitó «kg que traería a primera» y «kg de primera por hora» por recolector** (2026-09-18). Aplicaban una proporción contada en **cerezas** a **kilos**, sin pesos por clase que lo justifiquen, y podían perjudicar injustamente a una persona. La comparación se hace poniendo las evidencias juntas; **la conclusión la saca quien mira**, y la pantalla no la afirma por él.

**Recoger verde o pintón es lo que baja la columna de primera**, y por eso la muestra es lo que el capataz y el Farm Manager necesitan para corregir la recolección. Los flotadores **pueden** decir algo de la finca —broca, grano vano, sobremadura— más que del recolector, pero la muestra registra **lo observado, no la causa**: la pantalla no atribuye un flotador a nadie.

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

**Lo que se añade: `specimenId` anulable en `HarvestEventSource`.** Con sus reglas **en la base**: la planta tiene que estar en la ubicación de esa misma fuente, y **si la fuente declara cohorte, la planta es de esa cohorte**. Una cosecha de «la planta 14 de la fila 3» que dijera venir de otra parcela es un dato contradictorio, y se rechaza al guardar.

**Y la unicidad cambia.** Hoy es `(harvestEventId, locationId, plantingCohortId)`: dos plantas de la misma cohorte en una cosecha chocarían. Pasa a incluir `specimenId`, con el cuidado de que en Postgres los `NULL` no chocan entre sí en un índice único — el plan decide cómo, con una sonda que pruebe que dos fuentes sin planta **siguen** chocando. Los lectores de fuentes —el informe del lote (`lib/traceability/reports.ts`) hoy no las carga— se actualizan en el mismo paso.

**Las muestras bajan más fácil que la cosecha.** Una `MuestraDeEntrega` declara su propio origen (§5.3), así que su Brix, su densidad y sus conteos se leen **directamente** en la planta, el bloque, la microparcela o la parcela, sin pasar por la cosecha ni repartir nada. Por origen se enseñan agregadas y **siempre con su número de muestras**.

**La regla que no se rompe: se baja hasta donde la cosecha lo declaró, nunca se reparte hacia abajo.** Una cosecha anotada a nivel de parcela **no** se divide entre sus microparcelas ni entre sus plantas: la pantalla dice que esa parte no tiene más detalle. Repartirla sería inventar un dato (ADR-080). Por eso el rendimiento de una microparcela dice **cuánto de él viene declarado a ese nivel**, y no aparenta un total que no tiene.

**Y la trazabilidad llega al lote sin nada nuevo:** el lote ya hereda sus fuentes por `HarvestEvent.resultingLotId`, así que al declarar la planta en la cosecha, el lote puede decir de qué plantas vino. El informe del lote enseña **el origen más fino que se declaró**, no más.

**«Bloque» se toma como la parcela**, que es como el esquema presenta ese nivel (*«Farm/block granularity»*). Si Daniel usa «bloque» para un nivel **entre** la parcela y la microparcela, eso es un tipo de ubicación nuevo y una decisión aparte; no se crea sin preguntarlo.

## 6. Pruebas

- **Permisos, con control positivo:** el capataz ve nombres; un perfil de investigación ve la misma pantalla **sin** nombres, y el control es que sí ve los agregados.
- **Horas que faltan:** la persona aparece con «sin dato» y fuera de la media de eficiencia, no como cero.
- **La muestra:** el eje color que suma más que el tamaño se rechaza **en la base**; una cereza roja y flotadora se registra en los dos ejes sin chocar; una muestra con `locationId` y `specimenId` a la vez, o sin ninguno, se rechaza; cada una con su sonda que prueba que lo válido sí entra.
- **Origen de la muestra:** una muestra de una planta que no está entre los orígenes de su cosecha se rechaza; dos muestras de orígenes distintos de una misma entrega cuentan cada una en el suyo y **ninguna** aparece repartida hacia abajo.
- **Mediciones:** Brix y densidad se guardan como `Measurement` con su unidad; tres lecturas de una muestra se guardan las tres.
- **Comparación sin conversión:** la pantalla del recolector no contiene ningún «kg de primera» por persona; el control es que la selección del lote sí aparece, marcada como del lote.
- **Una cosecha con dos parcelas** no atribuye su selección a ninguna de las dos por separado; la de una sola parcela sí.
- **Entregas que no cuadran:** se avisa con la diferencia y el guardado no falla.
- **Selección de vuelta:** un lote de una cosecha atribuye sus corrientes a esa parcela y día; un lote de dos cosechas **no** reparte y lo dice.
- **Hasta dónde se baja:** una cosecha declarada por planta cuenta en la planta, su microparcela y su parcela; una declarada por parcela **no** aparece repartida en sus microparcelas ni plantas, y la pantalla lo dice. Una planta de otra ubicación se rechaza **en la base**, con sonda que prueba que la válida sí entra.
- **Primera frente a otras calidades:** una corriente de otra calidad cuenta en los kilos de la cosecha y **no** en los kilos de primera; el control es que la corriente de primera sí cuenta en los dos.
- **Flip-tests** con las tres cosas de la casa —sha antes y después, compila, qué prueba cae por su nombre—: tratar horas nulas como cero; conceder el permiso de ver nombres a Research; repartir las corrientes de un lote mezclado; **atribuir la selección de una cosecha de dos parcelas a una de ellas**; **sumar flotadores al eje color**; **contar una corriente de otra calidad como primera**; **repartir hacia abajo una cosecha declarada por parcela**.
- `npm run build` en toda tarea que toque TypeScript; al final `npm run verify`, `bash scripts/ci.sh` y `npm test`.

## 7. Orden

1. **Menú «Finca» e índice** (§5.1). Independiente; se puede construir ya.
2. **Recolectores, entregas, el permiso y el ADR** (§5.3, §5.5, §3).
3. **Rendimiento, eficiencia y calidad**, con la selección de vuelta (§5.2 pantallas 4 y 5, §5.4). Incluye `specimenId` en las fuentes de cosecha, con su migración (§5.7).
4. **«Meliponarios» con entrada propia.** Toca la página de apiarios, que lleva otra sesión: se coordina antes de tocarla.
5. Fusiones y despliegues: **decisión de Daniel**.

## 8. Fuera de alcance

Pago a recolectores y precio por lata o kilo · la entrega sin conexión desde el acopio (decidido: con conexión; puede venir después sobre la cola sin conexión que ya existe) · reconstruir quién recolectó en cosechas pasadas · compras de cereza a terceros (`ReceivingEvent`) · un rol nuevo de Process Manager.
