# 016 · Deduplicar por la corrida más antigua descarta, antes de calcular la cola, la decisión más urgente

**Estado: hecho**, el 2026-10-02. Encontrado el 2026-10-01 por el CLI de Codex auditando el diff del
PR #573, y **no estaba reproducido en el navegador**: era propagación leída en el código.

## La afirmación de Codex se comprobó, y se confirma

La ficha decía de la fila más importante: «mutar `<` por `>` en `anotar` deja la suite en verde
(afirmación de Codex; **comprobar con el flip antes de fiarse**)». Comprobado:

| medición | resultado |
|---|---|
| fila de control: archivos que corre la selección hermética | **188** — los mismos que dice el carril |
| la mutación está puesta (`grep` del texto mutado) | **1** |
| con la comparación invertida | **188 de 188 archivos, 2460 pruebas, salida 0** |
| fallos por nombre | **ninguno** |

**Y el primer intento de esa medición no midió nada, lo que vale anotar.** El carril salió `134`
—SIGABRT, sin memoria— y la fila «CI correrá» **no apareció en el log**: murió dentro del `tsc`, antes
de ejecutar una prueba. Su «0 fallos» era el cero que significa «no miré». Se repitió sin el `tsc`,
que no es relevante porque la mutación compila, leyendo la fila de control **antes** del resultado.

## Y se encontró POR QUÉ nadie la cazaba

**El fixture del caso ya existía.** `datos-del-tablero.test.ts` tenía un lote con **dos
fermentaciones abiertas** a horas distintas (`PD-DOBLE`), y la prueba afirmaba **cuántas** entradas
salen —una— y nunca **cuál**. Las dos corridas tenían el mismo veredicto, así que la elección era
invisible. Es la misma forma que el fixture del 018: el caso montado y la propiedad sin afirmar.

## La regla, decidida por Daniel el 2026-10-02

**Se queda la de veredicto más grave; si empatan, la que empezó antes** — que era la regla vieja, y su
razón sigue siendo buena. Y a igualdad total, la de `corridaId` menor, para que no decida el orden en
que la consulta devuelve las filas.

## Lo que se hizo

- **El cálculo del grupo salió de `colaDeAtencion` a `grupoDeLaEntrada`.** La deduplicación necesita
  saber la gravedad de cada candidata, y calcularla allí con un criterio propio habría puesto **dos
  definiciones de «más grave»** en el repositorio. Ahora hay una, y el orden es el mismo `ORDEN` que
  ordena la cola.
- **El bucle produce una entrada por CORRIDA**, y `unaEntradaPorLote` elige después, cuando ya están
  evaluadas todas y se conocen las desviaciones abiertas que el grupo necesita. Por eso la consulta de
  desviaciones pasó a hacerse sobre las entradas por corrida: el dato hace falta **antes** de elegir.
- **Segunda mitad, la curva.** `EntradaDeLoteParaTablero` lleva ahora `corridaId`, y `curvaDeUnLote`
  recibe el elegido en vez de repetir la selección con un `find` propio sobre `crudas` —que no ordena
  y lleva las fermentaciones primero, así que podía abrir una corrida distinta de la que explica el
  aviso—. Una sola pregunta con una sola respuesta.

## Lo que costó montar el guardia con base, y por qué importa

Las dos corridas de un lote tienen **ventanas anidadas**: la nueva ve un subconjunto de las lecturas
de la vieja, así que **ninguna lectura puede hacer más grave a la nueva**. Lo que sí puede es su
receta: la nueva declara «pH cada 2 h» y su última lectura es de hace 5 h, así que **debe** una
medición y sube a aviso; la vieja no declara ritmo y se queda en curso. Sin ese detalle el caso no se
puede montar, y una prueba que no lo monte pasaría con el defecto puesto.

Lo que sigue abajo es el hallazgo tal como se midió.

---

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
