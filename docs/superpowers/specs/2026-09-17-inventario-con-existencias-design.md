# Inventario con existencias

**Fecha:** 2026-09-17 · **Camino:** arquitectónico

Tres subsistemas pidieron lo mismo en dos días, y por eso esto va primero:

- **el programa de biochar** necesita saber cuánta gallinaza y cuánta hojarasca
  entran en una noria, y de qué lote;
- **la trilla** lo rozó al registrar subproductos;
- **el contrato de investigación** del paquete lo exige literal:
  *«stock/reserved/used/waste»* con transacciones que se **añaden**, y
  *«corrección explícita en vez de existencias negativas en silencio»*.

---

## 1. El problema, en una frase

**Hoy el sistema registra lo que se gasta y no lo que queda** — y no por
descuido, sino porque **no puede**: `MaterialConsumptionEntry.materialName` y
`batchLabel` son **texto libre**, medido el 2026-09-17, y no existe ningún
catálogo de materiales.

No se pueden sumar existencias de algo que se escribe distinto cada vez.
«Aserrín», «aserrin» y «Aserrín para el ahumador» son tres materiales para una
base de datos. **La identidad es el requisito, no el saldo.**

---

## 2. Lo que YA existe y es el molde — MEDIDO

| Pieza | Qué aporta |
|---|---|
| `QuantityEvent` | **el libro mayor del café**: sólo se añade, ocho tipos de evento —`received`, `loss`, `adjustment_increase/decrease`, `transfer_in/out`…— con cantidad, unidad, fecha y procedencia |
| `computeLotBalance(client, lotId)` | lo suma, y devuelve **`recorded: boolean`** |
| `VariableCatalog` / `VariableCatalogValue` | la maquinaria de vocabularios controlados, ya usada para cultivar y para alimentación |
| `Equipment` + `InstrumentCheck` | lo **duradero** con su verificación. Un consumible no es equipo |
| `MaterialConsumptionEntry` | registra el consumo, con material y lote **en texto libre** |

**Y ese `recorded` es la pieza que hay que copiar entera.** Distingue *«nunca se
pesó»* de *«se pesó y hoy es cero»*, que son dos afirmaciones distintas sobre el
mundo — ADR-080. Un inventario que no las distinga dirá «no queda gallinaza»
cuando lo cierto es «nadie ha contado nunca».

---

## 3. Tres piezas, y ninguna es un saldo guardado

### 3.1 `ConsumableMaterial` — la identidad

Qué es la cosa: nombre canónico, categoría, **unidad por defecto**, y su estado
de aprovisionamiento. Es lo que hoy falta y lo que hace posible todo lo demás.

**No se reutiliza `VariableCatalogValue`.** Esa maquinaria guarda *etiquetas* de
un vocabulario —un cultivar, una forma de alimentar—; un material tiene unidad,
categoría y existencias. Meterlo ahí haría que un valor de catálogo significara
dos cosas según quién lo lea, el error que este repositorio ya evitó tres veces.

**Pero sí se alinea con los vocabularios que ya hay.** El enum `FeedingMaterial`
—azúcar morena, melaza, miel de caña— salió de las palabras de Daniel en campo.
Los materiales que ya tienen vocabulario **no se duplican**: se enlazan.

### 3.2 `ConsumableLot` — el lote que entró

Material, etiqueta del lote del proveedor, fecha de recepción, caducidad cuando
importa, unidad, coste y moneda. **Un lote, no un material**, porque dos sacos de
gallinaza de proveedores distintos no son intercambiables cuando algo sale mal.

### 3.3 `ConsumableStockEvent` — el libro mayor, sólo se añade

Copia la forma de `QuantityEvent`: tipo, cantidad, unidad, fecha, procedencia y
nota. Tipos: `received`, `consumed`, `reserved`, `released`, `waste`,
`adjustment_increase`, `adjustment_decrease`.

**Nada guarda el saldo.** Se deriva al leer, como el balance del lote y como el
envejecimiento del biochar: un saldo guardado y un libro mayor **dejan de cuadrar
en silencio**, y entonces el número que se enseña es el que nadie comprobó.

---

## 4. Lo negativo se avisa, no se bloquea

El contrato pide *«corrección explícita en vez de existencias negativas en
silencio»*. Hay dos maneras de leer eso, y sólo una encaja aquí.

**No se bloquea el consumo.** Gastar más de lo que el sistema cree que hay es un
hecho **frecuente y legítimo**: apareció un saco que nadie registró, o la
recepción se anotó tarde. Bloquearlo obligaría al operario a mentir en la
cantidad para poder seguir, y entonces el sistema sabría menos — la doctrina de
la casa, otra vez.

**Se registra, se marca y se pide reconciliar.** El saldo negativo es una
**pregunta visible**, no un error: *«aquí faltan 12 kg de explicación»*. La
reconciliación es un evento más del libro mayor, con su razón — nunca una
edición que borre el rastro.

---

## 5. El enganche con lo que ya hay

`MaterialConsumptionEntry` gana **`consumableLotId`**, anulable.

**Anulable para siempre**, y no por comodidad: todas las filas de hoy tienen
texto libre y **no se pueden reasignar sin adivinar**. Una consumición sin lote
sigue siendo válida —dice que se gastó algo— y sencillamente no mueve
existencias. El sistema lo declara en vez de callarlo.

**La captura no se complica.** Cuando el material está en el catálogo, la
pantalla ofrece el lote abierto; cuando no, se escribe como hoy. Obligar a elegir
lote para registrar un consumo convertiría una anotación de diez segundos en un
trámite, y el resultado sería que no se anota.

---

## 6. Lo que NO hace

- **No es contabilidad.** Coste y moneda se guardan porque el contrato los pide,
  pero aquí no se valora inventario ni se amortiza nada.
- **No compra.** Ninguna alerta genera un pedido. El paquete es explícito:
  *«no automatic zero-quantity purchase approval»*.
- **No toca el equipo duradero.** `Equipment` ya existe con su ciclo de vida y su
  verificación; una noria no es un consumible.
- **No reconstruye el histórico.** Lo gastado hasta hoy se queda en texto libre,
  y eso se dice en vez de fingir una migración que adivinaría.

---

## 7. Decisiones abiertas — de Daniel, no mías

1. **Quién puede recibir y quién puede reconciliar.** Recibir un lote es
   rutina; cuadrar un negativo es una afirmación sobre lo que pasó. ¿Mismo
   permiso o distinto, como pasó con `lot:release`?
2. **Si el aviso de existencias bajas existe**, y con qué umbral. El contrato
   pide marcar «material no resuelto», no un mínimo por material.
3. **Si el coste entra ahora.** Se puede dejar nulo y añadirlo cuando haya
   facturas de verdad que copiar.
