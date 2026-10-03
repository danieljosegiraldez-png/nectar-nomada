# Una selección no resta: microlote, bloque y planta nombran parte de la rejilla de su lote — diseño

**Fecha:** 2026-10-03 · **Camino:** arquitectónico · **Estado:** pendiente de revisión escrita de
Daniel · **Medido sobre:** `origin/main` = `203d9236`

**De dónde sale.** Daniel, el 2026-10-03, con la metáfora del lego: «solo funciona si conectan las
celdas del lego». Sus palabras, la parte que manda:

- «decir finca no dice más que una organización» — finca no es un nivel de espacio;
- «al identificar lote, hay un espacio… no depende de definir el metraje de ese espacio, solamente
  cuantas plantas y espacio aprox de densidad de plantas»;
- «microparcela o microlote **no como una parte del lote, es una selección del lote**», y «el lote
  sigue relevante»;
- «igual lo minucioso y detallado de un especimen, es solo relativo de la atención y vista a ese
  nivel de acción e impacto».

---

## 1. Lo que este encargo NO es, medido antes de diseñar

**El modelo ya implementa el principio en el esquema.** Esto no es un rediseño: es cerrar los huecos
de algo construido. Medido sobre `203d9236`:

| pieza | cómo dice dónde está | dónde |
|---|---|---|
| parcela | declara su rejilla: origen, hileras, plantas por hilera, separación | `schema.prisma:916-919` |
| microparcela | su **rango** dentro de la rejilla de **su madre** | `schema.prisma:925-928` |
| bloque (trampa o ensayo) | uno o varios **rangos** de la rejilla de la parcela | `model PlotBlockRange`, `schema.prisma:7110` |
| planta | su **celda**: `gridRow`, `gridPosition` | `model Specimen`, `schema.prisma:6980` |
| el conector | ella, sus antepasados y sus descendientes | `lib/traceability/ubicacionesEmparentadas.ts:16` |

Y la regla de solapes ya es la de esta casa: **se avisa, no se rechaza** —«un ensayo que se solape
con una trampa es una decisión del agrónomo, no un error de captura», `lib/traceability/plotBlocks.ts:241`—
con una sola excepción, dos trampas sobre la misma celda, que impone el disparador
`traceability.exigir_trampas_sin_solape`. La migración `20261002040000_las_tres_reglas_que_faltaban`
lo extendió el 2026-10-02 a las trampas de **microparcelas hermanas**, «porque D3 dice que la
numeración es UNA, la de la parcela» — que es exactamente el conector del lego.

**Y nada de eso se ha usado todavía.** Consultado en solo-lectura sobre la copia restaurada
(`nectar_test`, cuya última migración aplicada es la del 2026-10-02, así que el cero no es un
respaldo viejo):

| | |
|---|---|
| parcelas (`location_type = 'plot'`) | **38** |
| de ellas, con rejilla declarada | **0** |
| microparcelas (plot con madre plot) | **0** |
| filas en `plot_block` / `plot_block_range` | **0** / **0** |
| filas en `specimen` | **0** |

Control de que la consulta medía: 38 `plot` de 71 `location` en total. **No hay datos que migrar**,
y por eso este diseño puede exigir cosas que mañana costarían una migración de datos.

---

## 2. La regla

> **Una selección no resta.** Un microlote, un bloque o una planta nombran **parte de la rejilla de
> su lote**, y el lote sigue respondiendo por lo que ocurre en ellos. Lo que cambia entre niveles es
> el **nivel de atención, acción e impacto**, no la identidad: la misma planta es «hilera 12, planta
> 30» del lote mire quien mire.

**Va de ADR en `docs/architecture/DECISIONS.md`**, que es donde este repositorio guarda las reglas de
modelo que el esquema cita —D3, D5 y D7 viven ahí— y no en `docs/dominio/`, que es literatura del
dominio. **El número se asigna en el último momento, antes de fusionar**, no al escribir el plan: dos
sesiones que numeran a la vez chocan, y eso ya pasó con `D-019`.

El último ADR sobre `203d9236` es el **195**, así que será el **196** salvo que otra rama llegue
antes. El plan tiene que nombrar ese paso explícitamente o nadie distinguirá «sin hacer» de «hecho y
sin rastro».

### 2.1 El corolario que caza errores: las áreas no se suman

Si el rendimiento del lote incluye el de su microlote, el **divisor sigue siendo las hectáreas del
lote**. La microparcela está *dentro*, no *al lado*: sumar las dos áreas sería tratarla como una
parte, que es el error que la regla existe para impedir. Esto se dice en el ADR y se prueba con un
guardia, porque es el fallo que un lector apresurado introduce al implementar el enrollado.

### 2.2 Qué hechos enrolla el lote, y cuáles no

Decisión de Daniel, 2026-10-03: **lo que cruza físicamente el límite, más la producción y las
plantas.**

| hecho | ¿el lote responde por su microparcela? | hoy |
|---|---|---|
| intervenciones y su carencia | **sí** | ya |
| floración | **sí** | ya |
| cosecha (comprobación de carencia) | **sí** | ya |
| rendimiento | **sí** | **no** |
| cohortes de siembra y eventos de producción | **sí** | **no** |
| especímenes y trampas | **sí** | **no** |
| muestras, calicatas de suelo, fotos, jornadas de campo | **no** — se toman en un punto y son de ese punto | ya |
| bloques | **no** — un bloque es una selección de SU parcela; listarlo en la madre lo haría parecer suyo | ya |

Las tres que ya enrollan son las tres donde algo cruza: un producto aplicado y su carencia, una
floración, un residuo. Las cuatro que no, son observaciones de un punto. **Esa frontera se escribe en
el ADR**: hoy no está dicha en ninguna parte, y por eso parecía un olvido en vez de una decisión.

---

## 3. Los tres huecos, con ruta y rechazo exacto

### 3.1 El enrollado

Son **cinco** consultas con `where: { locationId }` **pelado**, no cuatro: cuatro en `getPlotDetail`
(`lib/traceability/plantingCohorts.ts:608`) y una aparte, porque las plantas se listan en otro
archivo. La quinta la encontró la autorrevisión de este spec, no la primera lectura.

| ruta | consulta | qué alimenta |
|---|---|---|
| `plantingCohorts.ts:655` | `plantingCohort.findMany` | cohortes y densidad |
| `plantingCohorts.ts:666` | `harvestEventSource.findMany` | el **rendimiento** |
| `plantingCohorts.ts:684` | `plantingEvent.findMany` | «entró en producción» |
| `plantingCohorts.ts:735` | `specimen.findMany` con `specimenType: "trap"` | las **trampas** |
| `specimens.ts:228` | `specimen.findMany` con `specimenType: "plant"` | las **plantas** |

Las cinco pasan a `{ in: await ubicacionesEmparentadas(locationId) }` — el mismo conector que ya
usan intervenciones (`intervenciones.ts:226`), floración (`floracion.ts:179`) y cosecha
(`harvest.ts:163`). No se escribe un segundo mecanismo: duplicar la regla es cómo se pierde.

**El rendimiento ya está medio preparado para esto y conviene no romperlo.** Se lee por
`HarvestEventSource` y no por `HarvestEvent.locationId`, con su motivo escrito en el código: «el
segundo es el lote principal de la cosecha, y una cosecha de varios bloques sólo nombra uno ahí».
Enrollar por `locationId` de las fuentes es la continuación correcta de esa decisión.

### 3.2 El rango obligatorio

`createMicrolot` (`lib/traceability/locations.ts:543`) hoy sólo exige nombre y rechaza un padre
`beneficio`. Gana tres rechazos, cada uno con su mensaje propio:

1. **la madre no declara rejilla** → no se puede situar nada en ella;
2. **el microlote llega sin rango** → una selección que no selecciona nada;
3. **el rango no cabe** en la rejilla de la madre → una selección fuera de lo que selecciona.

Y el esquema deja de aceptar el estado 2: los cuatro `range*` pasan de opcionales a obligatorios
**para una `Location` con madre `plot`**, impuesto por un `CHECK` como el que ya tiene la rejilla
(«los cuatro juntos o ninguno», `schema.prisma:913`). Con 0 microparcelas creadas, la migración no
toca ni una fila — y el `CHECK` se escribe acotado a ese caso, no a toda la tabla, porque una cama
de secado no tiene rango.

**El requisito previo tiene consecuencia de pantalla, y se dice:** ninguna de las 38 parcelas declara
rejilla hoy, así que «Nueva microparcela» (`app/plots/[id]/microparcela/nueva/page.tsx`) tiene que
explicar que primero hace falta numerar la parcela, con el enlace a hacerlo — no un error seco.

### 3.3 El vocabulario que hoy enseña lo contrario

| dónde | qué dice | por qué es falso |
|---|---|---|
| `schema.prisma:7066` | «**Subdivisión** con nombre de una parcela… Es una **ZONA, no una lista de plantas**» | sus rangos son coordenadas **de la parcela** —hilera y planta—, o sea una lista de plantas expresada por tramos; y no resta nada a la parcela |
| `schema.prisma:828`, enum `SubdivisionReason` (9 usos en `lib` + `app`) | `subdivisionReason` | el motivo por el que se **selecciona** un trozo, no por el que se parte |
| enum de tipos de `Location`, valor `micro_plot` | existe | **nada lo produce** (`schema.prisma:7057` lo dice). Se quita o se marca como muerto, pero no se deja ambiguo |

El comentario se reescribe citando el ADR. `subdivisionReason` pasa a `motivoDeLaSeleccion` y
`SubdivisionReason` a `MotivoDeSeleccion`, con sus cuatro valores intactos (`altitude`, `shade`,
`slope`, `other`): es un renombrado, no un cambio de dominio.

---

## 4. Lo heredado se marca, nunca se mezcla

Un hecho que llega de una selección **se pinta diciendo de dónde viene**. El rendimiento del lote
distingue **lo propio** de **lo de cada selección**, con su nombre, en vez de dar un agregado que
nadie puede desarmar.

No es estética: es la misma regla que esta casa aplica en `loteNoVisible` —una unidad ocupada por un
lote que no ves lo dice en palabras— y la que cerró `PENDING_IMPLEMENTATIONS/019` el mismo día que se
escribió este diseño. Un número agregado que no dice de qué está hecho es la forma de dato que este
repositorio persigue: **un total no es una medición si no se puede desarmar.**

---

## 5. Los guardias, y qué caza cada uno

| guardia | la mutación que tiene que hacerlo caer |
|---|---|
| una cosecha registrada en la microparcela **aparece** en el rendimiento de su madre | volver `harvestEventSource` a `where: { locationId }` pelado |
| y **se distingue** de lo propio de la madre, por nombre | fundir las dos cifras en un total |
| **las áreas no se suman**: el divisor del rendimiento por hectárea es el de la madre | sumar `areaHectares` de la madre y la hija |
| una trampa y una planta de la microparcela **aparecen** en su madre | volver cualquiera de las dos consultas de `specimen` a `locationId` pelado |
| una calicata, una foto o una muestra de la microparcela **NO** aparecen en la madre | enrollar también esas cuatro consultas |
| `createMicrolot` rechaza los tres casos, con mensaje distinto cada uno | quitar cualquiera de los tres rechazos |
| y **acepta** el caso que cabe | — es el control positivo: sin él los tres rechazos pasarían con una función que rechaza todo |
| el comentario del bloque cita el ADR y no dice «zona, no lista de plantas» | restaurar el comentario viejo |

**El control positivo de la cuarta fila es la fila que la hace medir**: una prueba que sólo comprueba
que algo NO aparece pasa igual si la madre no pinta nada. Tiene que haber una calicata de la MADRE
que sí aparezca al lado.

---

## 6. Lo que este diseño deja fuera, dicho para que no se cuente dos veces

- **La microparcela sigue siendo una `Location`.** Se consideró quitársela y modelarla como filas de
  rangos, igual que un bloque: es más literal al principio y tira el conector de enrollado, la
  herencia de permisos, el selector de cosecha y el vínculo de la cosecha, para ganar lo que la
  columna de rango ya da. Daniel eligió no hacerlo el 2026-10-03.
- **Las 38 parcelas sin rejilla no se numeran aquí.** Numerar una parcela es trabajo de campo con el
  dueño, no una migración. Lo que este diseño hace es que la pantalla lo pida cuando haga falta.
- **`PlotBlock` no enrolla.** Un bloque es una selección de su parcela; listarlo en la madre lo haría
  parecer suyo, que es el error simétrico al que arregla este diseño.
- **El metraje sigue siendo opcional.** `areaHectares` es `Decimal?` y así se queda: Daniel dijo que
  el espacio se describe por plantas y densidad. Lo que este diseño añade es que **no se suma**.
