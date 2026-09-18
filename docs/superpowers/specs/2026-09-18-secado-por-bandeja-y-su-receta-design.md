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

**Abierta, sin decidir:** cómo **termina** el secado de un lote repartido en bandejas —bandeja a bandeja, todo junto, o a criterio del encargado—. La pregunta se hizo el 2026-09-18 y **Daniel no la contestó**; no se supone. Ver §7.

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

### 4.1 Las instalaciones

`DryingEnvironment` gana dos valores: **cama africana a la intemperie** y **piso con lona**. Los nombres exactos se contrastan con `docs/beneficio/03_public_api.md` en el plan, que es el contrato de nombres.

**La forma varía por instalación, y el modelo lo aguanta sin ramas:**

| instalación | posiciones | bandejas |
|---|---|---|
| cama africana afuera, piso con lona | `drying_bed` sin nivel ni fila | **ninguna**: el lote está en la cama, como hoy |
| invernadero, cuarto oscuro | `drying_bed` con **nivel y fila** | una bandeja por posición |

### 4.2 La posición y la bandeja

- **`drying_bed` gana `rackRow Int?`**, al lado de `rackLevel`. Anulable por la misma razón que el nivel: una cama de patio no está en ningún estante. Nivel y fila, **no negativos**, en la base.
- **La bandeja es un `Equipment` de `kind = vessel`.** Su número va en el nombre y su **QR propio** sigue el mismo diseño que los envases de insumos (#365): una etiqueta que el celular escanea para abrir esa bandeja, no un código que identifica por sí mismo.
- **Dónde está una bandeja** en un momento = su último `EquipmentTransfer` hasta ese momento, hacia una `drying_bed`. **Moverla de nivel o fila es un traslado**, con quién y cuándo. No hay historial nuevo que construir.
- **Una posición aloja una bandeja a la vez.** Dos bandejas en la misma posición al mismo tiempo se enseñan como **conflicto de datos**, igual que dos corridas en un tanque (#363 §4.3), y no se reparte nada.

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
| cielo | catálogo corto: soleado, nublado, lluvia… más nota libre, **nunca en su lugar** |
| ventilación | catálogo corto: abierto, cerrado, ventilador… más nota libre |
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
2. **Bandejas y posiciones** (§4.1–§4.3): `rackRow`, los dos valores de instalación, `DryingRunTray` con sus reglas. Sin esto no hay dónde colgar lo demás.
3. **Humedad y volteos por bandeja** (§4.4).
4. **Ambiente a mano** (§4.5). Independiente de 2 y 3: puede ir en paralelo.
5. **Tramos, inicio y marcha** (§4.6, §4.7), y su entrada en el tablero (§4.8), que espera a que el tablero (#363) exista.
6. Fusiones y despliegues: **decisión de Daniel**.

## 7. Abierto

- **Cómo termina el secado de un lote en bandejas.** Bandeja a bandeja —cada una que llega a meta baja sola y el lote cierra con la última—, todo junto, o a criterio del encargado. Se preguntó y no se contestó; **se vuelve a preguntar antes del plan del paso 2**, porque decide si `DryingRunTray.hasta` basta o si cada bandeja lleva su propio resultado.
- **Los nombres** de todo lo nuevo, contra `03_public_api.md`.
- **Los catálogos de cielo y ventilación**: los valores los da Daniel; el diseño no los inventa.
- **«Una bandeja por posición» es un supuesto mío, no una decisión.** Es lo físico en un estante, y por eso §4.2 enseña dos bandejas en una posición como conflicto. Si en algún cuarto una posición lleva dos bandejas, esa regla se cambia antes del plan.

## 8. Fuera de alcance

Registradores y sensores conectados —la columna de fuente los deja preparados, sin construirlos— · importar CSV de un registrador · la secadora mecánica y sus parámetros · el reposo y la trilla (su propia spec del 2026-09-16) · un umbral de humedad «bueno»: los umbrales son de Daniel y siguen `[PROVISIONAL]` (`P-F`).
