# 018 · Una corrección puede resucitar la lectura que corrige

**Estado: hecho**, el 2026-10-02. Encontrado el 2026-10-01 por el CLI de Codex auditando el diff del
PR #573, y **no estaba reproducido en el navegador**: era propagación leída en el código.

**Lo que se hizo**, y es el principio que la propia ficha nombraba: la vigencia de una medición
—«¿alguien la corrigió?»— se resuelve **antes** de aplicar la ventana, o el filtro de tiempo decide
qué correcciones existen.

- **La curva** (`curvaDeUnLote`) hace ahora **dos** consultas en paralelo: las lecturas de la ventana,
  y por separado **todos** los `correctsId` de ese lote y esa variable, sin ventana y con una sola
  columna. El conjunto de corregidas sale de la segunda.
- **`entradaDelLote` ya no lo deduce.** Recibe `idsCorregidos`, **obligatorio y sin valor por
  defecto**: un llamador que lo olvide no compila. Con un `?? new Set()` el defecto habría vuelto en
  silencio, que es exactamente cómo llegó.
- **El tablero lo calcula una vez para todos los lotes visibles**, no una consulta por vuelta del
  bucle: dos columnas y sólo las filas que corrigen algo.

**La ficha mandaba revisar el otro consumidor «con la misma pregunta», y la respuesta fue que SÍ lo
tenía.** `datosDelTablero` consulta las mediciones del bucle con `occurredAt: { gte: c.startedAt }`
y pasaba `correctsId` aguas abajo, así que `entradaDelLote` armaba el conjunto sobre lo ya acotado:
el mismo defecto, en el veredicto en vez de en el dibujo.

**Y el campo obligatorio destapó un TERCER consumidor que no estaba en la ficha:**
`app/lots/[id]/page.tsx`. Ése **no** tenía el defecto — `getLotDetail` carga las mediciones con
`where: { lotId }`, **sin ventana de fecha** (`lots.ts:952`), así que el conjunto que esa página ya
calculaba estaba completo. Hoy se le pasa ése en vez de dejar que la función lo deduzca otra vez, así
que la página tiene **una** cuenta y no dos que puedan discrepar. Sin el tipo obligatorio, ese
consumidor no se habría mirado.

**Una prueba que NO se escribió, y por qué.** La mitad de `entradaDelLote` no se afirma desde el
carril con base: `EntradaDeLoteParaTablero` no expone las mediciones, y sus tres campos observables
no sirven de testigo —`ultimaLectura` sale de la lista cruda sin mirar las corregidas, `metas`
necesita una receta con ritmo que el fixture no tiene, y el `veredicto` de esos lotes ya es
`SinVeredicto` por falta de grado, así que la aserción saldría igual con el defecto puesto y sin él—.
Esa mitad la guardan dos pruebas **puras**, y la nota está escrita en el archivo de pruebas para que
nadie cuente dos veces el mismo guardia. Un testigo que no discrimina es peor que ninguno.

Lo que sigue abajo es el hallazgo tal como se midió.

---

**Estado: abierto.** Encontrado el 2026-10-01 por el CLI de Codex, auditando el diff del PR #573
(el tablero del beneficio) antes de la fusión. **No está reproducido en el navegador**: es propagación
leída en el código.

## La causa

La consulta de mediciones de `curvaDeUnLote` (`lib/beneficio/datosDelTablero.ts`, :443-449) hace dos
pasos **en este orden**:

1. filtra por `occurredAt >= abierta.startedAt` (la ventana de la fase abierta);
2. **después** construye `corregidas` con los `correctsId` de **lo que quedó dentro de la ventana** y
   descarta esas lecturas.

`correctMeasurement` (`lib/traceability/measurements.ts:453`) **permite corregir la fecha**: la
corrección es una fila nueva con su propio `occurredAt` (`CorrectMeasurementInput.occurredAt`,
:438). Si la corrección cae **antes** del inicio de la fase —la fecha original estaba mal—, queda
**fuera** de la consulta; su `correctsId` nunca entra en `corregidas`, y **la original, ya corregida,
se sigue dibujando**: una lectura que nadie sostiene vuelve a la pantalla.

## Lo medido, y con qué control

| qué se midió | resultado |
|---|---|
| el conjunto `corregidas` se construye sobre las filas ya filtradas por ventana | **sí**, leído (:449 sobre :443-447) |
| `correctMeasurement` acepta `occurredAt` distinto del original | **sí** (`CorrectMeasurementInput`, `measurements.ts:438`; la fila nueva usa `input.occurredAt`) |
| control: una corrección **dentro** de la ventana sí oculta la original | **sí**: es el caso que hoy funciona y el que las pruebas cubren |

El caso roto es exactamente el que ningún test ejerce: corrección **fuera de la ventana**, original
**dentro**.

## El principio que se viola

La vigencia de una medición —«¿alguien la corrigió?»— es una propiedad de la **cadena de
correcciones**, no de la ventana de la pantalla. Se resuelve **antes** que la ventana, o el filtro de
tiempo decide qué correcciones existen. Las otras lecturas del tablero (`entradaDelLote`, :262, que
también pasa `correctsId`) conviene revisarlas con la misma pregunta.

## Qué haría falta para arreglarlo

Calcular las corregidas sobre **todas** las mediciones de esa variable y ese lote (sin el filtro de
fecha), o con una subconsulta `NOT EXISTS (correctsId = m.id)` en la propia consulta, y **después**
aplicar la ventana a las vigentes. Una corrección que cae antes de la fase deja la original oculta y
**tampoco se dibuja ella** (queda fuera de la ventana por su fecha, y eso es correcto).

## Cómo comprobar que se arregló

Prueba con base: lectura original dentro de la fase, corrección con `occurredAt` **anterior** al inicio
de la fase. La curva **no** debe contener la original. Control: sin corrección la original **sí** sale;
con corrección dentro de la ventana, sale la corrección y no la original. Flip-test: volver a calcular
`corregidas` sobre lo filtrado debe hacer caer la primera.
