# 019 · Dos mensajes convierten un límite de observación en un hecho

**Estado: hecho** (2026-10-03). Encontrado el 2026-10-01 por el CLI de Codex, auditando el diff del
PR #573 (el tablero del beneficio) antes de la fusión. **No estaba reproducido en el navegador**: era
propagación leída en el código. Lo que cerró la ficha está al final, en «Cómo quedó».

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

## Cómo quedó (2026-10-03)

**(a)** Tres estados donde había uno, en `app/beneficio/page.tsx`: sin ámbito (ya estaba), cero
instrumentos visibles —clave nueva `instrumentosNingunoVisible` en los dos idiomas— y hay
instrumentos de los que ninguno pide atención, que es el único caso donde la frase de antes es
verdad. Las dos cuentas salen de la lista que la página ya tenía: ninguna consulta nueva.

**Y un fallo de la primera versión de este arreglo, que una de sus propias pruebas daba por bueno.**
Contaba `datos.instrumentos`, que lleva **todo** el equipo visible con su `kind`
(`datosDelTablero.ts:516`), así que una cuenta que ve tanques y cero instrumentos volvía a leer
«ninguno pide atención» — la misma mentira con otra cara. La cuenta buena es `instrumentosVisibles`,
nueva en `tablero.ts` junto a `instrumentosQuePidenAtencion` para que la regla de qué cuenta como
instrumento viva en un solo sitio.

**(b)** `elegirObjetivo` gana un segundo argumento **obligatorio**, `recetaResuelta`, y un cuarto
tipo de elección, `receta_no_resuelta`, con su texto propio y su frase corta para el rótulo
accesible. Resuelta = hay corrida abierta **Y** esa corrida tiene versión de receta; con cualquiera
de las dos ausentes no se afirma nada de la receta. Con objetivos en la lista el indicador no manda:
no puede borrar un rango que la receta sí declara.

En la entrada de `curvaDeLote` el campo es **opcional**, con `true` por omisión, y el motivo está
medido: 82 llamadas de prueba construyen curvas para medir bandas y ejes, y obligarlas a repetirlo
son 82 ediciones en los mismos archivos de prueba cuyos conflictos de encadenado costaron 59 errores
de sintaxis esa misma jornada. El riesgo que crea ese valor por omisión lo cubre el guardia del
carril con base, que no construye la curva a mano: pide el tablero y comprueba que el **único sitio
de producción** lo pasa.

**El tercer estado que esta ficha pedía, «no tienes acceso», NO se añadió.** En (b) el `visible` de
`datosDelTablero.ts:580` ya corta antes el lote que la cuenta no ve, así que ese estado no se da ahí.
Se dice en vez de inventarlo. Si algún día hace falta, el sitio es otro.

**Un defecto preexistente que encontró el guardia de (a).** `app/beneficio/page.tsx` pedía la frase
del estado del instrumento con el estado pelado —`tEq("REVISION_VENCIDA")`— y esa clave no existe: se
llama `verificacion_REVISION_VENCIDA`, como ya hacían las otras tres pantallas que lo pintan. Lo que
salía junto al nombre del instrumento era el nombre crudo de la clave. No lo cazaba nadie porque
ninguna prueba pintaba un instrumento que pidiera atención —el control existía y faltaba el caso— y
porque `claves-de-traduccion-existen.test.ts` sólo mira archivos con un espacio de nombres, y esta
página usa dos. Arreglado aquí, con `tests/arquitectura/estados-de-verificacion-tienen-frase.test.ts`
para que los cinco estados tengan su frase en los dos idiomas.
