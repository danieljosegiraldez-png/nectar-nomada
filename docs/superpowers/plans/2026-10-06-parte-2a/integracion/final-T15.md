# Informe final de T15 — R20 y la parte de T15 de R28 (2026-10-05, 22:05)

Sólo se editó `tareas/T15.md` (2785 → 3023 líneas; sha `2fe9d397844c` → `35ef45802c4c`; +265 −27 líneas de diff; copia del estado de partida en
`scratchpad/T15.final-antes.md`) y este informe. En el worktree: `git status --porcelain` = 0 y HEAD `06b2e2e9` al empezar y al terminar; sólo
lecturas de `git` (`show`, `ls-tree`, `rev-list`, `cat-file`) y un `node t15-afirmaciones.mjs` de sólo lectura sobre el árbol real. Ni `fetch`, ni
`npm install`, ni ninguna conexión a una base.

## Lo primero que encontré

T15 NO estaba como lo describía el verificador: alguien (un intento anterior de esta misma ronda, sin informe; el archivo tenía fecha de las 12:34) ya
había aplicado una parte de R20 y de R28 —el eco del paso 2 sin comillas invertidas, las 30 filas de A de R3 a R9, R22 a R24, los seis códigos de la Libre y
las ocho filas de la tabla 13.1— y había dejado **colgando** una referencia al «paso 22 (e)» que no existía (línea 1392 del guion de afirmaciones). Por eso no
me fié de lo hecho: medí cada afirmación contra el árbol real, contra el texto de las tareas y contra código armado con los bloques de las tareas.

## Qué dice cada punto del encargo

| Punto | Estado | Evidencia |
|---|---|---|
| **R20**: comillas invertidas dentro de un `echo "..."` (T15:~151) | **Hecho, y verificado con control** | La línea (hoy el eco del paso 2, :154) no lleva ninguna. Barrido de los 45 bloques bash (2382 líneas, 26 heredocs entrecomillados): **0 activas** (`scratchpad/t15-barrido-comillas.mjs`: ignora comillas simples, comentarios, heredocs entrecomillados y las escapadas, y sigue las comillas entre líneas). Control positivo: sobre un texto con el defecto da 6 hallazgos (un `echo`, un `-m` y un heredoc sin entrecomillar). **El barrido cazó una comilla activa MÍA**: al actualizar la cifra de migraciones puse `main` entre comillas invertidas dentro de un `echo "..."` (L620), la forma exacta de R20, que `bash -n` y `zsh -n` no ven; la quité y el barrido dio 0. Barrido informativo de las otras 15 tareas: 0 en T00–T13; T14 da 4 sobre una línea que es **falso positivo** (comillas invertidas entre comillas simples dentro de un `$(...)`: probado, son literales) |
| **R28 · cifras al día con T00** | Hecho | Ver «Cifras» abajo |
| **R28 · los seis códigos de la Libre, medidos en T10** | Confirmado y ya recogido | T10 paso 5 declara en `errorDeReceta.ts`: `libre_sin_pasos`, `libre_parecida`, `libre_repetida`, `libre_con_receta`, `libre_demasiados_pasos`, `libre_con_lectura_de_cierre` (los dos últimos, de R6, los lanza `validarPasosPlaneados` en `pasos.ts`) y, aparte, el de proceso `receta_libre_no_se_elige`. T15 los afirma (A, bucle de `errorDeReceta.ts`), los nombra en la fila §5.2 de la tabla («**Seis** códigos…») y en «Consume». Medí también dónde vive cada código de T11 (`lectura_reemplazada` y `lectura_de_cierre_ajena` en `errorDeProceso.ts`; `no_es_libre` y `ya_convertida` en `errorDeReceta.ts`): coincide con las listas de T15 |
| **R28 · la tabla «lo que se construyó distinto» gana R3–R9 y R23** | Ya estaba; verificada y corregida una fila | 27 filas (cabecera + 26), las ocho de la revisión (R9, R3, R4, R5, R6, R23, R7, R8+R24) con su regex, y 1 fila con 6 columnas (la de V16, que lleva `organizationId \| null`): las tres cuentas del paso 19 dan 27, 8 y 1 sobre el heredoc extraído. **Corregí la fila R8/R24**: decía que leer los pasos de una Libre pasa por `exigeLecturaDeLosPasos`; en la T03 vigente la Libre va a `exigeVerLosLotesDeLaLibre` |

## Lo que estaba roto o incompleto, y lo que hice

1. **Una fila de A caía sobre código correcto (R24).** Medida contra el código de la T03 (la tarea cambió a las 12:45 y otra vez a las 21:38): la guardia con `"view"` ya no es
   `exigeLecturaDeLosPasos` —ésa pide autoría o `manage`— sino la nueva `exigeVerLosLotesDeLaLibre`, a la que `pasosDeLaVersion` manda a la Libre. Reescribí las dos filas (control de la guardia y propiedad `view`
   sobre su bloque) y **añadí la tercera, la conducta** (`pasosDeLaVersion` la llama). Texto, tabla y la duda 4 al día.
2. **Faltaba el «paso 22 (e)».** Lo escribí: `t15-flip-afirmaciones.mjs` + `t15-flips-afirmaciones.json` (código entero en heredocs), cinco mutaciones que **quitan la conducta**, una por tarea —R3 (T11, su fila 30), R5 (T11, fila 23),
   R8 (T14, fila L6), R9 (T09, fila 6) y R24 (sin fila en la T03: la añade este paso)— con las anclas que esas tareas ya tenían. Por mutación: árbol limpio, control de que la fila existe y pasa, texto una sola vez, sha antes y después,
   `git diff --stat`, qué filas caen **de más** (tienen que ser exactamente la nombrada), restauración y sha de vuelta. Aborta si `t15-afirmaciones.mjs` no llega a su línea final. Enganchado al resumen, al cuerpo del PR («Medido»),
   a la tabla final de flips, a «Archivos» y a la prosa del paso 22.
3. **Cifras.** Ver abajo. Tres nombres de commit de `main` en el texto (a8f50df7, 7c56d8c8 y el nuevo ab94ff09).
4. **Migraciones.** El paso 7 esperaba `aplicadas ≥ 190`; hoy son 203 en `main` (202 la rama sola) + la de la 2a = 204.
5. **Conteos del guion de afirmaciones**: 183 → **184** filas (A 159 → 160, B 18, C 6); sobre el árbol real, sin la 2a, **184 · FALLAS=168** (151 en A, 17 en B, 6 `ok` en C); en el árbol construido: `FALLAS=17` antes de editar el diseño y 0 después.

## Pruebas (con control y con flip)

- **Las filas de A contra el CÓDIGO real de las tareas.** Armé un repositorio de juguete (`scratchpad/t15f/arma_toy.py`) con los bloques de código de T03 (pasos, autoría y el perfil), T09, T10 y T11, y con el `processTargets.ts` y el
  `catalog.ts` **reales** de `origin/main` más las ediciones de las tareas: las **cuatro sustituciones del paso 32c de la T14 casan cada una exactamente una vez**, y las dos ediciones del perfil de T03 también. Corrí el `t15-afirmaciones.mjs` extraído **del propio T15**: las
  **42 filas** de R, C4 y C8 pasan, salvo la del tope de `MAX_PASOS_PLANEADOS` en `lib` y `app`, que exige haber mirado 50 archivos y el juguete tiene 12 (cuenta 1, la buena). Repetido con los textos de las 21:38 (T03) y las 21:29 (T00).
- **El flip (e), 5 de 5** sobre ese juguete en git: cada ancla una vez, sha distinto, cae exactamente una fila (la nombrada), restaurado. **Y el arnés se probó a sí mismo con siete casos que tiene que rechazar** (todos rechazados): nombre de fila mal escrito, ancla ausente,
  mutación que no quita la conducta (sólo un comentario), mutación que tumba cuatro filas de más, árbol que no está en verde, archivo sucio y `t15-afirmaciones.mjs` inexistente (aborta: «no se pudo medir» no es «ninguna cayó»). Con el código de salida leído del propio guion, no de una tubería.
- **Sintaxis de todo lo que escribe el plan:** `bash -n` y `zsh -n` en los 45 bloques, `node --check` en los 8 `.mjs`, `JSON.parse` en los 3 `.json`: 0 errores; control positivo con un bloque, un `.mjs` y un `.json` rotos (los tres marcados). Cada heredoc extraído del plan es **byte a byte** el que se probó.
- **Guarda del trailer:** los 4 `git commit -F` / `git merge -F` de T15 la llevan delante (medido con un detector con control: quitada la guarda, da «SIN GUARDA»). El único `git push` va tras la comprobación de ancestro.
- **Las 15 anclas del flip de integración (I1–I15)** siguen casando contra el texto de las tareas (T03 vigente incluida).
- **Anclas de A contra la prosa y los bloques de todas las tareas** (`scratchpad/t15f/mide-anclas.mjs`): ninguna fila con ancla «≥1» sin acierto, salvo las que leen código que ya existe en `main` (`catalog.ts`) o lo reescriben las sustituciones de la T14 (todas pasan en el juguete).

## Cifras (medidas con un guion que lee la lista como `ci.sh` y `ci-con-base.sh`; con control: da las 418/206/212/206 que mide T00 sobre `a8f50df7`)

| árbol | tests | hermético | excluidas | base-sembrada | `SESSION_STATE.md` | tope | migraciones |
|---|---|---|---|---|---|---|---|
| rama sola `06b2e2e9` | 414 | 202 | 212 | 206 | 394 | 400 | 202 |
| `a8f50df7` (el «hoy» de T00) | 418 | 206 | 212 | 206 | 397 | 400 | 203 |
| `7dd95ab8` | 422 | 208 | 214 | 208 | 381 | 450 | 203 |
| `7c56d8c8` (el `main` que T00 nombra; le lleva 72 commits a la rama) | 422 | 208 | 214 | 208 | 396 | 450 | 203 |
| **`ab94ff09`** (hoy, 22:00; **#646 acaba de fusionar**; 82 commits) | **423** | **209** | 214 | 208 | **401** | 450 | 203 |

El hueco para la entrada de la 2a en `SESSION_STATE.md` es hoy **49** líneas (cabe: ocupa 5). `origin/main` se movió **mientras trabajaba** (de `7c56d8c8` a `ab94ff09`), así que T15 lo dice en sus tres sitios y repite que lo que manda es lo que imprima cada guion.

## Dudas

1. **Dos tareas cambiaron mientras trabajaba** (T03 a las 21:38, T00 a las 21:29) y `main` avanzó. Re-medí todo contra ellas, pero seguirán moviéndose: los scripts de medición están en `scratchpad/t15f/` (`arma_toy.py`, `mide-anclas.mjs`, `mide-flips.mjs`, `carriles.mjs`, `extrae.mjs`, `valida-sintaxis.sh`) y se repiten en un minuto.
2. **T00 está viejo en un punto que no es mío:** dice que #646 está `OPEN` y que su paso 9 da `NO_ESTA`. Fusionó a las 21:59 (`ab94ff09`): toca `lib/traceability/drying.ts`, las dos acciones de cierre y los mensajes, que T11 y T13 anclan por texto (R19). La tarea 0 lo medirá bien (da `EN_ARBOL`), pero su prosa y las anclas de T11/T13 conviene releerlas contra `ab94ff09`.
3. **La T03 no tiene fila de flip para el camino de la Libre de `pasosDeLaVersion`** (su tabla de 33 filas no la nombra). La cubre aquí la E5 a nivel de afirmación; una prueba de conducta con su flip en la T03 sería lo suyo.
4. **Las filas de A son de PRESENCIA**: el flip (e) dice que cada una cae cuando se quita su conducta, no que atrape toda forma de romperla (cambiar `> 0` por `> 100` no la toca). Lo dice T15 y lo cubren las pruebas de conducta de las tareas.
5. **Usé `git init`/`add`/`commit`/`checkout` en repositorios de juguete DENTRO del scratchpad** (`t15f/toy-git`, `toy-git2`), como en la ronda del 2026-10-04, para poder ejecutar el arnés que restaura con `git checkout --`. Ningún comando de escritura de git tocó el worktree ni su repositorio (comprobado: HEAD `06b2e2e9`, 0 sucios). Si el encargo quería excluir también los juguetes, se borran sin consecuencias.
6. **No toqué R21 (T13) ni R25/R26/R27**: no son de T15. La fila de R22 de A (`MAX_PASOS_PLANEADOS` declarado una vez) sigue viendo bien a T13: ahora la T13 lo re-exporta con `export { … }` y la fila busca `export const`.

Archivos relevantes: `/Users/danielsan/Developer/nectar-worktrees/recetas-parte-2a/.superpowers/plan-2a/tareas/T15.md` · `/private/tmp/claude-501/-Users-danielsan/02029a71-7835-4736-b245-713ece44a3e2/scratchpad/t15-barrido-comillas.mjs` · `…/scratchpad/t15f/` · `…/scratchpad/T15.final-antes.md`.
