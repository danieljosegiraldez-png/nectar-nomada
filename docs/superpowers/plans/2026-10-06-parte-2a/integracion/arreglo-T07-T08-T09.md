# Arreglo del segundo cruce — T07, T08, T09 (2026-10-04)

Alcance: sólo los tres cambios mecánicos del registro (C11, C9, CI-INERTE) en `tareas/T07.md`, `T08.md` y `T09.md`, más la confirmación
de T07 paso 8c contra T05. Ningún otro archivo del plan se tocó. Ninguna base se tocó (los `psql` se probaron con un `psql` falso).
`.superpowers` no está versionado (`info/exclude`), así que no hay `git diff` de esto: los cambios van por línea.

## Qué cambió

| Cambio | T07 | T08 | T09 |
|---|---|---|---|
| **C11**, guarda del trailer delante de cada `git commit -F` | :1434 (1 commit) | :1483 (1 commit; la guarda va en su propia línea ANTES del `tsc`, para que el `$?` que lee `test $? -eq 0` siga siendo el del `tsc`) | :996, :1555, :1969 (3 commits) |
| **C9**, el entorno lee `$OUT/t00-base.txt` (omisión `nectar_test_recetas_2a`), sombra `${BASE}_shadow` | :103 (bloque inline; `B` y `OUT` suben antes de las URL) | :141 | :133 (el bloque no definía `$B`; se añade) |
| C9, prosa «la única base es…» | :114 | :152 (y el comentario de cabecera del test nuevo, :255, deja de nombrar la base) | :140 |
| C9, comprobación con el nombre literal | — | :1507, `datname = '$BASE'`; la línea decía «1, o se aborta» y **no abortaba**: ahora aborta y restaura el archivo mutado (`git checkout -- "$F"`) | :162, el `echo` imprime `$BASE` (era informativo, no abortaba) |
| **CI-INERTE**, de `grep -c <archivo> ci.txt` a reconstruir la selección de `ci.sh` | :1339-1351 (era :1337-1338) | :1393-1405 (era :1391-1392) | :932-944 (**no estaba en la lista del cruce**: es el mismo patrón, `grep -c 'lectoresPorPaso' $OUT/t09-ci.txt`; entra por «toda comprobación») |

El método de CI-INERTE es el de T01 paso 12 / T02 paso 15, con tres endurecimientos que T01/T02 no tienen, todos medidos abajo:
la cifra reconstruida se COMPARA con la línea «CI correrá N» que imprimió `ci.sh` (T01/T02 piden mirarlas a ojo); `grep -cxF` con la ruta
entera en vez de una subcadena (es lo que hace `ci.sh` con `grep -vxF`); y un control de que la prueba nueva existe en disco.

## T07 paso 8c y T05 — confirmado

`recetaDemoVersionId` es exactamente el nombre que T05 deja: `T05.md:1696` `const recetaDemoVersionId = recetaDemo.versions[0]?.id;`,
con la guarda `if (!recetaDemoVersionId) { throw … }` en :1697-1699, dentro de `seedDemoTraceabilityChain`, justo antes de `const blindCodes`
(`seed.ts:880` hoy). El `for` de las tandas (`seed.ts:883`) queda después, y es ahí donde 8c pone `pasoDeLaDemo`, así que la constante está en el
alcance. Los pasos que busca 8c (`fermentation`, `drying`) están en `tiposDeLaRecetaDemo` de T05 (`["pulping","fermentation","washing","drying"]`).
Medido: las tres anclas de 8c casan **1 vez** cada una en `prisma/seed.ts` del worktree. Compilado: el bloque `pasoDeLaDemo` extraído literal de T07
junto a la declaración y la guarda extraídas literal de T05, con `strict` + `noUncheckedIndexedAccess` (las opciones del repo) → `tsc=0`; sin la
guarda de T05 → `TS2322 string | undefined` (**T07 depende de que T05 conserve esa guarda**; está dicho aquí y no hace falta cambiar nada).
La duda 1 de T05 (C12) es de otro agente y no la toqué.

## Medidas (todas con su control)

- **C11, las 5 guardas extraídas del `.md`** (no retipeadas), con `git`/`npx` falsos que dejan rastro: archivo CON marcador → `ABORTA…`, salida 1, **0**
  llamadas a `git commit`; SIN marcador → `commit=0`, **1** llamada; archivo AUSENTE → `ABORTA` (grep da error, `$(…)` queda vacío, `[ "" = 0 ]` falla), 0 llamadas. Las 5 × 3.
  Cuenta: 5 `git commit -F` ejecutables, 5 guardas, cada una justo encima.
- **CI-INERTE, premisa medida de nuevo** (no heredada): vitest 4.1.10, dos pruebas, una pasa y otra cae, sin terminal → el nombre de la que pasa aparece
  **0** veces; el de la que cae, 3. O sea que `grep -c <archivo> ci.txt` da 0 con la prueba corriendo y en verde.
- **CI-INERTE, el bloque nuevo, extraído del `.md`, 4 mundos** sobre un árbol con los 414 nombres de prueba del worktree + las 3 nuevas, N calculada por un camino
  independiente (bucle sobre disco): A correcto → `0 · 1 · 0 · 1 · 1` (N=202, la cifra de T01); **B flip, las 3 nuevas fuera de la lista → la tercera línea pasa a 1 y la
  cuarta a 0** (N=205); C `ci.sh` murió antes de imprimir → la comparación da 1; D `ci.txt` de otra corrida (N distinto) → 1. Las tres tareas, los cuatro mundos.
- **Atado a la salida real de `ci.sh`**: las tres líneas de `scripts/ci.sh` que calculan la selección y la imprimen, ejecutadas en el worktree → «CI correrá 202 archivos…»;
  el `sed` del plan extrae 202; la reconstrucción da 202. `mensajesDeProceso` está en la selección real (1) y `rejillaEnLaBase`, excluida hoy, en la exclusión (1) y no en la selección (0).
- **C9, los 3 bloques de entorno extraídos del `.md`** (rutas sustituidas por rutas del scratchpad; 0 rutas del worktree real en lo que se corrió): sin `t00-base.txt` → `nectar_test_recetas_2a`
  y `…_shadow`; con `nectar_test_recetas_2a_b` → `…_b` y `…_b_shadow`; archivo vacío → omisión. T08 :1507 con `psql` falso: la consulta recibida lleva `'$BASE'`; con 0 filas aborta y llama a
  `git checkout -- prisma/seed.ts`; con 1 sigue.
- Vallas de código balanceadas en los tres (86/76/146 líneas de valla, pares), y 0 archivos de código bajo `.superpowers`; `git status --porcelain` del worktree, 0.

## Tropiezos míos, dichos

- Mi primera cuenta de guardas dio 0 en los tres archivos (incluido T09, que tiene tres): era el patrón con comillas anidadas, no el archivo; se midió con `grep -F -f patrón` y dio 1/1/3.
- `set -- $par` en zsh no parte la cadena (la trampa de la regla global): el extractor falló en rojo con «No such file»; se reescribió con llamadas explícitas.
- Mi primer flip de la compilación de 8c dio `tsc=0` **sin** la guarda: el stub no discriminaba porque le faltaba `noUncheckedIndexedAccess`. Se rehízo con las opciones del repo y entonces sí cae (TS2322).

## Lo que no hice y por qué

- No cambié «en `$OUT` sólo va texto —`.txt`, `.json`, `.md`—» (T07/T08/T09): es un subconjunto de la regla 14 ampliada, no es falso, y estas tareas sólo escriben `.txt` en `out`.
- No toqué ningún código de las tareas (guardián, semilla, pruebas): ningún cambio mecánico lo pedía.
- No corrí nada con base, ni `bash scripts/ci.sh` entero, ni `npm`.

## Dudas

1. T08 :1507 y T09 :162: aparte del mecánico, T08 :1507 pasó de informar a abortar de verdad (era lo que su propio comentario decía). Si el controlador prefiere sólo el cambio de `$BASE`, se quita la rama `ABORTA`.
2. T09 :932-944 no estaba en la lista de anclas del cruce (`T07 :1337–1338; T08 :1391–1392`) pero es el mismo defecto; lo corregí. El resto de tareas con ese patrón (T03, T04, T10, T11, T06) son de otros agentes.
