# Revisión T05 y T10 — ronda del 2026-10-05 (R1, R6, R8, R14)

Hecho sobre `recetas-parte-2a`. Editados EN SU SITIO, y sólo ellos: `tareas/T05.md` (2342 → 2364 líneas) y `tareas/T10.md` (2841 → 3408). Respaldos de
antes: `…/scratchpad/rev-t05-t10/T05.antes.md` y `T10.antes.md`. Ningún `git add/commit/stash/checkout/rebase/merge/push`, ningún `npm install`, ninguna
conexión a una base: `git status --porcelain` del worktree, 0 líneas antes y después.

**Un dato de la ronda que da la razón a R1:** el HEAD con el que arrancó esta ronda era `da048af2`; mientras trabajaba, la sesión de los diseños 2b/2c
añadió `06b2e2e9` («Parte 2b: la venta bloqueada depende de #646») y `git ls-remote` ya dice `06b2e2e9`. La rama se mueve debajo de quien construye.

## 1. Qué cambió

| id | T05 | T10 |
|---|---|---|
| **R1** (push sin force; si se rechaza, PARAR y avisar) | paso 20 reescrito: `fetch`, `REMOTO_ANTES`, comprobación de que el remoto es **antecesor** de `HEAD` (ABORTA con `exit 1` si no, o si el `ls-remote` sale vacío), `push -u` sin `--force` ni `--force-with-lease`, **PARA** si el push sale ≠ 0, y después del veredicto «LLEGÓ» una última columna: lo que había en el remoto sigue dentro de lo que hay. Línea 40 y Duda 4 (hablaba de «rebasar») alineadas con el merge de T00 | paso 26, igual (`t10-*`). Además corrige una frase que ya era falsa: «la rama no sigue a nadie» (tras el push de T05 sigue a `origin/recetas-parte-2a`) |
| **R6** (tope y `desdeLecturaId` en una Libre) | — | `MAX_PASOS_PLANEADOS = 100` declarado UNA vez en `lib/recetas/parecido.ts` (puro: la pantalla puede importarlo sin Prisma); `validarPasosPlaneados` rechaza `> MAX_PASOS_PLANEADOS` (`libre_demasiados_pasos`) y **todo** `desdeLecturaId` (`libre_con_lectura_de_cierre`), el segundo ANTES de cualquier consulta y sin preguntar si la lectura está marcada. Dos códigos nuevos con texto es/en. Import nuevo en `pasos.ts` (edición (d) del paso 15) |
| **R8** (clasificación y nombre) | — | `DatosDeLaLibre.classification`; `crearRecetaLibreEnTx` la guarda; `abrirProceso` pasa `lote.classification`. `nombreDeLaLibre` recorta la intención a `MAX_INTENCION_EN_EL_NOMBRE = 120` caracteres con «…» **por puntos de código** (un emoji en el corte no deja medio par suelto); `description` conserva todo. El texto de `libre_repetida` dice ahora «…o con el mismo comienzo, si es larga…» (el recorte puede juntar dos intenciones largas) |
| **R14** (`escribirPasosPlaneados`) | — | lee la versión DENTRO de la transacción y rechaza (`Error` común: invariante, no algo que una persona provoque) si no existe, si su receta no es Libre, o si ya tiene pasos; guardia de arquitectura nuevo `tests/arquitectura/pasos-planeados-un-solo-camino.test.ts` (molde: `listarProcesosDeLote`) que fija a `lib/recetas/pasos.ts` como único dueño y `lib/recetas/libre.ts` como único llamador, y **una sola declaración** de `MAX_PASOS_PLANEADOS` |

Pasos nuevos de T10: **12b** (seis pruebas con base: R8 ×2, R6 ×2, R14 ×2), **12c** (el guardia y su rojo). Pasos tocados: 1 (anclas y medidas nuevas), 2–8 (hermética,
stub, código, seis códigos, commit 1, filas 11–15 del flip), 9–10 (ayudantes, `admin`), 14 (cuentas del rojo), 15 (edición (d) y cuerpo nuevo de (c)), 16–17 (libre.ts,
lotProcess), 18–19 (cuentas), 21 (razones de la allowlist y nota), 22 (control del guardia), 24 (12 archivos), 25 (filas 25–33), 26.

**Cifras que cambian:** hermética 7 → **9** pruebas; con base 20 → **26**; paso 3 «9 failed (9)»; paso 14 «25 failed | 1 passed (26)»; paso 18 «35 passed (35)»;
paso 19 «Test Files 11 passed (11)»; commit 1 sigue en **6** archivos, commit 2 pasa de 11 a **12**; mensajes `N → N+6` y `--numstat` `7 1` por idioma; flip del commit 1 de 10 a 15
filas y el del commit 2 de 24 a 33.

## 2. Nombres nuevos (para la lista de Daniel, regla 12)

`MAX_PASOS_PLANEADOS`, `MAX_INTENCION_EN_EL_NOMBRE` (`lib/recetas/parecido.ts`); `libre_demasiados_pasos`, `libre_con_lectura_de_cierre` (`RecipeError`);
`DatosDeLaLibre.classification`; `tests/arquitectura/pasos-planeados-un-solo-camino.test.ts`. `MAX_PASOS_PLANEADOS` ya era nombre de T13 (misma cifra): no es un nombre más, es el mismo con un solo dueño.

## 3. Cómo se comprobó (todo en `scratchpad/rev-t05-t10/`)

**T05, el bloque del push** (extraído del `.md` con `awk`, no retecleado) contra un remoto de juguete, en bash y en zsh:

| caso | resultado |
|---|---|
| A: el remoto es antecesor | `push=0`, «LLEGÓ», «sigue dentro: 0», salida 0 |
| B: otra sesión empujó un commit encima | «antecesor: 1» → ABORTA, salida 1, el remoto **no cambió** |
| C: el remoto rechaza (hook `pre-receive`) | `push=1` → PARA, salida 1 |
| D: el remoto ya no tiene la rama | `ls-remote` vacío, `merge-base` 128 → ABORTA, salida 1 |

Flips del bloque: sin la línea ABORTA, el caso D **vuelve a crear la rama remota** y dice LLEGÓ; sin la línea PARA, el caso C sale con **código 0** y «NO LLEGÓ» (la forma exacta de un
código de salida que se lee como éxito). El de T10 (paso 26) dio lo mismo en los ocho casos (4 × 2 shells).

**T10, el código.** Copia del árbol (`arbol/`, de `c8/t11`, con el cliente de Prisma regenerado: la copia vieja no tenía la relación inversa `steps` de la tarea 1, que `escribirPasosPlaneados` usa).
`construir.mjs` revierte las ediciones del plan viejo y aplica las del nuevo con ancla única, y sustituye por su bloque cada archivo que el plan da entero: el árbol compilado ES el plan.

- `tsc` (los archivos de T10, de `lib/recetas/**` y `tests/recetas/**` más el guardia): **0**. Control negativo: quitar `classification` de la llamada en `lotProcess.ts` → `tsc=2` (TS2345). `eslint` sobre los nueve archivos tocados: **0**.
- **Herméticas, corridas de verdad:** `parecido.test.ts` contra el stub: **9 failed (9)**, la primera por su igualdad de columnas y las otras ocho por `sin_implementar`; contra el código: **9 passed (9)**.
  El guardia: rojo en el estado del paso 12c (`pasos.ts` sin la función, sin `libre.ts`) **2 failed | 3 passed (5)**, cayendo «mira el repositorio de verdad…» y «sólo lib/recetas/pasos.ts la define y sólo lib/recetas/libre.ts la nombra»; verde **5 passed (5)**.
- **Flips medidos, con sha antes y después, `tsc=0` y el nombre de lo que cae:**
  - `parecido.ts`, filas 1–5, 9, 10 (las de antes, re-corridas: sin cambios salvo que la 4 ahora hace caer también las dos del recorte, que miran la cola del nombre y está dicho en la tabla) y filas nuevas 11 (sin recorte → caen las dos del recorte), 12 (UTF-16 → cae sólo la del emoji), 13 (elipsis fuera del tope → caen las dos).
  - Filas 6, 7, 8, 14, 15 sobre `mensajesDeReceta.test.ts`: cae lo que dice la tabla (y siempre además «friendlyError consulta…», que **ya caía sin mutar** en la copia porque no lleva la rama de la tarea 3; con la tarea 3 puesta pasa).
  - Filas 32 y 33 sobre el guardia real: cae «sólo lib/recetas/pasos.ts la define…» y «MAX_PASOS_PLANEADOS se declara una sola vez…», cada una sola.
  - Filas 25–31 (las de `libre.test.ts`): **compilan** las siete, ancla única cada una; su CAÍDA no se pudo medir con la base (ver §4), así que se midió la **conducta** con una sonda sin base (`tests/recetas/sonda-sin-base.test.ts` del scratchpad, que NO es del plan): una base inexistente
    (puerto sin nadie) prueba que el tope y el `desdeLecturaId` se rechazan **antes de cualquier consulta** (1–4 ms, y el control —un paso válido— sí intenta consultar y falla con otra cosa); un `tx` de mentira prueba las tres comprobaciones de R14 y que la receta nace con la clasificación del lote
    (`internal`, `confidential`, `trade_secret`). **Cada mutación 25, 27, 28, 29, 30 y 31 hace caer su prueba de la sonda, por nombre.**
- **Inventario:** `inventario-de-acceso.mjs --json` sobre el árbol viejo y el nuevo: 632 operaciones las dos, y las cuatro de T10 en la **misma** clase (`parecidoDeLaLibre` guardia directo; `crearRecetaLibreEnTx` recibe principal; `validarPasosPlaneados` y `escribirPasosPlaneados` dependen del llamador), así que las cifras de los pasos 20–21 no cambian.
- **Guiones del paso 21:** `t10-allowlist.mjs` contra una allowlist con `pasos.ts` como la deja la tarea 3: `168/32/23/96 → 169/33/24/98` (A+1/B+1/C+1/D+2, como dice el plan). `t10-cifras.mjs` y `t10-mensajes-b.mjs` pasan `node --check` (el primero no se pudo correr sin el `.md` del inventario de las tareas 3–9).
- **Mensajes:** el guion del paso 5 sobre los `messages/*.json` de HEAD: `1464 → 1470` por idioma y `7 añadidas / 1 quitada`, que es el `7 1` del plan.
- **Guardias vecinos, diferencial viejo contra nuevo** (`audit-atomico`, `acciones-traducen…`, `proceso-por-el-resolvedor`, `use-server-solo-async`, `claves-de-traduccion-existen`, `cliente-sin-prisma`, `ritmo-con-quien-lo-lea`, `mensajesDeProceso`): las **mismas 5 caídas** en los dos árboles (todas por lo que la copia no lleva de las tareas 3 y 13), y el mensaje de `acciones-traducen…` idéntico: sólo `RecipeError` sin rama, **ninguna clase nueva** — el `Error` común de `escribirPasosPlaneados` no cuenta.
- **Paso 1 y paso 22:** las líneas nuevas corrieron sobre el worktree (`MAX_PASOS_PLANEADOS` 0 archivos, `escribirPasosPlaneados / validarPasosPlaneados` 0 / 0, control `listarProcesosDeLote` 2, `sinComentarios` 1, guardia «no»); la reconstrucción de `ci.sh` sobre el árbol: `libre.test` 0, `parecido.test` 1, guardia nuevo 1. `bash -n` y `zsh -n` sobre los bloques tocados: 0.

## 4. Lo que NO se pudo medir (prohibido tocar una base)

- **Las seis pruebas nuevas de `libre.test.ts` no se ejecutaron**: sólo compilan (`tsc=0`) y su lógica de fondo está medida por la sonda. No se midió que pasen con la base, ni qué prueba cae en las filas 26 (la clasificación fija en `lotProcess.ts`) ni, con la base, en las 25 y 27–31. Los números «25 failed | 1 passed (26)» y «35 passed (35)» salen de **contar** (26 con base, 9 herméticas), no de correr.
- **Dos supuestos de esas pruebas que sólo la base confirma:** que el Farm Operator no limpia `confidential` (el catálogo dice `clear_internal` y nada más: `lib/rbac/catalog.ts`, perfiles Farm Manager y Farm Operator) y que el Platform Admin sembrado sí; el paso 1 mide que el admin existe. Y que 5 KB casi incompresibles (`randomBytes(2560).toString("hex")`) no caben en el índice sin el recorte: la prueba mira además el largo del nombre, así que no depende de eso para caer.
- El «Tiene que caer» de las filas 25–31 es, por tanto, lo que cada prueba afirma, no una caída vista.

## 5. Para quien integra (fuera de mis dos archivos)

1. **T13 (obligatorio, o su guardia cae en CI):** `lib/recetas/pasosDelFormulario.ts` declara hoy `export const MAX_PASOS_PLANEADOS = 100;` (T13.md:1328). Con R6 esa línea pasa a
   `import { MAX_PASOS_PLANEADOS } from "./parecido";` más `export { MAX_PASOS_PLANEADOS };` (el 100 es el mismo; el resto de sus usos —el bucle de `libreDelFormulario`, la prueba, los imports de `paraLasPantallas`— no cambia). El guardia de T10 falla con el nombre del archivo si lo declara otra vez: está dicho en T10 «Dudas», punto 3.
2. **T15:** T15.md:1595 dice «Cuatro códigos de receta» y T15.md:1323 comprueba cuatro `libre_*`: ahora son **seis** (`libre_demasiados_pasos`, `libre_con_lectura_de_cierre`). Además, `MAX_PASOS_PLANEADOS` y `MAX_INTENCION_EN_EL_NOMBRE` entran a la lista «Nombres nuevos».
3. **T11 (R8 sin cerrar):** `convertirLibre` copia `description: libre.recipe.description` (T11.md:2691) y no copia `classification`: con R8 la Libre de un lote `confidential` ya nace `confidential`, pero la receta de la organización que sale de convertirla nace `internal` con ese mismo texto. Una línea (`classification: libre.recipe.classification`) y su caso.
4. **T14 (R8, lectura):** la parte de R8 que es de T14 —`esLibre: false` en el servicio de `listRecipes`, `requireLotAccess(view)` sobre el lote del proceso en `getRecipeForEditor` de una Libre— sigue en su sitio; T10 sólo evita que la Libre nazca más abierta que su lote (Conflictos, punto 4, y decisión 12).
5. **T03:** (a) `validarPasosPlaneados` llama `exigeValoresDelPaso(tipo, paso)` con dos argumentos: T03 lo conserva (su nota de :4493 lo dice) — si cambia la firma, cambia esa línea; (b) la edición (d) ancla en `import { RecipeError } from "./errorDeReceta";`, que en el T03 de hoy aparece una vez en `pasos.ts` (:3110) y otra en `autoria.ts` (:1185); (c) T03 sigue siendo quien escribe `friendlyError` para `RecipeError`: los dos códigos nuevos entran por su mecanismo por código, sin rama nueva.
6. **T00:** los dos pushes (T05 y T10) suponen que T00 une con `git merge origin/main` y que la rama remota es antecesora de `HEAD`; si T00 reescribiera la historia publicada, los dos bloques ABORTAN (a propósito).
7. **Cuentas absolutas de claves de `Traceability`:** T10 añade 6 + 1 por idioma (antes 4 + 1). Las tareas posteriores que usan cuentas relativas («N → N+k») no se ven afectadas; si alguna fija un total absoluto, sube en 2.

## 6. Dudas

- **`crearRecetaLibreEnTx` también está exportada sin autorización** y el guardia de R14 sólo fija a `escribirPasosPlaneados` (lo que R14 pide). Fijar también su llamador es una fila más del guardia, pero exige que ninguna tarea posterior nombre ese símbolo ni en código; lo dejé como Duda 5 de T10 en vez de adivinar.
- **Un fin de una Libre nunca cita una lectura de cierre, ni una marcada de verdad** (lectura estricta de «se define antes de ejecutarse»). Si Daniel quiere que cite una de un proceso anterior del mismo lote, cambia sólo `validarPasosPlaneados` y su prueba (T10 «Dudas», punto 4).
- **El recorte puede dar `libre_repetida`** entre dos intenciones largas que sólo difieran después del carácter 119, sobre el mismo lote el mismo día (frase ajustada; T10 «Dudas», punto 6).
- **Error propio mío, cazado:** al compilar por primera vez, `tsc` dijo que `steps` no existía en `ProcessRecipeVersion`: no era el plan, era la copia (su esquema simulado no traía la relación inversa que la tarea 1 sí escribe, T01.md:1036). Se corrigió en la copia y se comprobó contra el texto de T01 antes de seguir.
