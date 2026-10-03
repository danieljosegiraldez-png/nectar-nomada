# 016 · Deduplicar por la corrida más antigua descarta, antes de calcular la cola, la decisión más urgente

**Estado: abierto.** Encontrado el 2026-10-01 por el CLI de Codex, auditando el diff del PR #573
(el tablero del beneficio) antes de la fusión. **No está reproducido en el navegador**: es propagación
leída en el código.

## La causa

`anotar` (`lib/beneficio/datosDelTablero.ts:209`) mantiene **una entrada por lote**: si el lote ya está,
se queda la corrida que **empezó antes** (`nueva.faseIniciada < destino[i].faseIniciada`). El criterio
tiene una razón escrita («esconder la más vieja es esconder la más atrasada»), pero **se aplica antes
de calcular la cola**, no después. Una corrida **posterior** del mismo lote con una lectura debida,
otro veredicto o una duración esperada más corta **desaparece** antes de que nada la evalúe.

Y desaparece también de `entradasPorFase` (:286) si las dos corridas comparten fase: se anota en las
dos listas con la misma regla.

## Segunda mitad: la curva usa otra selección

`curvaDeUnLote` elige su corrida con `crudas.find(...)` (:443): **sin ordenar**, y `crudas` lleva las
**fermentaciones primero** (:198-201). Así que la curva puede abrir una corrida que **no es la que
explica el aviso elegido** por `anotar`: dos reglas de selección para la misma pregunta («¿qué
corrida es la de este lote?»).

## Lo medido, y con qué control

| qué se midió | resultado |
|---|---|
| `anotar` conserva la corrida con `faseIniciada` menor, y no calcula nada antes de elegir | **sí**, leído (`datosDelTablero.ts:209-220`) |
| `curvaDeUnLote` ordena por inicio antes del `find` | **no**; `crudas = [...fermentaciones, ...secados]` y el `find` toma la primera que contenga el lote |
| **«se queda la que empezó antes» tiene guardia** | **no**: **mutar `<` por `>` en `anotar` deja la suite en verde** (afirmación de Codex; comprobar con el flip antes de fiarse) |

Esa última fila es la que más pesa: la regla está escrita en un comentario y **ninguna prueba la
distingue de su contraria**. Antes de arreglar nada, el primer paso es que esa mutación **caiga**.

## Qué haría falta para arreglarlo

1. Un test que fije la regla hoy: dos corridas del mismo lote con inicios distintos, y la afirmación de
   cuál se queda — con el flip `<`→`>` cayendo por su nombre.
2. Decidir la regla de verdad: **calcular la cola sobre todas las corridas y deduplicar después**,
   quedándose con la **más urgente** (la de mayor atraso) y no con la más antigua. Si se prefiere
   mantener «una entrada por lote» para el recuento, que la selección sea del resultado ya evaluado.
3. Que la curva reciba **la misma selección** que el aviso (el `id` de la corrida elegida), no la
   repita con un `find` distinto.

## Cómo comprobar que se arregló

Prueba con dos corridas del mismo lote: la antigua sin nada debido, la posterior con una lectura
vencida. La cola **debe** pedir decisión, y la curva **debe** abrir la corrida del aviso. Flip-test:
volver a deduplicar antes de evaluar debe hacer caer la primera; volver al `find` sin orden, la segunda.
