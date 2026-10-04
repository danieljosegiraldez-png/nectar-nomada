# 015 · La capacidad visible se presenta como capacidad DISPONIBLE: un tanque ocupado por un lote que no ves sale «libre»

**Estado: hecho**, el 2026-10-02.

**La causa se midió, no se dedujo.** `lib/beneficio/datosDelTablero.ts` consulta las fases abiertas
con `transformations: { some: { inputs: { some: { lot: lotWhere } } } }` —filtradas por lote
visible—, así que una corrida sobre un lote que quien mira no ve **no llega** a
`ocupacionDelSitio`. Con `enUso` derivado sólo de ésas, «no me llegó ninguna corrida» se presentaba
como «la unidad está libre». Es el mismo error caro que el de `vesselNote`, por otra puerta:
alguien le echa cereza encima.

**Lo que se hizo:**

- Un recuento de corridas abiertas **por unidad y sin filtrar por lote**, acotado a las unidades ya
  visibles (`groupBy` con `_count`, sin seleccionar ni una columna del lote). De ahí sale `enUso`, y
  de ahí salen los **conflictos**: dos corridas en un tanque son un conflicto aunque ninguno de sus
  dos lotes se vea, y contándolo sobre lo visible el conflicto desaparecía junto con sus lotes.
- `proximaLiberacion` **agrupa por unidad** y dentro de cada una toma el fin **mayor** —se libera
  cuando acaba la última—, y entre unidades el menor. Y deja fuera las retiradas y las que requieren
  intervención, con el **mismo `clasificar`** que usa la ocupación, no una regla paralela.
- Una unidad con una corrida sin duración declarada **no tiene hora conocida**, aunque otra corrida
  de la misma unidad sí la declare. Era la misma forma del defecto, más pequeña: anunciar la hora de
  la que habla es anunciar una hora a la que la unidad no va a estar libre.

**Una corrección a la ficha, dicha porque cambia el nombre de un estado.** Pedía tres estados y
llamaba al tercero «ocupación desconocida». Con el recuento sin filtrar **no es desconocida**: se
sabe que la unidad está ocupada, y lo único que falta es de qué lote. Se llama
`loteNoVisible` / `ocupadasSinLoteVisible`, que es lo que el dato sostiene; «desconocida» diría
menos de lo que se sabe.

**Lo que esto enseñó, y no está en el diff:** el defecto no estaba en cómo se clasifica una unidad
sino en **qué llega a clasificarse**, así que **ninguna prueba de la función pura podía verlo** —
`ocupacionDelSitio` clasificaba correctamente lo que recibía—. El guardia que lo caza vive en el
carril con base (`datos-del-tablero.test.ts`), monta una cama visible con un secado abierto de un
lote invisible, y afirma **las dos mitades**: que la corrida NO llega a `corridas` y que SÍ aparece
en `corridasPorUnidad`. Sin la primera, la segunda no probaría nada.

Lo que sigue abajo es el hallazgo tal como se midió.

---

**Estado: abierto.** Encontrado el 2026-10-01 por el CLI de Codex, auditando el diff del PR #573
(el tablero del beneficio) antes de la fusión. **No está reproducido en el navegador**: es propagación
leída en el código. El coste que nombra Codex: **aceptar cereza contando con capacidad que no existe.**

## La causa

Dos fuentes con dos reglas de visibilidad distintas, y una función que las cruza sin decirlo:

- Las **corridas** (fermentaciones y secados abiertos) se leen filtradas por la visibilidad del **lote**
  (`lotWhere` en `lib/beneficio/datosDelTablero.ts`, :139).
- Los **equipos** salen de sus propios permisos (`listarEquipos`), y las camas de las suyas.

`ocupacionDelSitio` (`lib/beneficio/tablero.ts:277`) cuenta `enUso` a partir de **las corridas que
recibió**: `enUso: (cuenta.get(u.id) ?? 0) > 0` (:306). «Ninguna corrida recibida» se interpreta como
`enUso: false`. Pero «no recibí ninguna» no es «no hay ninguna»: puede ser «hay una y no tengo permiso
sobre su lote». **Un tanque visible, ocupado por un lote que no ves, aparece como libre y sano.**

## Segundo defecto, en la misma pantalla: `proximaLiberacion`

`proximaLiberacion` (`lib/beneficio/liberacionDeUnidad.ts:50`) recorre las corridas y se queda con el
**mínimo** de `iniciadaEn + expectedHours` **sin agrupar por unidad** (:70-71). Dos corridas abiertas
sobre la **misma** unidad dan la hora de la primera aunque la segunda siga abierta: la unidad no se
libera a esa hora. Tampoco mira **condición** (una unidad que requiere intervención no está disponible
a la hora que su corrida termine) **ni retiro** (`lifecycleStatus`).

## Lo medido, y con qué control

| qué se midió | resultado |
|---|---|
| `enUso` de `ocupacionDelSitio` se deriva sólo de `cuenta.get(u.id)` sobre las corridas recibidas (`tablero.ts:306`) | **sí**, leído |
| `proximaLiberacion` agrupa por unidad | **no**: un solo `proxima` global (`liberacionDeUnidad.ts:62-72`) |
| `proximaLiberacion` mira `condicion`/`lifecycleStatus` | **no**: su entrada es `CorridaConDuracion` (`equipmentId`, `bedLocationId`, `iniciadaEn`, `expectedHours`) |
| el filtro de `datosDelTablero` sí excluye corridas de unidades no visibles (`idsVisibles`, :~377) | **sí** — lo que falla es el caso **inverso**: unidad visible, corrida invisible |

Control: el filtro `idsVisibles` existe y funciona en una dirección; la prueba de que la dirección
contraria no tiene su equivalente es que ninguna entrada de `CorridaAbierta` distingue «sin corrida»
de «corrida que no puedo ver».

## Qué haría falta para arreglarlo

- Que la ocupación distinga **tres** estados por unidad —`libre comprobada`, `ocupada`, `ocupación
  desconocida`— y que «desconocida» sea lo que sale cuando el filtro de visibilidad de lotes pudo
  haber ocultado una corrida sobre ella. Hace falta saber **cuántas corridas abiertas existen sobre
  las unidades visibles sin filtrar por lote** (un recuento que no devuelve datos del lote), y
  compararlo con lo visible.
- Que `proximaLiberacion` agrupe por unidad, tome para cada una el **máximo** de sus corridas abiertas
  (se libera cuando termina la última), y deje fuera las unidades con condición que pida intervención
  o retiradas.

## Cómo comprobar que se arregló

Prueba con base: una cama visible con una corrida abierta de un lote **fuera** del ámbito de la cuenta
debe salir `ocupación desconocida`, nunca «libre y sano», con la misma cama sin corrida saliendo libre
(control). Y dos corridas sobre la misma unidad, una con hora de fin anterior y otra posterior: la
liberación es la **posterior**. Flip-test: volver al mínimo sin agrupar debe hacer caer la segunda.
