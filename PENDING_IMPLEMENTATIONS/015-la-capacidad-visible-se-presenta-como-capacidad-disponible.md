# 015 · La capacidad visible se presenta como capacidad disponible: un tanque ocupado por un lote que no ves sale «libre y sano»

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
