# Última ronda de arreglo — T11 (R23 en T11, R24, R25) — reintento verificado

Sólo se editó `tareas/T11.md` (4255 líneas, sha `a21c46aabfe72b80` al empezar la ronda → **4365 líneas, sha `ca5951e01935838c`**; copia previa en el
scratchpad, `t11-final-work/T11.antes.md`). Ninguna base se tocó, ningún `git add/commit/stash/checkout/…`, ningún `npm install`. Los guiones de medición
viven en el scratchpad, fuera del worktree.

**Cómo llegó este reintento.** El primer intento ya había dejado las tres ediciones en disco y escrito un informe, pero su resultado no llegó (el sha de
`T11.md` coincidía con el del informe). Esta vez no se reescribió: se **re-verificó todo de forma independiente** (bloques extraídos de nuevo del plan, compilados
de nuevo, anclas medidas de nuevo) y salieron **dos cosas que corregir**, abajo.

## Lo que se pidió, y dónde queda

**R23 (la parte de T11).** `convertirLibre` sigue escribiendo la id de la VIGENTE: `desdeLecturaId: lectura.id` con
`lectura = aporte.vigentes.get(marca.measurementId)` (`convertir.ts`), y la prueba «marcar, corregir DESPUÉS y convertir…» (R4a) afirma que el fin lleva la id de la
corrección (`buena`); las filas 35 y 36 del flip la mutan. Sin cambio de código. El paso 1 ya no pregunta ni elige: se quitó «se PARA y se pregunta al controlador: hay dos
salidas» (0 restos con `grep`), y la «Duda» 1 se cerró con una nota **sin renumerar** (otras líneas citan las dudas 5, 6 y 7 por su número). El «Consume» de la tarea 3 y el
comentario de `convertir.ts` dicen que R23 acepta la corrección de una marcada.

**R24.** `convertirLibre` crea la receta con `classification: libre.recipe.classification` (una línea tras `description`; `libre.recipe` ya viene en la lectura de la versión:
`include: { recipe: true`, 1 vez). Dos pruebas nuevas al final de `convertir.test.ts`: **R24a** (lote confidencial → receta confidencial con su intención; control de cuentas antes de
los rechazos: `encargado` NO ve el lote ni convierte, `confidencial` sí) y **R24b** (control: internal → internal). Cuenta nueva `confidencial` (Farm Operator + Coffee Process Manager +
Research Lead); `lote()`, `libre()` y `cerrar()` ganan un parámetro con valor por omisión. Dos filas de flip: **37** (quitar la línea → cae sólo R24a) y **38** (constante
`"confidential"` → cae sólo R24b). Contadores: `convertir.test.ts` 16 → 18 pruebas (Archivos, paso 16 «Tests  18 failed (18)», mensaje del commit 2; 0 restos de «16»/«dieciséis»).

**R25.** Filas 1–5 de la tabla de la parte A con el texto real: `lotId: registro.loteDeLaCorrida` y `...(await idsDeDescendencia(tx, registro.loteDelProceso))`. Y del mismo
defecto, las filas 21 y 24 decían «sus seis líneas»: son siete (medido: llamada de fermentación 7, de secado 7, de lotProcess 8; la fila 31 dice «seis» y es cierto, el bloque
`try/catch` de `puedeConvertirLibre` tiene 6).

## Lo que corrigió ESTE reintento (dos cosas)

1. **El paso 1 medía el archivo entero, y la tarea 3 ya promete el cuerpo.** La ronda anterior aflojó la medición de R23 a `grep -c 'correctsId' lib/recetas/pasos.ts` con la razón
   «la subida puede vivir en un ayudante». Entre tanto `T03.md` quedó escrito con R23 **dentro del cuerpo de `exigeValoresDelPaso`** y dice, en su cabecera, que respeta que «T11
   (paso 1) mide con `awk` que `exigeValoresDelPaso` nombra `correctsId` y `processStepClosingReading` en su PROPIO cuerpo (por eso la subida vive ahí y no en un ayudante)». Las dos
   tareas se contradecían, y la medición floja además **no discrimina**. Se restauró la medición en el cuerpo (`awk '/^async function exigeValoresDelPaso/,/^}/'`, con su control de
   `processStepClosingReading` en ≥ 1) y la prosa del paso 1 y del «Consume» lo dice. **Medida contra el código REAL de T03** (cuerpo extraído de `T03.md`, 41 líneas): con él,
   `correctsId` = 4 y marcas = 1; sin la subida (control negativo, quitando las líneas con `correctsId`), `correctsId` = **0** y marcas = 1, mientras que `grep` sobre un archivo con
   el comentario de arriba y otra función da 2 (el falso positivo que el `awk` evita).
2. **«El perfil de la casa que da `clear_confidential`» no era exacto**: lo dan DOS, Research Lead y Research Compliance Reviewer (`lib/rbac/catalog.ts:237` y `:266`); el segundo es de
   revisión y no gestiona lotes. El comentario de la cabecera de `convertir.test.ts` decía «el perfil»; ahora dice «un perfil» y nombra al otro. (El informe del primer intento decía «el
   único perfil»: era falso.) La premisa de R24a no cambia: el Farm Operator, el Farm Manager (excluido a propósito, `catalog.ts:366`) y el Coffee Process Manager (T03: `clear_partner` e
   `clear_internal`) no alcanzan un lote confidencial; `confidencial` sí.

## Evidencia (copia `scratchpad/t11-final`, con las tareas 1–10 aplicadas encima del worktree; bloques re-extraídos de `T11.md` por su fence)

- Los cuatro bloques de código del plan (los dos `lib`, los dos `tests`) son **idénticos byte a byte** a los compilados: `diff=0` los cuatro tras el último cambio del plan
  (`convertir.test.ts` pasó de `3706ffbb6abc` a `23e52831c870`, y la única diferencia con la copia anterior es el comentario de arriba; control del `diff`: entre dos archivos distintos da 1).
- `tsc` con el código y las pruebas finales: **0 bytes, salida 0**. Control: con dos tipos rotos a propósito (`classification: 5` en el código y `"bogus"` en la prueba) `tsc` da **salida 2** con los dos
  errores nombrados (`convertir.ts(340,9) TS2322`, `convertir.test.ts(1140,49) TS2345`); sha antes/mutado/restaurado `b1356c89242a` / `8d5858444cfd` / `b1356c89242a`.
- **Anclas: 62 de 62 casan UNA vez** (barrido `anclas-flip.mjs` sobre la copia final; 27 de la parte A y 35 de la B). Control: las anclas viejas de las filas 1–5 (`lotId: entrada`, `...descendencia`)
  dan 0 sobre el código real. Y el plan contiene las anclas nuevas (filas 1–5, 37 y 38) tal como el barrido las mide.
- **Filas 37 y 38 aplicadas a mano**, cada una con sha distinto y compilando: la 37 `b1356c89242a → ae4af01c7021` (393 → 391 líneas, quitando también el comentario de arriba; la fila del plan
  quita sólo la línea), `tsc=0`, y `classification: libre.recipe.classification` pasa de 1 a 0; la 38 `→ a6ac61572f43`, `tsc=0`, y `classification: "confidential",` pasa de 0 a 1; las dos restauradas
  (sha vuelve a `b1356c89242a`). La conducta que cada fila quita (receta `internal` con intención confidencial; clasificación fija) es la que sólo R24a y sólo R24b afirman.
- **Premisa de R24a**, con la función pura `can` y los perfiles reales (sin base): `encargado` ve/gestiona lo internal y NO lo confidencial; `confidencial` ve y gestiona los dos; el Farm Manager y el
  Project Viewer tampoco alcanzan lo confidencial; control: en OTRA parcela todos dan falso. `requireLotAccess` pasa `candidate.classification` a `can` (`lib/traceability/lots.ts:84`).
- La limpieza de las pruebas nuevas está cubierta: `cuenta()` registra a `confidencial` en `fijo.cuentaIds` (lo borra el `afterAll`), las recetas de R24 llevan `RUN` en el nombre (las borra el `afterEach`
  con `contains: RUN`) y el `auditEvent` de actores incluye a `confidencial`.
- Coherencia con otras tareas: T10 guarda `classification: datos.classification` en la Libre (R8) y T15 ya afirma `classification: libre.recipe.classification` dentro de `convertirLibre` (`T15.md:1422`,
  `exacto: 1`; en el bloque de T11 aparece una sola vez). T15 también cita R23 con «`convertirLibre` sigue escribiendo la id de la **vigente**».
- Ninguna línea de `echo "..."` ni `-m "..."` de los bloques bash de T11 lleva comilla invertida (255 líneas revisadas, 0; control del detector sobre una línea mala conocida: lo encuentra).

## Lo que NO se pudo comprobar

- Ninguna prueba con base se corrió (prohibido): lo que dicen R24a/R24b y las filas 37/38 es lo que se espera por lo que cada prueba afirma. El paso 16 de T11 las verá caer por la razón de verdad y el 24 las voltea.
- El paso 1 de T11 mide `exigeValoresDelPaso` sobre la rama construida, no sobre el plan de T03; aquí sólo se midió contra el cuerpo que `T03.md` escribe.

## Dudas para el controlador

1. El paso 1 sigue deteniéndose si el cuerpo de `exigeValoresDelPaso` da 0 en `correctsId`, pero ya no es una decisión: es «la tarea 3 no entregó lo que R23 le encarga», como cuando falta `publicarVersion`.
   Si se prefiere que no pare, es borrar esa frase y las dos líneas de medición.
2. Si T15 o T00 llevan un total de pruebas de la rama, cuenta las de T11: `convertir.test.ts` pasa de 16 a 18 (R28; no se tocaron esos archivos).
3. R24a/R24b dependen de que la base propia tenga el perfil «Research Lead» (lo siembra `db:seed`); el paso 1 lo mide (`<base>|1|1|24|1|1|1`).
