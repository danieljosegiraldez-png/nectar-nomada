# De la recepción a los lotes: cada proceso un lote, y la calidad pedida

**Estado:** diseño aprobado por partes por Daniel el 2026-09-19; este documento, pendiente de su
revisión.

Pieza 3 de 3 del flujo finca → beneficio. La pieza 1 (`2026-09-18-jornada-y-entrega-de-cosecha-design.md`)
deja cada entrega enviada; la pieza 2 (`2026-09-19-recepcion-de-cereza-en-beneficio-design.md`) la
recibe. Ésta convierte lo recibido en lotes.

**El propósito es la trazabilidad.** Daniel, 2026-09-19: «de una recepción se pueden correr muchos
diferentes procesos, y cada uno se ve como un lote». Desde cualquier lote se tiene que poder volver
a sus recepciones, y de ahí a su entrega, jornada, parcela, bloque o planta y recolector, o a su
proveedor.

## 1. Lo que dijo Daniel (2026-09-19)

| pregunta | respuesta |
|---|---|
| cuándo nace el lote | **al iniciar un proceso**: se eligen recepciones (enteras o por kilos) y el proceso que se les corre |
| dónde entra la selección | **después, sobre el lote** (flotación, manual, madurez…), como ya existe |
| qué pasa con los rechazos | **cada corriente, su propio lote**, con su categoría y su origen |
| qué es «maduro» para el pedido | **lo aceptado en la selección**; verde y flotes, sus rechazos |
| cuándo se juzga el pedido | **en la primera selección** de un lote atribuible; una segunda no lo cambia |
| un lote que mezcla pedidos | **se avisa y no se atribuye**: un pedido podría tapar el incumplimiento del otro |
| las vías viejas | **se retiran** en esta pieza, sin tocar los datos |

## 2. Lo que hay hoy (medido sobre `origin/main`, 2026-09-19)

- **La selección ya existe:** `recordSelection` (`lib/traceability/selection.ts`) registra sobre un
  lote el método (catálogo `seleccion_metodo`: flotación, manual, madurez, densidad, color,
  óptica), lo aceptado y **cada rechazo con su peso y su categoría** (catálogo
  `rechazo_categoria`: flotadores, cereza verde, sobremadura, broca, moho, materia extraña…).
  Es una `LotTransformation` de tipo `selection`, conservativa en `balance.ts`: aceptado +
  rechazos + merma declarada tiene que dar el insumo.
- **Cada rechazo nace como lote propio**, con su código derivado (`codigosDerivados.ts`).
- **Los procesos ya existen:** `abrirProceso` (`lib/traceability/lotProcess.ts`) con su intención
  obligatoria, su grado (`grado_proceso`: natural, lavado, semi wash, honey), el estado de la
  cereza y su receta opcional; un lote no tiene dos procesos abiertos a la vez.
- **`createLot`** (`lib/traceability/lots.ts`) crea el lote con código, tipo, organización y, si se
  sabe, proyecto y ubicación.
- **Lo que NO existe:** ninguna relación entre un lote y las recepciones de las que sale. Hoy el
  lote nace en `recordHarvestEvent` (registrar cosecha) o en `recordReceivingEvent` (la recepción
  vieja, una recepción = un lote). En la copia local restaurada hay **34 `HarvestEvent`** y **0
  `ReceivingEvent`**.
- **La pieza 2 dejó una comprobación pendiente a propósito:** anular una recepción «sólo mientras
  no haya salido ningún lote». El vínculo no existía; esta pieza lo crea y cierra esa regla.

## 3. Diseño

### 3.1 De qué recepciones sale un lote

- **`LoteDesdeRecepcion`**, una fila por recepción que entra en el lote:
  - el lote, la recepción y **los kilos tomados** (> 0);
  - único por (lote, recepción): una recepción entra una vez en el mismo lote.
- **Los kilos no se inventan:** la suma de lo tomado de una recepción, en todos los lotes, no pasa
  de su neto. Se comprueba en el servicio con la fila de la recepción **bloqueada**
  (`SELECT … FOR UPDATE`), y un disparador lo vuelve a comprobar al insertar y al actualizar.
- **Sólo cereza recibida:** la recepción tiene que estar `recibida`. Una `rechazada` o `anulada`
  no entra (CHECK imposible entre tablas → disparador).
- **Anular una recepción con cereza ya tomada se rechaza** (`ya_tiene_lotes`), en el servicio de la
  pieza 2 y en un disparador. Es la regla que la pieza 2 dejó anotada como pendiente.

### 3.2 Armar el lote

- Un solo acto, en una transacción: `armarLote(user, { beneficioId, codigo, recepciones: [{ recepcionId, kg }], proceso })`.
  - `proceso` son los campos que ya pide `abrirProceso`: intención, grado, estado de la cereza y
    receta opcional;
  - crea el `Lot` (`lotType: "cherry"`, la organización del beneficio, `locationId` = el
    beneficio), sus `LoteDesdeRecepcion`, el `QuantityEvent` de entrada con la suma de los kilos, y
    abre el proceso;
  - AuditEvent de cada escritura, en la misma transacción.
- **Permiso:** `lot:manage` sobre el beneficio, el mismo que recibir. **La regla de dos personas no
  se extiende aquí:** es del doble peso, no de armar un lote.
- **El código del lote** lo escribe quien arma, como hoy en el resto del sistema; su unicidad por
  organización ya la impone la base.
- Errores con nombre: `sin_recepciones`, `kg_invalidos`, `kg_sobre_lo_recibido`,
  `recepcion_no_recibida`, `recepcion_de_otro_beneficio`, `codigo_repetido`.

### 3.3 La selección, y el veredicto del pedido

- **La selección no cambia.** Se registra sobre el lote con `recordSelection`, igual que hoy.
- **El veredicto** se guarda en `VeredictoDeCalidadDePedido`, una fila por lote:
  - el lote, la transformación de selección que lo produjo y, si es atribuible, el pedido;
  - `maduroPct`, `verdePct`, `flotesPct`, todos sobre el **insumo de la selección**
    (`inputQuantity`): maduro = lo aceptado; verde = la suma de los rechazos de categoría
    `cereza_verde`; flotes = los de `flotadores`;
  - `cumple` (o `null` cuando no es atribuible) y `motivo` cuando no cumple o no se atribuye.
- **Cuándo:** al registrar la **primera** selección del lote. Una segunda selección del mismo lote
  no lo cambia y se dice así en la pantalla.
- **Atribuible** = todas las recepciones del lote apuntan al **mismo** pedido. Si mezclan pedidos, o
  alguna no tiene, el veredicto se guarda con `pedidoId` nulo, `cumple` nulo y el motivo «lote de
  varias fuentes».
- **Cumple** = `maduroPct ≥ minMaduroPct` (si el pedido lo fija) **y** `verdePct ≤ maxVerdePct`
  **y** `flotesPct ≤ maxFlotesPct`. Un límite que el pedido no fijó no se juzga. Comparaciones en
  enteros (centésimas de punto), como `cantidadDelPedido` de la pieza 2.
- **No bloquea nada:** es un veredicto que se ve, no una compuerta. Es la misma regla que el doble
  peso de la pieza 2.

### 3.4 Pantallas

- **`/beneficio/recepcion`, bloque «Armar lote»:** lo recibido con cereza disponible (neto menos lo
  ya tomado), con su origen; se eligen recepciones o kilos, el proceso y su intención, y el código.
  Si las recepciones elegidas son de pedidos distintos, **avisa antes de armar** que la calidad no
  será atribuible.
- **Ficha del lote:** «De dónde viene», con cada recepción, sus kilos y, detrás, su entrega,
  parcela, bloque o planta y recolector, o su proveedor.
- **Al registrar la selección:** el veredicto, con los tres porcentajes y el límite pedido.
- **`/beneficio/pedidos`:** cada pedido, con el veredicto de sus lotes.

### 3.5 Las vías viejas se retiran

- Se quitan **`/lots/new`** (registrar cosecha y la recepción de proveedor) y sus dos formularios;
  la cereza entra sólo por jornada → entrega → recepción → lote.
- **Los datos viejos no se tocan ni se migran.** Los 34 `HarvestEvent` siguen ahí, y sus lotes se
  siguen viendo y procesando como hasta hoy.
- `recordHarvestEvent` y `recordReceivingEvent` quedan **sin pantalla**; se marcan en su comentario
  como camino retirado, y sus pruebas siguen (son la red de los datos que ya existen).
- El enlace «Registrar una cosecha» ya se quitó de `/finca` el 2026-09-19 (PR #442).

## 4. Fuera de esta pieza

- Vender o despachar un lote de rechazo (flotes comerciales): ya existe el camino de lotes.
- Repartir la calidad proporcionalmente entre pedidos mezclados: Daniel eligió no atribuir.
- El secado, el reposo y lo que sigue: ya existen.
- Migrar los datos viejos.

## 5. Pruebas que tienen que existir

- **Base:** tomar más kilos de los que tiene una recepción se rechaza; una recepción rechazada o
  anulada no entra en un lote; la misma recepción dos veces en el mismo lote se rechaza; lo válido
  entra (control positivo).
- **Armar:** dos recepciones de 20 y 30 kg dan un lote de 50 con su proceso abierto; tomar 10 de
  una de 20 deja 10 disponibles; dos armados simultáneos sobre la misma recepción no pasan de su
  neto; un Farm Manager de otra finca no arma lotes en este beneficio; una recepción de otro
  beneficio se rechaza.
- **Anular:** anular una recepción con cereza ya tomada se rechaza en el servicio **y** en la base;
  sin lotes, se sigue pudiendo.
- **Veredicto:** un lote de un solo pedido con 80 % aceptado, 10 % verde y 10 % flotes contra un
  pedido que pide ≥ 75 % maduro y ≤ 12 % de cada uno **cumple**; con 20 % de verde **no cumple** y
  lo dice; un lote que mezcla dos pedidos sale no atribuible; una segunda selección no cambia el
  veredicto; un límite que el pedido no fijó no se juzga.
- **Genealogía:** desde el lote se llega a la entrega, la parcela y el recolector (una prueba que
  recorre la cadena entera, y su control: un lote de proveedor llega al proveedor).
- **Retirada:** `/lots/new` ya no está en el inventario de rutas, y los lotes viejos con
  `HarvestEvent` se siguen leyendo.
