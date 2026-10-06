# Ronda de arreglo de T13 tras la revisión adversaria — R10, R11, R12, R16, R17, R18, R19 — 2026-10-05

Worktree `recetas-parte-2a`, HEAD `da048af2`, `git status --porcelain` = 0 al empezar y al terminar. **Sólo se editó `tareas/T13.md`** (8547 → 8989 líneas, sha `5cb328be…` → `01301d41…`) y se escribió este informe.
Ninguna base se tocó, ningún guion se creó en el worktree; todo lo compilado y corrido vive en `scratchpad/t13r/` (copia de la copia de verificación de T13, con la ronda aplicada), `scratchpad/t13r646/` (la misma con los cambios de #646
compuestos encima) y `scratchpad/t13r-work/` (guiones de edición, JSON de filas y salidas). `git fetch origin desenlace-del-secado` (lo que pedía el encargo) fue lo único que escribió en el repositorio: `FETCH_HEAD` y, como mucho, la referencia remota.

## Qué cambió, ruling por ruling

**R10 — los flip-tests mutan el consumidor.** Las cuatro filas que cambiaban el `simbolo` de `ritmo-con-quien-lo-lea.test.ts` (36 a 38 del paso 39, 12 del paso 49) ya no tocan ese archivo. Ahora quitan la llamada, o el uso de su
resultado, en el consumidor real y nombran la prueba de conducta que cae: 36 = la página de secado ya no lee los pasos (`paginasDeEmpezar`); 37 = la página del proceso no pinta los avisos (`paginaDelProceso`, tres pruebas); 38 = la acción pregunta
a `parecidoDeLaLibre` y no usa lo que contesta (`accionesDePaso`; la fila 15 del paso 21 quita la LLAMADA, ésta el USO); 12 del paso 49 = `convertirLibreAction` no llama a `convertirLibre` ni usa su resultado (`accionesDePaso` y la prueba de fuente que ata
sus campos). El paso 29(d) dice, además, lo que el guardia NO ve (un `import` cuyo valor se descarta lo deja en verde) y por qué los flips ya no lo mutan. La fila 37 necesitó un reemplazo tipado: con `avisos: []` a secas TypeScript infiere
`never[]` y no compila (me pasó, está en el texto).

**R11 — bandeja y secado.** (a) `bajarBandejaAction`: `lectura_reemplazada` y `lectura_de_cierre_ajena` salen con su propio código (`CODIGOS_DE_LECTURA_DE_CIERRE`, nuevo en `app/beneficio/bandejas/errorDeSecado.ts`, y dentro de
`ERRORES_DE_BANDEJA`) y con su frase en `BandejasDelSecado` (es y en, dos claves nuevas que añade el guion del paso 16, ahora de dos espacios de nombres); lo demás del proceso o de la receta que el mapa no conoce sigue saliendo como «no se pudo
completar». Prueba: «las lecturas de cierre rechazadas salen con su propio código y su frase» (código distinto de `desconocido` y `claveDeErrorDeSecado` = `error_<código>`), con su control. (b) `endDryingFormAction`: un `TraceabilityAccessError` vuelve a
`/lots/<id>?error=sin_acceso` (el código que la ficha ya sabía decir). Prueba con su control. Commit 2 pasa de 7 a 8 archivos, de 27 a 29 pruebas y de 20 a 24 filas de flip.

**R12 — `ElegirPaso`.** Envoltorio sin hooks que pone la `key` (`llaveDeLosPasos`: visibilidad, si la receta tiene pasos, la propuesta y cuántas veces se cumplió cada paso) al hijo con estado (`ElegirPasoConEstado`, el cuerpo de antes, con su
`useState` intacto). Prueba «tras un registro correcto vuelve a proponer el SIGUIENTE paso»: dos renders seguidos con el `selected` de cada uno, y la `key` del envoltorio (cambia con la propuesta, cambia con sólo repetir un paso, NO cambia con los mismos datos).
Tres filas de flip nuevas (13 a 15 del paso 28). Commit 3: 12 → 13 pruebas.

**R16 — `lecturasParaMarcar` con el id de una corrida oculta.** Prueba nueva con base, en `paraLasPantallas.test.ts` (la séptima de `lecturasParaMarcar`): `gestor` pregunta desde su lote A con el id de una corrida del lote B, que no ve → `[]`; control: la lectura
existe, es candidata, y `soloB` (que ve B) la recibe. Línea en la cabecera del archivo. La fila 26 del flip espera ahora también esta prueba. Sólo se compiló (no hay base): 13 → 14 pruebas, 17 → 18 con las de base.

**R17 — la ficha y `puedeRegistrar`.** Paso 34: el manejo y el fin de una fermentación van dentro de `{puedeRegistrar ? (<>…</>) : null}`; el fin de secado pasa a ser la rama «sí» de `… : puedeRegistrar ? (<form…>) : null` (dos ediciones, cabeza y cola);
`pasosDelManejo` y las dos lecturas de cierre se leen sólo con `puedeRegistrar`. Prueba de fuente nueva en `pantallas-de-paso.test.ts` (lecturas con `puedeRegistrar` en su condición; cada etiqueta de formulario con `puedeRegistrar ?` en las cuatro líneas de
antes, con control del análisis). Cinco filas de flip (39 a 43 del paso 39), una por cada `puedeRegistrar` puesto. Commit 4: 17 → 18 archivos (por R18), 38 → 39 pruebas de los cuatro archivos, 39 → 44 filas. La página del proceso ya condicionaba
sus formularios y lecturas (`puedeGestionarElAbierto`): no cambia.

**R18 — paso 35.** Medido: `git grep -n endFermentationFormAction -- lib app` da CINCO líneas, y la quinta es el comentario de `lib/traceability/operations.ts:100`. Se edita el comentario (`endFermentationAction`, una ancla única) y el archivo entra en el
`git add` del commit 4; la lista de menciones esperadas «antes» lo nombra y el segundo `grep` vuelve a esperar vacío.

**R19 — #646.** Medido: **no está en `main`** (`origin/main` `50cbfda3`, `desenlace-del-secado` `36053095`, no ancestro). Dejé escrito en el paso 1 cómo saberlo (`t13-646.sh`: cinco señales, todo cero o `2/4 y 3/1/1 y 1`, una mezcla para y avisa) y los pasos 20 y 37 comprueban con
`diff` que el desenlace queda donde #646 lo puso. Las tres anclas de T13 que casaban sólo sin #646 (`endDryingRun(` con la línea de `lotId`, `} : null,` con `provenanceClass`, el `import` de `BandejasDelSecado.tsx`) se reescribieron para casar UNA vez en los dos
mundos; las pruebas de acciones llevan `endedOutcome: "target_reached"`. Dudas 14 resume lo que se probó y lo que no.

## Qué se midió (y qué NO)

- **Anclas** (`t13-anclas.mjs`, el del plan, extraído del documento): `60 anclas · mal: 1` (18 B, 41 D, 1 Dp; el uno es el rótulo del manejo, de la tarea 1) sobre el worktree, sobre `origin/main` y sobre `origin/desenlace-del-secado` (salidas idénticas);
  **control**: con las anclas de antes sobre #646 da `56 · mal: 4` (tres de #646). Quince de las 16 de Ep contra los bloques del documento: 1 cada una (la que falta, la de `ritmo-con-quien-lo-lea`, se ancla en un archivo de `main` más la edición del paso 29(d), que esta ronda no toca).
- **Código del plan, compilado**: `tsc --noEmit` = 0 errores sobre la copia con la ronda (varias veces); `eslint` = 0 sobre los nueve archivos tocados (incluye los dos `import` del mismo módulo en la acción de la bandeja). Los bloques de código de R11, R12, R16 y R17 del
  documento son subcadenas literales de los archivos compilados, y los bloques de pruebas de acciones, de pantallas y de fuente del documento son idénticos al árbol salvo lo que añade la Parte E.
- **Pruebas herméticas, sin mutar**: `accionesDePaso` 34, `pantallasDePaso` 14, `pantallas-de-paso` 14, `paginaDelProceso` 18, `paginasDeEmpezar` 4, `erroresDeSecado` 26, `pasosDelFormulario` y `errorParaLaFicha`: 8 archivos, 130 pruebas, todas en verde; 16 archivos de
  guardias fs (acciones-traducen, use-server-solo-async, cliente-sin-prisma, confirmacion-que-se-lee, claves-de-traduccion-existen, envio-sin-doble-toque, numeros-sin-rueda, booleanos-de-tres-estados, procedencia-declarada, campos-con-dos-puertas,
  cierreDeSecadoUI, accionesQueNoCapturaban y `tests/ui`): 365 pruebas, **las mismas en la copia de antes y en la de ahora**.
- **Flip-tests**, con el arnés de la copia (`flip.py`: ancla UNA vez, sha antes/después, `tsc`, vitest, nombre de la prueba caída, restauración con el mismo sha): **commit 2, 24 de 24**; **commit 3, 16 de 16**; **commit 4, las 44 de 44**; **commit 5, 14 de 14**. Todas aplican,
  compilan y caen por su nombre. Del commit 1 sólo la fila 26 se comprobó (compila, ancla única); su `CAYÓ` necesita base. **La edición de `lib/traceability/operations.ts` (R18) es un comentario y no se aplicó en la copia**; su ancla sí se midió en el worktree (una vez).
- **#646 compuesto** sobre la copia (sus archivos y su diff, no una unión real con T1 a T12): `tsc=0`, 123 pruebas de siete archivos en verde —incluidas `desenlaceDelSecado` y `cierreDeSecadoUI` de #646—; **sin el campo `endedOutcome` en los formularios de las pruebas caen 8**.
- **Texto**: los cinco JSON de filas parsean y sus cifras casan con «deben ser N» y con las filas de las tablas; el script de textos del paso 16 corrido sobre copias limpias de `messages/*.json`: `+8 −2` por archivo (16 y 4 en total), y se niega a repetirse.
- **NO se midió**: ninguna prueba con base (la nueva de R16 y las 17 de la Parte A: sólo compiladas); las cifras de los pasos rojos 14, 30 y 43 (se DEDUCEN del recuento de pruebas: dicen «medido antes de la ronda» y qué se sumó); `bash scripts/ci.sh`, `npm run build`, el inventario
  (no nace ninguna función con datos); `ritmo-con-quien-lo-lea` (usa `git grep` y la copia no es un repositorio: no se escenificó nada, ni siquiera en la copia; su archivo no cambia en esta ronda salvo lo que ya traía); `mensajesDeProceso` (en la copia falla igual antes y después:
  le faltan los textos de las tareas 5 a 11); una unión real de #646 con las tareas 1 a 12.

## Dos errores previos que encontré y corregí de paso (no eran del encargo)

- Paso 21: «`vitest sin mutar=0` con `Test Files 1 passed (1)`» era falso desde antes: las filas 18 y 19 ya corrían `mensajesDeProceso`, eran dos archivos; con R11, tres.
- Paso 49: «5 passed (5)» pasa a 4 (la fila 12 ya no corre `ritmo-con-quien-lo-lea`).

## Dudas

1. **R17 deja fuera el volteo** (`recordDryingTurnFormAction`, que la ficha sigue pintando sin `puedeRegistrar`) y las páginas `fermentation/new` y `drying/new` (que usan `puedeEmpezarCorrida`, de `view`): no los reescribe esta tarea. Dudas 7 del documento lo dice. Si Daniel quiere la regla del 2026-09-27 entera, es otra tarea.
2. **R12 no puede probar el remonte real**: no hay `jsdom` ni `@testing-library`. La prueba afirma lo que sí se puede leer sin DOM —el `selected` de dos renders y la `key` del envoltorio, que es lo que React usa para remontar—, no que React lo haga. El día que haya un DOM de pruebas, esta prueba es la primera candidata a sustituirse (lo mismo dice la cabecera de
   `desfase-horario-sobrevive-al-render`).
3. **`MassBalanceError` en `endDryingFormAction` sigue siendo un 500** (es anterior y R11 sólo pidió `TraceabilityAccessError`); lo dice Dudas 10.
4. **Nombres nuevos** que Daniel no tiene en su lista: `CODIGOS_DE_LECTURA_DE_CIERRE`, las claves `BandejasDelSecado.error_lectura_reemplazada` y `error_lectura_de_cierre_ajena`, `ElegirPasoConEstado` y `llaveDeLosPasos` (no exportados). Están en la duda 1 del documento; `registro.md` no es mío y no lo toqué.
5. **R3 a R5 son de T11 y no se tocaron**: la prueba de R16 usa una medición del mismo lote que la corrida, que es válida antes y después del endurecimiento de R5 («la medición es del lote de entrada de la corrida»); si T11 cambiara qué es «lote de entrada» de una corrida cruda de fixture, hay que mirarla.
6. **La fila 36 elige la página de secado** como consumidor de `pasosParaElegir` porque las de fermentación y del proceso ya tenían fila de «se quita la llamada» (11 y 3/7). Si se prefiere otra, es cambiar un ancla.
