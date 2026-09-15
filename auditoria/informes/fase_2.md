# Fase 2 — Procesos del lote, divisiones y fusiones

**Corrida el 2026-09-14** sobre `origin/main` en `6a7287b`. Rama `auditoria/fase-2`.

---

## Una discrepancia del kit con este repositorio, antes de nada

**El kit está escrito para la implementación de referencia en Python.** Su
`HANDOFF.md` instala `services/processing/` y `tests/test_processing_spec.py`, y
los prompts de fase se refieren a esos nombres. Aquí el **mismo contrato** —los
47 criterios de aceptación— se implementó en TypeScript: los motores en
`lib/beneficio/`, la genealogía en `lib/traceability/`.

No es una contradicción entre documentos: es que el paquete supone un
repositorio que no es éste. Se audita el código que existe contra los mismos
criterios, y se dice cuando un criterio no es trasladable.

**Y una nota de método:** esta fase se corrió sin el prompt maestro previo, que
es lo que el kit manda hacer primero y que produce `auditoria/INVENTARIO.md`.
Daniel pidió la fase 2 directamente. La consecuencia es que **este informe no se
apoya en un inventario completo del ciclo**, así que los «no comprobado» de abajo
son más numerosos de lo que serían con el maestro corrido.

---

## Resumen

De los 17 criterios del eje funcional: **9 pasan, 4 son hallazgos, 4 no se
comprobaron.** El más grave es el que el propio kit anticipa como «el defecto más
común de esta parte», y está exactamente donde dice.

| | criterio | veredicto |
|---|---|---|
| 1 | lote como nodo de grafo, no fila con `parent_id` | ✅ pasa |
| 2 | conservación en la división, al momento del evento | ❌ **F2-002** |
| 3 | conservación en la fusión | ✅ pasa, con la reserva de F2-002 |
| 4 | un lote dividido queda cerrado a lecturas nuevas | ❌ **F2-003** |
| 5 | pedir más masa de la disponible es error | ✅ pasa |
| 6 | herencia: aguas arriba sí, aguas abajo no | ⚪ no comprobado |
| 7 | fusión: todo atributo no idéntico se vuelve `MIXED` | ❌ **F2-001** |
| 8 | el puntaje de taza **no** se hereda en una fusión | ✅ pasa |
| 9 | divisiones de ensayo registran variable y control | ⚪ no comprobado |
| 10 | el costo se reparte por la genealogía | ⚪ no comprobado |
| 11 | cinco perfiles con valores concretos, ningún umbral literal | ✅ pasa |
| 12 | estancamiento de Brix como rama ejecutable con prueba | ✅ pasa |
| 13 | velocidad sobre ventana móvil, no promedio acumulado | ✅ pasa |
| 14 | banda de vigilancia de pH emite alerta | ✅ pasa |
| 15 | un reposo frío declarado suprime el estancamiento | ❌ **F2-004** |
| 16 | ninguna crítica desde una sola lectura | ✅ pasa |
| 17 | ninguna transición destructiva sin confirmación humana | ⚪ no comprobado |

---

## F2-001 · La fusión toma el origen de un padre arbitrario, y no hay `MIXED`

**Eje funcional, criterio 7. Es el hallazgo grave de esta fase.**

`lib/traceability/lots.ts`, en `recordTransformation`:

```ts
// Inherit the first input lot's project/location/organization context —
const sourceLot = inputLots[0]!;
```

El lote de salida recibe `organizationId`, `projectId` y `locationId` **del primer
lote de entrada**. El kit lo predice con estas palabras: *«Busca específicamente
si el código toma el valor del primer padre, del mayoritario o del más reciente.»*

**Y es peor que «el primer padre».** `inputLots` sale de:

```ts
const inputLots = await prisma.lot.findMany({ where: { id: { in: ... } } });
```

**sin `orderBy`**. No es el primero que el operario escribió: es la fila que
Postgres devuelva primero. El origen de un lote fusionado lo decide, hoy, el
orden de recorrido de un índice.

**Nada impide la fusión entre sitios distintos.** `requireLotAccess` comprueba
acceso a todos los lotes de entrada, no que compartan origen. *Control positivo
de que la casa sabe hacer esta comprobación:* `lib/apiary/traslado.ts:121` rechaza
`origenes_mezclados` con exactamente esa forma.

**No existe la noción `MIXED`.** Búsqueda de `MIXED|mezclado|isMixed` sobre el
esquema y `lib/`: ninguna aparición aplicable. Y el propio esquema lo dice en
`schema.prisma:3244` — el soporte de cultivar mezclado es *«free text now, a
`LotCultivarComposition` join table if/when a real mixed-lot reporting need
appears — **not built**»*.

**Consecuencia.** Fusiona dos lotes de parcelas distintas y el resultado dice,
con toda confianza, que viene de una de las dos. Sin marca, sin composición, y
sin que la elección sea reproducible. Es exactamente lo que la rúbrica de
veracidad (`docs/beneficio/21`) llama un generador de documentación creíble.

**Prueba que debe fallar antes de corregir:** fusionar dos lotes de `location`
distintas y afirmar que el lote de salida **no** hereda ninguna de las dos en
silencio.

**Lo que NO se corrige sin Daniel:** la forma de `MIXED` —columna, tabla de
composición, o valor de catálogo— es diseño de modelo de datos. Va a
`DECISIONES_PENDIENTES.md`.

---

## F2-002 · El saldo se calcula a día de hoy, no al momento del evento

**Eje funcional, criterio 2**, que pide literalmente *«la masa del padre al
momento del evento, no la de recepción»*.

`computeLotBalance` (`lib/traceability/balance.ts:199`) suma **todos** los
`QuantityEvent` del lote sin filtro temporal. `occurredAt` aparece cinco veces en
ese archivo y las cinco son de **escritura**, ninguna de lectura.

*Control positivo de que sé buscar un filtro temporal:* `lib/apiary/carencia.ts:84`,
`lib/apiary/traslado.ts:358` y `lib/equipos/equipos.ts:489` usan
`occurredAt: { lte: ... }`.

**Por qué importa aquí y no es teórico.** `LotTransformation.occurredAt` lo pone
quien registra, y este repositorio tiene toda la maquinaria de `recordedAt` /
`syncedAt` precisamente porque la captura de campo llega tarde. Una división
fechada el lunes y registrada el jueves se valida contra el saldo del jueves:

- puede **rechazarse** (`input_exceeds_available`) aunque la masa estuviera el lunes;
- y puede **aceptarse** si el lote recibió masa entre medias, aunque no la hubiera.

El segundo es el peligroso: entra una división que no podía ocurrir, y el balance
cuadra.

**Prueba que debe fallar:** un lote con 100 kg el día 1, una salida de 60 kg el
día 3, y una división retroactiva de 80 kg fechada el día 2 — hoy la rechaza; el
criterio dice que era válida.

---

## F2-003 · Un lote dividido sigue admitiendo lecturas

**Eje funcional, criterio 4**, que además pide *«verifica que el sistema lo impida
de verdad»*.

No hay ningún guardia. Búsqueda de `cerrado|closed|consumido|agotado|sin saldo`
en `lib/traceability/measurements.ts` y `lots.ts`: nada aplicable. *Control
positivo:* `measurements.ts` sí tiene guardias —`lot_not_found`,
`subject_required`, `non_coffee_subject_is_exclusive`— así que la ausencia está
medida en el sitio correcto.

**Consecuencia.** Se puede seguir registrando pH, Brix o humedad contra un lote
que ya no existe físicamente porque se repartió entre sus hijos. Esas lecturas
entran en las curvas de un café que ya no está en ningún tanque.

**Prueba que debe fallar:** dividir un lote al 100 % y registrar después una
medición contra el padre.

---

## F2-004 · El reposo frío existe y ningún lote puede alcanzarlo

**Eje funcional, criterio 15.**

El mecanismo está: `COLD_HOLD_PREFERMENT` declara `stallSuspendedUntilHours: 48`
en `lib/beneficio/perfiles.ts`. Pero el puente `lib/beneficio/desdeElLote.ts`
deduce el perfil del **grado de proceso**, y su mapa tiene **dos** entradas:

```ts
const PERFIL_POR_GRADO = { Washed: "WASHED_STANDARD", Natural: "NATURAL" };
```

Así que ningún lote puede recibir `COLD_HOLD_PREFERMENT`, y **un reposo frío
declarado no suprime nada**: sus 24–72 h de meseta deliberada se leen como
estancamiento.

**Ya está documentado y propuesto**, con su corrección, en
`docs/arquitectura/cryobloom-contra-el-esquema.md`: leer las **intervenciones**
del proceso abierto y elegir `COLD_HOLD_PREFERMENT` cuando haya
`manejo_temperatura: cold_hold_prefermentativo`. Es código, no esquema. Que esta
auditoría llegue al mismo sitio por otro camino es el argumento de que la
propuesta es la correcta.

---

## Lo que NO se comprobó, y por qué

«No existe» y «no lo encontré» son hallazgos distintos, y éstos son lo segundo:

- **Criterio 6** (herencia aguas arriba / aguas abajo) — pide recorrer qué
  atributos y qué eventos se consideran heredados en cada consulta, y eso es un
  barrido de todos los lectores, no una comprobación puntual.
- **Criterio 9** (divisiones de ensayo con su variable y su rama de control) —
  toca Research OS, `TreatmentBatch` y `ProtocolVariable`, que es el territorio
  que el documento de CryoBloom dejó señalado como colisión de vocabulario
  pendiente de ADR.
- **Criterio 10** (costo repartido por la genealogía) — no se buscó ningún modelo
  de costo. Es fase 5 en el kit.
- **Criterio 17** (ninguna transición destructiva sin confirmación humana) —
  requiere enumerar qué cuenta como destructiva antes de poder medir.

**Los ejes veraz y pedagógico están sin correr.** El eje veraz pide recorrer
fichas, etiquetas, exportaciones y reportes buscando si un lote mezclado puede
imprimirse con el nombre de un proceso; el pedagógico pide revisar alerta por
alerta contra los niveles de `docs/beneficio/22`. Los dos son trabajo de su
propia sesión, y el kit avisa de que correr dos cosas seguidas reparte la
atención.

---

## Lo que pasa, y merece decirse

- **La genealogía es un DAG de verdad** (criterio 1): `LotTransformation` con N
  entradas y N salidas, cada una su fila. Una fusión de tres lotes se expresa sin
  perder información. No hay ningún `parent_id` de lote en el esquema.
- **El puntaje de taza no sobrevive a una fusión** (criterio 8). El lote de salida
  es una fila nueva sin muestras, y `getLotLineage` devuelve **sólo ids y
  profundidad** — ninguna evaluación, ningún puntaje. La pantalla del lote enseña
  cuentas de ancestros y descendientes, no notas.
- **Y el recorrido recursivo de linaje no puede ciclar**, aunque su `UNION ALL` no
  lleve guardia: `recordTransformation` **siempre crea** los lotes de salida, así
  que una salida nunca puede ser un ancestro. Es seguro por construcción — y nada
  lo obliga si algún día aparece otro escritor de `lot_transformation_output`.
- Los cinco perfiles existen con valores concretos (11), el estancamiento de Brix
  es rama ejecutable (12), la velocidad va sobre ventana móvil (13), la banda de
  vigilancia de pH emite (14) y ninguna crítica sale de una sola lectura (16) —
  todo eso se construyó contra los 47 vectores y está cubierto por prueba.
