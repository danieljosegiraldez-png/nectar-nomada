# Ronda de arreglo del segundo cruce — T03 y T14 (2026-10-04)

Archivos editados EN SU SITIO: `tareas/T03.md` y `tareas/T14.md`. Ninguna otra cosa del worktree (`git status --short` vacío, HEAD `da048af2`
sin moverse; ni `add`, ni `commit`, ni `stash`, ni `checkout`, ni `push`, ni `npm install`, ninguna base). Las copias de verificación viven en el scratchpad
(`scratchpad/arreglo-t03-t14/`): `t03/` (de `scratchpad/t0304`, árbol con las tareas 1–4) y `t14/` (de `scratchpad/t14/arbol`, árbol con la tarea 14 hasta la Parte D),
cada una con **su propio** `.git`. En `t14/` hice un `git reset --hard HEAD` para volver al estado posterior a la Parte D (descarta los cambios, sin commitear, de la Parte E de la
redacción anterior); es una copia mía y no toca el repositorio del proyecto. Respaldos de lo que había: `arreglo-t03-t14/T03.antes.md` y `T14.antes.md`.

## Lo que cambió, por ruling

### C4 (lecturas del Coffee Process Manager)

- **T03** (`puedeAutoriaDeReceta` ya existía, paso 9e: la misma regla en booleano, llama a `exigeAutoriaDeReceta` y sólo se traga su negativa; no se copia).
  - Prosa corregida: la descripción del perfil en `catalog.ts` (~1096–1100 originales: ya no dice «cuando la tarea 14 las ensanche o cuando Daniel decida añadírselo»; dice que el
    perfil NO gana `lot:manage` ni `lot:view` y que las pantallas se le abren porque las tres lecturas aceptan también la autoría), la de la descripción del permiso, la cabecera de
    `autoria.ts` («Quién LEE»), la viñeta de `RBAC.md`, el conflicto 4 (pasa a «resuelto por C4»), la duda abierta de las lecturas (pasa a «Resueltas») y la «Produce».
  - La prueba de la gemela (`autoria.test.ts`, mismo `it`, sin cambiar el recuento 8 ✓ / 2 ×) gana tres aserciones: plantilla con plataforma sí / con finca no, y Platform Admin sí. **Fila de flip 10
    nueva** (quitar la línea que llama a `exigeAutoriaDeReceta` dentro de `puedeAutoriaDeReceta`: la gemela deja de preguntar). Medido en la copia: el ancla casa 1 vez, compila.
- **T14** — paso nuevo **32c** (Parte D, commit 4): `tests/recetas/lecturasDeRecetas.test.ts` (10 casos, `base-sembrada`) y las cuatro ediciones de `processTargets.ts`.
  - `getRecipeForEditor`: `if (await puedeAutoriaDeReceta(cuenta, recipe.organizationId)) return recipe;` ANTES del «sin lotes» (la autoría no pide lote).
  - `listRecipeOrganizations`: la organización también se ofrece si `puedeAutoriaDeReceta` (conserva el filtro «organizaciones con lotes»).
  - `listRecipes`: quien opera sigue viendo todas (camino de siempre); quien no, ve **sólo las recetas de las organizaciones que puede escribir** (la plantilla, sólo con plataforma);
    sin ninguna visible se devuelve `[]` si `puedeCrearRecetaEnAlguna` (primera visita de un PM sin recetas) y se rechaza con la negativa de siempre si no.
  - Pruebas por lectura y sus controles: Project Viewer sigue sin leer (las tres), PM de OTRA finca no lee, PM puro pasa (también en una organización sin lotes y con `organization_has_no_lots`
    para quien no la escribe), capataz con `lot:manage` pasa en `getRecipeForEditor` y `listRecipeOrganizations`; en `listRecipes` el control de «quien opera» es el Platform Admin (ver duda 3).
  - Flip: filas **L1–L5** en el paso 39 (quitar la rama nueva de cada lectura, no filtrar, no rechazar, no devolver vacío): cada una hace caer la prueba del PM por su nombre.
  - Prosa corregida: intro de T14 (las dos frases «Lo que NO se arregla aquí»), la razón de `/recipes/[id]/pasos/nuevo` en `rutas-declaradas` (~5145: ya no dice «exige lot:manage…»), el comentario
    de `datosDelFormulario.ts`, la razón de la allowlist de `catalogosDelEditor`, la cabecera de `puedeCrearReceta.test.ts`, el conflicto 1 (a «Resueltos») y la duda 1 (reescritas).
  - Commit 4: 19 → **20** archivos (`git add tests/recetas/lecturasDeRecetas.test.ts`), mensaje con su párrafo, apuntada al grupo `base-sembrada`.

### COMENTARIO-PHASE (T14, Parte E)

Apartado nuevo **43 (b) 6**: corrige las dos líneas del comentario de `process_target.phase` en `prisma/schema.prisma` («nada escribe ya una fase nula —`createRecipeWithVersion` la exige—»),
**sólo comentario, sin migración**. Dice lo cierto: ninguna escritura nueva crea una meta de VERSIÓN con fase nula (las puertas que las escribían exigían la fase y se van), y la fase nula sí se
escribe en las metas de un PASO sin fase (un lavado), que no abre la grieta (unicidad por paso). El ancla (las dos líneas) casa 1 vez en el worktree y en la copia con la tarea 1 aplicada.
Comprobaciones: 8 líneas cambiadas, 0 que no sean `///`, `git status --short prisma/migrations` vacío, `prisma validate` 0, y `derivaDeMigraciones` añadido a la última corrida de la Parte E (con base).
Commit 5: 17 → **18** archivos (`git add prisma/schema.prisma`). La duda 6 vieja y la comprobación «1 línea en prisma» pasan a 0.

### C15 (T03)

Duda nueva en T03: `agua` y `capacidad_sin_recipiente` **esperan a la 2c** (dueña del ámbito de cada capacidad y de la comprobación); `validarPaso` guarda los cinco valores y sólo comprueba
que sean del catálogo `capacidad`; coste dicho. Sin código.

### C11 — guardas del trailer

Antes de cada `git commit -F` : **3 en T03** (`t03-commit-1/2/3.txt`) y **5 en T14** (`t14-msg-1…5.txt`) = **8**, con el texto exacto del ruling
(`[ "$(grep -c 'TRAILER-DE-LA-REGLA-4' <archivo>)" = 0 ] || { echo "ABORTA: falta sustituir el trailer"; exit 1; }`) y una frase en cada tarea que dice cuándo se sustituye.

### C9 — base de pruebas

El entorno de las dos tareas lee `$OUT/t00-base.txt` con `nectar_test_recetas_2a` por omisión y su sombra `${BASE}_shadow` (como `T15.md:91–92`); `export OUT` se movió antes porque la lectura lo necesita.
Las comprobaciones que abortaban por el nombre (T03 ×2: `= nectar_test_recetas_2a`; T14 ×1: `datname = '…'`) usan `$BASE`. La prosa («si la base no sale `nectar_test_recetas_2a`, parar») dice ahora «si sale un error».

### CI-INERTE

T03 (los dos bloques de `:1624–1625` y `:4027–4028`) y T14 (tres sitios que tenían el mismo `grep -c <archivo> ci.txt`: pasos 9, 37 y 45) pasan al método de T01/T02: reconstruir `EXCLUIDAS`/`A_CORRER`
con las dos líneas de `ci.sh`, con `la selección tiene N archivos`, el 0 y **dos controles** que tienen que salir 1 (en la exclusión y en la selección). Medido en el worktree: la selección da 202
archivos (la misma cifra que midió T01), y `derivaDeMigraciones` sale 0 en la selección y 1 en la exclusión.

## Lo que se midió (y qué no)

- Las cuatro ediciones del paso 32c casan **exactamente una vez**: contra el `processTargets.ts` posterior a la Parte D (copia) y contra el de HEAD de la rama (antes de la tarea 3). **La cuarta, sin
  su línea de comentario `the same rule a stale id gets everywhere else (ADR-081)`, casaba DOS veces en HEAD** (el bloque de `createRecipeVersion` previo a la tarea 3): se reforzó con esa línea.
- `tsc` sobre los archivos tocados: 0; `eslint` sobre `processTargets.ts` y la prueba nueva: 0 avisos. El `tsc` del proyecto entero de la copia da 20 errores, todos en pruebas de otras tareas
  (`libre.test.ts`, `editarBeneficio.test.ts`, `recipeAuthoring`, `recipeVersions`: nombres que el estado de la copia no trae); ninguno en lo que toqué.
- Inventario de acceso: 631 operaciones antes y después, las tres lecturas «guardia directo» (el edit no cambia ninguna clase).
- Guardias vecinos con la línea nueva de la compuerta: `ci-cobertura`, `audit-atomico`, `accion-que-no-puedes-no-se-ofrece`, `ritmo-con-quien-lo-lea`, `claves-de-traduccion-existen` y `campos-con-dos-puertas` en verde.
  `acceso-a-datos` y `cifras-del-inventario` caen 3 veces en la copia **con y sin mi cambio** (la copia tiene el inventario desfasado de la Parte E): no son de este cambio.
- **La lógica de las ramas ejecutada de verdad** con una base y dos reglas simuladas (9 casos que reproducen las afirmaciones de la prueba con base): verde; y las cinco mutaciones L1–L5, cada una con sha
  distinto, `tsc` 0 y la prueba que cae por su nombre (L1: 3 casos de `getRecipeForEditor`; L2: organizaciones, vacío y `puedeCrearRecetaEnAlguna`; L3: lista, vacío y visor; L4: visor; L5: vacío).
- **No medido** (pide la base, que esta ronda tiene prohibida): `lecturasDeRecetas` contra la base de verdad (su rojo previo, `7 failed | 3 passed (10)`, está razonado a mano, no medido), los flips L1–L5 sobre la base,
  la fila 10 de A2 sobre la base, `derivaDeMigraciones` tras el cambio de comentario, y las cifras de `mismas-filas`.

## Dudas que dejo (también están en `Dudas` de cada tarea)

1. `listRecipeOrganizations` conserva su filtro «organizaciones con lotes»: un PM de una organización recién creada y sin lotes crea su receta por el servicio, pero la organización no sale en `/recipes/new` hasta que tenga un lote.
2. Una plantilla se abre/lista sólo con alcance de plataforma (lo dice el ruling): un PM de UNA finca no la ve ni la deriva desde la pantalla. Si Daniel quiere que la derive, son dos líneas más y su prueba.
3. En `listRecipes` el control «Farm Operator con lot:manage sigue pasando» es el Platform Admin: esa lectura autoriza contra «un lote cualquiera de la base» (u1 S11, ya existente), y un capataz de finca cruzaría o no según qué lote devuelva la base compartida.
4. El menú: el enlace «Recetas» de `/beneficio` (`destinos.ts:32`) y el de `/lots` piden `lot:manage`, y la sección `/beneficio` pide `lot:view`: un PM puro abre `/recipes` por la dirección, no por el menú. Fuera del C4; se señala.
5. El esqueleto no lista `puedeAutoriaDeReceta` (T03 lo dice como «nombre nuevo»): ahora la consume T14 en tres lecturas, conviene que el controlador la ponga en la lista de nombres que revisa Daniel.
