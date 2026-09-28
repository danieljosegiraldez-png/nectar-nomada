# La cola de secado y el ritmo por fase — diseño

Daniel recorrió la aplicación el 2026-09-27 con una cuenta de operario y con una base de
demostración construida paso a paso por los servicios. Su encargo, en sus palabras: **«ver muchos
procesos o secados y manejos y no perder ojo al detalle y ser práctico y organizado logísticamente
hablando»**, y para el operario de secado, **«poder ver la cola de trabajo, que le indique
ordenado por urgencia, qué se debe hacer cuándo»**.

Lo que hay hoy no es un hueco de datos: es un hueco de lectura. El programa sabe casi todo lo que
hace falta para decir qué toca ahora, y no lo dice en ninguna pantalla.

## Sus cinco decisiones, 2026-09-27

| # | decisión |
|---|---|
| 1 | El ritmo sale **de la receta, con fase**: a cada objetivo se le añade si es de fermentación o de secado |
| 2 | En la cola, cada fila es **el área, con lo suyo dentro** — el cuarto, sus camas y zarandas, y en cada una su lote |
| 3 | Sube a lo alto lo que el **reloj de la receta** pide, y lo que está **cerca del objetivo** de humedad. No el clima, no el descuido |
| 4 | La tanda **la propone el sistema** —lo que debe volteo ahora— y el operario desmarca y confirma |
| 5 | Un proceso abierto en cereza se cierra con **la humedad de un lote descendiente** |

La 3 rechazó dos candidatas a propósito: el clima del cuarto (las lecturas de ambiente son manuales
y espaciadas, siete en cuatro días en la demo, así que la señal sería irregular) y el tiempo sin que
nadie mire (que era la red para los lotes sin receta declarada). **Cómo se cubre esa red sin esa
señal:** `ritmo.ts` ya trata «no se sabe» como distinto de «va bien» —`demora` es `null`, no
`false`— así que esos lotes se ordenan por horas en fase y la fila dice **«sin receta declarada»**
en vez de parecer puntual.

## Lo que ya existe, medido sobre `origin/main` en `49ffccb3`

- **`lib/traceability/ritmo.ts` calcula exactamente la cola que se pide** — `demora` (¿lleva más
  horas en la fase de las que la receta dice?), `debidas` (¿cuántas lecturas de cada variable
  deberían existir ya?) y `puntajeDeUrgencia` para ordenar. Su cabecera guarda la auditoría de
  Daniel del 2026-09-13 con la frase «la lista es una cola de trabajo, no un inventario».
  **Sus únicos consumidores son sus pruebas**: buscados los dos símbolos exportados en todo el
  repositorio, sólo aparecen en `tests/traceability/ritmo.test.ts`.
- **El panel del operador ya existe** en `/lots` y agrupa «fermentando», «secando», «necesita una
  medición» y «esperando análisis sensorial». Pero «necesita una medición» usa
  `ATTENTION_MEASUREMENT_STALENESS_HOURS = 24` (`lib/traceability/lots.ts:788`), un umbral fijo que
  su propio comentario llama *placeholder*, y **no mira la receta**.
- **El formulario de volteo existe y está enterrado**: `recordDryingTurnFormAction` se pinta en
  `app/lots/[id]/page.tsx:1150`, de 1418 líneas, una unidad a la vez.
- **`DryingTurnEvent` es una fila por corrida de secado.** No hay ninguna noción de tanda; revolver
  seis zarandas son seis registros que nada agrupa. Buscado `tanda|batchTurn|grupoDeVolteo` en
  `lib/`, `app/` y el esquema: sólo aparece en el apiario, que sí tiene tandas
  (`docs/superpowers/specs/2026-09-18-alzas-y-tandas-de-marcos-design.md`), así que la forma ya
  está en casa.
- **Una corrida de secado va en cama o en bandejas, nunca en las dos**: `cargarBandeja` rechaza con
  `corrida_con_cama` si la corrida tiene `dryingBedLocationId`
  (`lib/traceability/bandejasDelSecado.ts:224`).
- **La ocupación de una bandeja ya está en la base y nadie la lee**: `DryingRunTray` tiene corrida,
  equipo, `desde` y `hasta`, y `lib/equipos/bandejas.ts` no menciona `dryingRunTray` ni una vez
  (control: menciona `equipment` ocho veces). Por eso la lista de bandejas dice que las ocho están
  «en Finca Rosina» cuando cuatro tienen café encima.
- **`ProcessRecipeVersion` ya trae la maquinaria del ritmo**: `expectedHours` en la versión y
  `everyHours` por objetivo, validado con `cadence_only_while_running` — sólo se admite en el
  momento `during`.
- **`LotProcess` ya cuelga de una versión de receta**, así que la receta puede hablar del proceso
  entero y no sólo de la fermentación. Lo que no puede es decir de qué fase habla cada objetivo:
  `ProcessTarget` tiene `moment` (`initial` / `during` / `final`) y ninguna columna de fase.
- **`DryingRun` y `RoastSession` no tienen versión de receta** (medido: 0 menciones de
  `processRecipeVersionId` en sus modelos), y **`DryingRun` no tiene ningún campo de frecuencia de
  volteo** — sólo la relación `turningEvents`.
- **El cierre del proceso exige una humedad del mismo lote**: `cerrarProceso` lanza
  `measurement_belongs_to_another_lot`, y `opcionesParaProceso` sólo ofrece
  `where: { lotId, variable: "moisture" }`. Como la fermentación crea un lote nuevo de pergamino, un
  proceso abierto en cereza **no se puede cerrar desde la pantalla**. Medido en la demo: el lote del
  proceso tiene **0** mediciones de humedad, así que el formulario de cierre no ofrece ninguna
  opción.
- **El recorrido de la ascendencia que hace falta para la decisión 5 ya está escrito**:
  `tieneSecadoTerminadoArriba` en `lib/traceability/samples.ts` sube por las transformaciones hasta
  seis niveles buscando una fase de reposo.
- **La humedad objetivo es un número, no un rango**: `LotProcess.targetMoisturePct`, validado como
  porcentaje. Daniel trabaja con 9–12 %.
- **El vocabulario de proceso no tiene dos de los que Daniel nombra.** `grado_proceso` trae
  `Washed`, `Natural`, `Honey`, `Semi Wash 50%` y `Semi Wash 75%`; faltan «naked fermentation» y
  «receta especial». Son valores de catálogo, no código.
- **La ventilación es un solo valor**: `DryingVentilation` = `open` / `semi_open` / `closed` /
  `fan_or_dehumidifier`. No distingue abanico de deshumidificador de aire acondicionado.
- **El ambiente sólo se registra en un `drying_facility`**: `puedeRegistrarAmbienteEn` lo exige
  (`lib/traceability/ambiente.ts:49`), así que **el ambiente de afuera no tiene dónde vivir**.

## A. El modelo

### A.1 Los objetivos de la receta llevan fase

`ProcessTarget` gana `phase`, con los valores `fermentation` y `drying`.

**El supuesto que hay que medir antes de escribir la migración**, y que nadie debe dar por hecho:
que todos los objetivos existentes son de fermentación, porque es la única fase que tenía receta.
Se cuentan primero —objetivos agrupados por si su versión de receta aparece en `FermentationRun`,
en `LotProcess` o en ninguno— y el resultado se escribe en el plan. Si alguno cuelga de una receta
usada en otra parte, se para y se pregunta. La migración rellena `fermentation` en las filas
existentes **sólo si esa cuenta lo respalda**.

### A.2 La duración y el ritmo se declaran por fase

Tabla nueva, una fila por fase de una versión de receta:

| campo | qué dice |
|---|---|
| `recipeVersionId` + `phase` | a qué receta y a qué fase |
| `expectedHours` | cuánto debe durar esa fase |
| `turnEveryHours` | cada cuántas horas se voltea, sólo con sentido en `drying` |
| `targetMoistureMinPct`, `targetMoistureMaxPct` | el rango por defecto de esa fase |

`ProcessRecipeVersion.expectedHours` se queda donde está y significa lo que siempre significó: la
duración de la fermentación. Una fila de fase para `fermentation` lo sustituye cuando exista; **no
se migra a ciegas**, por la misma razón que A.1.

### A.3 La humedad objetivo pasa a ser rango

`LotProcess` gana `targetMoistureMinPct` y `targetMoistureMaxPct`. `targetMoisturePct` se conserva
—es dato registrado y no se reescribe historia— y significa lo que se declaró aquel día. Cuando el
proceso tiene rango, el rango manda; cuando sólo tiene el número, la pantalla lo dice así.

El rango es lo que alimenta el estado `cerca del objetivo` y el estado `listo`.

### A.4 El cierre acepta la humedad de un descendiente

`cerrarProceso` deja de exigir que la medición sea del mismo lote: acepta cualquiera de la
descendencia del lote del proceso, recorriéndola con el mismo ayudante que ya usa la muestra verde.
`opcionesParaProceso` ofrece las mismas, cada una diciendo **de qué lote es** — porque una humedad
de un lote que no es el que abrió el proceso tiene que verse como lo que es.

Sigue prohibido cerrar con una medición que no sea de humedad, y con una de otra rama.

### A.5 La tanda es una entidad

Tabla nueva `DryingTurnBatch`: hora, persona, nota, procedencia. Cada `DryingTurnEvent` gana
`turnBatchId`, anulable —los volteos que ya existen no pertenecen a ninguna tanda, y eso es la
verdad, no un hueco—.

Un volteo suelto sigue siendo posible y no crea tanda. La tanda escribe **un** evento de auditoría
con la lista de unidades, y cada volteo conserva el suyo.

### A.6 La ocupación no necesita nada nuevo

`DryingRunTray` ya lo dice. Falta leerlo.

## B. La pantalla

Maqueta con los datos de la demo: el lienzo «Cola de secado»
(`https://claude.ai/artifact/LMGcbgbzz4dVEHeGLg3QjC`), tres tableros — escritorio, teléfono y la
ficha de la zaranda con su gráfica.

### B.1 La cola, en `/beneficio/secado`

Es la pantalla de inicio del operario de secado, no una herramienta escondida. De fuera hacia
dentro: **área** con su línea de resumen y su último ambiente; dentro, sus **unidades físicas**
—camas y zarandas— y en cada una su lote.

Cada fila dice, en este orden: unidad · lote · proceso · día dentro de lo declarado · cuánto hace
del último volteo · humedad con su dirección · estado. En el teléfono la fila se parte en dos
líneas, la casilla es de 26 px y el estado queda a la derecha.

**Los estados, con nombre y no sólo con color** —en el patio, a pleno sol, un matiz no sobrevive, la
misma regla que ya gobierna la pantalla de equipos y el inventario—:

`al día` · `le toca volteo` · `debe lectura` · `va tarde` · `cerca del objetivo` · `listo` ·
`sin receta declarada`

**El orden** sale de `puntajeDeUrgencia`, que ya existe, más la cercanía al rango. Un lote sin
receta se ordena por horas en fase y lleva su estado propio.

**Filtro por proceso** —lavado, natural, honey, semi-lavado— porque es como Daniel agrupa el
trabajo. Y una unidad libre se ve, con desde cuándo: saber qué hay disponible es la otra mitad de la
logística.

### B.2 Los dos actos, distintos a propósito

- **«Revolví éstas»** — la cola llega con lo que debe volteo **ya marcado**. El operario desmarca lo
  que no tocó y confirma. Un acto, una tanda, sin abrir ninguna pantalla.
- **«Medir»** — abre el formulario en cascada **ya rellenado** con esa unidad, su lote, su corrida y
  la hora; ahí sí se piden zona de muestreo, instrumento y foto. Medir sigue siendo **opcional** y
  en cualquier momento, en cereza o en pergamino.

### B.3 La ficha de la unidad, en `/beneficio/secado/[unidad]`

**Qué es `[unidad]`**, porque las dos clases de unidad se nombran distinto y dejarlo a medias
produciría dos rutas: una **bandeja** es un equipo numerado y se dirige por su número, `B-001`, que
es lo que está escrito en la zaranda y lo que el operario teclearía; una **cama** es un lugar y se
dirige por el id de ese lugar, porque su nombre no es único entre fincas. La ruta acepta las dos
formas y la pantalla dice cuál está mirando.

Arriba, una sola respuesta: qué tiene encima, desde cuándo, qué día va de los declarados, su
humedad contra el rango y qué le toca. Después, cinco cifras: humedad, rango, volteos con el
último, ritmo declarado y peso neto con el de entrada.

La gráfica, un eje de tiempo y cinco series, todas con datos que ya existen:

| serie | forma | por qué así |
|---|---|---|
| humedad del grano | puntos | son lecturas sueltas; una línea inventaría lo que pasó entre ellas |
| rango objetivo | banda sombreada | el objetivo es una zona |
| peso neto de la bandeja | cifras, no curva | cuatro pesajes no hacen una curva |
| temperatura y humedad relativa del cuarto | línea | de las lecturas de ambiente |
| volteos | marcas verticales | un gesto, no una medición |

Debajo, los actos en orden inverso con su hora, su persona, su instrumento y su nota, y cuándo entró
y salió el café.

### B.4 La lista de bandejas dice si están ocupadas

`/beneficio/bandejas` gana una columna: con qué lote está, desde cuándo, o libre desde cuándo. Sale
de `DryingRunTray`, que ya lo sabe.

## C. Cómo se comprueba que funciona

Cada pieza con su guardia, y cada guardia con su mutación. **Ningún guardia entra sin su flip-test
sobre un árbol que compila.**

1. **El ritmo por fase se usa de verdad.** Prueba con base: una receta con objetivos de secado
   (`turnEveryHours: 4`) y un lote con su último volteo hace 19 h → la cola lo marca
   `le toca volteo`. Mutación: quitar la fase del objetivo → la prueba cae por su nombre.
2. **`ritmo.ts` deja de estar suelto.** Guardia de arquitectura: `estadoDeRitmo` y
   `puntajeDeUrgencia` tienen al menos un consumidor fuera de `tests/`. Es el guardia que habría
   evitado tener la cola calculada y sin pintar durante dos semanas. Mutación: borrar el import de
   la pantalla → cae.
3. **Sin receta no se finge puntualidad.** Un lote sin fase de secado declarada sale como
   `sin receta declarada`, y **no** como `al día`. Mutación: hacer que `demora` nulo cuente como
   falso → cae. Es la regla de la casa: ausencia no es cero.
4. **La tanda es un acto.** Marcar tres unidades escribe una tanda, tres volteos que la referencian
   y **un** evento de auditoría con las tres. Mutación: escribir los volteos sin tanda → cae.
5. **La tanda propuesta es la debida.** Con dos unidades vencidas y tres al día, la cola llega con
   dos marcadas. Control positivo: si todas están al día, ninguna viene marcada, y el botón lo dice
   en vez de registrar una tanda vacía.
6. **El cierre acepta el descendiente y sólo el descendiente.** Cierra con la humedad del pergamino
   nacido de ese proceso; rechaza la de un lote de otra rama con su error propio. Mutación: aceptar
   cualquier lote → cae la segunda.
7. **La ocupación se lee.** La lista de bandejas dice el lote de una bandeja cargada, y «libre» de
   una que no. Mutación: devolver siempre el último traslado → cae.
8. **Lo que no puedes hacer no se ofrece**, que ya es guardia en el repositorio
   (`tests/arquitectura/accion-que-no-puedes-no-se-ofrece.test.ts`): la cola es de lectura para
   quien ve lotes, y los botones de revolver y medir sólo para quien puede escribir.

Y la verificación que no es una prueba: **recorrer la cola en la copia de demostración**, con la
cuenta del operario, antes de decir que está hecho. La demo ya tiene los datos: cuatro zarandas
cargadas, seis volteos, cuatro pesajes, humedad 24 → 13 % y siete lecturas de ambiente.

## Lo que este diseño NO hace, y hay que decirlo antes de empezar

1. **No dibuja el ambiente de afuera.** Sólo se puede registrar en un lugar de tipo cuarto de
   secado, y el patio no lo es. Meter una instalación falsa para colgar el dato sería mentirle al
   modelo. Decidir dónde vive el ambiente exterior es su propia conversación.
2. **No separa abanico de deshumidificador de aire acondicionado.** Hoy los tres son un solo valor
   de ventilación. Separarlos es vocabulario nuevo y toca la escritura de ambiente.
3. **No baja el volteo a la bandeja.** El volteo es por corrida, así que cuatro zarandas de la misma
   corrida comparten la cuenta. La pantalla lo dirá con palabras en vez de dar una cifra que no es.
4. **No añade «naked fermentation» ni «receta especial»** al vocabulario de proceso. Son valores de
   catálogo y entran por su propio camino, con la decisión de Daniel sobre cómo se llaman.
5. **No toca el tueste.** `RoastSession` sigue sin receta, así que el tueste sigue sin ritmo ni
   objetivos. Es el mismo hueco que este diseño cierra para el secado, y merece su propio turno.
6. **No arregla el panel de `/lots`.** Su umbral fijo de 24 h se queda mientras la cola de secado
   viva aparte; cuando ésta funcione, ese grupo debería leer el ritmo o desaparecer, y eso se decide
   viéndolas juntas.

## Por qué en este orden

El ritmo por fase (A.1, A.2) va primero porque sin él no hay nada que ordenar ni que proponer: la
cola sería otra lista. El rango de humedad (A.3) va con ellos porque `cerca del objetivo` es la
mitad de la urgencia que Daniel eligió. La tanda (A.5) va después de la cola, porque la cola es
donde se marca. Y el cierre del proceso (A.4) es independiente de todo lo anterior: se puede hacer
primero, solo, y arregla hoy un proceso que hoy no se puede cerrar.
