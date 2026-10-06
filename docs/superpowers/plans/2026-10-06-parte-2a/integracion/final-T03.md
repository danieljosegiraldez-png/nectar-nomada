# Informe final — T03 (R23 y la parte de T03 de R24)

Ronda final del 2026-10-05, tercer intento. Archivo editado en su sitio: `.superpowers/plan-2a/tareas/T03.md`. Ningún otro archivo del
worktree se tocó; no hubo `git add/commit/stash/checkout/rebase/merge/push`, ni `npm install`, ni conexión a ninguna base.

## Cómo encontré la tarea

Los dos intentos anteriores no dejaron informe. El primero (12:26–12:45) **sí había editado `T03.md`** —código de `exigeValoresDelPaso`, la función
nueva `exigeVerLosLotesDeLaLibre`, seis pruebas, cifras, inventario— pero **se quedó sin las filas de flip de R23 y R24 en la tabla del paso 33**
(la tabla terminaba en la 33; sus mediciones de las filas 34–40 estaban sólo en su scratchpad) y sin informe. El segundo (17:41) sólo copió
herramientas a `scratchpad/ronda-final-t03/` y no tocó el archivo. No me fié de ninguno: volví a medir todo desde el texto del `.md`.

- `T03.md` al llegar: sha256 `dfc43e6f2d998cd0…`, 4790 líneas (reconstruido deshaciendo mis tres primeras ediciones sobre un respaldo; el respaldo y el
  reconstruido están en `scratchpad/ultima-t03-tools/`).
- `T03.md` al irme: sha256 `4b2bb5c5c36244f8…`, 4860 líneas. Diferencia: 17 líneas quitadas y 87 añadidas (13 bloques de cambio).

## Lo que ya estaba bien (medido, no leído)

Ensamblado `pasos.ts` (pasos 21–25) y `pasos.test.ts` (pasos 10–16) **desde el propio `.md`** en una copia nueva (`scratchpad/ultima-t03`, 54 MB, con el
esquema de la tarea 1 aplicado y `node_modules` enlazado):

| qué | resultado |
|---|---|
| `pasos.ts` ensamblado | sha `4b36e6d14e4e`, **idéntico** al que el intento anterior había verificado |
| `pasos.test.ts` | 42 pruebas (`grep -c 'it('` = 42 = 30 + 6 de R6 + 3 de R23 + 3 de R24: lo que dice el paso 29) |
| `tsc` sobre `pasos.ts`, `pasos.test.ts` y la simulación | 0, salida vacía (control: la mutación `if (true) {` de la fila 41 dio `TS18047` en el mismo arnés, así que tsc sí habla) |
| simulación de las doce pruebas (R6, R23, R24) con el `pasos.ts` REAL y una base falsa en memoria | 12 de 12 |
| guardias de arquitectura que miran esta tarea | 9 archivos, 518 pruebas, ninguna `×`: `acceso-a-datos`, `cifras-del-inventario`, `audit-atomico`, `campos-con-dos-puertas`, `proceso-por-el-resolvedor`, `acciones-traducen-sus-errores`, `claves-de-traduccion-existen`, `use-server-solo-async`, `quien-lo-hizo-con-su-guardia` |
| inventario de acceso, con y sin R23/R24 | 627 operaciones, 170 archivos, 475 «guardia directo» **las dos veces**; difiere UNA fila: `pasosDeLaVersion` (modelos +`lotProcess`, guardias +`exigeVerLosLotesDeLaLibre`; sigue en «guardia directo») |
| T11 paso 1 (awk sobre el cuerpo de `exigeValoresDelPaso`) | `correctsId` 4, `processStepClosingReading` 1, cuerpo de 41 líneas |
| T10 paso 15 (a), (b), (c) sobre `pasos.ts` | las tres anclas casan 1 vez |

(Los otros 12 archivos de `tests/arquitectura` que fallan en la copia —`ritmo-con-quien-lo-lea`, `protocolo-con-su-sitio`, `colacion-de-la-base`…— fallan por archivos que la
copia no trae (`ENOENT` sobre `docs/`, `protocolos/`, `public/sw.js`) o por la base falsa; medido: ninguno cita `lib/recetas`.)

## Lo que cambié en `T03.md`

1. **Filas de flip 34–41** en la tabla del paso 33 (antes terminaba en la 33), con su ancla exacta, su mutación y la prueba real que cae por su nombre;
   «Al final de las cuarenta y una»; y el párrafo «Lo medido de las filas 19 y 28–41» con lo que cae en cada una.
2. **La prueba de R24 ya no usa `abrirProcesoDePrueba`.** La tarea 5 (paso 1) espera 148 líneas, 149 apariciones, 7 con receta y 14 archivos de ese ayudante, y
   «un número distinto no se ajusta: se para». La llamada del intento anterior en `pasos.test.ts` habría dado 149/150/8/15 en cuanto se construyera la 3 y
   la 5 parara. Ahora los procesos son filas de `lot_process` (`procesoEn`, un `lotProcess.create` con la forma de las pruebas de hoy: `colaDeSecado`,
   `procesoDelLinaje`), que `borrarProcesosDeLotesDonde` ya borra. Medido: `grep -cF 'abrirProcesoDePrueba(' tests/recetas/pasos.test.ts` = 0 (el
   árbol real da 147 líneas en total, el control). Cabecera, import, helper, cifras del paso 9f y 29 y mensaje del commit 3 dicen «insertados», no «abiertos».
3. **Dudas nuevas** (siguen abiertas, con su razón): qué cuenta como «marcada» en R23 (ver abajo), el control de R6 sobre la lectura CITADA, dónde vive
   la regla de R24, las dos frases de T14 que dejan de ser ciertas, por qué la prueba no usa el ayudante, y dos supuestos que sólo una base confirma.
4. El párrafo final de «No se pudo ejecutar contra la base» ahora dice qué se midió de R23/R24 y qué queda para el paso 29.

### Las filas nuevas, medidas (simulación de 12 pruebas, `pasos.ts` REAL; cada ancla UNA vez, sha distinto, `tsc` 0)

Sha del archivo limpio `4b36e6d14e4e`. Fila patrón sin mutar: 12 de 12.

| fila | mutación (quita la conducta) | sha después | cae |
|---|---|---|---|
| 34 | `exigeValoresDelPaso`: `eslabon = lectura?.correctsId ?? null;` → `eslabon = null;` (no se sube) | `3ed94ccea235` | las tres de R23 |
| 35 | `if (marca) {` → la marca sólo vale en la raíz o en la citada misma | `e393e4d38367` | sólo R23-1 (por `m2`) |
| 36 | el `for` pierde `nivel <= TOPE_DE_LA_CADENA_DE_CORRECCIONES` | `6b471c69ef0b` | sólo R23-3 |
| 37 | `pasosDeLaVersion`: quitar `await exigeVerLosLotesDeLaLibre(...)` | `5d85b7f234c9` | las tres de R24 |
| 38 | `exigeVerLosLotesDeLaLibre`: lote por lote → un «O» (`requireLotAccess(..., lotes)`) | `4b293fdacea1` | sólo R24-2 (dos lotes) |
| 39 | quitar `if (lotes.length === 0) throw ...` | `8aafd129d8ba` | sólo R24-3 (ningún proceso) |
| 40 | `if (version.recipe.esLibre && recipeVersionId === "")` (la Libre va por la autoría) | `64b5230dab10` | las tres de R24 |
| 41 | `if (version.recipe.esLibre \|\| recipeVersionId !== "")` (todas por el lote) | `8a58f5c73802` | R24-1 y R24-3 (sus controles) y, de rebote, las nueve de R6 y R23: 11 de 12 |

Las filas 19, 28, 29, 32 (R6) se volvieron a medir con las tres de R23 dentro y **ahora también las hacen caer**: 19 → R6-3, R23-1, R23-3; 28 → R6-1, R6-2, R23-2;
29 → R6-4, R6-6, R23-2; 32 → R6-1, R6-4, R6-5, R23-2. Las filas 30, 31 y 33 caen igual que antes. Todo está en `scratchpad/ultima-t03-tools/flip-0.txt` y `flip-41.txt`.
Una mutación mía no compiló y se descartó: `if (true) {` en la fila 41 (`TS18047: 'version' is possibly 'null'`, TS pierde el estrechamiento detrás del `if`); se sustituyó por la que sí compila.

**Lo que esta simulación NO mide:** el SQL, los permisos reales (la visibilidad de los lotes la simula una función), `correctMeasurement` ejecutado, el tiempo de la prueba del tope
(unas 4000 consultas seguidas, `it` con 120 s) ni el orden real del `afterAll` frente a las claves `RESTRICT`. Lo cierra el paso 29 contra la base propia. Las columnas «debe caer» de las
filas con prueba de base son lo esperado, no una medición.

## Decisiones que tomé o confirmé (dichas en la tarea)

- **R23, qué es «marcada».** El registro dice «una corrección cuya raíz por `correctsId` está marcada». `exigeValoresDelPaso` acepta la marca en **cualquier eslabón** de la cadena que sube
  desde la lectura citada (raíz o de en medio). Razón: T11 marca la VIGENTE de una cadena (I4), y esa vigente puede ser ya una corrección (`m1` marcada, luego corregida en `m2`: el fin
  cita `m2` y su raíz `r0` no está marcada); con «sólo raíz» el editor rechazaría justo lo que R23 quería aceptar. La lectura estricta es la fila 35. Sólo se sube: `r0` no vale.
- **R24, dónde vive.** La regla de «para una Libre, `requireLotAccess(view)` sobre el lote del proceso que usa la versión» está en `exigeVerLosLotesDeLaLibre`, llamada desde `pasosDeLaVersion`
  ANTES que `exigeLecturaDeLosPasos`. No la metí dentro de `exigeLecturaDeLosPasos` porque esa función no recibe la versión (`(userAccountId, organizationId)`) y T10 (pasos 1 y 15) ancla en el
  texto de su llamada. Se lee por TODOS los procesos que usan la versión (también cerrados), lote por lote; una Libre sin proceso no se abre a nadie.

## Efectos en otras tareas (no las toqué; las señalo)

1. **T05, paso 1:** sus cifras del ayudante (148/149/7/14) siguen valiendo porque `pasos.test.ts` ya no llama a `abrirProcesoDePrueba(`.
2. **T14, Dudas 9 (`T14.md:7995`) y el comentario de `T14.md:5607`** dicen que `pasosDeLaVersion` abre los pasos de una Libre a quien escribe sin ver el lote. Con esta ronda es falso; su arreglo propuesto es
   `exigeVerLosLotesDeLaLibre`. Las corrige quien mantenga T14.
3. **T15, flip E5 (`T15.md` ~2046–2051)** dice «sin fila en la tarea 3: la añade este paso»; ahora la fila 37 de T03 tiene la misma mutación (mismo ancla, mismo reemplazo). No choca; la frase de origen queda vieja.
   Las anclas de T15 sobre `exigeVerLosLotesDeLaLibre`, `exigeValoresDelPaso` y `correctsId` (`T15.md:1405–1429`) casan con el código de T03.
4. **T14 (paso 42, edición (b), `T14.md` ~7171)** reescribe `borrador()` de `pasos.test.ts`; el bloque de R24 llama a `borrador(nombre)` con la misma firma, así que sigue valiendo. Sus anclas del import y de `OBJETIVO` no cambian.
5. **T10 y T11:** sus anclas/medidas sobre `pasos.ts` casan (arriba). Ninguna otra tarea llama a `pasosDeLaVersion` en una prueba sobre una Libre.

## Qué no hice

- No ejecuté ninguna prueba con base (prohibido). Las seis pruebas nuevas están compiladas y ejecutadas sólo en simulación.
- No cambié la firma de `exigeLecturaDeLosPasos` (ver arriba).
- No añadí un código de error nuevo para R23/R24 (`lectura_no_marcada` ya cubre las dos razones de R23; R24 lanza `TraceabilityAccessError`, como `getRecipeForEditor`): las cuentas «21 códigos» de T03 y T04 no se mueven.

Herramientas y salidas (scratchpad, no versionadas): `/private/tmp/claude-501/-Users-danielsan/02029a71-7835-4736-b245-713ece44a3e2/scratchpad/ultima-t03` (copia) y `.../ultima-t03-tools`
(`ensamblar.mjs`, `flip.mjs`, `filas.json`, `cruzar-filas.mjs`, `flip-0.txt`, `flip-41.txt`, `arq-relevantes.txt`, `inv-antes.json`, `inv-despues.json`, `T03.al-llegar.md`).
