# Parte 2a — La receta con pasos

**Fecha:** 2026-10-02 · **Estado:** diseño aprobado por Daniel en conversación, sección por sección;
**corregido tras dos revisiones adversarias** (Codex y un revisor Claude, §11); pendiente de su
lectura del spec escrito. **Base:** escrito sobre `origin/main` `85eab6da`. Depende de la Parte 1,
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
Parte 1 por la coordinadora. **La 2a no depende de él para unir registros a pasos**: hoy un secado
que se corta para un tratamiento se termina con `abandoned` o `interrupted`, y su corrida sigue
unida a su paso. Lo que ese desenlace arregla es que la etiqueta diga la verdad. Nota: el diseño de
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
| Ejes — **catálogos existentes** | A `estadoFruto` → `estado_cereza`, y `mucilagoRetenidoPct`; B `oxigeno` → `condicion_oxigeno`; C `temperatura` → `manejo_temperatura`, y `temperaturaMinC`/`MaxC`; D `fuenteMicrobiana` → `fuente_microbiana`; medio → `medio_lavado`; `recipiente` → `recipiente` |
| Ejes — catálogos nuevos | F `fisico` (agitación, ultrasonido…), G `modoSecado` (cama africana, patio, marquesina…) |
| Adiciones (E) | filas hijas: sustancia (→ `sustrato_anadido`), cantidad, unidad, `momento: pre_verde | post_verde` |
| Requisitos (para la 2c) | `capacidadesRequeridas`: lista de valores del catálogo nuevo `capacidad` (sellable, válvula, control de temperatura, oscuridad…). La 2a lo guarda; la comprobación es de la 2c |
| Valores por defecto | `horasMin`, `horasSugeridas`, `horasMax`; sólo secado: `volteoCadaHoras`, `humedadMinPct`, `humedadMaxPct` |
| Fin (D2) | `finPorTiempo` (sí/no: el paso termina al cumplir `horasSugeridas` desde su inicio) + filas de fin: variable, operador, valor, unidad; `reglaDeFin: primero | todas`. Con tiempo y varias filas, «primero» = la primera condición que se cumple; «todas» = todas, incluido el tiempo |
| Plan de medición | **`ProcessTarget` reutilizado** con su `everyHours`, más `recipeStepId` (§3.2) |

### 3.1 Qué lee cada consumidor, con pasos

`ProcessRecipePhase` es única por versión y fase, así que **no puede representar dos secados
distintos** ni prefermentación + fermentación con parámetros propios. Por eso:

- **Una corrida con `recipeStepId` lee sus valores (horas, volteo, banda) de su paso.** La cola de
  secado (`colaDeSecado.ts:263–275`) y el tablero (`datosDelTablero.ts:274–282, 351, 451`) cambian
  para mirar primero el paso de la corrida.
- **Las fases quedan como compatibilidad** para corridas sin paso (históricas y procesos viejos sin
  receta). Una versión con pasos escribe al publicarse **una** fase por tipo, con los valores del
  **primer** paso de esa fase en `seq` — sólo para esos lectores antiguos —, y
  `ProcessRecipeVersion.expectedHours` = la suma de `horasSugeridas` de los pasos no opcionales.
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

Para que el despulpado y el lavado se puedan registrar, sus valores entran en el catálogo de
intervenciones (§7).

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

Ocurren antes de abrir el proceso, que se abre sobre el lote aceptado. No se unen por paso: al abrir
el proceso, el servicio busca en la ascendencia del lote **todas** sus recepciones
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
- **No exige `edit_beneficio`**: quien puede abrir procesos puede abrir una Libre. Una receta propia
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
- «Publicar» fija la versión. Esta pantalla sustituye a la «pantalla de fases» que la Parte 1 dejó
  fuera.
- Al terminar una corrida o registrar una intervención, la casilla para marcar las lecturas de
  cierre (§5.3).
- Textos en es y en.

---

## 7. El vocabulario

**Se amplían los catálogos que ya existen; no se crean paralelos.**

- **Nuevos, porque no existe nada parecido:** `tipo_paso` (los 23 + `prefermentacion`), `fisico`,
  `modo_secado`, `capacidad` (para la 2c).
- **Valores nuevos en catálogos existentes:**
  - `recipiente`: cama africana, sacos de cosecha (fiebre), bolsa anaeróbica.
  - `fuente_microbiana`: mosto propio, bioprotección, atomizado. «Mosto de otro fermento» **no** es
    valor nuevo: es `mosto_de_otro_lote` de `medio_lavado`, y se pone como alias.
  - `estado_cereza`: los estados de mucílago que aún falten (en mucílago, lavado).
  - El catálogo de intervenciones gana los valores de despulpado, desmucilaginado y lavado, para que
    `LotProcessIntervention` los registre (4.1).
- **Sinónimos del paquete como alias** (`aliasOf`): mosto = mossto = lixiviado = «previous-batch
  starter» → `doble_mosto` / `mosto_de_otro_lote` según el caso.
- **Definiciones de la casa** en `definition`:
  - **Lavado:** a la cama de secado sin nada de mucílago; si llega con mucílago es semi-lavado.
  - **Honey:** 100 % del mucílago retenido; con menos, semi-lavado.
  - **Fiebre:** cereza entera en sus sacos de cosecha sin sellar, se calienta; prefermentativo por
    intención.
  - **Láctico, málico, acético:** resultados, no métodos; exigen datos medidos o se publican como
    perfil buscado.

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
