# 014 · `lotWhereFromVisibility` filtra por alcance y no por clasificación: una consulta así puede traer lotes que `can()` denegaría

**Estado: HECHA el 2026-10-14, de raíz y en los ocho (más la gemela de muestras), por decisión de
Daniel.** Lo que se hizo y cómo se comprobó está al final, en «Cómo quedó». Lo de en medio es la ficha
tal como se abrió, y se queda como registro.

**Estado original: abierto, y es decisión de Daniel si se cierra y dónde.** Encontrado el 2026-10-01 por el CLI de
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

## Cómo quedó (2026-10-14)

**Daniel eligió los ocho y la gemela de muestras, de raíz**, y en el mismo cambio un defecto que salió
midiendo esta ficha: la lista leía `roleProfile.permissions` y **se saltaba los ajustes por asignación**
de #357, que `can()` sí aplica. Quitado `lot:view`, la lista, el tablero y el CSV seguían enseñando lo
que la ficha negaba; añadido, la lista salía vacía. Lo mismo en la lista de apiarios.

**Seguía dormida al cerrarla**, medido ese día: de las 17 llamadas que crean o actualizan lotes y
muestras, sólo 2 tocan `classification`, y las dos copian la del lote a su muestra. Pero el guardia de
ADR-063 vigilaba los perfiles, no las escrituras: no habría caído si alguien abría ese camino.

**Dónde se arregló: en el resolvedor, no en las pantallas.** `resolveLotVisibility` lee los permisos
efectivos (`getResolvedAssignments`, exportada de `lib/rbac/service.ts`) y lleva, por objetivo, los
niveles que la cuenta limpia. La regla es la de `can()`, y es **por objetivo**: para cada uno suma las
asignaciones de plataforma y las de ese objetivo exacto, no las de sus ancestros. `lotWhereFromVisibility`,
`sampleWhereFromVisibility` y `lotMatchesVisibility` filtran con eso. De las ocho superficies, cinco sólo
usan el `where` (medido: cero lecturas de `mode`, `projectIds` o `locationIds`) y lo heredan sin tocarse;
el tueste se saltaba el filtro con `mode === "all"` y ahora se fía del `where`; la exportación sólo lee
`mode` para decir «sin permiso».

**La prueba no es la que esta ficha proponía, y es más fuerte.** `tests/traceability/laListaVeLoQueVeCan.test.ts`
monta once cuentas y seis lotes, y para cada cuenta afirma dos cosas: que `can()` deja ver lo que dice su
tabla —si eso cae, la tabla está mal— y que la lista trae exactamente eso. Después ejerce cuatro
superficies de punta a punta: `/lots`, las operaciones en curso (las únicas que filtran con el
predicado), la exportación con un lote y una muestra confidenciales, y los tuestes con ámbito de
plataforma. Las otras cuatro (cola de secado, bandejas, clasificación verde y reporte de proceso) y el
tablero comparten el mismo `where` y no tienen prueba propia de esto.

Con el código anterior caían **13 de 29**, todos con la firma del defecto, y pasaban las once filas de
`can()`. Siete mutaciones, cada una con su sha distinto, cero errores de carga y el árbol restaurado:

| mutación | cae |
|---|---|
| el filtro por nivel desaparece | seis cuentas, y las cuatro superficies |
| sumar los permisos a lo largo de la cadena en vez de por objetivo | sólo `fincaYLeadEnParcela` |
| la lista lee los permisos del perfil, sin ajustes | las tres cuentas con ajustes, y `/lots` |
| lo mismo en apiarios | las dos de apiario, no su control |
| el tueste vuelve a saltarse el filtro con ámbito de plataforma | sólo los tuestes |
| el predicado no mira el nivel | sólo las operaciones en curso |
| las muestras sin filtro | sólo la exportación, en la aserción de la muestra |
