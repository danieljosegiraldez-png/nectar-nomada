# Arreglo mecánico — T10 y T12 (C9, C11, CI-INERTE)

Hecho el 2026-10-04 sobre `recetas-parte-2a`. Editados EN SU SITIO, y sólo ellos: `tareas/T10.md` (2819 → 2841 líneas) y `tareas/T12.md`
(1697 → 1722). Respaldos de antes en el scratchpad de la sesión (`…/scratchpad/arreglo-t10-t12/T10.md` y `T12.md`). Ningún
`git add/commit/stash/checkout/rebase/push`, ningún `npm install`, ninguna conexión a una base de datos. `git status --porcelain` del worktree: 0
líneas antes y después; `recetas-parte-2a--guiones` no se creó (los bloques que lo crean corrieron con la ruta cambiada al scratchpad).

## Qué cambió

| id | T10 | T12 |
|---|---|---|
| **C9** (la base sale de `$OUT/t00-base.txt`, por omisión `nectar_test_recetas_2a`, sombra `<base>_shadow`) | el «Bloque de entorno» (:160-183, con la lectura en :174-181): `OUT`/`GUIONES`/`mkdir` suben encima de las URL (antes `OUT` se definía DESPUÉS de usarse en la lectura), `BASE` se lee con el mismo patrón de T15/T06/T03 y las tres URL salen de `$BASE`; la frase de presentación del bloque (:160-163); el «Esperado» del paso 1 (:248, ya no exige el nombre literal); el `EXISTE` del arnés del paso 25 usa `'$BASE'` y su `ABORTA` nombra `$BASE` | el heredoc de `t12-entorno.sh` (:156-172, con la lectura en :164-171), con el mismo reordenamiento y las tres URL desde `$BASE`; la regla «Base» (:130); la lista de lo que lleva el entorno (:128); la fila patrón de la escotilla de limpieza (:223, ahora `printf '%s\n' "$BASE"`); el `EXISTE` del arnés del paso 13 (:1630) usa `'$BASE'` |
| **C11** (guarda del trailer delante de `git commit -F`) | delante de los DOS `git commit -F` (paso 7, commit 1; paso 24, commit 2), antes del `tsc` encadenado, con una frase en cada «Esperado» | delante del único `git commit -F` (paso 12) + una frase en el «Esperado» + una cláusula en la regla del trailer (:142). **El bloque se partió en dos**: el que escribe el mensaje con `cat <<'EOF'` (que ahora imprime la cuenta del marcador) y el que commitea (guarda + commit). Con un solo bloque, repetirlo tras sustituir el trailer habría reescrito el marcador |
| **CI-INERTE** | paso 22 (:2602-2616): las dos líneas `grep -c … t10-ci.txt` («ci.sh nombra libre.test (0)» y su control «≥ 1») se quitan; en su lugar, las tres N (reconstruidos, «CI correrá», «Test Files … passed») y un veredicto «es la reconstruida: sí/NO — PARAR». El «Esperado» se reescribe | paso 10 (:1344-1358): su única línea «ci.sh nombra la nueva (debe ser 0)» se sustituye igual; «Esperado» reescrito |

El método de T01/T02 reconstruye la selección con las dos líneas de `ci.sh` y mira ahí; **T10 y T12 ya la reconstruían ANTES de correr `ci.sh`**
(`t10-hermeticas.txt` / `t12-hermeticas.txt`, con sus lecturas 0 y 1), así que no se duplicó: lo que faltaba era atar esa selección a lo que
`ci.sh` de verdad corrió, y eso hacen las tres N. Las lecturas «0» y «1» quedan donde estaban, ahora dichas como lo que son (valen sobre la
reconstrucción, no sobre la salida de `ci.sh`).

## Cómo se comprobó (scratchpad `arreglo-t10-t12/`)

Los bloques se extrajeron del `.md` YA editado con `awk` (no retecleados) y se ejecutaron con la ruta de salida cambiada al scratchpad.

| qué | resultado |
|---|---|
| bloque de entorno de T10 y heredoc de T12, bash y zsh, sin `t00-base.txt` / con `nectar_test_recetas_2a_b` | sin archivo: `…_2a` y `…_2a_shadow`; con sucesora: `…_2a_b`, `…_2a_b_shadow`; las cuatro combinaciones iguales en bash y en zsh |
| **C11**, las tres guardas extraídas (T10 ×2, T12 ×1), bash y zsh, tres casos | marcador sin sustituir: `ABORTA`, salida 1, el comando siguiente NO corre; trailer sustituido: salida 0, corre; archivo ausente: `ABORTA` (falla cerrada) |
| **C11, T12**, los dos bloques en secuencia con `git` de mentira | A: «marcador … 1»; B con el marcador: `ABORTA`, salida 1; sustituyo la última línea y repito SÓLO B: marcador 0, `git commit -F …` llega, `commit=0` |
| **CI-INERTE**, el paso 22 de T10 y el 10 de T12 contra el `ci.sh` REAL (el del worktree, con `npm` y `npx` de mentira) sobre 417 archivos de prueba vacíos con los nombres reales + los tres nuevos | normal: 203 = 203 = 203, «sí». Flip 1 (vitest dice un archivo menos): 203 / 203 / 202 → «NO — PARAR». Flip 2 (`verify` falla, `ci=1`): «CI correrá» y «Test Files» `NINGUNA` → «NO — PARAR». Los dos se repiten idénticos en T10 y T12 |
| el método VIEJO sobre la misma salida normal | `grep -c -F 'tests/recetas/parecido.test.ts' t10-ci.txt` = **0**: el control «≥ 1» viejo habría fallado con la suite en verde, y el «0» de su primera línea habría dado igual con y sin la prueba apuntada |
| flip de la reconstrucción (quito `libre.test.ts` y `recepcion.test.ts` de la lista de exclusión; sha 3586…→eaf9…, 214 → 212) | T10: «libre.test (con base) entre ellas (debe ser 0): **1**»; T12: «la nueva entre ellas (debe ser 0): **1**»; 205 herméticas. La línea de las tres N dice «sí» (sólo ata, no juzga la lista): lo que delata es la lectura 0/1 |
| `sed` de las dos extracciones con `LC_ALL=C`, `en_US.UTF-8` y el locale por omisión | 203 en los tres; con `Test Files  1 failed \| 202 passed (203)` no casa y da `NINGUNA` (falla cerrada) |
| `bash -n` y `zsh -n` sobre los 8 bloques tocados | 0 en todos |
| anclas de las 12 ediciones (herramienta `Edit`, que exige que el texto viejo sea único) | todas casaron UNA vez; vallas de código (` ``` `): T10 156 → 156, T12 46 → 48 (el bloque partido) |

**Un tropiezo del arnés mío, dicho:** en una pasada intermedia el escenario «`ci.sh` muere» salió «sí» con 203 en las tres cuentas. No era el
plan: era `env $esc …` con `$esc` sin comillas en zsh, que no parte la cadena y dejó `STUB_NPM_FALLA` sin fijar, o sea la trampa que ya
documenta el hook `partir-por-palabras`. Lo destapó que el mismo escenario hubiera dado `ci=1` y `NINGUNA` una pasada antes: dos lecturas que se
contradecían. Repetido con `env "$@"`: `ci=1`, `NINGUNA`, «NO — PARAR».

## Lo que NO se hizo, y por qué

- **No se ejecutó nada contra una base** (prohibido): los bloques con `psql` (el `EXISTE` de los dos arneses, los pasos 1) sólo pasaron `bash -n`; la
  lectura de `t00-base.txt` que los alimenta sí se probó en seco.
- **No se corrió `ci.sh` de verdad** (genera el cliente de Prisma y corre `verify` y la suite): se corrió su texto real con `npm`/`npx` de mentira.
  Lo que se midió es que el bloque de la tarea discrimina; que la suite pase es cosa de quien ejecute la tarea.
- **No se tocó nada más** de T10 ni de T12 (ni los pasos de flip, ni las tablas, ni el código), como pide el encargo.
