# La forma del lote y la densidad por marco — diseño

**Fecha:** 2026-10-02 · **Camino:** arquitectónico · **Estado:** **las cuatro decisiones las tomó Daniel el 2026-10-02**, una por una; este documento espera su revisión escrita antes de que haya plan.

**Corrige** `docs/superpowers/specs/2026-10-01-rejilla-y-bloques-design.md` (D1–D7), que **ya está implementado y fusionado**: PR #584, #586, #589 y #597–#601, `main` = `203d9236`. Ese documento no se reescribe; aquí se dice qué corrige y por qué.

**Medido contra** `main` = `203d9236`.

---

## 1. El problema, en una frase

El diseño del 2026-10-01 da por supuesto que un lote es un **rectángulo perfecto**, y sobre ese supuesto la pantalla afirma una capacidad que un lote irregular no sostiene.

## 2. De dónde sale: una contradicción dentro del documento aprobado

No es deriva del tiempo. Estaba ahí el día que se escribió, y se puede señalar con el dedo:

| dónde | qué dice | qué implica |
|---|---|---|
| §1 | «una parcela no tiene numeración, así que "hilera 12, planta 30" no nombra nada» | la rejilla es un **espacio de direcciones** |
| §4.1 | `plantsPerRow` = «cuántas plantas por hilera» | la rejilla es un **censo** |

La tarea 6 construyó la capacidad sobre la segunda lectura —`capacidad = rowCount * plantsPerRow`— y Daniel corrigió la premisa el 2026-10-02: **«a veces no es rectangular o cuadrado el lote, a veces puede variar unas columnas o filas»**.

Con la lectura de censo, una parcela de 10×20 a la que le falta una esquina dice **«caben 200 y hay 150 contadas: una diferencia de 50»** cuando la diferencia real es 20. Es una afirmación que no se puede sostener al desarmarla, que es exactamente lo que `docs/beneficio/21_rubrica_veracidad.md` prohíbe.

## 3. Las cuatro decisiones de Daniel, 2026-10-02

Continúan la numeración de D1–D7.

| nº | decisión |
|---|---|
| **D8** | **La rejilla es un tablero de direcciones, y la forma se declara aparte y es opcional.** `rowCount` × `plantsPerRow` es el **tamaño del tablero**, no un censo: puede haber celdas vacías. Sin forma declarada, la aplicación **no afirma capacidad**. |
| **D9** | **La forma son uno o varios rectángulos**, con la misma estructura que los rangos de bloque de D5, porque así se expresa todo: hileras de distinto largo, hileras desplazadas, y un hueco en medio por una roca. |
| **D10** | **La densidad sale del marco de plantación, y el área se deriva de la rejilla.** Diseñada = `10.000 / (plantSpacing × rowSpacing)`. Área plantada = celdas × marco. Real = contadas ÷ esa área. **No de `areaHectares`**, que en un lote irregular incluye la roca y el camino. |
| **D11** | **Marcar un bloque o una microparcela fuera de la forma se guarda y se avisa.** El límite duro sigue siendo el tablero. Una trampa en un claro es su sitio natural; declarar el claro como plantado para poder ponerla sería mentir. |

## 4. Lo medido, con su control

Nada de esto se dedujo del nombre de una variable.

| qué se preguntó | respuesta | su control |
|---|---|---|
| ¿de dónde sale la densidad hoy? | `computePlotDensity(cohorts, location.areaHectares)` — contadas ÷ área | se leyó la función entera, no la llamada |
| ¿cuántos consumidores de producción tiene? | **dos**: `lib/traceability/plantingCohorts.ts` y `lib/traceability/pendienteDeLaParcela.ts` (más 3 archivos de prueba) | búsqueda sobre `lib`, `app` y `tests`, los tres |
| ¿existen los dos metros del marco? | **sí**: `plantSpacingMeters` ya estaba en `Location` antes de este trabajo; `rowSpacingMeters` entró con la tarea 2 | §4.1 del documento anterior ya lo decía: «`plantSpacingMeters` ya está en `Location` y se queda como está» |
| ¿se puede mapear hasta el plantón? | **sí**: `Specimen` lleva `gridRow` + `gridPosition`, y a propósito **no** es excluyente con `sectorSimple` | se leyó el modelo entero, incluido el comentario de la línea 1513 del esquema |
| ¿el tablero limita dónde se pone un plantón? | **NO, y es una asimetría** — ver §7.3 | **0** disparadores sobre `traceability.specimen` en la migración de la rejilla, con el control de que el mismo archivo nombra `plot_block` 15 veces |

## 5. Lo que NO se toca

La mayor parte. Se dice explícitamente para que nadie lo vuelva a abrir:

- **Los tres disparadores de la tarea 2 y los cuatro de la tarea 8 se quedan como están.** El límite duro es el tablero, y ya lo imponen.
- **D1, D2, D3, D5, D6 y D7 se quedan.** D4 se matiza sólo para la forma (§7.4).
- **El rango de la microparcela sigue siendo opcional** (D3).
- **La trazabilidad no se toca.** Nunca fue el problema.
- **`PlotBlockRange` no cambia de estructura.** La tabla de la forma es su hermana, no su sustituta.

## 6. El modelo

Una tabla hija nueva, con la misma forma que `PlotBlockRange`:

| campo | nota |
|---|---|
| `locationId` | **la parcela que pone la numeración**, nunca una microparcela: D3 dice que la numeración es una sola |
| `rowFrom`, `rowTo` | hileras, enteros desde 1 |
| `plantFrom`, `plantTo` | plantas dentro de la hilera, enteros desde 1 |

Cero filas significa **forma sin declarar**, que no es lo mismo que un lote vacío (ADR-080). Varias filas: su **unión** es lo plantado.

La unión se calcula con `celdasEnComunConVarios` de `lib/territorio/rejilla.ts`, que **ya está en `main`** desde el PR #600: compresión de coordenadas, así que no cuenta dos veces una celda que está en dos rectángulos. Ése fue un defecto real de la tarea 5 —sumaba intersecciones y decía 70 donde había 50— y por eso la función existe ya probada.

## 7. Las reglas

### 7.1 La capacidad, y cuándo NO se afirma

```
con forma declarada:  capacidad = |unión(forma) ∩ ámbito|
sin forma declarada:  no hay capacidad; se dice el tamaño del tablero y lo contado
```

El «ámbito» es el rango de la microparcela si lo declaró, y el tablero entero si no.

Eso exige **un estado nuevo** en `ComparacionDeLaRejilla`, junto a los cinco que ya tiene (`sin_rejilla`, `sin_rango`, `sin_cohortes`, `conteo_incompleto`, `ok`): **`sin_forma`** —ese nombre, no otro— que pasa el tamaño del tablero y lo contado **y ningún número de diferencia**. Hoy ese caso cae en `ok` y da una diferencia que no se sostiene.

### 7.2 Marcar fuera de la forma

Vuelve por el canal de `avisos` de `TraceabilityActionState`, que **ya existe** desde el PR #600 y se pinta con `role="status"`, separado de los errores con `role="alert"`. Es la misma forma que D7 usa para los solapes permitidos, a propósito: dos conductas parecidas no deben contarse de dos maneras.

### 7.3 La asimetría del plantón — un guardia que falta

Medido: el disparador `location_exigir_rejilla_sin_huerfanos` impide **encoger** el tablero por debajo de una planta existente, y nombra cuál («una planta en la hilera 9, planta 12»). Pero **no hay ningún disparador sobre `traceability.specimen`**, así que hoy se puede crear un plantón en la hilera 99 de un lote de 10 hileras y nadie dice nada.

El guardia existe en un solo sentido, y es la misma clase de defecto que la tarea 8 cerró para los rangos de bloque: una restricción que vive en TypeScript —o que sólo se comprueba al encoger— no existe para la base. Entra un disparador `BEFORE INSERT OR UPDATE` sobre `specimen` que rechace una coordenada que el tablero no tiene.

**Esto vale más que el resto del documento**, porque es lo que hace fiable la respuesta a «¿se puede mapear las plantas?». Sí se puede — y hasta que exista ese guardia, se puede también mapearlas donde no existen.

### 7.4 Encoger la forma

D4 dice que encoger la rejilla sólo se puede si nada queda fuera. La **forma** no es un límite duro (D11), así que encogerla **avisa** en vez de rechazar: «quedan 12 plantas fuera de la forma declarada». Rechazar obligaría a declarar como plantado un terreno que no lo está.

## 8. La densidad

Tres cifras, cada una con su procedencia dicha, que es la regla del §3 de este repositorio:

| cifra | de dónde sale | qué contesta |
|---|---|---|
| **diseñada** | `10.000 / (plantSpacing × rowSpacing)` | a qué densidad se sembró |
| **área plantada** | celdas de la forma × (`plantSpacing × rowSpacing`) | cuánto terreno hay de verdad bajo planta |
| **real** | plantas contadas ÷ área plantada | qué hay en pie |

La diferencia entre la diseñada y la real **es señal agronómica**: plantas que faltan o que se murieron. No es un error de cuadratura.

`computePlotDensity` tiene **dos consumidores de producción**, uno de ellos el cálculo de lo pendiente de la parcela. **No se cambia a ciegas:** entra una función nueva al lado, se migran los dos consumidores uno a uno con su prueba, y la vieja se retira cuando no queda ninguno. Cada paso conserva los estados de «no medido» que la función ya tiene bien puestos (`sin_area`, `conteo_incompleto`, `area_no_positiva`), porque son la parte buena de lo que hay.

## 9. Las pantallas

1. **Declarar la forma** de la parcela: añadir y quitar rectángulos, con el total de celdas a la vista. Mismo patrón que `RangosDeBloqueForm`, que entró con el PR #600.
2. **El rango de la microparcela**, que el §6 del diseño del 2026-10-01 pedía y **nunca se construyó**. Sin ella, `sin_rango` es un estado al que no se puede salir desde la aplicación.

Las dos con `CampoNumerico`, porque girar la rueda sobre un `<input type="number">` con foco cambia su valor, y en un formulario de campo eso convierte «no se midió» en otro número.

## 10. Qué corregir del documento del 2026-10-01

No se reescribe; se corrige en su sitio y se dice aquí:

- **§4.1**: `plantsPerRow` ya no es «cuántas plantas por hilera» sino **el ancho del tablero**. **La columna no se renombra** —tocaría migración, código y mensajes— así que se corrige el texto, el comentario del esquema y el rótulo de la pantalla. Queda anotado que el nombre es más estrecho que su significado.
- **§1 gana la frase que faltaba**: la numeración nombra celdas; cuáles están plantadas es otro dato.

## 10.5 El orden, porque una parte no depende de las demás

**§7.3 —el disparador del plantón— es independiente de todo lo demás y se puede entregar sola.** No necesita la tabla de la forma, ni el estado nuevo, ni las pantallas: es un disparador sobre `specimen` que compara contra `rowCount`/`plantsPerRow`, que ya existen en `main`. Y es la única parte de este documento que arregla algo que **hoy ya puede ocurrir**: un plantón mapeado en una celda que no existe.

Va primero. El resto se encadena: la tabla de la forma (§6), la capacidad honesta (§7.1), la densidad (§8) —que necesita las celdas de la forma para derivar el área—, y las pantallas (§9) al final.

## 11. Lo que queda fuera a propósito

- **Dibujar la forma sobre un mapa.** Se declara con números. Un lienzo es otro proyecto.
- **Deducir la forma de los plantones ya registrados.** Tentador y falso: la ausencia de un plantón registrado no dice que no haya planta (ADR-080).
- **Renombrar `plantsPerRow`.** §10.
- **Tocar `densityNote`**, la columna que guarda «a cierta distancia entre tantos plantones» como texto. Es la frase del dueño y se queda; las cifras de §8 no la sustituyen.

## 12. Cómo se sabrá que funciona

Cada guardia con la mutación que dice atrapar, y la mutación quita **la conducta**, no el token con el que casa el detector:

- Quitar el estado `sin_forma` y ver caer la prueba que afirma que **sin forma no hay número de diferencia**. Sin esa prueba, volver al `ok` de hoy pasa desapercibido.
- Una forma de dos rectángulos que comparten celdas: la capacidad es la **unión**, no la suma. El control es una forma donde los dos números difieren — si coinciden, la prueba no mide.
- El disparador del plantón, por los dos caminos: `INSERT` con `gridRow` fuera del tablero, y `UPDATE` que lo mueva fuera. Un disparador que sólo cubre el `INSERT` se lee igual que uno completo.
- La densidad diseñada con un marco conocido: 1,8 × 2,5 da 2.222 plantas/ha. El control positivo es un marco distinto que **tiene** que dar otro número.
- El aviso de D11 con su caso negativo: un bloque enteramente dentro de la forma **no** debe avisar. Sin ese caso, un aviso que se emite siempre pasa por bueno.
