# Insumos — diseño

**Fecha:** 2026-09-17 · **Camino:** arquitectónico · **Estado:** aprobado por partes en conversación, pendiente de revisión escrita · **Medido sobre:** `origin/main` = `d77db66`

**Alcance.** Pieza 2 de la capa de decisión (la 1 es el tablero del beneficio, PR #363). Se parte en **tres PR**, y este spec diseña a fondo el primero:

| PR | qué | depende de |
|---|---|---|
| **A · este spec en detalle** | catálogo, existencias por sitio, envases de lo perecedero, recibir / abrir / descartar / ajustar, escaneo y QR propio | nada nuevo; ver §8 |
| B | dosis en las recetas y la dosis realmente usada, enlazada al envase PR A. **No depende de ninguna rama**: el ritmo de receta que se creía pendiente ya estaba en `main` (#287) — ver §8 |
| C | lotes planificados: necesidad contra existencia **viable en la fecha del lote**, y bloque de insumos en el tablero del beneficio | que exista el tablero (#363) |

B y C tendrán su propia ronda corta de diseño. Aquí sólo se nombran para no cerrarles la puerta.

---

## 1. El problema

Daniel, 2026-09-16 (lo dijo en inglés; las dos citas de abajo son traducción): *«si necesito ciertos instrumentos o insumos como levadura, nutrientes o CO₂ para maceración carbónica»*.

Y, sobre las dosis: *«cada cosa tiene su uso y su dosis, desde el sanitizante Star San al peracético, a la limpieza con soda cáustica diluida; cada levadura tiene no sólo dosis sino también un envase, y una vez abierto puede volverse perecedero si no se usa en una ventana de días a meses, porque la población de células activas muere. Que podamos ser más eficientes con los insumos no significa que debamos poner en riesgo fermentaciones importantes, ni dejar de considerar ajustar la dosis y otras variables mientras se procesa.»*

Hoy el sistema **sólo sabe lo que se consumió**: `MaterialConsumptionEntry` guarda `materialName` y `batchLabel` como texto libre, colgando de una fermentación, un secado o una ubicación. No sabe qué hay, qué está abierto ni qué caduca. El esquema lo dice en un comentario: *not an FK to a Consumable entity — none exists yet*.

## 2. Lo que ya estaba decidido y este spec respeta

`docs/architecture/EQUIPMENT_AND_READINESS.md` §8, aceptado como insumo de planificación por **ADR-060**:

- los consumibles son un **tercer concepto de inventario**, distinto del inventario de SKU de Commerce y del inventario de lotes — *«never one table with three meanings»*;
- existencias **por sitio**: el mismo insumo en tres sitios son tres saldos;
- movimientos con motivo: recibido, consumido, trasladado, ajustado, descartado;
- **`MaterialConsumptionEntry` se queda**, y capturar un consumo **nunca exige que el inventario esté bien**. El enlace a un movimiento es opcional y aditivo;
- permiso `consumable:manage`;
- **no es un sistema de compras**: nada de órdenes de compra, proveedores ni reposición automática (§10).

Y §10 lo ponía en cuarto lugar: equipo, disponibilidad y calibración — ya construidos — y **después consumibles**. Esta pieza es ese cuarto paso.

**Dos desviaciones deliberadas del documento**, dichas aquí:

1. El documento guardaba `on_hand` materializado. Aquí **se deriva sumando movimientos** en cada lectura: un total guardado deriva la primera vez que alguien se lo salta, y al volumen de hoy sumar no cuesta nada. Si un día cuesta, se materializa entonces, con prueba de paridad.
2. El documento no tenía envases. Aquí **los perecederos se siguen envase por envase**, porque el riesgo que Daniel nombró —una levadura abierta que ya no tiene células vivas— es invisible en un saldo.

## 3. Decisiones de Daniel (2026-09-16/17)

| pregunta | decisión |
|---|---|
| qué pieza después del tablero | **insumos** |
| cómo de ancho es el catálogo | **uno para toda la operación** (levadura, nutrientes, CO₂, reactivos, frascos, tratamientos de apiario, fitosanitarios); **se cablea primero el beneficio** |
| cómo declara una receta lo que necesita (PR B) | **cada línea elige su base**: por kg de cereza, por tanda, por tanque, por litro de solución |
| qué pasa con la eficiencia | **nunca a costa de la fermentación**: la dosis de receta es el valor por defecto, el operador puede ajustarla por tanda, se registra y **nunca se bloquea** |
| cómo se siguen las existencias | **por envase lo que se degrada al abrirse**; lo demás como saldo simple por sitio |
| escaneo y fotos | **código del fabricante para elegir el producto + foto de la etiqueta + QR propio por envase** |
| cómo sabe el sistema lo que viene (PR C) | **lotes planificados** |
| cómo se parte | **existencias → dosis → planificación**, tres PR |
| teléfonos | **iPhone y Android** |

## 4. Modelo (PR A)

Todo en el esquema `core`, como proponía §8.

### `ConsumableItem` — el catálogo

| campo | nota |
|---|---|
| `name`, `maker` | |
| `gtin` | opcional, **único cuando existe**: el código de barras del fabricante |
| `category` | enum: `yeast_culture`, `nutrient`, `enzyme`, `gas`, `sanitizer`, `cleaning_agent`, `lab_reagent`, `packaging`, `apiary_treatment`, `phytosanitary`, `other` |
| `baseUnit` | `g`, `kg`, `mL`, `L`, `unit`. Todas las cantidades se guardan en esta unidad; el formulario convierte al entrar |
| `usualPackageSize` | opcional, en `baseUnit` |
| `degradesAfterOpening` | booleano |
| `viableDaysAfterOpening` | **obligatorio si `degradesAfterOpening`**, rechazado en el servidor si falta — `CHECK` en la migración |
| `storageNote`, `safetyNote` | «refrigerar», «cáustico, usar guantes» |
| `organizationId`, `provenanceClass` | como el resto de catálogos |

**El catálogo nace vacío.** No hay semilla con productos ni dosis: el esquema ya registra que el dueño no ha dado un vocabulario de levaduras, e inventarlo sería fabricar datos.

### `ConsumablePackage` — sólo para lo perecedero

| campo | nota |
|---|---|
| `itemId`, `receivedAt` | |
| `supplierLotCode`, `expiresAt` | la fecha es de **día**, no de instante |
| `sizeInBaseUnit` | |
| `openedAt` | anulable |
| `labelPhotoAssetId` | anulable. `lib/traceability/media.ts` sólo acepta padres de lote (`LotAssetParent`): hace falta un tipo de padre nuevo, y es la parte de PR A que toca un archivo existente de medios |
| `qrToken` | único, generado al recibir; se imprime con `svgDeQr` de `lib/apiary/etiquetasQr.ts` |

**Su estado nunca se guarda: se calcula.** `sellado` · `abierto y viable` · `vencido` · `agotado` · `descartado`. *Viable hasta* = la fecha más temprana entre `expiresAt` y `openedAt + viableDaysAfterOpening`.

El sitio de un envase sale de sus movimientos, igual que el sitio de un equipo sale de su último traslado.

### `ConsumableMovement` — sólo se añade

`itemId`, `locationId`, `delta` (con signo, en `baseUnit`), `reason` (`received`, `consumed`, `transferred_in`, `transferred_out`, `adjusted`, `discarded`), `packageId?`, `occurredAt`, `personId`, `note`, `createdAt`, `createdBy`.

**No se edita ni se borra.** Un error se corrige con un movimiento de `adjusted` y su nota. Un traslado son dos movimientos en la misma transacción.

### `ConsumableSiteLevel`

`itemId`, `locationId`, `minimumQuantity`. Único por par.

### Permisos

| permiso | qué permite | a quién |
|---|---|---|
| `consumable:view` | ver existencias y envases | Farm Operator, Farm Manager |
| `consumable:record` | recibir, abrir, descartar | Farm Operator, Farm Manager |
| `consumable:manage` | catálogo, mínimos, ajustes por conteo | Farm Manager |

Las cifras de `docs/arquitectura/inventario-de-acceso.md` se recalculan con `node scripts/inventario-de-acceso.mjs`.

## 5. Pantallas y flujos (PR A)

**`/insumos`** — existencias del sitio.

- **Arriba, lo que pide atención:** envases abiertos o sellados **vencidos** («descartar, no usar»), insumos **bajo el mínimo**, envases que **vencen en 14 días**.
- **Debajo, todos los insumos:** en existencia, y para los perecederos cuántos sellados, abiertos viables y vencidos.
- Botones: **Recibir** y **Escanear envase**.

**Recibir.** Escanear el código del fabricante, o buscar por nombre → cuántos envases y de qué tamaño → si es perecedero: lote del proveedor y vencimiento **una vez para toda la tanda**, y foto de la etiqueta → imprimir un QR por envase.

**Abrir.** Escanear nuestro QR → ver insumo, vencimiento y estado → «Abrir ahora», que enseña la nueva fecha de *viable hasta*. **Un envase sellado ya vencido avisa antes de abrirse**; no se bloquea, porque la decisión es del operador y bloquear se esquiva en campo.

**Descartar.** Escanear o elegir → motivo: vencido, contaminado, derramado, otro. Queda registrado.

**Ajustar.** Sólo Farm Manager: lo contado → la diferencia se guarda como movimiento con nota.

**Escaneo en los dos teléfonos.** `BarcodeDetector` donde exista (Chrome en Android); una biblioteca de lectura donde no (Safari en iPhone). **La biblioteca se elige en el plan, leyendo su licencia y su peso antes**, y se carga sólo en la pantalla de escaneo. La búsqueda por nombre funciona siempre.

**Sin conexión.** Recibir, abrir y descartar **necesitan conexión**, con el mismo patrón que el tablero de parcela (#362): dos personas no pueden abrir el mismo sobre sin red.

## 6. Reglas — `estadoDeInsumos`, pura

Una función pura, sin base de datos, que recibe insumos, envases, movimientos, mínimos y el día de hoy, y devuelve estados y avisos. El tablero del beneficio (PR C) la consumirá tal cual.

| situación | qué dice |
|---|---|
| abierto dentro de su ventana | abierto y viable, con la fecha en que deja de serlo |
| abierto fuera de su ventana, o sellado pasado su vencimiento | **vencido: descartar, no usar** — y **no cuenta como existencia usable** |
| perecedero recibido sin vencimiento | **vencimiento desconocido** — nunca «bien» |
| insumo perecedero sin `viableDaysAfterOpening` | no se puede guardar |
| apertura anterior a la recepción, o en el futuro | se rechaza al guardar |
| los movimientos suman menos de cero | **«las existencias no cuadran (−3 kg): contar»** — se enseña tal cual, nunca se redondea a 0 |
| vence pronto | aviso a 14 días, fijo por ahora |
| «hoy» | el **día del sitio**. Se usa `lib/time/diaDeHoy.ts`, que **no está en `main`**: llega con #362. PR A espera a que se fusione o la reutiliza desde allí, **no la copia** |
| unidades distintas | todo en `baseUnit` |

## 7. Pruebas

- **`estadoDeInsumos`, hermética:** cada fila de §6 escrita como entrada hostil.
- **Con base (grupo `base-sembrada`):** recibir → abrir → descartar deja existencias y estados correctos; un traslado son dos movimientos atómicos; `gtin` duplicado se rechaza.
- **Permisos:** un Farm Operator no puede ajustar ni tocar el catálogo.
- **Flip-tests**, contra el commit, con sha antes y después, compila, y qué prueba cae por su nombre:
  1. contar un envase abierto vencido como existencia usable;
  2. tratar un vencimiento desconocido como bueno;
  3. redondear existencias negativas a cero.
- **`npm run build`** en toda tarea que toque TypeScript; al final `npm run verify` y `scripts/ci.sh`.

## 8. Orden y con qué choca

1. **Este spec**, PR sólo de documentación.
2. **PR A.** Tablas, permisos y página nuevos. Comparte con trabajo abierto sólo `prisma/schema.prisma`, `lib/rbac/catalog.ts` y los archivos de cuentas (inventario de rutas y de acceso): conflictos mecánicos que se resuelven recalculando con script. **Espera a #362** por `diaDeHoy`. Plan con `superpowers:writing-plans` sobre el `main` de ese momento.
3. **Antes de PR A, de Daniel:** la lista real de insumos — nombres, tamaños de envase y días viables tras abrir. Sin ella la pantalla funciona pero está vacía.
4. **PR B**, después de PR A. **Corrección del 2026-09-17:** la primera versión decía que esperaba a una decisión sobre la rama `ritmo-de-receta`. Esa rama ya se había fusionado como #287 el 2026-09-13, así que no hay nada que esperar. B toca las mismas pantallas de receta que #287 dejó, y parte de su forma.
5. **PR C**, cuando exista el tablero del beneficio.
6. Fusiones y despliegues: **decisión de Daniel**.

## 9. Fuera de alcance

Compras, proveedores y órdenes de compra · reposición automática · costo de insumos (va con la pieza de costos) · lectura automática de la etiqueta con IA · el cableado de apiario, parcela y laboratorio al catálogo · avisos empujados, que esperan a `Notification` como dice §10 del documento de equipos.
