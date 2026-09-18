# La faena de colmena — plan

> Spec: `docs/superpowers/specs/2026-09-17-faena-de-colmena-y-botiquin-design.md` §A.

**Objetivo:** «¿A qué venís hoy?» — una fila de faenas arriba de la colmena
(revisar · alimentar · tratar · varroa · cosechar). La elegida queda abierta y las
demás plegadas a un toque, **nunca ocultas**. Sin elegir, la pantalla de siempre.

## Restricciones (del spec)

- **Navegación, no dato.** Ninguna columna, ninguna migración: la faena vive en la
  URL (`?faena=`), y guardarla junto al registro sería guardar dos veces lo mismo.
- **No obliga a elegir.** Sin `?faena`, todo abierto como hoy.
- **Un valor desconocido es «sin faena»**, no un error: un enlace viejo o mal
  escrito no debe dejar la colmena sin formularios.
- **Decisión abierta §5.2** (qué faenas y en qué orden): se toman las cinco que
  propone el spec, en su orden, porque salen de los formularios que ya existen.
  Cambiarlas es editar una lista.

## Tarea 1 — La decisión, pura

`lib/apiary/faena.ts`: `FAENAS`, `faenaDe(raw)`, `seccionAbierta(faena, seccion)`.
Prueba hermética `tests/apiary/faena.test.ts`: sin faena todo abierto; con faena
sólo la suya; valor desconocido = sin faena; ninguna faena deja las cinco cerradas.

## Tarea 2 — La pantalla

`app/apiaries/[id]/hives/[hiveId]/page.tsx` lee `searchParams.faena`, pinta la fila
de enlaces (`?faena=x#faena-x`, y «todo» para volver) y envuelve cada sección de
faena en `<details open>` según `seccionAbierta`. `ColonyEventQuickEntry` recibe
`faena` y pliega alimentar / tratar / observación del mismo modo. Claves en las dos
lenguas; compuerta completa; flip-test.
