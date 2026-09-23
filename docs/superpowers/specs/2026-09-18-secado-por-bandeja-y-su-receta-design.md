# El secado por bandeja, su ambiente y su receta — diseño

**Fecha:** 2026-09-18 · **Camino:** arquitectónico · **Estado:** aprobado por partes en conversación, pendiente de revisión escrita · **Medido sobre:** `origin/main` = `1192af6`

**Alcance.** Extiende la spec del 2026-09-15, **`2026-09-15-muestra-y-topologia-de-secado-design.md`**, ya construida: instalación, cama, nivel de estante, tipo de ambiente, y la inspección con sus muestras. Esa spec dejó en su §11, con orden, dos piezas para después. **Ésta las toma:**

| de su §11 | aquí |
|---|---|
| 1 · **la receta de secado** — «existe lo ejecutado y no existe el plan, así que un volteo de menos no es nada porque nadie declaró cuántos tocaban» | §4.6 y §4.7 |
| 2 · **la capa ambiental** — «cero modelos hoy» | §4.5, **sólo la lectura a mano**; sensores y registradores quedan fuera (§8) |

Y añade lo que Daniel pidió el 2026-09-18 y ninguna de las dos tenía: **la bandeja** —que se mueve— y **la humedad por bandeja**.

Su hermana es la spec del tablero (#363, §4.5): lo que aquí se declara debido —voltear, medir— aparece allí como una lectura debida más.

---

## 1. Qué pidió Daniel

Daniel, 2026-09-18 (sus palabras, con erratas de teclado corregidas): *«en el secado se debe registrar no sólo cuál cuarto de secado —ya sea invernadero solar, cama africana afuera a la intemperie, o en el piso con lona, o en cuarto de secado controlado oscuro—, cuál de las bandejas está, si ha cambiado de posición la bandeja por nivel o fila, etc.; también condiciones de sensores de este lugar, más H% de cada lote durante su proceso, y que se pueda definir en su receta o al iniciar el secado de ese lote qué tan a menudo se debe medir humedad de grano y/o voltear en su cama: puede ser 0, 1 o muchas más veces durante la jornada del día»*.

## 2. Decisiones de Daniel (2026-09-18)

| pregunta | decisión |
|---|---|
| cómo está organizado el secado | **varía por instalación.** Afuera, camas africanas sin bandejas o piso con lona; en invernadero o cuarto, estantes con **nivel y fila** donde van bandejas |
| lote y bandeja | **un lote se reparte en varias bandejas; cada bandeja lleva un solo lote.** Las bandejas se mueven de nivel o fila por separado, y cada movimiento se registra con hora |
| a qué se mide la humedad | **por bandeja, y se ve por lote**: el lote enseña todas sus bandejas y su dispersión. Se admite una lectura del lote entero, **marcada como mezcla** |
| cómo se expresa la frecuencia | **cada N horas**, como las lecturas de fermentación. **0 o vacío = no se exige** |
| receta o inicio | **la receta da el valor por defecto; al iniciar el secado se cambia para ese lote con razón escrita.** Queda qué decía la receta y qué se usó |
| puede cambiar en marcha | **sí, por tramos**: la receta puede decir «primeras 48 h cada 2 h, después cada 4 h», y el encargado cambia en marcha con razón; queda el historial |
| qué cierra un tramo | **tiempo o humedad**: a las N horas desde el inicio, o cuando la humedad baja de un valor |
| qué humedad cuenta para el tramo | **la de cada bandeja**: la del nivel alto puede pasar a cada 4 h mientras la de abajo sigue cada 2 h |
| cómo llegan las condiciones del lugar | **lectura a mano** |
| dónde se toma | **por instalación, con nivel o fila opcional** |
| qué se anota | **temperatura, humedad relativa, cielo/clima y ventilación** |
| cómo se identifica una bandeja | **número y QR propio**, como ya se decidió para los envases de insumos |
| cómo termina el secado de un lote en bandejas | **bandeja a bandeja**: cada bandeja que llega a meta se baja sola, y el lote termina cuando baja la última. **El paso a almacenamiento sigue siendo manual** (`20_modelo_ciclo_completo.md` §2) |
| cuántas bandejas por posición | **una**: dos bandejas en la misma posición al mismo tiempo son un conflicto de datos (§4.2) |
| catálogo de cielo | **soleado, parcialmente nublado, nublado, lluvia** |
| catálogo de ventilación | **abierto, semiabierto, cerrado, ventilador / deshumidificador** |

Las cuatro últimas filas se decidieron el 2026-09-18, en una segunda ronda. Hasta entonces figuraban en §7 como abiertas.

**Tercera ronda, el mismo día, con el plan de secado de Las Nubes Cerro Azul delante** (`Las_Nubes_Cerro_Azul_Drying_Plan_2026-27.md`, que Daniel compartió; §1, §5, §6 y §7 de ese documento):

| pregunta | decisión |
|---|---|
| sombra de arriba | **grado** (la escala de las parcelas, 20–90 %) y **qué la da** en texto libre —árbol, enredadera, lona, techo con cierta opacidad—, **en la instalación y en la cama**: la cama sólo si difiere |
| cómo está armado el lugar | **varios estantes por instalación** |
| qué es una posición | **estante + nivel + puesto**: «Cuarto oscuro I · Estante 2 · Nivel 4 · Puesto 3». Al crear un estante se dan sus niveles y sus puestos por nivel, y **las posiciones se crean solas** |
| la medida de la bandeja | **tipos fijos**, en **pies**: 2×2 y 4×2. Se guarda en centímetros y se enseña en pies |
| el número de la bandeja | **consecutivo por finca**: B-001, B-002… No se repite en la finca |
| cuánto café cabe en una bandeja | **medido por estado** —cereza entera, en mucílago (honey), lavado— con el pesaje de campo de §7 del plan de secado; **hasta que exista la medida, un estimado marcado como tal** |

**Qué dice el plan de secado, y se usa como dato de partida (declarado, no medido):**
- el cuarto oscuro I tiene 2 filas × 6 niveles × 6 bandejas: 72;
- el cuarto solar existente, 2 lados × 3 niveles, con 24 bandejas de 2×2;
- el toldo exterior, 1 fila × 1 nivel, con 25 bandejas;
- en la fase II, el cuarto oscuro II tiene 2 × 6 × 10 y el cuarto solar II 2 × 4 × 10;
- carga a unos 2,8 cm, dos capas de cereza;
- densidad de **400 kg/m³ para cereza, marcada allí como provisional**.

**Para mucílago y lavado el plan no da densidad**, así que aquí no se inventa ninguna.

## 3. Lo que ya existe — medido sobre `1192af6`

| qué | dónde | qué da, y qué le falta |
|---|---|---|
| la instalación | `Location` tipo `drying_facility`, con `dryingEnvironment` | `solar_greenhouse`, `dark_room_climate_controlled`, `open_patio`, `covered_patio`, `mechanical_dryer`. **Faltan «cama africana a la intemperie» y «piso con lona»** |
| la posición | `Location` tipo `drying_bed`, hija de la instalación, con `rackLevel` y `dryingRoomLightExposure` | **tiene nivel, no tiene fila** |
| el secado de un lote | `DryingRun`: `dryingBedLocationId`, `method` (texto, legado), `layerDepthCm`, `startedAt`, `endedAt` | **una sola cama** por corrida: no puede decir que el lote está en cinco bandejas |
| los volteos | `DryingTurnEvent`: `turned`, `covered`, `uncovered`, `other`, con operador y hora | cuelgan de la corrida, **no de una bandeja** |
| la inspección | `SamplingEvent`: cama, corrida, hora, operador, y sus `Sample` | cuelga de la cama, **no de una bandeja** |
| la humedad | `Measurement` de `moisture`, colgable de la corrida o de la muestra | — |
| la frecuencia | `ProcessTarget.everyHours`, por variable de la receta | sirve para **medir** una variable; **volteo no es una variable**, así que no se puede declarar; y **no tiene tramos** |
| la bandeja | `Equipment` de `kind = vessel` —el propio esquema pone «saco de secado» como ejemplo— | **ya existe como concepto** |
| moverla | `EquipmentTransfer`: desde, hacia, quién, cuándo, condición | **ya registra cada movimiento con hora** |
| el ambiente | — | **ningún modelo**. `Device` es el teléfono, no un sensor. Lo confirmó la spec del 2026-09-15 con su control positivo |

**Consecuencia para el diseño:** la bandeja **no es una tabla nueva ni un tipo de ubicación**. Es un equipo que se mueve, y moverlo ya deja historia. Lo que es fijo —la posición en el estante— es una `Location`; lo que se mueve —la bandeja— es un `Equipment`. Es la misma separación que ya hay entre un tanque y la sala donde está.

## 4. Diseño

### 4.1 Las instalaciones, sus estantes y su sombra

`DryingEnvironment` gana dos valores: **cama africana a la intemperie** y **piso con lona**.

**El árbol** —todo son `Location`, el patrón que ya siguen finca, instalación y cama—:

```
sitio (finca / beneficio)
└── instalación (drying_facility)            «Cuarto oscuro I»
    ├── estante (drying_rack)                «Estante 1»
    │   └── posición (drying_bed)            nivel 4 · puesto 3
    └── cama sin estante (drying_bed)        una cama africana, un piso con lona
```

| instalación | estantes | posiciones | bandejas |
|---|---|---|---|
| cama africana, piso con lona | ninguno | la cama misma, sin nivel ni puesto | **ninguna**: el lote está en la cama, como hoy |
| cuarto oscuro, invernadero, toldo con bandejas | uno o varios | **generadas**: niveles × puestos por nivel | una por posición |

- **El estante es un tipo de ubicación nuevo, `drying_rack`**, hijo de una instalación.
- **Al crearlo se dan sus niveles y sus puestos por nivel, y las posiciones se crean solas.** El cuarto oscuro I son dos estantes de 6 × 6, así que 72 posiciones sin teclear ninguna.
  - **Ampliar** un estante crea las posiciones que falten.
  - **Nunca se borra** una posición con historia: una bandeja que estuvo allí tiene que seguir pudiendo decir dónde estuvo.
- **La posición** es una `drying_bed` hija del estante, con `rackLevel` (ya existe) y **`rackSlot`**, el puesto dentro del nivel, que es nuevo.
  - Nivel y puesto `> 0` en la base, como ya lo es el nivel.
  - Una posición es **única** en su estante por (nivel, puesto): índice único en la base.
- **Sustituye a la «fila» que traía la versión anterior de esta spec.** Con el plan de secado delante, la fila del cuarto **es** el estante: «2 filas» son dos estantes. Añadir `rackRow` además de `rackSlot` sería decir lo mismo dos veces.
- **La sombra de arriba**, en la instalación **y** en la cama o posición:
  - `shadePercentage`, la columna que ya existe y usan las parcelas;
  - y **`shadeDescription`**, nueva: qué la da, en texto libre.
  - Una cama sin sombra propia se **enseña** con la de su instalación y marcada como tal. **No se copia.**

### 4.2 La bandeja: su tipo, su número, dónde está

- **La bandeja es un `Equipment` de `kind = vessel`**, como ya decía esta spec. Gana dos columnas:
  - **`trayTypeId`**: su tipo.
  - **`trayNumber`**: el consecutivo **único en la organización**. Una finca es una organización; hoy la única es Finca Rosina. Se enseña como **B-001**.
  - Las dos, **sólo en recipientes**, por `CHECK`.
- **El tipo de bandeja, `DryingTrayType`**, es de la organización:
  - un nombre («4×2 pies»);
  - **ancho y largo en centímetros**, `> 0` y con un decimal;
  - la unidad en que se tecleó (`ft` o `cm`), que se conserva como manda `00_conventions` §1.
  - **El área no se guarda**: se deriva de ancho × largo, que es lo único medido.
- **Registrar bandejas va en tanda:** «40 bandejas de 4×2 pies en el beneficio» crea B-0xx … consecutivas, cada una con su alta como primer traslado al sitio.
  - El siguiente número se toma **dentro de la transacción**.
  - El índice único cierra la carrera de dos tandas a la vez.
- **Dónde está una bandeja** en un momento = su último `EquipmentTransfer` hacia una posición. **Moverla es un traslado**, con quién y cuándo, como ya decía esta spec.
- **Una posición aloja una bandeja a la vez.** Dos a la vez se enseñan como **conflicto de datos**, sin bloquear.
- **El QR** sigue el diseño de los envases de insumos (#365) y va con su propio plan. El número ya permite escribir la etiqueta a mano.

### 4.2b Cuánto café cabe: medido por estado, con el estimado marcado

**El pesaje de bandeja cargada, `DryingTrayWeighing`**, es el protocolo de §7 del plan de secado hecho registro:
- el tipo de bandeja;
- **el estado del café**: `CHERRY`, `MUCILAGE_HONEY` o `PARCHMENT`, del enum `MaterialState` que ya existe (cereza entera, mucílago, lavado);
- **el peso neto** en kg, con tres decimales;
- **la profundidad en 3 o 4 puntos**, en cm;
- cuándo, quién, y **el lote con el que se pesó**. **Obligatorio**, corregido al planear: el protocolo de §7 pesa café de un lote («repetir en lotes distintos»), y el lote es lo que da el permiso —quien lo gestiona pesa— y el camino de vuelta de la cifra. La primera redacción decía «si se pesó con uno»; sin lote no habría a quién preguntarle el permiso.

Es `measured_fact`, y no se edita: una corrección es un registro nuevo que supersede (`00_conventions` §4).

**La densidad y la capacidad se derivan, no se guardan:**
- densidad = kg ÷ (área × profundidad media);
- capacidad de un tipo y un estado = área × profundidad media × densidad media de **sus** pesajes;
- se enseña **con cuántos pesajes** se calculó (`21_rubrica_veracidad` §1: `DERIVADO`, con sus insumos navegables).

**Sin pesajes de ese estado:**

| estado | qué se enseña |
|---|---|
| cereza | el estimado del plan de secado, **400 kg/m³ a 2,8 cm**, etiquetado **«estimado, sin medir»** (`SUPUESTO`) y con su fuente |
| mucílago, lavado | **«sin medir»**, sin número. El plan de secado no da densidad para ellos y no se inventa una (`21_rubrica_veracidad` §2.1) |

El estimado de cereza es configuración marcada `[PROVISIONAL]`, no un literal (`00_reglas_del_modulo` §1).

### 4.3 El lote en sus bandejas

**`DryingRunTray`** (nombre a contrastar con `03`) — qué bandejas lleva una corrida:

| campo | nota |
|---|---|
| `dryingRunId`, `equipmentId` | la corrida del lote y la bandeja |
| `desde`, `hasta` anulable | cuándo se cargó y cuándo se bajó |
| `provenanceClass`, `createdBy` | como el resto |

**Reglas en la base, no sólo en TypeScript:**

- una bandeja **lleva un solo lote a la vez**: no puede tener dos filas abiertas (`hasta` nulo) al mismo tiempo — índice único parcial o restricción de exclusión, el plan elige con su sonda;
- el equipo tiene que ser `kind = vessel` — mira otra tabla, así que va por **disparador**, como ya hizo la spec del 2026-09-15 con sus validaciones cruzadas.

**`DryingRun.dryingBedLocationId` se queda.** Sigue diciendo la cama de un lote que no usa bandejas —afuera—. Una corrida con bandejas deja ese campo nulo y declara sus bandejas; **una corrida con las dos cosas se rechaza**, porque diría dos verdades distintas sobre dónde está el lote.

### 4.4 La humedad y los volteos, por bandeja

- **`SamplingEvent` gana `trayEquipmentId` anulable.** La inspección puede ser de una bandeja. Sigue valiendo **D1** de la spec del 2026-09-15 —dos muestras por inspección, tres medidas por muestra que el aparato promedia— y **D2** —zonas o réplica, lo declara quien mide—.
- **La lectura del lote entero** —se mezcla grano de varias bandejas— se registra como inspección **sin bandeja** y se enseña **marcada como mezcla**, nunca como si fuera de una bandeja.
- **`DryingTurnEvent` gana `trayEquipmentId` anulable.** Un volteo sin bandeja es de la cama o del lote entero, como hoy.
- **La vista del lote** enseña cada bandeja con su última humedad, su posición y su dispersión. «El nivel alto va más seco» sale de poner las bandejas juntas, **no se calcula ni se afirma**.

### 4.5 El ambiente, a mano

**`LecturaDeAmbiente`** (nombre a contrastar con `03`; `CLAUDE.md` §7 lo llama *EnvironmentalObservation*):

| campo | nota |
|---|---|
| `locationId` | **la instalación** |
| nivel y fila | **opcionales**: si se tomó en un punto concreto del estante |
| `occurredAt`, operador | como el resto |
| temperatura | °C del aire, con unidad |
| humedad relativa | %, con unidad |
| cielo | catálogo de Daniel: **soleado, parcialmente nublado, nublado, lluvia**, más nota libre, **nunca en su lugar** |
| ventilación | catálogo de Daniel: **abierto, semiabierto, cerrado, ventilador / deshumidificador**, más nota libre |
| **fuente** | **`manual`** hoy. Va como columna aunque sólo tenga un valor, porque `CLAUDE.md` §7 exige **no mezclar fuentes como si fueran equivalentes**: el día que llegue un registrador, sus filas se distinguen de las de una persona sin migrar las viejas |
| `provenanceClass`, `createdBy` | como el resto |

**Cada bandeja ve la lectura más cercana de su instalación**, con su hora: «cuarto oscuro, nivel 3: 24 °C, 61 % HR, hace 2 h». **Nunca se interpola** un valor para el nivel de la bandeja a partir de otros niveles, y una lectura vieja dice su edad en vez de pasar por actual.

**No es el sensor de la receta.** La humedad relativa del aire va aquí; la humedad del grano va en `Measurement`. La spec del 2026-09-15 ya señaló que hoy son la misma fila sin nada que las distinga, y esto las separa.

### 4.6 La frecuencia en la receta, por tramos

**`TramoDeSecado`** (nombre a contrastar con `03`), en la versión de receta:

| campo | nota |
|---|---|
| `recipeVersionId`, `orden` | a qué receta y en qué orden |
| `accion` | **medir humedad** o **voltear** |
| `cadaHoras` | **0 = no se exige** en este tramo |
| cierre | **exactamente uno**: `hastaHoras` (desde el inicio del secado) **o** `hastaHumedad` (% de grano). El **último** tramo puede no tener cierre |

**Reglas en la base:** `cadaHoras ≥ 0`; exactamente un cierre salvo en el último tramo; `hastaHumedad` dentro del rango de la variable `moisture` de `lib/traceability/units.ts`.

**Por qué no basta `ProcessTarget.everyHours`:** sirve para medir **una variable**, y voltear no lo es; y no tiene tramos. Estirarlo para las dos cosas haría que una fila de «objetivo de pH» pudiera significar también «voltear», que es la clase de columna que miente según quién la lea.

### 4.7 Al iniciar y en marcha

- **Al iniciar el secado** se copian los tramos de la receta a la corrida. Si quien inicia cambia alguno, **escribe la razón**, y la corrida guarda **qué decía la receta y qué se usó**.
- **En marcha**, el encargado cambia la frecuencia con razón: se cierra la fila vigente y se abre otra con su `desde`. **No se reescribe la historia**: la pregunta «¿qué tocaba el martes a las 10?» tiene respuesta.
- **Cada bandeja avanza de tramo con su propia humedad.** Sin lectura de humedad de esa bandeja, **un tramo que cierra por humedad no avanza solo**, y la pantalla lo dice: «tramo 1 hasta 25 % — sin lectura de esta bandeja».
- **Lo debido** —«bandeja 4: voltear cada 2 h, último hace 3 h»— se calcula con la misma forma que `estadoDeRitmo` en `lib/traceability/ritmo.ts`. El plan decide si se reutiliza esa función con la bandeja como sujeto o si hace falta una hermana; **no se escribe una tercera regla de «debido»**.

### 4.8 En el tablero

Lo debido de §4.7 entra en la cola del tablero (#363 §4.2) **como una lectura debida más**: sube el lote a «Aviso» y la fila dice qué bandeja y qué acción. Y la línea por etapas (#363 §4.5) cuenta en «secado» las bandejas, no sólo los lotes: «6 camas y 14 bandejas ocupadas».

## 5. Pruebas

**Reglas en la base, cada una con su sonda que prueba que lo válido sí entra:**

- una bandeja con dos lotes abiertos a la vez → rechazada;
- un `DryingRunTray` con un equipo que no es `vessel` → rechazado;
- una corrida con cama **y** bandejas → rechazada;
- un tramo con `hastaHoras` **y** `hastaHumedad` → rechazado; uno sin ninguno que no sea el último → rechazado; `cadaHoras` negativo → rechazado;
- nivel o fila negativos → rechazados.

**Comportamiento:**

- una bandeja movida dos veces responde dónde estaba en cada momento;
- dos bandejas en la misma posición al mismo tiempo → conflicto, sin repartir nada;
- la lectura de ambiente de otro nivel **no** se presenta como la del nivel de la bandeja; una lectura de hace 9 h dice su edad;
- tramo por humedad sin lectura → no avanza y lo dice; con lectura bajo el umbral → avanza **sólo esa bandeja**, y la vecina más húmeda sigue en el tramo anterior;
- cambiar la frecuencia al iniciar sin razón → rechazado; con razón → la corrida guarda receta y usado;
- `cadaHoras = 0` → nada queda debido; el control es el mismo tramo con 2, que sí queda debido;
- una lectura de humedad del lote entero se enseña **como mezcla**, y no cuenta para el tramo de ninguna bandeja.

**Flip-tests**, contra el commit, con las tres cosas de la casa —sha antes y después, compila, qué prueba cae por su nombre—:

1. quitar el índice que impide dos lotes en una bandeja → cae la prueba de la bandeja doble;
2. hacer avanzar un tramo por humedad con la humedad del **lote** en vez de la de la bandeja → cae la prueba de la vecina;
3. interpolar el ambiente al nivel de la bandeja → cae la prueba del otro nivel;
4. tratar `cadaHoras = 0` como «cada 0 h, siempre debido» → cae la prueba del cero.

**Toda prueba con base va declarada** en `scripts/pruebas-por-compuerta.txt`, grupo `base-sembrada`; si no, cae en el carril hermético por omisión. `npm run build` en toda tarea que toque TypeScript, y al final `npm run verify`, `bash scripts/ci.sh` y `npm test`.

**Y aprueban también los documentos normativos del beneficio**: `03_public_api.md` para cada nombre nuevo, y `21_rubrica_veracidad.md` y `22_rubrica_pedagogica.md` con el mismo peso que el funcional. Lo debido tiene que decir **qué hacer y qué pasa si no**, no sólo que algo falta.

## 6. Orden

1. **Este spec**, PR sólo de documentación.
2a. **Instalaciones, estantes, bandejas y capacidad** (§4.1, §4.2, §4.2b): los dos ambientes, la sombra, el estante con sus posiciones generadas, los tipos de bandeja, el registro numerado en tanda, y el pesaje con su capacidad. Sin esto no hay dónde poner una bandeja.
2b. **El lote en sus bandejas** (§4.3): `DryingRunTray` con sus reglas, cargar y bajar —la última cierra el secado—, dónde está cada una y sus conflictos.
3. **Humedad y volteos por bandeja** (§4.4).
4. **Ambiente a mano** (§4.5). Independiente de 2 y 3: puede ir en paralelo. — **plan: `docs/superpowers/plans/2026-09-21-secado-4-ambiente-a-mano.md`; construido en la rama `plan-ambiente-a-mano` (ADR-185)**.
5. **Tramos, inicio y marcha** (§4.6, §4.7), y su entrada en el tablero (§4.8), que espera a que el tablero (#363) exista.
6. Fusiones y despliegues: **decisión de Daniel**.

## 7. Abierto

- **Los nombres de la tercera ronda: aprobados por Daniel el 2026-09-18** y declarados en `docs/beneficio/03_public_api.md` §11, cada uno en el commit que lo introdujo (`00_reglas_del_modulo` §7.6):
  - `drying_rack`;
  - `rackSlot`;
  - `DryingTrayType`;
  - `trayTypeId` y `trayNumber` en `Equipment`;
  - `DryingTrayWeighing`;
  - `shadeDescription`.

  Los de la segunda ronda (`african_bed_outdoor`, `floor_tarp`, `DryingRunTray`) ya estaban aprobados. **`rackRow` queda retirado** (§4.1). Construidos en el paso 2a: ADR-179.
- **Cómo se marca que una bandeja llegó a meta.** Daniel decidió que el secado termina bandeja a bandeja (§2). Lo que **no** decidió, y el plan del paso 2 no lo supone: si bajar una bandeja pide sólo cerrar su `DryingRunTray.hasta` o también dejar escrito con qué humedad bajó. Es una pregunta de modelo, no de dominio: el plan la resuelve con `13_drying_moisture.md` (`TARGET_REACHED` exige humedad **y** actividad de agua) y la enseña antes de construir.

Cerradas el 2026-09-18 y movidas a §2: cómo termina el secado de un lote en bandejas, «una bandeja por posición» (era un supuesto y ahora es decisión) y los catálogos de cielo y ventilación.

## 8. Fuera de alcance

Registradores y sensores conectados —la columna de fuente los deja preparados, sin construirlos— · importar CSV de un registrador · la secadora mecánica y sus parámetros · el reposo y la trilla (su propia spec del 2026-09-16) · un umbral de humedad «bueno»: los umbrales son de Daniel y siguen `[PROVISIONAL]` (`P-F`).
