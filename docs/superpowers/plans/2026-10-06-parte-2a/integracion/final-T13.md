# Última ronda de arreglo de T13 — R21 y R22 — 2026-10-05 (tarde), segunda pasada («vuelve a intentarlo»)

Worktree `recetas-parte-2a`, HEAD `06b2e2e9`, `git status --porcelain` = 0 al empezar y al terminar. **Sólo se editó `tareas/T13.md`** (9122 → 9122 líneas, sha `9d7cab30…` → `3024e5ee…`) y se reescribió este informe.
Ninguna base se tocó (las pruebas con base sólo se compilan; la sonda usa una base simulada en memoria), ningún guion se creó en el worktree. Todo lo compilado y corrido vive en `scratchpad/final2-t13/`: `arbol/` (copia de la de la pasada anterior), `flip.mjs`
(arnés), `t13-mut-1.json` (las 39 filas, sacadas de T13.md de hoy) y las salidas `*.txt`.

## Lo que encontré al empezar, y lo que hice con eso

**T13.md ya traía R21 y R22 aplicados** por una pasada anterior (sha `9d7cab30…`, el mismo que declara el informe de entonces). La línea de estado de un informe no es evidencia, así que **no volví a aplicar nada a ciegas: lo medí todo otra vez** sobre una copia propia
(`final2-t13/arbol`), y sólo toqué T13.md donde la medición dejó algo impreciso (tres ediciones, abajo). `T11.md` (sha `ca5951e0…`) y `T10.md` (sha `780d2810…`) son los de hoy: el `lecturasDeCierre.ts` de T11 y el `parecido.ts` de T10 extraídos de ellos salen **IGUAL** que los de la copia
(`extraer.mjs`, dos «destino IGUAL»), y los cinco bloques de T13 que esta ronda toca —`paraLasPantallas.ts`, su prueba, `pasosDelFormulario.ts`, su prueba y `avisosParaLaPagina.test.ts`— **son byte a byte los de la copia** (cinco «destino IGUAL», también después de mis ediciones).

## R21 — `loteDeLaCorrida` (rompía tsc)

**Cómo queda.** `lecturasParaMarcar` toma el lote que entró en la corrida **de la corrida** con un ayudante privado, `loteDeEntradaDeLaCorrida` (la entrada de la primera transformación, la misma regla que `resolveRunSourceLot` de `fermentation.ts` y `drying.ts`; las dos
siguen sin exportarse), y lo pasa como `loteDeLaCorrida`; sin transformación de entrada devuelve `[]`. `DondeSeMarca` no cambia (las páginas y los mocks siguen con `{ registro, registroId }`). Con eso `seVe` vuelve a trabajar en las corridas. La prueba del lote oculto está rehecha: la
corrida del lote B nace con su transformación (`abrirCorrida`), la prueba comprueba **antes** que con `b` la definición de la tarea 11 SÍ devuelve la lectura y con el lote de la ficha de `gestor` no, y entonces `lecturasParaMarcar(gestor, a, …)` da `[]` —lo da la autorización, no el filtro por lote—; control: quien ve B recibe esa lectura. Una prueba
nueva (R21) fija que el lote sale de la corrida: preguntando desde el lote de salida o desde el de entrada se ofrece la lectura del de entrada. `paraLasPantallas.test.ts` tiene **15** pruebas (contadas en el bloque: 15 `it(`), y con base 15 + 4 = **19**.

**Medido ahora, no heredado:**

- **El defecto original, reproducido con control.** `tsc` sobre la copia con el `lecturasDeCierre.ts` de T11 de hoy y los bloques de T13 de ANTES de la primera pasada (`final-t13/T13.antes.md`): **3 errores** —TS2322 en `registro = donde` de `lecturasParaMarcar`, TS2345 en la llamada de control de la prueba de R16, y el del cliente de Prisma
  parchado de la copia (`processStepClosingReading`, de T11 y no de T13)—. Con los bloques de hoy: **1** (sólo el de T11). El control discrimina: los mismos archivos, 3 contra 1. Los dos archivos se restauraron comprobando el sha (`ca9938b5…` y `96ed20c2…` / hoy `231a4840…` por mis comentarios).
- **La sonda sin base** (`zz-sonda-r21.test.ts`, del scratchpad, no del plan): corre el CÓDIGO REAL de `lecturasParaMarcar` y de `lecturasCandidatasDeCierre` contra una base simulada (`lot.findUnique`, `lotTransformation.findFirst`, `measurement.findMany` y `requireLotAccess`) con los escenarios de las pruebas de R16 y R21.
  Sin mutar: **3/3**.
- **Fila 26** (quita `if (ve)`; ancla única, sha `ca9938b5…` → `81ce1dbb…`, `tsc` 0 errores): cae **sólo** «R16: con el id de una corrida cuyo lote de entrada quien mira no ve»; la de R21 pasa. Restaurado con el mismo sha.
- **Fila 37** (`loteDeLaCorrida` → `loteDeLaCorrida: lot.id`; sha → `e082dacd…`, `tsc` 0): cae **sólo** la de R21; la de R16 pasa (con `lot.id` el `[]` lo sigue dando el filtro por lote, que es justo lo que la fila 26 no podía ver). Restaurado.
- **Control del defecto de la fila 26:** con las dos mutaciones a la vez (el diseño viejo `lot.id` **y** sin `ve`) la prueba de R16 **sigue en verde** (✓) y cae la de R21. O sea: con el lote de la ficha la fila 26 era ciega, y es el rediseño lo que la hace discriminar. **Una primera vez ese control salió «Tests  no tests»**: mi shell
  no llevaba `DATABASE_URL` (la suite se niega a arrancar sin base y lo dice como «no tests»), que es el instrumento fallando y se lee como «no cayó». Con las dos variables puestas, el resultado de arriba.
- **Las 39 anclas del paso 12**, extraídas del JSON de T13.md de hoy (`extraer-json.mjs`): `filas: 39`, **0 con el ancla fuera de «exactamente una vez»** contra los archivos de la copia. Las filas 26 y 37 del plan llevan el mismo ancla y reemplazo que las de la sonda (comparado en código).

## R22 — `MAX_PASOS_PLANEADOS` (rompía CI)

`pasosDelFormulario.ts` hace `import { MAX_PASOS_PLANEADOS } from "./parecido";` y `export { MAX_PASOS_PLANEADOS };` (re-exporta, como pide T10 en tres sitios): **no declara el número**. Ningún `const MAX_PASOS_PLANEADOS` ni `= 100` queda en el código de T13 (`grep` sobre T13.md: sólo la prosa, el paso 1 y la mutación de la fila 38).
`parecido.ts` de T10 es puro (sólo un TIPO de `./vocabulario`), así que un componente de cliente lo importa sin arrastrar Prisma. El paso 1 mide que `parecido.ts` declara el tope (1) y que el guardia existe.

- **Fila 38** (`import … "./parecido";` → `const MAX_PASOS_PLANEADOS = 100;`; ancla única, sha `74a49d76…` → `e6e11df1…`, `tsc` 0): cae «MAX_PASOS_PLANEADOS se declara una sola vez, en lib/recetas/parecido.ts» (guardia de T10). Sin mutar, esa prueba **pasa**.
- **Dos rojos que NO son de la mutación y que hay que saber leer:** en la copia el guardia de T10 también cae en «mira el repositorio de verdad…» y «sólo lib/recetas/pasos.ts la define…», con y sin mutar, porque la copia no lleva el `pasos.ts` ni el `libre.ts` de T10 (`pasos.ts ya no define escribirPasosPlaneados`). Con T10 construida sólo cae la del tope.
  Sin mutar: `Test Files  1 failed (1)`, `Tests  2 failed | 3 passed (5)` (los dos de arriba); mutado: 3 caídas, con la del tope entre ellas.

## Lo que cambié en esta pasada (tres ediciones de T13.md, todas de precisión, ninguna de código)

1. **Paso 8, prosa del inventario.** Decía que `idsDeTipos`, `puedeVer`, `elProcesoSeVe` y `recepcionesQueQuienMiraVe` son los ayudantes privados y «cuatro operaciones, no ocho». R21 añadió un quinto ayudante privado que toca la base, `loteDeEntradaDeLaCorrida`, y la aritmética pasó a ser
   4 + 5 = «no nueve». **Medido** (`inventario-de-acceso.mjs --json` sobre la copia): `paraLasPantallas.ts` sale con exactamente cuatro operaciones, todas «guardia directo», y `lecturasParaMarcar` con los modelos `lot`, `lotProcess` y `lotTransformation`; el total sigue en 627 operaciones y 171 archivos.
2. **Cabecera de `paraLasPantallas.test.ts`.** Decía «lo quita el filtro por el lote de cada lectura… (con el de la ficha, el filtro por lote ya lo habría dejado fuera)»: dos filtros distintos con casi el mismo nombre en una frase. Ahora nombra `seVe` (la pregunta de si quien mira ve el lote de cada lectura) y el filtro por lote de la definición de T11 por separado.
3. **Duda 15 (T11 dice otra cosa).** Eran «dos sitios» y son **tres**, con sus líneas de hoy: `T11.md:171` (Interfaces), `:1475-1479` (la viñeta «De la corrida es el id de la corrida Y el lote que entró en ella») y `:4293-4300` (la nota de Conflictos, que además delega en esta tarea decidir si añade un caso que ejerza `seVe`
   solo: es lo hecho). Añade la razón de T11 (las pruebas de esta tarea armaban corridas crudas) y cómo se resolvió aquí (las de lecturas nacen con su transformación).

## Qué se midió (y qué NO)

- **tsc** sobre la copia, con las tres ediciones ya aplicadas y los cinco bloques re-extraídos: **1 error** (el de T11 por el cliente parchado). `eslint` sobre los cinco archivos: **0** (salida 0, 0 bytes); control: un archivo en `app/` que importa `lib/db` da salida 1 y 523 bytes con la regla de la casa.
- **Pruebas herméticas de T13 sobre la copia:** 8 archivos, **130 pruebas en verde** (erroresDeSecado 26, errorParaLaFicha 5, paginaDelProceso 18, paginasDeEmpezar 4, pantallasDePaso 14, pasosDelFormulario 15, accionesDePaso 34, pantallas-de-paso 14), más 3 de la sonda = **133 de 133**. Las mismas cifras de la pasada anterior.
- **Seis guardias de `tests/arquitectura/`** (cliente-sin-prisma, proceso-por-el-resolvedor, acceso-a-datos, audit-atomico, cifras-del-inventario, ritmo-con-quien-lo-lea) con el `paraLasPantallas.ts` de ANTES y con el de AHORA: **580 ✓ y 19 × las dos veces, `diff` por nombre vacío**. Las 19 × son de la copia (no es un repositorio git, y su documento de inventario no lleva las operaciones nuevas); no investigué cada una:
  lo que importa es que son las mismas con el código de antes. Un guardia que usa `git grep` en un árbol sin `.git` no mide: no lo leí como verde.
- **NO se midió:** ninguna prueba con base real (la de R16 rehecha, la de R21 y las demás de `paraLasPantallas.test.ts` y `avisosParaLaPagina.test.ts` sólo se compilaron; su lógica de R16 y R21 se midió con la sonda); el `CAYÓ` con base de las filas 26 y 37; `bash scripts/ci.sh`; `npm run build`; el inventario con los documentos de T13 aplicados; el flip de las filas 12 a 36 (menos la 26),
  que no tocan nada de esta ronda (sólo se comprobó que sus anclas casan una vez); ni una unión real con `T03`/`T10` (la copia no trae su `pasos.ts`/`libre.ts`).

## Dudas

1. **`T11.md` dice otra cosa que el registro (R21), en tres sitios** (ver «Lo que cambié», 3). Con `lot.id` la prueba de R16 vuelve a dejar ciega a la fila 26 (control medido arriba). Quien mantenga `T11.md` tiene que alinear esas tres frases; esta tarea no lo toca.
2. **Hoy los dos lotes coinciden para una corrida abierta** (la transformación de arranque no tiene salidas, así que sólo la ficha del lote de entrada la muestra abierta), de modo que en la interfaz de hoy tomar el lote de la corrida y usar el de la ficha dan lo mismo. La razón de tomarlo de la corrida es que son dos datos que nadie ata (R16 pregunta
   justo con un lote y la corrida de otro) y que sólo así `seVe` trabaja. Si Daniel prefiere el lote de la ficha y renunciar a `seVe` en las corridas, son tres líneas y la prueba de R16 vuelve a ser ciega.
3. **Repito la regla de `resolveRunSourceLot`** (no se exporta). Exportarla de `fermentation.ts`/`drying.ts` daría una sola fuente; no es de esta tarea. La regla es la misma (primera transformación por fecha, `inputs[0]`) y, como una corrida real tiene dos transformaciones con la misma entrada, no hay ambigüedad.
4. **La fila 38 usa un guardia de la tarea 10** y mete `pasos-planeados-un-solo-camino.test.ts` en el `PRUEBAS_TODAS` del flip del commit 1: depende de que la 10 esté construida (T13 ya la consume).
5. **Cifras que citan otros documentos y no toqué:** `integracion/T13.md` y `integracion/revision-T13.md` hablan de «122 filas», «113/130 pruebas» y de 17/18 pruebas con base; son informes de rondas anteriores (historia). T15 sólo ancla `export async function lecturasParaMarcar(` (sigue saliendo una vez).

## Archivos

- `/Users/danielsan/Developer/nectar-worktrees/recetas-parte-2a/.superpowers/plan-2a/tareas/T13.md`
- este informe.
