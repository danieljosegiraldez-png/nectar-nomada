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

**Y eso vale después de divisiones y fusiones.** Sólo los lotes de nivel 1 llevan vínculo con las
recepciones; el origen de cualquier descendiente se obtiene **subiendo por el grafo de
`LotTransformation`** hasta los de nivel 1 (`origenDelLote`). Los kilos viven **sólo** en el nivel 1:
copiarlos a los descendientes contaría dos veces la misma cereza cuando dos ramas se vuelven a
juntar. Un lote que junta varias fincas o procesos devuelve varias, y así se muestra —la composición
que pide `20_modelo_ciclo_completo.md` §1.2–1.3—.

## 1. Lo que dijo Daniel (2026-09-19)

| pregunta | respuesta |
|---|---|
| cuándo nace el lote | **al armarlo** con recepciones (enteras o por kilos) |
| dónde entra la selección | **primero se selecciona, después el proceso**: el lote de cereza se limpia y el proceso —natural, lavado, honey— se abre sobre el lote **aceptado**. Corrige la primera respuesta del mismo día, cuando todavía no se sabía que la selección crea lotes nuevos |
| qué pasa con los rechazos | **cada corriente, su propio lote**, con su categoría y su origen |
| qué es «maduro» para el pedido | **lo aceptado en la selección**; verde y flotes, sus rechazos |
| qué representa el veredicto | **todo lo seleccionado del lote**: se suman sus selecciones y se recalcula |
| merma antes de armar | **se anota en la recepción, con motivo**, y deja de estar disponible |
| condición de pesaje en la selección | **sólo cuando el método es flotación**, que es la que moja la cereza; las demás no la piden |
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
- **La selección CREA los lotes de salida:** el aceptado y cada rechazo nacen con su propio código
  (`SelectionOutput.lotCode`). El café del lote de entrada sale de él.
- **Abrir un proceso exige** (`AbrirProcesoInput`): intención, grado, estado de la cereza, objetivo
  de humedad, hora de inicio y procedencia; receta y notas, opcionales.
- **`recordSelection` no anota la condición de pesaje**; `12_mass_balance_byproducts.md` §2 la pide
  para toda masa.
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
  de su neto **menos su merma**. El servicio bloquea la fila de la recepción
  (`SELECT … FOR UPDATE`); el disparador **bloquea esa misma fila él mismo** (`SELECT … FOR UPDATE`
  dentro del disparador) antes de sumar, porque si sólo sumara, dos inserciones simultáneas por
  otra vía no verían la del otro y las dos pasarían. Una suma sin bloqueo no es una garantía.
- **El vínculo es inmutable:** sus kilos no se editan y la fila no se borra (disparador de
  `UPDATE` y de `DELETE`). Bajarlos devolvería kilos que ya están en un lote y en todo lo que
  salió de él; borrarla borraría la evidencia que impide anular la recepción. Si el lote se armó
  mal, se corrige por el camino de lotes (transformaciones), no reescribiendo su origen.
- **Sólo cereza recibida:** la recepción tiene que estar `recibida`. Una `rechazada` o `anulada`
  no entra (CHECK imposible entre tablas → disparador).
- **Anular una recepción con cereza ya tomada se rechaza** (`ya_tiene_lotes`), en el servicio de la
  pieza 2 y en un disparador. Es la regla que la pieza 2 dejó anotada como pendiente.

### 3.2 La merma de una recepción

- **`MermaDeRecepcion`**: kilos (> 0), motivo (no vacío), quién y cuándo. Lo perdido antes de armar
  —derrame, mojado, descarte— deja de estar disponible, y la pérdida queda donde ocurrió.
- Exige `lot:manage` sobre el beneficio, con su AuditEvent. Es inmutable: se corrige anulándola con
  motivo, como el resto.
- **Disponible de una recepción** = neto − mermas vigentes − lo tomado por lotes.

### 3.3 Armar el lote

- Un solo acto, en una transacción: `armarLote(user, { beneficioId, codigo, recepciones: [{ recepcionId, kg }] })`.
  - crea el `Lot` (`lotType: "cherry"`, la organización del beneficio, `locationId` = el
    beneficio), sus `LoteDesdeRecepcion` y el `QuantityEvent` de entrada con la suma de los kilos,
    **cuantizada a 3 decimales** (`00_conventions.md` §1) antes de sumar;
  - **no abre proceso**: primero se selecciona (§3.4);
  - AuditEvent de cada escritura, en la misma transacción.
- **Permiso:** `lot:manage` sobre el beneficio, el mismo que recibir. **La regla de dos personas no
  se extiende aquí:** es del doble peso, no de armar un lote.
- **El código del lote** lo escribe quien arma, como hoy en el resto del sistema; su unicidad por
  organización ya la impone la base.
- Errores con nombre: `sin_recepciones`, `kg_invalidos`, `kg_sobre_lo_recibido`,
  `recepcion_no_recibida`, `recepcion_de_otro_beneficio`, `codigo_repetido`.

### 3.4 La selección, el proceso y el veredicto del pedido

- **La selección se registra sobre el lote de cereza** con `recordSelection`, que ya existe: método,
  aceptado y cada rechazo pesado, y cada salida nace como lote propio.
- **El proceso se abre sobre el lote ACEPTADO** (decisión de Daniel, 2026-09-19): «primero se
  limpia la cereza, después se fermenta». `abrirProceso` no cambia; lo que cambia es sobre qué lote
  se llama, y la pantalla lo ofrece ahí.
- **`recordSelection` gana la condición de pesaje** (`DRAINED` | `WET` | `DRY`), una por selección,
  guardada en su `LotTransformation`. **Obligatoria sólo cuando el método es `flotacion`**
  (decisión de Daniel, 2026-09-19, reconsiderando la respuesta anterior): es la que moja la cereza,
  y es donde un porcentaje puede ser agua en vez de calidad. Con cualquier otro método —manual,
  madurez, densidad, color, óptica— no se pregunta y queda nula.
  - Las selecciones ya guardadas no tienen ninguna: eso es **«sin declarar»**, nunca una suposición.
  - Se aparta de `12_mass_balance_byproducts.md` §2, que la pide para toda masa; la decisión y su
    alcance quedan anotados allí, junto a la de la recepción.
- **El veredicto** se guarda en `VeredictoDeCalidadDePedido`, **una fila por lote**, y se
  **recalcula** con cada selección de ese lote (decisión de Daniel: representa todo lo seleccionado,
  no la primera porción):
  - el lote, el pedido si es atribuible, y cuántas selecciones lo componen;
  - los kilos sumados: insumo, aceptado, verde (rechazos de categoría `cereza_verde`) y flotes
    (`flotadores`), sobre **todas** las selecciones del lote;
  - `maduroPct`, `verdePct`, `flotesPct` sobre el insumo sumado;
  - `cumple` (o `null`) y `motivo`.
- **Sólo los lotes de nivel 1** —los que tienen `LoteDesdeRecepcion`— llevan veredicto. Un lote que
  sale de una selección (el aceptado, un rechazo) **no genera uno nuevo**: volver a seleccionar café
  ya limpio daría un «cumple» sobre material depurado, que diría lo contrario de lo que pasó.
- **Atómico:** el veredicto se escribe en la MISMA transacción que la selección. Una selección
  guardada sin su veredicto sería una pantalla que miente.
- **Si dos selecciones del lote declaran condiciones de pesaje distintas**, el veredicto sale con
  `INCOMPARABLE_WEIGHING_CONDITION` y sin `cumple`: comparar mojado contra escurrido mide agua, no
  calidad (`12_mass_balance_byproducts.md` §2). Una declarada y otra sin declarar **no** es
  incomparable —no se sabe—, y sale como `CONDICION_SIN_DECLARAR`, también sin `cumple` cuando
  alguna fue por flotación.
- **Si el balance de la selección no cuadró** (discrepancia marcada, o aceptada con
  `acceptUnexplained`), el veredicto lo dice y **no** juzga `cumple`: un porcentaje sobre un balance
  descuadrado no sostiene una afirmación.
- **Atribuible** = todas las recepciones del lote apuntan al **mismo** pedido. Si mezclan pedidos, o
  alguna no tiene, el veredicto se guarda con `pedidoId` nulo, `cumple` nulo y el motivo «lote de
  varias fuentes».
- **Cumple** = `maduroPct ≥ minMaduroPct` (si el pedido lo fija) **y** `verdePct ≤ maxVerdePct`
  **y** `flotesPct ≤ maxFlotesPct`. Un límite que el pedido no fijó no se juzga.
- **Las comparaciones van sobre las masas en gramos enteros, sin redondear el cociente**:
  `aceptadoG × 10.000 ≥ insumoG × minMaduroBp` (y sus dos hermanas). Así 74,996 kg de 100 con un
  mínimo del 75 % **no** cumple, en vez de cumplir por redondeo. Los porcentajes que se muestran sí
  se redondean a dos decimales, y eso es presentación, no juicio.
- **No bloquea nada:** es un veredicto que se ve, no una compuerta. Es la misma regla que el doble
  peso de la pieza 2.

### 3.5 Pantallas

- **`/beneficio/recepcion`, bloque «Armar lote»:** lo recibido con cereza disponible (neto, menos su
  merma, menos lo ya tomado), con su origen; y «Anotar merma» con su motivo; se eligen recepciones o kilos, el proceso y su intención, y el código.
  Si las recepciones elegidas son de pedidos distintos, **avisa antes de armar** que la calidad no
  será atribuible. El lote nace sin proceso, y la ficha del lote ofrece «Registrar selección».
- **Ficha del lote:** «De dónde viene», con cada recepción, sus kilos y, detrás, su entrega,
  parcela, bloque o planta y recolector, o su proveedor.
- **Al registrar la selección:** si el método es flotación, se pide la condición de pesaje; sale el veredicto con los tres
  porcentajes, el límite pedido y cuántas selecciones lo componen. En el lote **aceptado**, el
  botón de «Abrir proceso».
- **`/beneficio/pedidos`:** cada pedido, con el veredicto de sus lotes.

### 3.6 Las vías viejas se retiran

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

- **Base:** tomar más kilos de los que tiene una recepción se rechaza; con merma anotada, el
  límite baja; una recepción rechazada o anulada no entra en un lote; la misma recepción dos veces
  en el mismo lote se rechaza; editar o borrar un vínculo se rechaza; lo válido entra (control
  positivo).
- **Armar:** dos recepciones de 20 y 30 kg dan un lote de 50, **sin proceso**; tomar 10 de
  una de 20 deja 10 disponibles; dos armados simultáneos sobre la misma recepción no pasan de su
  neto; un Farm Manager de otra finca no arma lotes en este beneficio; una recepción de otro
  beneficio se rechaza.
- **Anular:** anular una recepción con cereza ya tomada se rechaza en el servicio **y** en la base;
  sin lotes, se sigue pudiendo.
- **Veredicto:** un lote de un solo pedido con 80 % aceptado, 10 % verde y 10 % flotes contra un
  pedido que pide ≥ 75 % maduro y ≤ 12 % de cada uno **cumple**; con 20 % de verde **no cumple**;
  un lote que mezcla dos pedidos sale no atribuible; **una segunda selección del mismo lote
  recalcula** (1 kg limpio y después 99 kg con 30 % de verde → no cumple); el lote aceptado que se
  vuelve a seleccionar **no** genera veredicto; 74,996 de 100 con mínimo 75 % no cumple (el borde);
  dos selecciones por flotación con condiciones distintas salen incomparables, y una por flotación
  sin declarar sale sin juicio; una selección manual **no** pide la condición (control positivo:
  entra sin ella); una selección con
  balance descuadrado no juzga `cumple`; un límite que el pedido no fijó no se juzga.
- **Genealogía:** desde el lote se llega a la entrega, la parcela y el recolector; **y después de
  dividir y volver a fusionar**: A sale de la recepción R, se divide en B y C, y B y C se fusionan
  en D → `origenDelLote(D)` devuelve R **una vez**, con los kilos del nivel 1 y sin contarlos dos
  veces. Control: un lote de proveedor llega al proveedor.
- **Retirada:** `/lots/new` ya no está en el inventario de rutas, y los lotes viejos con
  `HarvestEvent` se siguen leyendo.
