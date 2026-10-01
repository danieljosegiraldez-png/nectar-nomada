# 014 · `lotWhereFromVisibility` filtra por alcance y no por clasificación: una consulta así puede traer lotes que `can()` denegaría

**Estado: abierto, y es decisión de Daniel si se cierra y dónde.** Encontrado el 2026-10-01 por el CLI de
Codex, auditando el diff del PR #573 (el tablero del beneficio) antes de la fusión. **No está
reproducido en el navegador**: es propagación leída en el código.

**Esto NO es un hallazgo desconocido, y hay que leerlo antes de decidir.** El repositorio ya lo sabe y
**ya decidió una vez**: ADR-063, «Corregido el 2026-09-26» (`docs/architecture/DECISIONS.md`, ~L4455),
dice que el `where` de las listas sale de `scopeOrClauses` y **no mira `classification` en ninguna
línea**, y que la divergencia **«hoy es inalcanzable»** — decisión de Daniel de no arreglarla, vigilada
por `tests/arquitectura/quien-lista-limpia-lo-que-lista.test.ts` (commit `19044b8f`). Y
`lib/traceability/lots.ts:732`, en el docstring de **otra** función (`puedeGestionarLote`), lo dice con
otras palabras: reimplementar «proyecto o ubicación en el alcance» *«habría dejado fuera la
clasificación, que `requireLotAccess` sí comprueba»*. Lo que Codex añade no es el defecto sino su
**radio**: esta rama lo lleva a dos lecturas más.

## La causa

`lotWhereFromVisibility` (`lib/traceability/lots.ts:712`) devuelve `{ OR: scopeOrClauses(visibility) }`:
cláusulas de `projectId` y `locationId`, **sólo alcance**. `can()` exige además
`classification:clear_<nivel>` exacto, sin jerarquía (`lib/rbac/resolve.ts`). O sea: una consulta
filtrada así puede traer lotes que una comprobación por recurso (`requireLotAccess`) denegaría.

## Lo medido, y con qué control

| qué se midió | resultado |
|---|---|
| `classification` dentro de `scopeOrClauses` (`lots.ts:704-710`) | **0** líneas |
| control: `classification` en el resto del archivo, en las rutas que sí pasan por `can()` | **sí** (`lots.ts:97`, `:545`, `:930`) — la búsqueda mira donde debe |
| módulos con `lotWhereFromVisibility`, sobre `HEAD` de la rama | **ocho** |
| de esos, los que esta rama NO toca | **siete** (los otros: `datosDelTablero.ts`, que ya llamaba al ayudante en `origin/main` y al que la rama le añade lecturas) |
| usos de `lotWhereFromVisibility` en `datosDelTablero.ts`, `origin/main` frente a `HEAD` | **2 → 2**: la rama no añade la llamada, **le cuelga lecturas nuevas** |

**Los ocho módulos** (`git grep lotWhereFromVisibility`):

1. `lib/beneficio/colaDeSecado.ts` (:214) — anterior
2. `lib/beneficio/vistaDeBandejas.ts` (:74, :199) — anterior
3. `lib/traceability/clasificacionVerde.ts` (:275) — anterior; su propio comentario en :280 ya dice que filtra por proyecto y ubicación pero **no** por `classification`
4. `lib/traceability/export.ts` (:101) — anterior; **no re-comprueba por fila**, así que una fila de más sale en un CSV, no sólo en pantalla
5. `lib/traceability/lots.ts` (:798, la lista de lotes) — anterior
6. `lib/traceability/reporteDeProceso.ts` (:102) — anterior
7. `lib/traceability/roasting.ts` (:320) — anterior
8. `lib/beneficio/datosDelTablero.ts` (:139) — **el de esta rama**: **extiende** la brecha a la lectura de la curva (`curvaDeUnLote`, que valida `lotWhere` con `findFirst`) y a los recuentos de etapa (`cuentaLotes`)

**Esta rama no introduce la brecha: la extiende.** Los siete primeros son anteriores. Y hay un gemelo
fuera de la lista: `sampleWhereFromVisibility`, con el mismo `scopeOrClauses`, usado en
`export.ts:102` y comentado en `lib/sensory/sessions.ts:42`.

## Por qué hoy no se ve

ADR-063 lo dejó «dormido por ausencia de camino»: `CreateLotInput` no acepta `classification`, todo
lote nace `internal`, y los tres perfiles no-admin con `lot:view` limpian exactamente `internal`. En la
base restaurada de entonces eran **45 de 45** `internal`. Cuando el dato cambie —alguien clasifica un
lote más arriba, o se quita la clearance a un perfil— la fuga se despierta **sin que falle nada**,
salvo el guardia de `quien-lista-limpia-lo-que-lista.test.ts`, que vigila las dos mitades por el lado
de los perfiles y del nivel por defecto, **no por el lado de las consultas nuevas**.

## Qué haría falta para arreglarlo

Decisión de Daniel, y son dos alcances distintos:

- **Sólo aquí:** que `datosDelTablero` (curva y recuentos) no use el ayudante pelado, sino uno que
  añada el filtro de `classification` según lo que la cuenta limpia.
- **En los ocho (y el gemelo de muestras):** que `lotWhereFromVisibility` reciba la clearance de la
  cuenta y añada `classification: { in: [...niveles que limpia] }`. Toca `/lots`, el panel, la
  exportación, el reporte de proceso, la cola de secado, las bandejas, la clasificación verde y el
  tueste **a la vez**; por eso ADR-063 lo dejó como decisión del dueño.

## Cómo comprobar que se arregló

Una prueba con base que cree un lote `confidential` en el ámbito de una cuenta que sólo limpia
`internal` y afirme que **ninguna** de las ocho superficies lo devuelve, con el lote `internal` de
control **sí** devolviéndose en las ocho (si no, «no sale» se lee igual que «no miré»). Flip-test:
quitar el filtro nuevo de una superficie debe hacer caer **esa** y sólo esa.

Sin fecha. No bloquea la fusión de #573: el dato de hoy la mantiene inalcanzable.
