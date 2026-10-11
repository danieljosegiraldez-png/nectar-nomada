# Parte 2a — La receta con pasos

**Fecha:** 2026-10-02 · **Estado:** **PR-A construido (rama `recetas-parte-2a`); el PR-B, la receta en la operación, viene después**; diseño aprobado por Daniel en conversación, sección por sección;
**corregido tras dos revisiones adversarias** (Codex y un revisor Claude, §11); pendiente de su
lectura del spec escrito. **Base:** escrito sobre `origin/main` `85eab6da`; **vuelto a medir el
2026-10-03 sobre la Parte 1 ya construida** (§12), con tres decisiones nuevas de Daniel; **el 2026-10-04,
la escala del mucílago (lo que QUEDA) y la autoría por el Coffee Process Manager** (§12). Depende de la Parte 1,
que vive en la rama `recetas-base` (sin fusionar al escribir esto), y de su diseño general, en la
misma rama:

- `docs/superpowers/specs/2026-09-30-recetas-del-beneficio-design.md` (general, §5 «Parte 2»)
- `docs/superpowers/specs/2026-09-30-parte-1-el-proceso-cubre-al-lote-design.md` (R1–R9)

**Fuente del modelo de pasos:** el paquete «farm-to-green v2» de Daniel (2026-10-02),
`06_PROCESSING_TAXONOMY.md` y `processing_axes.json` (ejes A–K, 23 tipos de paso). Daniel decidió
ese día que es la base de la Parte 2.

Criterio que manda, de Daniel: **«poder medir para poder reusar recetas y reproducir, replicar, ser
consistente con los resultados»**, con un sistema de recetas **funcional, inteligente y trazable**.

---

## 0. Por qué la Parte 2 se partió en dos — decisión de Daniel

Con lo decidido el 2026-10-02, la Parte 2 juntaba el modelo de pasos, la pantalla, la receta libre,
la ventana de la prefermentación, el aviso de humedad, los dos reposos y los motores. Se parte:

- **2a — este documento.** La receta como lista ordenada de pasos, su pantalla, su vocabulario, la
  receta libre, la receta obligatoria, y cómo cada registro del lote se une a su paso.
- **2b — después, encima de la 2a.** Lo que la receta vigila en el lote: ventana de la
  prefermentación y su aviso, humedad que sube sin intención declarada, los dos reposos (muestra y
  venta, con la venta bloqueada), que los motores juzguen por la receta (ADR-181) y que **el grado se
  ate a la receta** (lo promete el general, §5).

**La receta obligatoria entra aquí, en la 2a** (decisión de Daniel, 2026-10-02, a pregunta de la
coordinadora): la Parte 1 sale como está aprobada, con la receta opcional, y la exigencia llega junto
con la receta libre, que necesita los pasos para armar su borrador. Ver §5.

El desenlace de secado «salida a tratamiento» (`DryingOutcome`) **no es de la Parte 2**: va a la
Parte 1 por la coordinadora. **La 2a no depende de él para unir registros a pasos**: la corrida
sigue unida a su paso se termine como se termine. (Corregido el 2026-10-03: este párrafo decía que
hoy un secado cortado se termina con `abandoned` o `interrupted`; el servicio lo admite, pero
**ninguna pantalla escribe el desenlace**.) Lo que ese desenlace arregla es que la etiqueta diga la verdad. Nota: el diseño de
la Parte 1 (R7) dice que salir de secado a un tratamiento «no necesita ninguna acción nueva»; la
decisión de Daniel del 2026-10-02 lo corrige, y ese texto lo actualiza la coordinadora.

**Lo que compara lo real con lo declarado** (D2) **es de la Parte 5**: la 2a guarda los dos lados.

**2c — equipos y condiciones, después de la 2a** (decisiones de Daniel, 2026-10-02, pregunta por
pregunta). Una receta no se puede aplicar si el beneficio no tiene con qué:

| # | Decisión |
|---|---|
| E1 | Si **no existe** ningún equipo o instalación capaz de un paso, **no se abre el proceso**. Si existe pero está **ocupado o en reparación**, se abre con **aviso de esperar**, porque puede liberarse antes de llegar a ese paso. |
| E2 | El paso declara **capacidades**, no un equipo concreto («recipiente sellable con válvula», «control de temperatura»). Sirve cualquier equipo que las tenga, y las plantillas comunes funcionan en cualquier beneficio. |
| E3 | Al abrir, el sistema **ofrece los equipos disponibles con lo que les cabe**. Si el lote no entra completo, se asigna lo que quepa y **el resto se divide en otro lote** (R6: un proceso por parte), que se procesa donde se pueda. |
| E4 | El equipo guarda **litros útiles** (dato físico) y **kg máximos** (los define el beneficio); el lote se compara en kg, y los litros sirven después para el espacio libre del anaeróbico. Hoy `Equipment` no guarda ninguna capacidad. |
| E5 | Las condiciones que no son un equipo —cuarto oscuro, cámara fría, secador techado, agua— son **capacidades de la instalación**, con la misma regla de E1. |

La 2c lleva su propio diseño: capacidades de equipos e instalaciones, litros y kg, la comprobación al
abrir, la elección de equipo y la **pantalla de dividir** el sobrante (hoy dividir sólo existe por
servicio). **Lo único que la 2a deja para ella** es el campo `capacidadesRequeridas` en el paso
(§3), que la 2a guarda y no comprueba.

---

## 1. Lo que hay hoy, medido en `85eab6da`

- `ProcessRecipeVersion` tiene **fases** (`ProcessRecipePhase`: `fermentation` | `drying`, con horas,
  volteo y banda de humedad), **únicas por versión y fase** (`schema.prisma:4372`), y **metas**
  (`ProcessTarget`: variable, momento `initial|during|final`, rango, unidad, `phase` y **`everyHours`**,
  únicas por `[recipeVersionId, phase, variable, moment]`, `schema.prisma:4416` y `:4436`).
  **No tiene pasos.**
- **Toda versión nace `approved`** (`lib/traceability/processTargets.ts:406–411`, `:658`); no hay
  borrador ni función de edición. `abrirProceso` sólo rechaza una receta archivada
  (`lotProcess.ts:159–166`).
- `FermentationRun` lleva `processRecipeVersionId` y `lotProcessId`; no dice qué paso cumple.
- **Empezar y terminar una corrida crea `stage_change`** (`fermentation.ts:87,177`;
  `drying.ts:72,287`; también los tuestes). Ningún camino registra el despulpado o el lavado como
  transformación.
- **`LotProcessIntervention`** (`schema.prisma:4238`) registra, con `registrarIntervencion`
  (`lotProcess.ts:324`), «un manejo que no es una fermentación ni un secado: flotado, despulpado,
  reposo, mover a sombra», con un valor de los `CATALOGOS_DE_INTERVENCION`. `FermentationIntervention`
  registra lo que pasa dentro de una fermentación, con tipos que incluyen `inoculation` y `addition`.
- **Los catálogos de los ejes ya existen** en `lib/research/catalogs.ts`: `condicion_oxigeno`,
  `manejo_temperatura` (con `cold_hold_prefermentativo`), `fuente_microbiana`, `sustrato_anadido`
  (con `doble_mosto`), `estado_cereza`, `medio_lavado` (con `mosto_de_otro_lote`), `recipiente`. Un
  comentario de `lotProcess.ts` recuerda por qué no se crean paralelos: Daniel, 2026-09-07, «la lista
  ya está de antes».
- `VariableCatalogValueDef` (`catalogs.ts:20–36`) sólo tiene `value`, `definition`, `aliasOf`,
  `displayOrder` e `impliesUnknownIdentity`.

---

## 2. Decisiones de Daniel, 2026-10-02

| # | Pregunta | Decisión |
|---|---|---|
| D1 | Tipos de paso | **Los 23 del paquete + `prefermentacion`**, en catálogo |
| D2 | Cómo termina un paso | **Por tiempo y/o por medición**, con «la que ocurra primero» o «las dos»; el operario lo cierra y el sistema compara lo real con lo declarado |
| D3 | Receta libre al cerrar | **Se ofrece guardarla como receta** (borrador que Daniel nombra y publica); el lote queda unido a ella |
| D4 | Enfoque | **El registro apunta al paso** (no una tabla de «paso ejecutado», no JSON) |
| D5 | Paso fuera de la receta | **Desviación con motivo obligatorio, sin bloquear** |
| D6 | Regla 8 del paquete («sólo bloquear por seguridad y ley») | **Mandan las reglas de la casa**: la regla 8 vale para umbrales de referencia |
| D7 | Cuándo entra la receta obligatoria | **En la 2a**, con la receta libre |

---

## 3. El paso de la receta

Tabla nueva `ProcessRecipeStep`, hija de `ProcessRecipeVersion`:

| Grupo | Campos |
|---|---|
| Identidad | `seq` (único por versión), `stepType` (catálogo nuevo `tipo_paso`), `intencion` (texto corto), `opcional` |
| Ejes — **vocabulario existente** | A `estadoFruto` → `estado_cereza`, y `mucilagoObjetivo` (lo que **QUEDA**, en tramos 0 / 10 / 25 / 50 / 75 / 100; Lavado = 0, Honey = 100 — decisión de Daniel del 2026-10-03, que corrige ADR-181 #12; el mismo campo que la 2b §8.2); B `oxigeno` → `condicion_oxigeno`; C `temperatura` → `manejo_temperatura`, y `temperaturaMinC`/`MaxC`; D `fuenteMicrobiana` → `fuente_microbiana`; medio → `medio_lavado`; G `modoSecado` → el enum **`DryingEnvironment`** que ya usan las instalaciones (corregido el 2026-10-03: no es un catálogo nuevo) |
| Ejes — catálogo nuevo | F `fisico`, **sólo** con lo que no existe en otro sitio: ninguno, agitación, presión, ultrasonido, ozono/UV. El frío va por `manejo_temperatura`; congelar y las inmersiones son tipos de paso |
| Adiciones (E) | filas hijas con la **categoría** (`sustrato_anadido`; en una inoculación, la cepa de `levadura_cultivo`), cantidad, unidad y `momento: pre_green | post_green`. **El material concreto se anota al ejecutar**, como consumo de la corrida (`MaterialConsumptionEntry`, que ya existe): un material es de una organización y una plantilla sirve en cualquiera (decisión de Daniel, 2026-10-03) |
| Requisitos (para la 2c) | `capacidadesRequeridas`: lista de valores del catálogo nuevo `capacidad` (sellable, válvula, control de temperatura, oscuridad…). La 2a lo guarda; la comprobación es de la 2c. **El paso no nombra ningún equipo ni recipiente** (decisión de Daniel, 2026-10-03): el catálogo `recipiente` son equipos concretos (Tanque I, Cooler I…), y el equipo se elige al ejecutar, como hoy |
| Valores por defecto | `horasMin`, `horasSugeridas`, `horasMax`; sólo secado: `volteoCadaHoras`, `humedadMinPct`, `humedadMaxPct` |
| Fin (D2) | `finPorTiempo` (sí/no: el paso termina al cumplir `horasSugeridas` desde su inicio) + filas de fin: variable, operador, valor, unidad; `reglaDeFin: first | all`. Con tiempo y varias filas, «primero» = la primera condición que se cumple; «todas» = todas, incluido el tiempo |
| Plan de medición | **`ProcessTarget` reutilizado** con su `everyHours`, más `recipeStepId` (§3.2) |

### 3.1 Qué lee cada consumidor, con pasos

`ProcessRecipePhase` es única por versión y fase, así que **no puede representar dos secados
distintos** ni prefermentación + fermentación con parámetros propios. Por eso:

- **Una corrida con `recipeStepId` lee sus valores (horas, volteo, banda) de su paso.** La cola de
  secado (`colaDeSecado.ts:263–275`) y el tablero (`datosDelTablero.ts:274–282, 351, 451`) cambian
  para mirar primero el paso de la corrida.
- **Las fases quedan como compatibilidad** para corridas sin paso (históricas y procesos viejos sin
  receta). Una versión con pasos escribe al publicarse **una** fase por tipo, con los valores del
  **primer** paso de esa fase en `seq` — sólo para esos lectores antiguos —.
  **`ProcessRecipeVersion.expectedHours` no se calcula a partir de los pasos** (corregido al construir): al
  publicar nadie lo escribe y nadie lo lee; las copias (versión nueva y derivar) sólo arrastran el valor de la versión de
  origen. El registro de decisiones del plan lo dejó fuera por YAGNI. Este texto pedía la suma de `horasSugeridas`
  de los pasos no opcionales.
- La copia de R8 deja de copiar fases cuando la versión tiene pasos: las fases se derivan, los pasos
  mandan.

### 3.2 Las metas por paso

- `ProcessTarget` gana `recipeStepId` (nulo = meta de la versión, como hoy).
- **Unicidad:** dos índices parciales — `[recipeVersionId, phase, variable, moment]` donde
  `recipeStepId IS NULL` (lo de hoy) y `[recipeStepId, variable, moment]` donde no es nulo. Así la
  fiebre y la fermentación pueden pedir las dos pH inicial, y dos secados su humedad final.
- Una meta con paso toma `phase` del tipo de paso cuando el tipo tiene fase (fermentativos →
  `fermentation`, `drying` → `drying`) y **nulo** si no la tiene (lavado, despulpado…).
  `validateTargets` deja de exigir `phase` cuando hay `recipeStepId`.
- El paso tiene que ser de la misma versión que la meta (`paso_de_otra_version`).
- **Los lectores que filtran metas de la versión por fase** (`datosDelTablero.ts`, `colaDeSecado.ts`)
  filtran `recipeStepId IS NULL`, y las metas de la corrida salen de su paso.

### 3.3 Versiones: borrador y publicada

- **Estado real de borrador.** Una versión nace `draft` y sólo un borrador se edita (pasos,
  adiciones, fines, metas). **Publicar** la pasa a `approved` y desde ahí es inmutable. Cambiar una
  publicada crea la siguiente versión en borrador, copiando pasos, adiciones, fines y metas, **con las
  referencias remapeadas a los pasos nuevos** (extiende R8).
- `abrirProceso`, el selector de recetas y los lectores **exigen `approved`**.
- **Concurrencia:** editar, publicar y abrir un proceso con esa versión bloquean la fila de la versión
  (`SELECT … FOR UPDATE`) dentro de su transacción.
- Las versiones `approved` de hoy siguen siendo publicadas; ninguna se reabre.

### 3.4 Plantillas

Las recetas con `organizationId` nulo son de todas las organizaciones y ninguna las edita. Una
organización **deriva** una copia propia: receta nueva con `derivadaDeVersionId`.

### 3.5 Qué ejes aplican a cada tipo, y la referencia del paquete

`VariableCatalogValueDef` no tiene dónde guardarlo, así que vive **en código**, junto a los
catálogos: una constante `EJES_POR_TIPO_DE_PASO` (tipo → ejes que aplican) que usan la pantalla y la
validación del servicio, y un archivo de datos con las **referencias** del paquete que la pantalla
muestra (valor, fuente, confianza), copiadas de `04_reference_parameters.json` con su procedencia.
Ninguna de las dos escribe en la base.

---

## 4. Cómo se une el lote a su paso

### 4.1 Qué registro cumple qué paso

| Registro | Tipos de paso que puede cumplir |
|---|---|
| `FermentationRun` | `fermentation`, `prefermentacion`, `cold_hold`, `soaking`, `immersion_hot`, `immersion_cold` |
| `DryingRun` | `drying` |
| `LotProcessIntervention` | `pulping`, `demucilage`, `washing`, `sorting_flotation`, `sanitation`, `inoculation`, `addition` |
| `FermentationIntervention` de tipo `inoculation` o `addition` | `inoculation`, `addition` (los que ocurren dentro de una fermentación) |

**Las cuatro tablas ganan** `stepType` (anulable), `recipeStepId` (anulable) y `motivoDesviacion`
(anulable). **Los `stage_change` no se tocan**: los crea la corrida al empezar y terminar, y el paso
lo cumple la corrida, no su transformación técnica.

**El acto es el tipo de paso** (decisión de Daniel, 2026-10-03). Hoy el despulpado y el lavado no se
pueden registrar: `LotProcessIntervention` exige un valor de catálogo, y sus catálogos son ejes
(oxígeno, medio, cereza flotada…), no actos. Con `stepType`, el valor de catálogo pasa a ser
**opcional** y sigue diciendo el «cómo» (con qué medio se lavó). No nace ninguna lista paralela de
actos: era el `intervencion_de_proceso` que Daniel descartó el 2026-09-07.

### 4.2 Guardián de coherencia — bloquea

Con `recipeStepId`:
- el paso es de la versión del **proceso vigente** (R1), si no `paso_de_otra_receta`;
- el tipo del paso está en la fila del registro (4.1), si no `paso_no_corresponde`;
- y **el `stepType` del registro se toma del paso**: no se puede declarar otro. Una fermentación con
  `stepType=fermentation` no puede cumplir un paso `prefermentacion`.

Es trazabilidad, no un umbral (D6).

### 4.3 El avance se calcula sobre la cadena

Lo pendiente no se calcula sobre el proceso vigente solo: tras una división (R6) o una devolución a
secado (R7) cada parte o continuación es un proceso nuevo, con la misma versión, cuya historia viene
por la `cadena` de R1. **Lo ejecutado = los registros de todos los procesos de la cadena que
comparten la versión del vigente**, en orden de inicio. Un proceso anterior de **otra** receta corta
la cadena.

El formulario propone el siguiente paso pendiente según esa historia, y deja elegir otro: saltar un
opcional, o repetir uno (el multiproceso secado → tratamiento → secado; si la receta declara el
recorrido, cada registro se une a su paso).

### 4.4 Desviación (D5)

Una desviación es un registro **sin `recipeStepId`** de uno de los cuatro tipos de 4.1, bajo un
proceso **abierto** cuya receta **tiene pasos** (también una Libre, que desde el 2026-10-03 los planea al abrir). Exige `motivoDesviacion`
(`desviacion_sin_motivo`), queda marcado, y no bloquea. La Parte 5 separa esos lotes al comparar.

**No son desviación:** un registro con paso; cualquier registro bajo una receta sin
pasos o bajo un proceso viejo sin receta; la trilla y los tuestes, que ocurren con el proceso cerrado
y ninguna receta declara.

### 4.5 Recepción y clasificación

Ocurren antes de abrir el proceso, que se abre sobre el lote aceptado. No se unen por paso: al leer
la ficha del lote o la del proceso, el servicio busca en la ascendencia del lote **todas** sus recepciones
(`LoteDesdeRecepcion`, puede haber varias) y las compara **una por una** con el paso `reception` de la
receta, si lo declara (por ejemplo Brix 18–24). Una recepción fuera de rango → aviso con esa
recepción nombrada; **ninguna recepción en la ascendencia** → aviso propio. Avisa, no bloquea.

El aviso **no se guarda**: se calcula al leer, desde la recepción y la versión, que sí están
guardadas, así que cualquiera lo reproduce. El veredicto fijo 18–24 de `brixDeRecepcion.ts` sigue
siendo el de la recepción; el de la receta es el del proceso.

### 4.6 Lo que no tiene registro

`freezing`, `aging`, `monsooning`, `barrel_aging`, `decaf`, `hulling_wet` y `milling` existen en el
catálogo y se pueden escribir en una receta, pero ningún registro los cumple todavía. `reception` se
compara como en 4.5. `reposo` y `storage` los lee la 2b desde la asignación de bodega. Lo posterior
al verde queda fuera.

---

## 5. La receta obligatoria y la receta libre (D3, D7)

### 5.1 La receta obligatoria

- **`abrirProceso` exige receta** y rechaza sin `recipeVersionId` con `sin_receta`. La comprobación
  vive en `abrirProceso` (lo que abre un proceso a pedido de alguien), **no** en los núcleos de
  división (R6) ni de devolución (R7), que copian el proceso vigente tal cual: así un proceso viejo
  sin receta se puede dividir y devolver.
- **Transición (R9):** los procesos sin receta que ya existen **no se convierten en «Libre»** ni se
  rellenan. Siguen abiertos y se cierran como hoy; sus registros nuevos llevan `stepType` sin paso y
  no son desviación. El reimport los rehace.
- Las columnas nuevas de 4.1 son anulables: lo histórico queda nulo y no se deduce.

### 5.2 La receta libre — se define antes de ejecutarla

**Corregido el 2026-10-03 por Daniel.** La primera versión dejaba escribir los pasos sobre la marcha.
Daniel: «puedo escoger un proceso o inventar un proceso, pero debo mantenerlo dentro de su receta;
**no se improvisa constante: se define y se ejecuta**», y «libre pero es igual un wash» no vale.

- **Abrir con «Libre» es escribir una receta pequeña en ese momento.** El formulario exige:
  1. **la intención**, escrita (qué se busca probar);
  2. **los pasos planeados**, en orden, aunque sea a grandes rasgos (tipo de paso y lo esencial de
     sus ejes);
  3. **el grado** que se declara, como hoy (`grado_proceso`). Sus umbrales y tiempos de reposo salen
     del perfil de ese grado (2b §7).
- Con eso se crea una versión **publicada** de una receta marcada `esLibre`, propia de la
  organización y de ese proceso (`nombre`: «Libre — <intención>»). Desde ahí todo funciona como con
  cualquier receta: los registros se unen a sus pasos, y lo que se salga es **desviación** (4.4).
- **Control de parecido.** Antes de crearla, el servicio compara la secuencia planeada (tipos de paso
  y ejes esenciales) con las recetas publicadas que la organización puede usar. Si coincide con una,
  lo dice («estos pasos son la receta Lavado») y hay que **usar esa receta** o escribir **por qué**
  es distinta (`motivoDeLibre`, obligatorio en ese caso). La comparación y su resultado se guardan.
- **No exige el permiso de autoría de recetas**: quien puede abrir procesos (`lot:manage`; 2b V13) puede abrir una Libre. Una receta propia
  llamada «Libre» no choca, porque la marca es la columna, no el nombre.

### 5.3 Convertirla en receta

- Al cerrar por humedad, se **ofrece** convertir la Libre en receta de la organización: copia su
  versión, ya con lo planeado, y deja editar en borrador lo que la ejecución enseñó (horas reales,
  lecturas de cierre marcadas) antes de publicar.
- **Fin de cada paso:** al terminar una corrida o registrar una intervención, el operario puede
  **marcar las lecturas que motivaron el cierre** (`lecturasDeCierre`, opcional). El borrador sólo
  propone como fin esas lecturas, y nunca deduce un umbral de una lectura que nadie marcó.
- El proceso conserva su Libre (es lo que ocurrió) y gana `origenDeRecetaVersionId`, que cuenta como
  uso de la receta nueva. La Parte 5 lo agrupa con sus lotes, marcado como origen.

---

## 6. La pantalla

- La receta se ve como **lista de pasos en orden**: añadir, quitar, mover, marcar opcional. Sólo en
  borrador.
- Cada paso se abre en un formulario corto: primero el tipo, y sólo aparecen los ejes que le aplican
  (`EJES_POR_TIPO_DE_PASO`).
- Junto a cada valor por defecto, **la referencia del paquete** con fuente y confianza (por ejemplo
  «volteo ≥ 3–4 al día · Cenicafé · alta»). Informativa: la receta decide. Los valores `low` y `NN`
  se marcan visiblemente.
- «Publicar» fija la versión. No existía ninguna «pantalla de fases» que sustituir (ninguna pantalla
  escribe fases): lo que esta pantalla sustituye es la de metas de versión, y sus dos formularios
  (`RecipeForm` y `RecipeVersionForm`) se retiran.
- Al terminar una corrida o registrar una intervención, la casilla para marcar las lecturas de
  cierre (§5.3).
- Textos en es y en.

---

## 7. El vocabulario

**Se amplían los catálogos que ya existen; no se crean paralelos.**

- **Nuevos, porque no existe nada parecido:** `tipo_paso` (los 23 + `prefermentacion`), `fisico`
  (sólo lo que no está en otro sitio, §3) y `capacidad` (para la 2c). **`modo_secado` no:** ya
  existe como el enum `DryingEnvironment` (corregido el 2026-10-03).
- **Valores nuevos en catálogos existentes:**
  - `fuente_microbiana`: bioprotección (medida ausente). «Atomizado» **no** entra: es un método de
    inoculación (`metodo_inoculacion`, `docs/arquitectura/cryobloom-contra-el-esquema.md:72`), no una
    fuente (medido en el plan, 2026-10-04). «Mosto propio» ya
    es `mosto_propio` de `medio_lavado`, y «mosto de otro fermento» es `mosto_de_otro_lote` del mismo
    catálogo: **un alias no cruza catálogos** (la semilla y el servicio lo rechazan), así que esos
    sinónimos van al archivo de referencias del paquete, sólo para mostrar.
  - `estado_cereza`: los estados del eje A que falten (en mucílago, lavado…). El formulario de abrir
    proceso los ofrecerá también: son estados válidos al abrir.
  - `recipiente` **no gana valores** (decisión de Daniel, 2026-10-03): son equipos concretos, y el
    paso declara capacidades (§3).
  - El catálogo de intervenciones **no gana actos**: el acto es el tipo de paso (§4.1).
- **Sinónimos del paquete como alias** (`aliasOf`), **sólo dentro del mismo catálogo**: mosto =
  mossto = lixiviado = «previous-batch starter» → `doble_mosto` en `sustrato_anadido`.
- **Definiciones de la casa** en `definition`:
  - **Lavado:** a la cama de secado sin nada de mucílago; si llega con mucílago es semi-lavado.
  - **Honey:** 100 % del mucílago retenido; con menos, semi-lavado.
  - **Fiebre:** cereza entera en sus sacos de cosecha sin sellar, se calienta; prefermentativo por
    intención.
  - **Láctico, málico, acético:** el nombre del método se usa libremente en la receta (Daniel,
    2026-10-06: «fermentación láctica» ya existe como método); pero afirmar ante un comprador que
    el café «es láctico» exige un dato medido o se publica como perfil buscado. La frase «resultados,
    no métodos» venía del paquete, no de Daniel, y se matiza así. Málica y acética no existen como
    proceso en el código.

Antes de añadir cualquier valor, el plan mide la base: qué catálogos y valores existen ese día.

---

## 8. Pruebas — cada guardián con su flip-test

Cada prueba lleva su **control válido** al lado, para que no pase vacía.

| Guardián | Prueba (con control) | Flip-test |
|---|---|---|
| 4.2 paso de otra receta | rechaza `paso_de_otra_receta`; el mismo registro con un paso de su versión pasa | quitar la comprobación → cae |
| 4.2 tipo que no corresponde | una `DryingRun` con un paso `washing` **de la misma versión** se rechaza `paso_no_corresponde` (así no la tapa la regla anterior); con un paso `drying` pasa | idem |
| 4.2 tipo igual al del paso | una `FermentationRun` declarando `fermentation` sobre un paso `prefermentacion` acaba con `prefermentacion` o se rechaza | quitar la igualdad → cae |
| 4.4 desviación | sin paso y sin motivo bajo receta con pasos → rechazo; con motivo pasa marcada; **bajo receta sin pasos y en una trilla → no exige motivo** | «exigir motivo siempre» → caen los negativos |
| §3.1 dos secados | una versión con dos pasos `drying` de volteo distinto: cada corrida lee el suyo en la cola | leer de la fase → cae |
| §3.2 metas por paso | pH inicial en `prefermentacion` y en `fermentation` de la misma versión se guardan las dos; repetirla en el mismo paso se rechaza | quitar `recipeStepId` de la unicidad → cae |
| §3.3 borrador | editar una versión `approved` se rechaza; un borrador sí; abrir proceso con un borrador se rechaza | idem |
| §3.3 copia | una v1 con **las cuatro colecciones no vacías** → la v2 trae ids nuevos, y **cada `recipeStepId` de sus metas apunta a un paso de la v2**, no de la v1 | no remapear → cae |
| 4.3 cadena | tras dividir un proceso con dos pasos hechos, la parte propone el tercero | calcular sólo sobre el vigente → propone el primero |
| §5.1 receta obligatoria | abrir sin receta → `sin_receta`; con «Libre» pasa; dividir un proceso viejo sin receta pasa | quitar la comprobación → cae; moverla al núcleo → cae la división |
| §5.2 «Libre» | abrir sin intención o sin pasos planeados → rechazo; con pasos iguales a «Lavado» → exige usarla o `motivoDeLibre`; con pasos distintos → pasa; una receta propia llamada «Libre» no se confunde | quitar el control de parecido → cae |
| §5.3 convertir | la receta nueva copia los pasos planeados con ids nuevos; con una lectura de cierre marcada, ese paso propone ese fin; sin marcar, no propone ninguno | deducir el fin de una lectura no marcada → cae |
| 4.5 recepción | dos recepciones (Brix 26 y 20) → un aviso que nombra la de 26; sin recepción → aviso propio; una de 20 → ninguno | las tres ramas |

Si una tarea toca TypeScript, su plan manda `npm run build`, no sólo el runner de pruebas.

---

## 9. Lo que la 2a no hace

- La vigilancia en el lote: prefermentación, humedad sin intención, reposos, venta bloqueada,
  motores por receta, grado atado a la receta. **Es la 2b.**
- Comparar lo real con lo declarado y lotes de la misma receta. **Es la Parte 5.**
- Cargar Lavado, Natural y Honey. **Es la Parte 3**, que ahora las escribe como pasos.
- El plan del lote paso a paso, visible para el operario. **Es la Parte 4.**
- El desenlace «salida a tratamiento». **Es de la Parte 1**, por la coordinadora.
- Lo posterior al verde (añejado, monzón, barrica, descafeinado): existe en el catálogo, sin registro.

## 10. Dependencia y orden

Se construye **encima de la Parte 1 fusionada**: necesita que toda corrida esté unida a su proceso
(R3), el resolvedor R1 con su `cadena`, y los cierres `moisture` / `divided`. El plan de la 2a se
escribe cuando la Parte 1 esté en `main`, y empieza midiendo de nuevo todo lo que §1 afirma.

## 11. Revisión adversaria del 2026-10-02

Dos revisores independientes, en sólo lectura y sin verse entre sí: Codex (10 hallazgos) y un
revisor Claude (12). Coincidieron en los cuatro graves. Cada hallazgo se comprobó contra el código
antes de corregir; ninguno tocaba una decisión de Daniel.

| Hallazgo | Corrección |
|---|---|
| Una sola fase por versión y tipo: el multiproceso no cabe | §3.1: la corrida lee su paso; las fases son compatibilidad |
| `everyHours` ya existía; la unicidad de metas impedía repetir variable entre pasos | §3.2 |
| Los `stage_change` los crean las corridas; el guardián los habría rechazado | §4.1: no se tocan |
| El despulpado y el lavado ya se registran como `LotProcessIntervention` | §4.1 |
| Inoculación y adición sin registro enlazado | §4.1: las dos tablas de intervención |
| Catálogos «nuevos» que ya existían — **la misma equivocación que Daniel corrigió el 2026-09-07** | §7: se amplían los existentes |
| No había borrador: toda versión nace `approved` | §3.3 |
| Avance y borrador libre ignoraban la cadena de divisiones y devoluciones | §4.3, §5.3 |
| «Libre» identificada por nombre; permiso; concurrencia | §5.2 |
| Receta obligatoria contra procesos viejos y núcleos R6/R7 | §5.1 |
| Las lecturas «de cierre» no existen como dato | §5.3: el operario las marca |
| Tipo del registro distinto del tipo del paso | §4.2 |
| Trilla y tuestes caían como desviación | §4.4 |
| Varias recepciones por lote | §4.5 |
| Pruebas que pasaban vacías | §8: cada una con su control |

## 12. Vuelto a medir sobre la Parte 1 (2026-10-03)

Antes del plan, seis lentes independientes midieron de nuevo el §1 y el código que la 2a toca, sobre la
Parte 1 ya construida (rama `recetas-base`, PR #626). Las afirmaciones del §1 siguen siendo ciertas en
lo esencial; sus números de línea se movieron y el plan cita los de hoy. Lo que cambió el diseño:

| Hallazgo medido | Qué cambia | Quién decide |
|---|---|---|
| El despulpado y el lavado no se pueden registrar: la intervención exige un valor de catálogo y sus catálogos son ejes, no actos | §4.1: el acto es el tipo de paso; el valor de catálogo pasa a opcional | **Daniel** |
| Un material consumible es de una organización; una plantilla sirve en todas | §3: la adición guarda la categoría; el material se anota al ejecutar | **Daniel** |
| El catálogo `recipiente` son equipos concretos | §3: el paso declara capacidades, no un equipo | **Daniel** |
| `modo_secado` ya existe como enum `DryingEnvironment` | §3 y §7: se usa ése | controlador |
| El eje F se solapa con `manejo_temperatura` y con tipos de paso | §3: `fisico` sólo con lo que no existe en otro sitio | controlador |
| ~~La casa mide el mucílago quitado (ADR-181 #12)~~ — **corregido el 2026-10-04**: Daniel, el 2026-10-03, dos veces: «Semi Wash 75 %» = le **queda** el 75 %; 0 % = Lavado, 100 % = Honey, en tramos | §3: `mucilagoObjetivo`, sólo los seis tramos; ADR-181 #12 gana nota | **Daniel** |
| Publicar y versionar recetas es del **Coffee Process Manager**, un perfil nuevo con un permiso nuevo (2b §12, V16, 2026-10-04) | toda la autoría de recetas pasa por una sola regla; `edit_beneficio` deja de bastar | **Daniel** |
| `process_recipe.organization_id` es `ON DELETE SET NULL`: borrar una organización convertía sus recetas en plantillas de todas | la FK pasa a `RESTRICT` | controlador |
| Un alias no cruza catálogos | §7: esos sinónimos van al archivo de referencias | controlador |
| La receta obligatoria rompe ~160 aperturas de prueba y la demo de la semilla | el plan da a las pruebas una receta de fixture y abre la demo con receta | controlador |
| Un reproceso con la misma receta heredaría lo ejecutado arriba si el avance sólo mira la versión | §4.3: el avance sigue `derivedFromLotProcessId` mientras el origen no sea `original` | controlador |
| `compareRunToTargets` es un tercer lector de metas que el §3.2 no nombraba | lee las metas del paso de la corrida | controlador |
| `registrarIntervencion` y `recordFermentationIntervention` deciden fuera de una transacción | pasan a decidir dentro, con el linaje bloqueado; la segunda gana auditoría | controlador |
| Una corrida termina por **tres** puertas (las dos `end…` y bajar la última bandeja) | las lecturas de cierre entran por las tres | controlador |

Las demás decisiones técnicas del plan (nombres de la Libre, filtro de Libres en los selectores,
plantillas, orden de bloqueos, textos de los errores de receta, referencias con todas sus autoridades,
publicar exige al menos un paso) están escritas con su porqué en el plan.

**Nombres nuevos para que Daniel los revise:** `ProcessRecipeStep`, `stepType`, `recipeStepId`,
`motivoDesviacion`, `esLibre`, `motivoDeLibre`, `origenDeRecetaVersionId`, `lecturasDeCierre`,
`derivadaDeVersionId`, `capacidadesRequeridas`, `mucilagoObjetivo`, `exigeAutoriaDeReceta`, el perfil
«Coffee Process Manager» con su permiso (provisional `lot:approve_exception`), los catálogos `tipo_paso`,
`fisico` y `capacidad`, y los códigos `sin_receta`, `paso_de_otra_receta`, `paso_no_corresponde`,
`desviacion_sin_motivo` y `paso_de_otra_version`. Ninguno está en `03_public_api.md`, que no cubre las
recetas; siguen el estilo de la Parte 1, que nombró en español con el visto bueno de Daniel
(`00_reglas_del_modulo.md` §4 pide inglés).

## 13. Lo que se construyó distinto de este texto, y los nombres como quedaron

Escrito al cerrar el PR-A (esquema, vocabulario, autoría y editor), midiendo el código y no el plan. Donde este texto dice una cosa y el código otra, manda el código, y
esta sección dice cuál. Las correcciones de una línea ya están hechas arriba, en su sitio; aquí van las que no caben en una
línea. Cada fila nombra un identificador que existe en el código, y el cierre del PR-A comprobó que todos están. **El PR-B añade sus filas al final de esta tabla y sus nombres en el 13.3.**

### 13.1 Qué cambió respecto del texto de arriba

| Dónde | El texto decía | Se construyó | Por qué |
|---|---|---|---|
| Todo el texto | la 2a se construye y se entrega de una vez | se entrega en **dos PR**. El **PR-A** —el esquema (la única migración, `20261006130000_receta_con_pasos`), el vocabulario, la autoría de recetas, el borrador y la publicación, la copia de versiones, los lectores de metas y el editor— es lo que describe esta sección. El **PR-B**, «la receta en la operación» (la receta obligatoria al abrir un proceso, el avance, el guardián y la desviación, los lectores por paso, la Libre y convertirla, los avisos de recepción y las pantallas operativas), no lleva migración, añade sus filas al final de esta tabla y sus nombres en el 13.3. Donde el texto de arriba describe una conducta del PR-B, todavía no existe | decisión de Daniel, 2026-10-06: partir la 2a en dos PR para revisar y fusionar cada mitad por separado |
| §3.1, §4, §5.2 y §5.3 | las corridas y los manejos se unen a su paso, la Libre se define antes de ejecutarse y las lecturas de cierre se marcan | **en este PR el esquema está entero y nada de eso se escribe**: las columnas `stepTypeValueId`, `recipeStepId` y `motivoDesviacion` de las cuatro tablas de registro, `origenDeRecetaVersionId` de `LotProcess`, `esLibre` de `ProcessRecipe` y la tabla `ProcessStepClosingReading` están en la migración, pero ningún servicio las escribe (`motivoDesviacion` y `origenDeRecetaVersionId`: ningún uso en `lib/` ni en `app/`; `esLibre: true`: ninguno; `recipeStepId` sólo lo escriben `lib/recetas/pasos.ts` y `lib/recetas/versiones.ts`, para las metas de un paso). El guardián de coherencia (§4.2), el avance, la receta Libre, las lecturas de cierre y los avisos de recepción son del PR-B, y con ellos los lectores que leen el paso de la corrida: hasta entonces la cola de secado y el tablero siguen leyendo las fases, y una corrida no lleva paso | el PR-A es la receta como se escribe, no como se opera; las columnas van ya en la migración para que el PR-B no lleve ninguna |
| §3, §4.1, §4.2 | la columna `stepType` | `stepTypeValueId`: clave foránea al valor del catálogo `tipo_paso`, en el paso y en las cuatro tablas de registro. Donde arriba dice `stepType`, léase `stepTypeValueId` | un catálogo es una tabla de valores: la columna guarda su id, como los demás ejes |
| §3 «Requisitos» | `capacidadesRequeridas` | la tabla `ProcessRecipeStepRequirement`, con clave `(stepId, capacidadValueId)` | una lista de valores de catálogo es una tabla hija, no un arreglo |
| §3.2 | el paso tiene que ser de la misma versión que la meta (`paso_de_otra_version`) | además lo hace cumplir la base: clave foránea compuesta `(recipe_step_id, recipe_version_id)` hacia el paso. `paso_de_otra_version` queda en `validateTargets(metas, pasosDeEstaVersion)`, que es lo que pide la copia remapeada; ninguna de las seis funciones de `pasos.ts` puede construir una meta ajena. Quitar un paso borra sus metas (CASCADE) | una regla que sólo vive en el servicio no existe para un importador ni para SQL directo |
| §3.2 | los lectores que filtran las metas de la versión por fase (la cola de secado y el tablero) filtran `recipeStepId IS NULL` | son **cuatro**, y un selector: la cola de secado (`lib/beneficio/colaDeSecado.ts`), el tablero (`lib/beneficio/datosDelTablero.ts`), la tabla «objetivo contra real» (`compareRunToTargets`, `lib/traceability/processTargets.ts`) y el perfil de tueste elegido (`getPerfilDeTuesteElegido`, `lib/traceability/roasting.ts`) leen de la versión sólo las metas con `recipeStepId: null`, y `listRecipeVersionsForLot` sólo trae esas. Que las metas de la corrida salgan de su paso es del PR-B | desde que el editor escribe metas por paso, sin el filtro una meta de un paso se leería como meta de toda la versión |
| §3.3 | el número de la versión nueva | se toma dentro de la transacción, con la fila de la receta bloqueada (`nuevaVersionBorrador`, en `lib/recetas/versiones.ts`) | dos versiones nuevas a la vez chocaban en el único `(receta, versión)` |
| §3.4 | las plantillas (receta sin organización) no las edita ninguna organización | se editan sólo con la autoría de recetas con alcance de plataforma (`exigeAutoriaDeReceta(userAccountId, null)`); una plantilla se puede usar al abrir un proceso, como la del tueste, y una organización deriva su copia con `derivarReceta` (`derivadaDeVersionId`) | así se cumple «ninguna organización las edita» sin una excepción nueva |
| §3.5 y §6 | la referencia del paquete muestra valor, fuente y confianza | además guarda todas las autoridades del paquete (`alternativas`: nunca se elige una en silencio), la nota del paquete (`nota`, la de las 22 referencias que la traen) y dos marcas que la pantalla respeta: `marcarVisible` (las de fuente `NN` y las de confianza `low` se marcan) y `noPrecargar` (el lavado genérico y las dosis de fabricante nunca precargan un paso) | las reglas 2, 3 y 7 del paquete: la receta decide, y una referencia es informativa |
| §5.1 (PR-A) | `abrirProceso` exige receta | si se le pasa una versión, la exige publicada, de una receta no archivada y de la organización del lote o compartida (plantilla); la versión se bloquea después del linaje (`exigeRecetaParaAbrir`). Los selectores (`listRecipeVersionsForLot`) no ofrecen borradores, Libres ni archivadas, y traen cuántos pasos tiene cada versión y sólo las metas de la versión. Los dos servicios del tueste rechazan una versión no publicada o Libre (`version_no_publicada`). **Abrir sin receta sigue valiendo en este PR**: la obligatoriedad es del PR-B | la 2a introduce los borradores, y ni el tueste ni la apertura miraban el estado de la versión |
| §5.2, §5.3 y §12 | publicar y convertir exigen `edit_beneficio` (la convención de entonces) | toda escritura de autoría pasa por **una sola regla**, `exigeAutoriaDeReceta(userAccountId, organizationId \| null)` (`lib/recetas/autoria.ts`): crear una receta, derivarla, hacer una versión nueva, agregar, actualizar, quitar y mover un paso, y publicar (la conversión de una Libre la usará en el PR-B). Exige el permiso del Coffee Process Manager —el permiso nuevo, de nombre provisional `lot:approve_exception`, y el perfil «Coffee Process Manager» de `lib/rbac/catalog.ts`; Platform Admin lo recibe por llevar el catálogo entero y el Farm Manager no lo recibe de serie— con un alcance que llegue a la organización de la receta, o de plataforma si es una plantilla. **`edit_beneficio` ya no basta para una receta** (sigue valiendo para lo que no es receta). Abrir un proceso, también con Libre, sigue siendo `lot:manage`. **El perfil del Coffee Process Manager no lleva `lot:manage` ni `lot:view`** (no opera lotes: V13): las tres lecturas de recetas de `processTargets.ts` (`listRecipes`, `listRecipeOrganizations`, `getRecipeForEditor`) aceptan también `puedeAutoriaDeReceta` —la versión que pregunta de la misma regla—, y así abre `/recipes` y el editor sin ser operario (Ruling C4). **Al desplegar**, un Farm Manager que hoy crea o versiona recetas con `edit_beneficio` deja de poder hacerlo, y hasta que se asigne el perfil nuevo sólo lo hace un Platform Admin. | V16, Daniel, 2026-10-04: quien opera no redacta el procedimiento; y V16 pedía «sólo las lecturas que exigen las pantallas de recetas», sin permisos operativos |
| §12 | el permiso del Coffee Process Manager | se llama **`lot:approve_exception`** (`{ resourceType: "lot", action: "approve_exception" }` en `lib/rbac/catalog.ts`), nombre **provisional** que fijó Daniel el 2026-10-04 (diseño de la 2b, §12) y que todavía puede cambiar. Renombrarlo no es un cambio de una línea: la semilla escribe los permisos con `upsert` por `(resourceType, action)` y no borra ninguno, así que un nombre nuevo crea otra fila y deja la vieja, con sus vínculos a los perfiles y las concesiones por asignación que la citen; hace falta una migración de datos que renombre la fila | renombrarlo después de desplegar cuesta más que decidir el nombre antes |
| §5.3 (R6) | un fin cita la lectura de la que salió (`desdeLecturaId`) | sólo si la lectura es de un lote de la organización de la receta y quien escribe puede verlo (`exigeLecturasDelPaso`, en `lib/recetas/pasos.ts`, junto a la comprobación de la marca de `exigeValoresDelPaso`); una plantilla no cita ninguna, y lo que el mismo paso ya cita no se autoriza otra vez al actualizarlo. Un solo código para todo, `lectura_no_marcada`: no se dice si el id existe en otra organización o en un lote que no se ve | `desdeLecturaId` aceptaba cualquier lectura marcada: el borrador de una organización podía citar la medición de otra y, con la clave foránea `RESTRICT`, impedirle borrarla a su dueña |
| §5.3 (R23) | el origen de un fin es una lectura marcada | `exigeValoresDelPaso` acepta un `desdeLecturaId` que sea la lectura marcada **o una corrección cuya raíz, por `correctsId`, está marcada** (se sube la cadena), con la comprobación de organización y de visibilidad de R6 sobre esa lectura; una corrección de una lectura NO marcada sigue saliendo `lectura_no_marcada`. | la corrección vigente de una lectura marcada no está marcada (la marca es de la lectura original): sin esto, el editor, que reenvía el `desdeLecturaId` al editar o publicar ese paso, rechazaría con `lectura_no_marcada` un fin que cita esa corrección —lo que escribirá la conversión de una Libre, en el PR-B— |
| §6 | la pantalla del editor | además de lo que dice el texto, el editor necesita `crearRecetaEnBorrador` (una receta nueva y vacía, en borrador: `createRecipeWithVersion` exige al menos una meta y no sirve) y `catalogosDelEditor` (los vocabularios para quien no tiene el permiso de investigación, que `listVariableCatalogs` exige) | sin ellos el editor no podía ni crear una receta ni pintar un desplegable |
| §6 | la lista de pasos se edita sólo en borrador | además, cada paso de una versión que ya no es borrador (la publicada y las del historial) lleva «Ver el paso» (`app/recipes/[id]/pasos/[stepId]`, que carga `cargarFormularioDePaso`): la misma pantalla del paso, con el formulario entero y deshabilitado (`soloLectura`). La abre sólo quien puede escribir la receta (`puedeAutoriaDeReceta`; a los demás, 404): quien sólo la lee ve de cada paso el tipo, la intención, las horas sugeridas y cuántas metas, fines y adiciones tiene, no sus valores | tras publicar, los valores de un paso sólo existían dentro del formulario de edición, que ya no se abre |
| §3.3 y §6 | (el texto sólo dice que `abrirProceso`, el selector y los lectores exigen `approved`) | «versión vigente» es **la publicada más alta**, para todos (`app/recipes/[id]/page.tsx`): es la que se ofrece al abrir un proceso. El borrador se pinta sólo a quien puede escribir la receta —ni en la cabecera, ni en el historial, ni en la cuenta de versiones de la lista (`app/recipes/page.tsx`)— | «vigente» era la más alta a secas, y quien no escribe veía «vigente: v2» con los pasos de un borrador como sección principal |
| §6 (R7) | (el diseño no decía quién lee qué receta; la Parte 1 autorizaba contra un lote cualquiera de la base) | `listRecipes` y `getRecipeForEditor` deciden cada receta por **su** organización: la ve quien opera ALGÚN lote de ella (`ambitosDeLosLotes`, de `lib/traceability/processTargets.ts`, da de una vez los ámbitos de todos los lotes de la organización) o quien puede escribir sus recetas (`puedeAutoriaDeReceta`); una plantilla, quien opera algún lote en cualquier parte o tiene la autoría de plataforma | autorizar contra «un lote cualquiera de la base» devolvía las recetas de todas las organizaciones según qué lote respondiera primero la base, y un operario de una sola parcela pasaba o no según ese orden |
| §5.2 y §6 (R8, R24) | la Libre es una receta de la organización, como las demás | una Libre es lo que ocurrió en un lote: `listRecipes` no trae ninguna (filtro del servicio); `getRecipeForEditor` la abre sólo a quien VE el lote de cada proceso que la usa, antes y por encima de la autoría, y leer sus pasos pide lo mismo (R24): `pasosDeLaVersion` manda una Libre a `exigeVerLosLotesDeLaLibre` (`lot:view` sobre el lote de cada proceso que usa su versión; una Libre que ningún proceso usa no se abre a nadie) y no a `exigeLecturaDeLosPasos`, la regla de las demás recetas (la autoría o `manage`) | su nombre lleva el código del lote y su descripción lo que el operario escribió: la intención de un lote `confidential` o `trade_secret` quedaba legible, como receta `internal`, para cualquier Coffee Process Manager de la organización aunque no viera el lote |
| §6 | «sus dos formularios (`RecipeForm` y `RecipeVersionForm`) se retiran» | además se retiran los dos servicios que sólo ellos usaban, `createRecipeWithVersion` y `createRecipeVersion` (de `lib/traceability/processTargets.ts`), y sus dos pruebas, `recipeAuthoring.test.ts` y `recipeVersions.test.ts`. Lo que esas pruebas protegían sigue probado: `crearRecetaEnBorrador` (`recetaEnBorrador.test.ts`), `nuevaVersionBorrador` (`versiones.test.ts`) y las reglas de una meta (`validateTargets`, `validarMetas.test.ts`). Los nombres viejos quedan sólo en comentarios | tras quitar las acciones que los llamaban, sólo los llamaban sus pruebas, y eran una segunda puerta de escritura de recetas que seguía pidiendo `edit_beneficio` |
| §3 | las horas, las cantidades y las filas de un paso no tienen límite | tienen tope. `MAX_HORAS` (100 000) vale para las horas de un paso (`horas_invalidas`) y el ritmo de una meta (`cadence_must_be_positive_hours`), y `MAX_CANTIDAD_DE_ADICION` (99 999 999,9999) para la cantidad de una adición (`adicion_invalida`), las dos en `lib/recetas/vocabulario.ts`; el formulario del paso lee como mucho `MAX_FILAS` (50) adiciones, fines y metas (`lib/recetas/formularioDePaso.ts`) y apaga el botón de añadir al llegar | sin tope, un número enorme llegaba a la base y volvía como un error crudo (las horas son `INTEGER`, la cantidad `numeric(12,4)`), y la fila 51 se perdía en silencio |
| §7 | sinónimos del paquete como alias, sólo dentro del mismo catálogo | los sinónimos entre catálogos van en `SINONIMOS_ENTRE_CATALOGOS` (`lib/recetas/referencias.ts`), sólo para mostrar: no son alias y no se guardan. **Los cuatro alias de `doble_mosto` dentro de `sustrato_anadido`** (`mosto`, `mossto`, `lixiviado` y «previous-batch starter») **llegan con el PR-B**, junto con el filtro que los oculta del desplegable de intervención y el `aliasOfId ?? id` al guardar | un alias no cruza catálogos, y sembrarlo antes de ocultarlo duplicaría su valor canónico en el desplegable |

### 13.2 Nombres nuevos, como quedaron

Esto sustituye la lista del §12, que se escribió antes de construir. Está sacada del diff de la rama contra `main` (la migración `20261006130000_receta_con_pasos`, las exportaciones nuevas de `lib/` y de `app/actions/`, los códigos de error y los catálogos), no escrita a mano. Ninguno está en `03_public_api.md`, que no cubre las recetas; siguen el estilo de la Parte 1. Lo que construya el PR-B va en el 13.3.

- **Tablas** (5): `process_recipe_step`, `process_recipe_step_addition`, `process_recipe_step_end`, `process_recipe_step_requirement`, `process_step_closing_reading`.
- **Tipos** (3): `StepEndRule`, `StepEndOperator`, `AdditionMoment`.
- **Columnas añadidas a tablas que ya existían** (18): `fermentation_run.motivo_desviacion`, `fermentation_run.recipe_step_id`, `fermentation_run.step_type_value_id`, `lot_process.origen_de_receta_version_id`, `lot_process_intervention.motivo_desviacion`, `lot_process_intervention.recipe_step_id`, `lot_process_intervention.step_type_value_id`, `process_recipe.derivada_de_version_id`, `process_recipe.es_libre`, `process_recipe.motivo_de_libre`, `process_recipe.parecida_a_version_id`, `process_target.recipe_step_id`, `fermentation_intervention.motivo_desviacion`, `fermentation_intervention.recipe_step_id`, `fermentation_intervention.step_type_value_id`, `drying_run.motivo_desviacion`, `drying_run.recipe_step_id`, `drying_run.step_type_value_id`.
- **Restricciones CHECK** (13): `process_recipe_step_mucilago_en_tramos`, `process_recipe_step_horas_en_orden`, `process_recipe_step_humedad_en_orden`, `process_recipe_step_temperatura_en_orden`, `process_recipe_step_addition_cantidad_con_unidad`, `process_step_closing_reading_un_registro`, `fermentation_run_paso_exige_tipo`, `drying_run_paso_exige_tipo`, `lot_process_intervention_paso_exige_tipo`, `fermentation_intervention_paso_exige_tipo`, `lot_process_intervention_catalogo_o_tipo`, `process_recipe_parecida_exige_motivo`, `process_recipe_solo_libre_lleva_parecido_y_motivo`.
- **Índices** (35): `process_recipe_step_recipe_version_id_idx`, `process_recipe_step_step_type_value_id_idx`, `process_recipe_step_estado_fruto_value_id_idx`, `process_recipe_step_oxigeno_value_id_idx`, `process_recipe_step_temperatura_value_id_idx`, `process_recipe_step_fuente_microbiana_value_id_idx`, `process_recipe_step_medio_value_id_idx`, `process_recipe_step_fisico_value_id_idx`, `process_recipe_step_recipe_version_id_seq_key`, `process_recipe_step_id_recipe_version_id_key`, `process_recipe_step_addition_step_id_idx`, `process_recipe_step_addition_categoria_value_id_idx`, `process_recipe_step_end_step_id_idx`, `process_recipe_step_end_desde_lectura_id_idx`, `process_recipe_step_requirement_capacidad_value_id_idx`, `process_step_closing_reading_fermentation_run_id_idx`, `process_step_closing_reading_drying_run_id_idx`, `process_step_closing_reading_lot_process_intervention_id_idx`, `process_step_closing_reading_measurement_id_fermentation_ru_key`, `process_step_closing_reading_measurement_id_drying_run_id_key`, `process_step_closing_reading_measurement_id_lot_process_int_key`, `fermentation_run_step_type_value_id_idx`, `fermentation_run_recipe_step_id_idx`, `lot_process_origen_de_receta_version_id_idx`, `lot_process_intervention_step_type_value_id_idx`, `lot_process_intervention_recipe_step_id_idx`, `process_recipe_derivada_de_version_id_idx`, `process_recipe_parecida_a_version_id_idx`, `process_target_recipe_step_id_recipe_version_id_idx`, `fermentation_intervention_step_type_value_id_idx`, `fermentation_intervention_recipe_step_id_idx`, `drying_run_step_type_value_id_idx`, `drying_run_recipe_step_id_idx`, `process_target_unica_sin_paso`, `process_target_unica_por_paso`.
- **Códigos de proceso con texto** (4): `version_no_publicada`, `receta_de_otra_organizacion`, `recipe_archived`, `recipe_version_not_found`.
- **Códigos de receta con texto** (27): `sin_permiso_de_autoria`, `organizacion_sin_lotes`, `version_no_encontrada`, `version_no_es_borrador`, `version_sin_pasos`, `paso_no_encontrado`, `posicion_invalida`, `tipo_de_paso_desconocido`, `eje_no_aplica`, `valor_de_otro_catalogo`, `horas_invalidas`, `fin_por_tiempo_sin_horas`, `solo_en_secado`, `porcentaje_fuera_de_rango`, `mucilago_fuera_de_tramos`, `rango_invalido`, `adicion_invalida`, `fin_invalido`, `lectura_no_marcada`, `meta_de_recepcion_no_se_vigila`, `paso_de_otra_version`, `ya_hay_un_borrador`, `no_es_plantilla`, `version_no_publicada`, `nombre_requerido`, `nombre_repetido`, `receta_libre_no_se_versiona`.
- **Catálogos nuevos** (3): `tipo_paso`, `fisico`, `capacidad`.
- **Permisos nuevos** (1): `lot:approve_exception`.
- **Perfiles nuevos** (1): `Coffee Process Manager`.
- **Textos:** messages/en.json +214 líneas, messages/es.json +214 líneas.
- **Exportaciones nuevas** (58), por archivo:
  - `app/actions/traceability.ts`: `actualizarPasoAction`, `agregarPasoAction`, `crearRecetaAction`, `derivarRecetaAction`, `moverPasoAction`, `nuevaVersionBorradorAction`, `publicarVersionAction`, `quitarPasoAction`.
  - `lib/recetas/autoria.ts`: `exigeAutoriaDeReceta`, `puedeAutoriaDeReceta`.
  - `lib/recetas/catalogosDelEditor.ts`: `CATALOGOS_DEL_EDITOR`, `CatalogosDelEditor`, `ValorDeCatalogo`, `catalogosDelEditor`.
  - `lib/recetas/errorDeReceta.ts`: `CODIGOS_DE_RECETA_TRADUCIDOS`, `CodigoDeRecetaTraducido`, `RecipeError`, `claveDeErrorDeReceta`.
  - `lib/recetas/formularioDePaso.ts`: `MAX_FILAS`, `PasoInicial`, `pasoDeFormulario`, `pasoEnBlanco`, `posicionDeFormulario`, `valoresDelFormulario`.
  - `lib/recetas/pasos.ts`: `AdicionDelPaso`, `FinDelPaso`, `MetaDelPaso`, `PasoConDetalle`, `PasoEditable`, `actualizarPaso`, `agregarPaso`, `moverPaso`, `pasosDeLaVersion`, `publicarVersion`, `quitarPaso`.
  - `lib/recetas/referencias.ts`: `ReferenciaDelPaquete`, `SINONIMOS_ENTRE_CATALOGOS`, `referenciasDelTipo`.
  - `lib/recetas/rotuloDeVersion.ts`: `TraductorDelRotulo`, `VersionParaRotular`, `rotuloDeVersion`.
  - `lib/recetas/versiones.ts`: `copiarContenidoDeVersion`, `crearRecetaEnBorrador`, `derivarReceta`, `nuevaVersionBorrador`.
  - `lib/recetas/vocabulario.ts`: `EJES_POR_TIPO_DE_PASO`, `EjeDelPaso`, `FASE_DEL_TIPO`, `MAX_CANTIDAD_DE_ADICION`, `MAX_HORAS`, `RegistroDePaso`, `TIPOS_DE_PASO`, `TIPOS_POR_REGISTRO`, `TRAMOS_DE_MUCILAGO`, `TipoDePaso`.
  - `lib/traceability/processTargets.ts`: `CODIGOS_DE_META_TRADUCIDOS`, `CodigoDeMetaTraducido`, `claveDeErrorDeMeta`.
