# Ronda de arreglo del plan de la Parte 2a — T00 y T15 (R1, R2, R13, R19)

Fecha: 2026-10-05. Editados en su sitio, sólo: `tareas/T00.md` (802 → 1019 líneas) y `tareas/T15.md` (2675 → 2732). Nada más tocado: ni `git add/commit/stash/checkout/rebase/merge/push` en el worktree,
ni `npm install`, ni ninguna base. `git status --porcelain` del worktree: **0** antes y después. Las pruebas de los bloques se hicieron en **un clon de juguete con un remoto local** (`scratchpad/t00-test/…`,
`scratchpad/t15-nuevo/…`), nunca contra GitHub ni contra el worktree.

## Lo medido (y lo que se movió mientras trabajaba)

El plan se redactó contra un mundo que cambió **dos veces en una hora**, y eso es el hallazgo de contexto:

| qué | al empezar (09:2x) | a las 09:43 |
|---|---|---|
| HEAD de la rama | `da048af2`, 14 commits propios, tres diseños | **`06b2e2e9`**, 15 commits (la sesión de 2b/2c commiteó y **empujó** desde este mismo worktree: `ls-remote` = HEAD) |
| `origin/main` | `50cbfda3` (#640), 26 commits por delante de la rama | **`a8f50df7`** (#645), **37** por delante |
| seguimiento de la rama | ninguno (`@{u}` da 128) | ninguno |
| #646 | `OPEN`, `changedFiles=10` | `OPEN` |

Cifras de T00 sobre una copia del árbol de `origin/main` (`git archive`), la misma orden de cada paso, con su control:

| medida | 4ecdd36b / 49070a02 (plan) | `50cbfda3` | **`a8f50df7`** (hoy) |
|---|---|---|---|
| 27 anclas del paso 9 | — | todas, mismas líneas | **todas, mismas líneas** (0 sin acierto) |
| `abrirProcesoDePrueba` | 14 archivos · 147 líneas · 148 apariciones · 7 con receta | igual | **14 · 148 · 149 · 7** (`samples.test.ts` 3 → 4) |
| `abrirProceso(` directas | 17+2+1+1 en pruebas, +1 seed, +1 acción, +1 ayudante, +1 definición | igual | igual |
| inventario de acceso | 618 operaciones / 168 archivos (94 del llamador) | 618 / 168 | **619 / 168** (94) — coincide con `inventario-de-acceso.md` |
| FK-ORG (crean receta · borran organización · las dos) | 12 · 154 · 12, ninguna con orden malo | igual | **igual** (12 con receta antes de organización) |
| lista de la línea base | 107 (arq. 56, 68 herm., 39 base) | 108 (arq. 57) | **110** (arq. 59, **71 herméticas**, 39 `base-sembrada`) |
| nuevas contra `13fb6a8f` (104) | 3 | 4 | **6** (+`microparcela-no-hereda-lo-extensivo`, `ficha-del-lote-el-trabajo-primero`, `frases-de-tueste-de-muestra`) |
| carril hermético (`ci.sh`) | 202 y 212, de 414 | 203 y 212, de 415 | **206 y 212, de 418** |
| `SESSION_STATE.md` / tope | 397 / 400 | 397 / 400 | 397 / 400 |
| migraciones / última | 203 / `20261004100000_proceso_cubre_al_lote` | igual | igual |
| paquete en `origin/main` | — | `docs/reference/farm-management/` (29 archivos); sha256 del 04 `3779d9d7…97a2`, de los ejes `c1e9c6c5…ff6d` | **iguales a los de T02**; los ejes viven en `master_data/`, no en la raíz |

## Qué hice con cada ruling

- **R1 (T00).** Se acabó el rebase. El paso 2 son ahora cuatro bloques —medir, unir, comprobar, empujar— y cada uno vuelve a mirar lo que pudo moverse: worktree limpio, `ls-remote` (la rama existe), **remoto ancestro de HEAD**, la rama
  sólo lleva `docs/`, y la unión **predicha limpia con `git merge-tree --write-tree`** antes de tocar nada. `git merge --no-ff -F` (sin `--ff-only`) con la guarda del trailer; si el merge falla: `git merge --abort`, comprobar que HEAD
  volvió, PARAR. Después `git push -u origin recetas-parte-2a` **sin force**, con segunda comprobación del remoto justo antes; si se rechaza, PARAR. Quité el `unset-upstream` y el respaldo de rama. Cifras al día (15 commits, tres
  diseños, 37 de main, 203 migraciones…). Regla nueva en la cabecera de reglas de T00: ni rebase, ni force, ni `--force-with-lease`, ni `pull`.
- **R1 (T15).** Ya unía con merge; añadí el porqué (rama publicada), PARAR ante conflicto fuera de los cinco mecánicos o un merge que falle, la cabecera y el paso 2 corregidos (la rama está publicada desde **antes de T00**, que la unió y empujó;
  `commits sobre origin/main ≥ 16`; el `ABORTA` del remoto ya no culpa a las tareas 5 y 10) y el paso 24 con **guarda antes de empujar** (`fetch`, remoto ancestro de HEAD) y **PARAR si el push se rechaza** (sin `--force` ni
  `--force-with-lease` ni rebase). «Tercer push» pasa a «cuarto». «Conflictos con el esqueleto» nº 2 reescrito.
- **R2 (T00).** Tras la unión, `docs/reference/farm-management/04_reference_parameters.json` y `master_data/processing_axes.json` tienen que existir **con los dos sha256 que T02 fija**; control negativo (el 04 contra los ejes, la ruta vieja de
  los ejes). Si falta algo, PARAR (T02 se detendría en su primer paso con un diagnóstico que parece un paquete corrupto). **(T15).** El cuerpo del PR cita el paquete versionado (párrafo «Fuente de las referencias») y su línea «Medido» lleva el
  recuento de archivos y los dos sha, con una comprobación de que no salió vacía.
- **R13 (T15).** Apartado **«Retroceso»** en el cuerpo del PR, con lo que dice el registro: la migración es aditiva salvo tres cosas; no hay migración inversa; volver al código de la Parte 1 es seguro hasta la primera intervención sólo con tipo
  de paso; después hay que arreglar los dos lectores (`app/lots/[id]/process/page.tsx`, `lib/traceability/reporteDeProceso.ts`) en el código viejo. Medí que las dos lecturas `i.catalogValue.value` siguen sin guarda en `origin/main`
  (con control positivo). **Añadí una cuarta cuenta de sólo lectura** al SQL de producción del paso 16 (`intervenciones_sin_valor_de_catalogo`: `catalog_value_id IS NULL`) para que Daniel sepa de qué lado de esa línea está; se ensaya con el
  resto del SQL en el paso 16 (verbos de escritura: 0, transacción de sólo lectura).
- **R19 (T00).** Paso 9 gana un bloque que escribe `$GUIONES/t00-646.sh` y `$OUT/t00-646.txt`: mide **por contenido** si las dos acciones de cierre escriben `endedOutcome` y si los dos formularios lo piden, con **control positivo contra la rama de #646**
  (`origin/desenlace-del-secado`) y contra los lectores (`reposo.ts`). Veredictos `NO_ESTA` / `EN_ARBOL` / `PARCIAL` / `SIN_CONTROL` (un «no está» sin control no se lee como «no está»). Hoy: `NO_ESTA` (todo 0; la rama de #646: 6, 7 y 2; lectores 3).

## Cómo se probó (y qué falló al probar)

- Los cuatro bloques del paso 2, **con zsh** (la shell de la herramienta), contra un remoto local: camino feliz (`merge=0`, `padres de HEAD: 2`, `commits sobre main` = propios + 1, los tres shas iguales, `@{u}` = `origin/recetas-parte-2a`) y siete mutaciones, **cada una
  cae por su nombre**: remoto con un commit ajeno (PARAR, no queda mensaje de unión, HEAD no se mueve); conflicto de unión (`merge-tree=1`, nombra el archivo); archivo sin seguir (`sucios: 1`); HEAD movido entre medir y unir («ABORTA»);
  remoto que avanza entre unir y empujar (guarda de antes del push); remoto que rechaza (hook `pre-receive`, `push=1`); `main` sin el paquete (los dos `existe=1`, «SIN ARCHIVO», los dos sha `=1`). Y lo mismo para el bloque del push de T15 (feliz / remoto avanzó / rechazo).
- El guion de #646: cinco casos (árbol de main → `NO_ESTA`; árbol de #646 → `EN_ARBOL`; formulario sin el campo → `PARCIAL`; sin la rama de control → `SIN_CONTROL`; control sobre `origin/main` con todo 0 → `SIN_CONTROL`).
- El cuerpo del PR, armado con archivos de salida de juguete: Retroceso presente, cuatro bloques de código (pares), 0 sustituciones sin expandir, 0 líneas «Medido» vacías; **flip**: quitar la línea que ensambla el Retroceso → `0 (1)`; apuntar el 04 a un archivo que no existe → `con sus dos shas: 0 (1)`.
- Los **65 bloques bash** de los dos archivos pasan `zsh -n` y `bash -n`.
- **Fallos que encontró la prueba y que corregí:** (1) un backtick dentro de un `echo` entre comillas dobles (`06b2e2e9`) —la shell lo ejecutó y lo borró sin avisar: «command not found»—; ningún bloque nuevo lleva comillas invertidas en un `echo`.
  (2) Mi primera mutación del cuerpo del PR **no se aplicó** (`grep -v` sin `-F`: `$OUT` es ancla en BRE de BSD; el sha salió igual antes y después, que es lo que lo delató): repetida con `-F`, cayó. (3) Había escrito «el preview de Vercel no construye» para el push de T00:
  falso —con un commit de fusión, `scripts/solo-documentacion.sh` toma su primer padre como base y la diferencia trae el código de `main`—; lo corregí a «cuesta un preview, y es el coste de R1».

## Para el controlador (no son míos de editar)

1. **El esqueleto** sigue diciendo que T00 «rebasa» (cabecera, fila 0) y que «quita el seguimiento»/empuja sólo al final de 5, 10 y 15 (regla 4). Quedó escrito en «Conflictos con el esqueleto» de T00 y T15; R1 manda.
2. **T05** mide `abrirProcesoDePrueba` con 147 líneas / 148 apariciones: hoy son **148 / 149** (`samples.test.ts` suma una llamada con #644/#645). Y T05, T10 y T15 empujan: con un rechazo, PARAR (T15 ya lo dice; T05 y T10 no los toqué).
3. **T11 y T13** deben correr `bash "$GUIONES/t00-646.sh"` **antes de anclar** (no leer `t00-646.txt`: caduca); con `NO_ESTA` construyen sobre las acciones como están en `main`, con `EN_ARBOL` reanclan sin quitar el campo. La sesión de 2b ya escribe «la venta bloqueada depende de #646».
4. El push de T00 cuesta un preview de Vercel (el commit de fusión trae código de `main`). Si prefieres empujar al final de T00 (tras la línea base) en vez de justo tras la unión, es mover el cuarto bloque.
5. El registro dice «paquete v2.1»; el README del paquete dice «v2» y los dos JSON `_meta.version 2.0`; el commit de #638 dice «v2.1». No cité número de versión en el PR.
