# Insumos: envases perecederos, dosis y planificación — sobre el inventario con existencias

**Fecha:** 2026-09-17 · **Camino:** arquitectónico · **Estado:** **reconciliado el 2026-09-17** con `docs/superpowers/specs/2026-09-17-inventario-con-existencias-design.md`, ya fusionado en `main` (#375) · **Medido sobre:** `origin/main` = `10757ea`

> **Este spec cambió de forma, y conviene saber por qué.** Su primera versión (PR #365, del 2026-09-17 por la mañana) diseñaba **su propio** catálogo, sus lotes y su libro mayor. Mientras se revisaba, otra sesión fusionó **«Inventario con existencias»** con spec y plan: identidad de material, lote del proveedor y libro mayor que sólo se añade, con el saldo **derivado** al leer. Eso es la misma base que yo había diseñado, y es la que manda — está fusionada y con plan escrito.
>
> Lo que queda aquí es **sólo lo que ese inventario no cubre** y que Daniel pidió: los **envases** de lo que se degrada al abrirse, el **escaneo** al recibir, los **mínimos**, las **dosis por receta** y los **lotes planificados**. Todo aditivo. Nada de lo de abajo redefine una tabla que ya existe.

---

## 1. Qué pidió Daniel, y qué parte sigue sin cubrir

Daniel, 2026-09-16 (lo dijo en inglés; la cita es traducción): *«si necesito ciertos instrumentos o insumos como levadura, nutrientes o CO₂ para maceración carbónica»*. Y sobre las dosis: *«cada cosa tiene su uso y su dosis, desde el sanitizante Star San al peracético, a la limpieza con soda cáustica diluida; cada levadura tiene no sólo dosis sino también un envase, y una vez abierto puede volverse perecedero si no se usa en una ventana de días a meses, porque la población de células activas muere. Que podamos ser más eficientes con los insumos no significa que debamos poner en riesgo fermentaciones importantes.»*

| lo que pidió | quién lo cubre |
|---|---|
| saber **cuánto queda** de un material, y distinguirlo de «nadie lo ha contado» | **el inventario fusionado** — `ConsumableMaterial`, `ConsumableLot`, `ConsumableStockEvent`, saldo derivado con su `recorded` |
| que un saldo negativo **avise y no bloquee** | **el inventario fusionado**, §4 |
| que el consumo que ya se registra enganche con el inventario | **el inventario fusionado**, §5: `MaterialConsumptionEntry.consumableLotId` anulable |
| **un envase abierto que ya no sirve**, con su ventana de viabilidad | **este spec** |
| **escanear al recibir**, foto de la etiqueta y **QR propio por envase** | **este spec** |
| **mínimos** y el aviso de que algo se acaba | **este spec** (y cierra la decisión abierta 2 de aquel) |
| **dosis por receta** y la dosis realmente usada | **este spec**, PR B |
| **qué hace falta para los lotes que vienen** | **este spec**, PR C |

## 2. El mapeo, para que nadie construya dos veces

| lo que este spec proponía en su v1 | qué se usa ahora |
|---|---|
| `ConsumableItem` (catálogo) | **`ConsumableMaterial`**, con cinco campos añadidos — §3.1 |
| `ConsumableMovement` (libro mayor) | **`ConsumableStockEvent`**, tal cual. Sus tipos `received / consumed / reserved / released / waste / adjustment_*` **absorben** los motivos que yo proponía |
| saldo derivado sumando movimientos | **igual**, y mejor: aquel copia `recorded` de `computeLotBalance`, que distingue «nunca se contó» de «hoy es cero» |
| lote del proveedor | **`ConsumableLot`**, tal cual |
| `ConsumablePackage` (envase individual) | **se queda, como hijo de `ConsumableLot`** — §3.2. Es la pieza que aquel no tiene |
| `ConsumableSiteLevel` (mínimo por sitio) | **se queda** — §3.3, y depende de la decisión de §5 |
| coste | **el del inventario fusionado**, en `ConsumableLot`. Este spec no lo toca |

**Un lote no es un envase, y ésa es toda la diferencia.** `ConsumableLot` es *lo que llegó en una entrega*: veinte sobres de la misma levadura, mismo lote de fábrica, misma caducidad. El envase es *el sobre que alguien abrió el martes*. Con un solo nivel, dos sobres del mismo lote son indistinguibles — y el riesgo que Daniel nombró vive exactamente ahí.

## 3. Lo aditivo

### 3.1 Cinco campos en `ConsumableMaterial`

| campo | para qué |
|---|---|
| `gtin` | el código de barras del fabricante, único cuando existe: es lo que se escanea al recibir |
| `usualPackageSize` | tamaño habitual del envase, en la unidad por defecto del material |
| `degradesAfterOpening` | booleano. **Es el interruptor**: sólo lo que lo tiene en `true` se sigue envase por envase |
| `viableDaysAfterOpening` | **obligatorio si el anterior es `true`**, con `CHECK` en la migración: un material perecedero sin ventana declarada no se puede guardar |
| `storageNote`, `safetyNote` | «refrigerar»; «cáustico, usar guantes» |

Nada de esto cambia la forma del material ni su unidad: son columnas anulables sobre la tabla que el inventario ya crea.

### 3.2 `ConsumablePackage` — hijo de `ConsumableLot`, sólo para perecederos

`consumableLotId`, `sizeInBaseUnit`, `openedAt` (anulable), `labelPhotoAssetId` (anulable), `qrToken` (único).

- **Viable hasta** = la fecha más temprana entre la caducidad del lote y `openedAt + viableDaysAfterOpening`.
- **El estado no se guarda, se calcula:** sellado · abierto y viable · **vencido** · agotado · descartado.
- **Un envase vencido no cuenta como existencia usable**, y así se lee en pantalla: «descartar, no usar». El saldo del material sigue siendo el del libro mayor; lo que esta capa añade es **de qué parte de ese saldo se puede echar mano hoy**.
- Consumir de un envase escribe un `ConsumableStockEvent` de tipo `consumed` **con su `consumablePackageId`**: un campo anulable más en el evento, que es el único cambio de esta capa sobre el libro mayor.

### 3.3 Mínimos, y el aviso

`ConsumableMaterialLevel`: material, **sitio**, cantidad mínima. Único por par. Por debajo, aviso.

Esto **cierra la decisión abierta 2** del inventario fusionado —*«si el aviso de existencias bajas existe, y con qué umbral»*—: Daniel ya la contestó el 2026-09-17 al aprobar la v1 de este spec. **Existe, y el umbral es por material y por sitio**, escrito a mano, no calculado.

### 3.4 Recibir con escaneo, y el QR propio

Escanear el código del fabricante, o buscar por nombre → cuántos envases y de qué tamaño → si el material es perecedero: lote del proveedor y caducidad **una vez para toda la entrega** (eso es el `ConsumableLot`), foto de la etiqueta, y **un QR impreso por envase**, con `svgDeQr` de `lib/apiary/etiquetasQr.ts`, que ya existe.

Abrir es escanear ese QR. **El código del fabricante identifica el producto, no el envase** —rara vez lleva lote o caducidad—, y por eso el QR propio no es un adorno: sin él, dos sobres iguales son el mismo sobre para el sistema.

**En los dos teléfonos:** `BarcodeDetector` donde exista (Chrome en Android), y una biblioteca de lectura donde no (Safari en iPhone), elegida en el plan leyendo antes su licencia y su peso. La búsqueda por nombre funciona siempre.

## 4. Permisos — y cierra la decisión abierta 1 de aquel spec

Aquel pregunta: *«¿quién puede recibir y quién puede reconciliar? ¿Mismo permiso o distinto?»*. Distinto, y con la forma que este repositorio ya usa:

| permiso | qué permite | a quién |
|---|---|---|
| `consumable:view` | ver existencias, lotes y envases | Farm Operator, Farm Manager |
| `consumable:record` | **recibir, abrir, descartar** — rutina | Farm Operator, Farm Manager |
| `consumable:manage` | **catálogo, mínimos y reconciliar un negativo** | Farm Manager |

**Cuadrar un negativo es una afirmación sobre lo que pasó, no una anotación**, y por eso va al permiso del jefe. Es el mismo reparto que el beneficio acaba de estrenar con `location:create_site`, y el mismo argumento que aquel spec ya hace con `lot:release`.

## 5. Una decisión que el inventario fusionado deja abierta sin saberlo: **el sitio**

**Medido el 2026-09-17 sobre `main`:** ni el spec ni el plan de «Inventario con existencias» mencionan `locationId` en ninguna de las tres tablas. Ninguna vez. Así que el saldo que ese diseño deriva es **global**: dice cuánta gallinaza hay *en total*, no cuánta hay **en Cerro Azul** frente a **Las Nubes**.

Eso choca con dos cosas escritas antes:

- `docs/architecture/EQUIPMENT_AND_READINESS.md` §8, aceptado por **ADR-060**: *«el mismo consumible en tres sitios son tres saldos, no uno»*;
- los mínimos de §3.3, que sin sitio no pueden avisar de lo que falta **donde se va a usar**.

**Es aditivo y barato ahora, caro después:** un `locationId` anulable en `ConsumableStockEvent` —el sitio donde ocurrió el movimiento— convierte el saldo global en un saldo por sitio sin tocar nada más, y **nadie ha construido todavía** ese plan. Añadirlo cuando ya haya filas obliga a adivinar dónde estaba cada cosa.

**Decisión de Daniel, pendiente.** Si dice que no, este spec se ajusta: los mínimos pasan a ser por material y los avisos dejan de saber dónde falta. Se dice aquí en vez de construirlo a medias.

## 6. Reglas que esta capa añade a las de aquel spec

| situación | qué dice |
|---|---|
| abierto dentro de su ventana | abierto y viable, con la fecha en que deja de serlo |
| abierto fuera de su ventana, o lote caducado | **vencido: descartar, no usar** — y no cuenta como existencia usable |
| perecedero recibido **sin caducidad** | **caducidad desconocida** — nunca se lee como «bien» |
| material perecedero sin `viableDaysAfterOpening` | no se puede guardar (`CHECK` en la base, no sólo en TypeScript) |
| apertura anterior a la recepción, o futura | se rechaza al guardar |
| vence pronto | aviso a 14 días |
| «hoy» | el **día del sitio**, con `lib/time/diaDeHoy.ts`, que ya está en `main` desde #362 |
| saldo negativo | **lo que aquel spec ya decide**: se registra, se marca y se pide reconciliar. Esta capa no lo cambia |

## 7. Orden, ahora que hay dos specs

1. **El plan del inventario fusionado, sus seis tareas** —identidad, lote, libro mayor, negativos, engancharlo al consumo, y verlo—. **Es la base y va primero.** Nadie lo está ejecutando: medido el 2026-09-17, no hay PR abierto suyo.
2. **Antes de que empiece: la decisión del sitio** (§5). Es una columna en una tabla que aún no existe.
3. **PR A′ · esta capa:** los cinco campos, `ConsumablePackage`, los mínimos, y recibir/abrir/descartar con escaneo y QR.
4. **PR B · dosis:** cada línea de receta con su cantidad y su base —por kg de cereza, por tanda, por tanque, **por litro de solución**—, y la dosis realmente usada, enlazada al envase. La dosis de receta es el valor por defecto, el operador puede ajustarla, **se registra y nunca se bloquea**.
5. **PR C · lotes planificados:** necesidad contra existencia **viable en la fecha del lote** —un envase que vence antes no cuenta— y bloque de insumos en el tablero del beneficio (#363).
6. **De Daniel, antes de PR A′:** la lista real de insumos — nombre, tamaño de envase y días viables tras abrir. El catálogo nace vacío y no se inventa ningún producto ni ninguna dosis.
7. Fusiones y despliegues: **decisión de Daniel**.

## 8. Fuera de alcance

Compras, proveedores y órdenes de compra · reposición automática · valoración de inventario y contabilidad (el coste se guarda en `ConsumableLot` porque el contrato de investigación lo pide, y nada más) · lectura automática de la etiqueta con IA · reconstruir el histórico de texto libre · avisos empujados, que esperan a `Notification`.
