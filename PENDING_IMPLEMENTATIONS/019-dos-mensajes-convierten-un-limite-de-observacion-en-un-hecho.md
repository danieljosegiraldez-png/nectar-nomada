# 019 · Dos mensajes convierten un límite de observación en un hecho

**Estado: abierto.** Encontrado el 2026-10-01 por el CLI de Codex, auditando el diff del PR #573
(el tablero del beneficio) antes de la fusión. **No está reproducido en el navegador**: es propagación
leída en el código.

**Es la misma forma que esta rama existe para impedir** —un cero, un vacío o una ausencia leídos como
un hecho— **en dos sitios que nadie miró.** En los dos, lo demostrado es sólo que **una consulta no
recuperó nada**, y la pantalla lo presenta como que **no hay nada**.

## (a) «Ningún instrumento pide atención» sin instrumentos visibles

`app/beneficio/page.tsx` (:255) oculta la sección de instrumentos sólo con `datos.sinAmbito`. Con
**ámbito de lotes pero sin instrumentos visibles** —la cuenta ve lotes, y no ve ningún equipo de
medición—, `instrumentos.length === 0` y la pantalla dice `instrumentosNinguno` (`messages/es.json`):
«Ningún instrumento pide atención.» Lo cierto es «no veo ninguno»; la frase lo lee como «todos bien».

## (b) «Esta variable no tiene rango declarado en la receta»

Sin corrida abierta, `curvaDeUnLote` (`datosDelTablero.ts`, :443-455) consulta **todas** las
mediciones del lote y pone `objetivo: null` **sin mirar recetas históricas**: `metas` sale de
`abierta?.lotProcess?.processRecipeVersion?.targets ?? []`, así que sin `abierta` es `[]`. La pantalla
entonces dice `curvaSinBanda` (:3298): «Esta variable no tiene rango declarado en la receta.» **Lo
demostrado es que esa consulta no recuperó ninguno**; el lote puede haber tenido una receta con
rango en una fase ya cerrada, o la receta puede no estar resuelta por falta de permiso.

## Lo medido, y con qué control

| qué se midió | resultado |
|---|---|
| la sección de instrumentos se oculta con algo distinto de `sinAmbito` | **no** (`page.tsx:255`) |
| sin `abierta`, `metas` es `[]` y no se consulta ninguna receta histórica | **sí**, leído (`datosDelTablero.ts:451-452`) |
| el texto de `curvaSinBanda` afirma ausencia en la receta, no en la consulta | **sí** (`messages/es.json:3298`) |
| control: con `sinAmbito` la sección **sí** se oculta (el guardia que ya existe) | **sí**: es el patrón correcto, aplicado a un solo estado |

## Qué haría falta para arreglarlo

Estados **distintos**, con texto distinto, donde hoy hay uno:

- **ausencia comprobada** — se miró y no hay (la receta existe y no declara rango; el equipo existe y
  no pide atención);
- **no tienes acceso** — hay algo que esta cuenta no ve;
- **contexto de receta no resuelto** — no se pudo saber qué receta aplicaba (sin corrida abierta, sin
  versión de receta, o receta histórica sin consultar).

Para (a): la sección debe distinguir «lista vacía porque ningún equipo pide atención» de «lista vacía
porque no se ve ningún equipo», lo que necesita saber **cuántos instrumentos son visibles** (no sólo
cuántos piden atención). Para (b): o consultar la receta del lote por la última corrida cerrada, o decir
que **no se pudo resolver** el rango, no que la receta no lo tiene.

## Cómo comprobar que se arregló

(a) Cuenta con ámbito de lotes y **cero** equipos visibles: la pantalla **no** dice «Ningún instrumento
pide atención»; con un equipo visible y sin alertas, **sí**. (b) Lote sin corrida abierta cuya última
fase cerrada tenía rango: la pantalla **no** dice «no tiene rango declarado»; con una receta que de
verdad no declara rango, **sí**. Flip-test: volver al texto único debe hacer caer (a) y (b) por separado.
