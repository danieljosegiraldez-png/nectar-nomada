# Arreglo de T15 — ronda del segundo cruce (C1–C9, C11, C16, CI-INERTE) — 2026-10-04

Sólo se editó `tareas/T15.md` (2508 → 2675 líneas; copia del original en el scratchpad) y este informe. En el worktree: `git status --porcelain` = 0 en las tres veces que se midió (a mitad del trabajo, antes de escribir el informe y al terminar),
HEAD `da048af2`. No se hizo `fetch`, `commit` ni `push` en el repositorio del plan, ni `npm install`, ni se abrió ninguna conexión a una base: el entorno de T15 se probó con la
llamada a `psql` quitada. Las pruebas de bloques con `git` (`checkout`, `commit`, `push`, `update-ref`) se corrieron en **repositorios de juguete dentro del scratchpad**, con un
remoto local desnudo, nunca en el árbol del plan.

## Qué cambió, por ruling

| Ruling | Qué dice ahora T15 | Dónde |
|---|---|---|
| **C1** | `lecturasParaMarcar` se afirma como `export async function` de `lib/recetas/paraLasPantallas.ts` (exacto 1); fila nueva: `lib/recetas/lecturasParaMarcar.ts` ya no existe. La fila de la 13.1 nombra su módulo. Se borra la duda 4 vieja («se estaban integrando»). | A (paso 17), 13.1, Dudas |
| **C2** | «publicar no escribe expectedHours» se mide sólo en el bloque `tx.processRecipeVersion.update({` … `})` (exacto 0), con dos controles: ese bloque pone `approved` (1) y el `expectedHours` de `processRecipePhase.create` sí está (≥1). | A |
| **C3** | G1 pasa a «**2c — equipos y capacidades**: `2026-10-04-parte-2c-equipos-y-capacidades-design.md`». La fila de A que exigía 0 diseños de la 2c exige ahora **exactamente uno y con ese nombre**; B gana dos filas (el general nombra su diseño; el general ya no dice «sin diseño escrito»). El texto del PR (paso 25) dice «Equipos y capacidades». Flip nuevo en el paso 22 (d). | A, B, G1, paso 22, PR |
| **C4** | A: el perfil Coffee Process Manager **no** lleva `["lot", "manage"]` ni `["lot", "view"]` (cada negativa con su control: el recorte lleva `["lot", "approve_exception"]`), `puedeAutoriaDeReceta` existe una vez, y cada una de las tres lecturas de `processTargets.ts` la llama dentro de su bloque. 13.1 y PR lo cuentan. | A, 13.1, PR |
| **C5** | La rama **ya está en el remoto** al llegar a T15: esperado `remoto con la rama: 1`, `@{u}` = `origin/recetas-parte-2a`, remoto = ancestro de HEAD y sin commits que HEAD no tenga (si no, PARAR); el paso 24 compara HEAD, `@{u}` y el remoto con `git ls-remote` y dice que es el tercer push, nunca `--force`. | cabecera, paso 2, paso 24, Conflictos nº 2 |
| **C6** | Cuatro borrados esperados (los dos formularios y `recipeAuthoring.test.ts` y `recipeVersions.test.ts`, medidos en T14 con `git rm`), comparados con `comm` contra una lista, con tres cuentas (ajenos, faltan, control con lista vacía). | paso 24 |
| **C7** | Las dos frases «esta máquina no tiene ninguna credencial de producción» (paso 16 y cuerpo del PR) pasan a «la decisión de tocar producción es de Daniel; el SQL Editor de Neon no deja la credencial en disco; la sesión no corre nada contra producción». Se quita la cita a «psql SÍ EXISTE». | paso 16, PR |
| **C8** | A: `convertirLibre` y `puedeConvertirLibre` llaman `requireLotAccess(…, "view", …)` en su bloque, `convertirLibre` exige `exigeAutoriaDeReceta`, `puedeConvertirLibre` `puedeAutoriaDeReceta`, y `convertir.ts` no tiene ninguna `requireLotAccess` con `"manage"`. 13.1 y PR dicen la excepción. Flip nuevo en el paso 22 (c). | A, 13.1, paso 22, PR |
| **C9** | Comprobado, sin cambio de lógica: `t15-entorno.sh` ya leía `$OUT/t00-base.txt` con `nectar_test_recetas_2a` por omisión, y la sombra es `${BASE}_shadow`; ningún paso compara el nombre con el literal. Probado con y sin `t00-base.txt` y con `nectar_test_recetas_2a_b` (la sombra sale `…_2a_b_shadow`). Se dejó dicho en el entorno y en su Esperado. | paso 1 |
| **C11** | T15 ya tenía la guarda en sus **4** sitios (`git merge -F`, dos `git commit -F` y el de los documentos); no se añadió ninguna. Se midió con un detector que exige la forma de la guarda y con un control: quitando una guarda, el detector la cuenta. | — |
| **CI-INERTE** | En T15 no hay ningún `grep -c <archivo> ci.txt` ni «ci.sh nombra la nueva»: su paso 13 ya reconstruye la selección de `ci.sh` (`t15-carril.mjs`) y compara su cuenta con la que imprimió el script. Nada que cambiar. | — |
| **C16** | El tope de `SESSION_STATE.md` **no se escribe**: el entorno lo lee de `MAX_LINEAS` (`$TOPE_ESTADO`, 400 hoy en la rama y en `origin/main` `50cbfda3`, aunque la regla global diga 450), el paso 8 y el 24 imprimen el de la rama y el de `main`, y el cuerpo del PR (paso 25) calcula el hueco y escribe «cabe» o «no cabe» según 5 líneas (la entrada propuesta). Medido hoy: rama 394, `main` 397, hueco 3. | cabecera, entorno, pasos 8, 24, 25, 27 |
| regla 14 | La línea de `$OUT` cita la regla 14 ampliada (`.txt .json .md .sql .sh .tsv`); T15 sigue escribiendo ahí sólo `.txt`, `.json`, `.md`. | cabecera |

Además: «Consume» nombra `puedeAutoriaDeReceta`, `lecturasParaMarcar` y las tres lecturas; el §8 de cierre gana dos filas (C4 y C8) con su hueco dicho; la tabla final de flips, tres filas; las Dudas
resueltas nombran C1–C8 y C16, y la nueva duda 4 dice de qué forma del código dependen las filas de C4 y C8.

## Cifras del guion de afirmaciones (`t15-afirmaciones.mjs`)

| | antes | ahora |
|---|---|---|
| filas | 133 (A 111 · B 16 · C 6) | **150** (A 126 · B 18 · C 6) |
| `FALLA` antes de editar el diseño, con A en verde | 16 | **17** (B 17 de 18: la ausencia «ya no dice sin diseño escrito» pasa antes de editar; su control es la fila de presencia) |
| medido sobre el árbol de hoy (sin la 2a construida) | 120 | 134 (117 en A, 17 en B) |

Los textos del paso 17 y del paso 20 («133», «16») se actualizaron a 150 / 17 / 18.

## Anclas medidas

- **En el worktree** (`grep -cF`): `export async function listRecipes(`, `listRecipeOrganizations(`, `getRecipeForEditor(` en `processTargets.ts`: 1 cada una; `const MAX_LINEAS = `: 1 línea;
  los cuatro archivos que T14 borra existen hoy: 1 cada uno. El diseño de la 2c: 1 archivo `parte-2c`.
- **Contra el texto de las tareas** (T03 18:01, T10, T11 18:12, T13, T14 18:43): `export async function lecturasParaMarcar(` 1 en T13; `tx.processRecipeVersion.update({` 1 en T03; `tx.processRecipePhase.create({` 1 en T03;
  `requireLotAccess(userAccountId, "view"` ×2 en T11 (el reescrito de C8); `name: "Coffee Process Manager",` 1 en T03; y las **cuatro sustituciones del paso 32c de T14 casan cada una exactamente una vez** sobre el `processTargets.ts`
  real y dejan 3 llamadas a `puedeAutoriaDeReceta(` (una por lectura).
- **Ediciones del diseño** (paso 18): D1–D6 y G1 con el texto nuevo de G1 casan **una vez** cada una sobre una copia de los dos diseños (segunda corrida: aborta).

## Lo que se ejecutó (todo de sólo lectura sobre el plan, o en juguetes)

- `node --check` de los 7 `.mjs`, `bash -n` y `zsh -n` de los 3 `.sh` y de los **44 bloques bash** de T15, y `JSON.parse` de los 2 `.json` embebidos: 0 errores.
- `t15-afirmaciones.mjs` contra el árbol real (150 filas, 134 `FALLA`, 6 controles `ok`) y contra un **árbol de juguete** armado con el texto de las tareas 3, 10 (`derivarFases`), 11 y 13, el `catalog.ts` y el
  `processTargets.ts` reales con lo que T3 y T14 les añaden, y los dos diseños con las siete ediciones y un §13 simulado: las 23 filas nuevas o cambiadas, `ok`; la sección B, 18 de 18.
- **Flip de cada fila nueva**, una mutación sobre copias del juguete: C1 (renombrar `lecturasParaMarcar`), C2 (`expectedHours` en la actualización de la versión), C4 (`lot:manage` al perfil; quitar `puedeAutoriaDeReceta`
  de `getRecipeForEditor`), C8 (`view` → `manage`): cae exactamente la fila de la mutación y ninguna otra de las mías.
- Los bloques nuevos del **paso 22 (c, d)** tal cual, en un repositorio de juguete con `git`: el perfil operando cae por «C4: … NO lleva lot:manage»; `convertirLibre` pidiendo `manage` cae por las dos de C8; el general con la
  frase vieja cae por las dos de B; sha restaurado y `sucios: 0` en cada una.
- Los bloques del **paso 2** (con remoto, y sin remoto: imprime `ABORTA`) y del **paso 24** (con y sin un borrado ajeno: «1 (0)» y el nombre; el push a un remoto local desnudo, `HEAD = remoto: sí`), y el fragmento del cuerpo
  del PR (paso 25) con hueco 3 («no cabe») y con hueco 8 («cabe»).
- El entorno real con una sucesora (`nectar_test_recetas_2a_b`) y sin `t00-base.txt`.

## Lo que NO se ejecutó

`git fetch`, el rebase/merge de T15, `npm ci`, `prisma generate`, todo `psql`/`pg_dump`/`create database`, el renombrado de la fila de `_prisma_migrations`, `migrate deploy`, la semilla, `vitest` sobre el árbol real, `ci.sh`,
`ci-con-base.sh`, el build, el flip de integración real (los 15 + los de C4/C8 sobre código que aún no existe), `gh pr create`. Los 3 flips nuevos del paso 22 sólo se corrieron en juguetes: sobre el árbol construido
quedan por ver con el contador total en 1 y 2.

## Dudas

1. **Las filas de A de C4 y C8 dependen de la forma del código de T3, T11 y T14**, que se reescribían a la vez: están medidas contra el texto de las 18:01, 18:12 y 18:43. Si una tarea cambia la forma (autoría en un ayudante, otro guardia), una `FALLA`
   en A nombra la fila y se lee antes de aflojar (paso 17, (a) y (c)). La duda está escrita en T15.
2. **Un Coffee Process Manager «puro» no convierte una Libre** (C8 pide `view` y su perfil no lleva `lot:view`, T03/C4): sólo convierte quien ve el lote por otro perfil (V14). T11 ya lo dice en su duda 1; T15 lo escribe en el cuerpo del PR
   para que Daniel lo sepa antes de fusionar.
3. **El tope de `SESSION_STATE.md`**: el guion dice 400 y la regla global 450. T15 lee el guion y no decide; si la coordinadora sube `MAX_LINEAS`, el cuerpo del PR lo recalcula solo. La entrada propuesta mide 5 líneas (está fija en dos sitios: el
   cálculo del hueco y el texto de paso 27).
4. **No hay flip de integración que quite `puedeAutoriaDeReceta` de `listRecipes` o `listRecipeOrganizations`**: la prueba de T14 (`lecturasDeRecetas`) y su flip L1 sólo mutan `getRecipeForEditor`. Está dicho en el §8 de T15. Si se quiere, es una fila más (I16) con su ancla.
5. **C10 (regla 14) y C15 (2c: `agua`, `capacidad_sin_recipiente`) no eran de esta tarea**: se tocó sólo la cita a la regla 14 y una línea del PR que remite a la 2c; el resto es de T02/T03/T05.
