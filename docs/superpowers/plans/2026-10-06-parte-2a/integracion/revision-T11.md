# Ronda de arreglo de T11 — tras la revisión adversaria (2026-10-05)

Árbol: `recetas-parte-2a`, HEAD `da048af2`. Único archivo del plan editado: `tareas/T11.md` (3211 → 4255 líneas; sha256 `a21c46aa…`; el original, `b3494f49…`, está
en el scratchpad de la sesión). Nada más del worktree se tocó (los otros `tareas/*.md` que cambiaron hoy son de otros agentes). Ninguna base se tocó: toda
medición con base se hizo contra una URL a un puerto vacío, y sólo se corrieron pruebas herméticas.

## Qué se hizo, por ruling

**R3 — `proponerFines` / `convertirLibre` acotan al hilo.** Nuevo `hiloDelProceso(tx, id)`: bucle por id con `lotProcess.findUnique({ where: { id } })` —no por lote—,
siguiendo `derivedFromLotProcessId`; un reproceso nace sin derivación y no hereda. `aporteDelHilo` lee corridas, manejos y marcas con `lotProcessId in hilo.ids` y
`recipeStepId in pasos`; reúne los lotes de lo que aporta (el de cada lectura vigente y el lote del proceso de cada manejo con marcas); `convertirLibre` y
`puedeConvertirLibre` piden `view` sobre todos con `exigeVerLosLotes`: si uno no se ve, `convertirLibre` se rechaza entera (`TraceabilityAccessError`) y el predicado dice que no
(decisión escrita en «Dudas» 5: rechazar y no recortar). Pruebas (R3): división B/C (B trae lo suyo y lo del proceso dividido, no lo de C; C, lo suyo y lo mismo de arriba),
continuación (trae lo de su proceso cerrado, dos fines del mismo paso), hilo por un lote oculto (no convierte ni se ofrece), y descendiente oculto de un manejo del hilo.
`proceso-por-el-resolvedor` pasa con ese bucle, y con una búsqueda por lote metida a mano en `convertir.ts` cae por su nombre (control medido).

**R4 — la vigente de la marca.** `vigenteDe(tx, ids)` exportado, con el MISMO recorrido que `lecturasCandidatasDeCierre` (factorizado en `bajarCadenas`, uno solo para las dos
preguntas); `proponerFines` usa valor, unidad, fecha e id de la vigente y deduplica por esa id (`${pasoNuevo}:${lectura.id}`). Con la cadena bifurcada gana la corrección de
fecha más reciente y, a igualdad, la de id mayor. Pruebas: «marcar, corregir DESPUÉS y convertir» (B4: el fin lleva la corrección y su id, la marca sigue siendo la que se hizo),
«una lectura y su corrección marcadas son una sola condición», y las dos de `vigenteDe` (eslabones y bifurcación con DOS bifurcaciones en órdenes opuestos).

**R5 — autorizar en la escritura y atar al lote.** `marcarLecturasDeCierre` pide `view` sobre el lote de cada lectura que no es el que su puerta ya autorizó
(`exigeVerLosLotes`, función aparte a propósito: si la llamada a `requireLotAccess` viviera dentro de `marcarLecturasDeCierre`, el inventario reclasificaría
`cerrarCorridaEnTransaccion`; medido). «Es de la corrida» exige el id de la corrida Y el lote que entró en ella, y **ese lote lo pasa la puerta** (`loteDeLaCorrida:
sourceLot.id`, el que ya leyó y sobre el que ya pidió `manage`), igual que un manejo lleva `loteDelProceso`. No se lee de la primera transformación dentro de
`lecturasCandidatasDeCierre` (la primera versión lo hacía) porque las pruebas de T13 arman corridas crudas sin transformación. El paso 7 gana las dos líneas
`loteDeLaCorrida: sourceLot.id,` en `endFermentationRun` y `cerrarCorridaEnTransaccion`. Pruebas: «lectura con el id de la corrida pero de OTRO lote» por las tres puertas de
corrida, «descendiente que quien marca no ve», «cuenta que sólo gestiona la parcela HERMANA» por las cuatro puertas (cero marcas), y la de OTRA corrida del MISMO lote.

**R16 — la prueba compuesta.** Una cuenta de otra organización con Coffee Process Manager y Project Viewer sobre este lote: `sin_permiso_de_autoria`, `puedeConvertirLibre` falso,
cero recetas nuevas (ni en la organización del lote ni en la otra).

**R19 — #646.** El paso 1 corre `t00-646.sh` y dice que el veredicto caduca. Medido hoy con copias de `drying.ts` de `main` (`50cbfda3`) y de la rama de #646 (`36053095`): las dos
anclas de `drying.ts` casan 1/1 en las dos, y lo único que crece es el comentario de `endedOutcome`. Esta tarea no toca las dos acciones ni los formularios (son de T13). El paso dice
cómo re-anclar por texto sin quitar `endedOutcome` si una ancla dejara de casar.

Tamaños resultantes: 18 pruebas en `lecturasDeCierre.test.ts` (antes 12), 16 en `convertir.test.ts` (antes 12); 34 filas de flip en la parte A y 36 en la B (las 70 del encabezado).

## Medido (cada cosa con su control)

- **tsc** sobre una copia con el código de T3, T5, T7, T8 y T10 más lo de T11: 0 salidas; con `const roto: number = "…"` (control): `tsc=2`, así que el arnés mide.
- **Arnés de mutaciones** (`muta.mjs`: ancla ÚNICA, sha antes/después, tsc, vitest cuando es hermético, restaurar): parte A, filas 1–34, todas `ancla 1`, `tsc=0`, sha distinto;
  filas 31–34 (hermeticas) caen por su nombre (`mensajesDeProceso.test.ts`, «control: …» y «cada código tiene…»). Parte B, filas 1–36, ídem; filas 24–25 caen por nombre (en la 24 cae
  además la prueba de fuente de `friendlyError`, que ya caía sin mutar porque la copia no lleva la rama de T3: se descuenta). Después de las 70, `git hash-object` de los 8 archivos
  mutables == sus hashes de antes (8/8 iguales; el archivo de hashes trae 8 líneas, control de que se comparó algo).
- **Inventario con el código final** (copias A y B reconstruidas hoy): A, 628→632 operaciones, 170→171 archivos, «guardia directo» 474→476, «depende del llamador» 96→98, cuatro filas de
  `lecturasDeCierre.ts` con la clase que el plan dice y `cerrarCorridaEnTransaccion` en «recibe principal, sin guardia visible» (el control que dice que `marcarLecturasDeCierre` no se leyó
  como guardia en `drying.ts`). B, 632→634, 171→172, 476→478. La nota del documento que el plan trae, con las cifras sustituidas, está **verbatim** en el documento validado de cada copia.
- **Allowlist**: los dos guiones se corren (A: 1 `reciben_transaccion` + 2 `dependen_del_llamador`; B: 1 `importan_cliente_total` + 1 `reciben_transaccion`); `acceso-a-datos` y
  `cifras-del-inventario` pasan 20/20 en A y en B. Control: quitar la entrada de `vigenteDe` hace caer «ninguna operación nueva entra sin que alguien mire a su llamador».
- **Código incrustado**: los cuatro archivos nuevos aparecen enteros y UNA vez en el plan (idénticos a los compilados), también los tres bloques de las puertas; fences pares (136); cero «TODO»,
  «similar a», `loteDeEntrada` ni cifras viejas.
- **Anclas**: el guion de anclas del plan, extraído del propio plan, da 14/15 sobre la copia (la 15, la línea de `guardian.test.ts` en `pruebas-por-compuerta.txt`, no existe en la copia
  porque la pone T7).
- **Dos medidas de contexto que el plan cita**: `recordMeasurement` consulta `lotTransformation` 2 veces (las ramas de la inspección de un secado; mi suposición inicial de 0 era falsa), y de
  231 bloques `$transaction(async (tx) => …)` de `lib/` ninguno llama a un guardia dentro (control: 223 llaman a `recordAuditEvent`).

## No medido

- **Ninguna prueba con base se corrió.** Las dos suites compilan y la lógica de cadenas y de lote se ejercitó contra un cliente de mentira, pero las columnas «tiene que caer» de las filas 1–30
  (A) y 1–22, 26–36 (B) son lo que se espera por lo que cada prueba afirma. La corrida real las sustituye.
- La copia no lleva las entradas de allowlist de `guardian.ts` y `versiones.ts` (T7, T8), ni la rama de `friendlyError` de T3: sin T11, `acceso-a-datos` y `acciones-traducen-sus-errores` fallan en la
  copia exactamente igual (control: mismas dos rutas y el mismo `RecipeError`). En el árbol de verdad esos dos fallos no existen.
- El costo de autorizar dentro de la transacción (una segunda conexión mientras dura, sólo con la lectura de un descendiente) no se midió en carga; sólo se midió que la casa no lo hace en ningún otro sitio.

## Acoplamientos con otras tareas (para quien las junta)

1. **T13 tiene que pasar `loteDeLaCorrida`.** `RegistroDeLecturasDeCierre` lo exige en sus dos miembros de corrida; `tsc` lo dirá en `lecturasParaMarcar` (`T13.md:1790`, `registro = donde`) y en su
   prueba de control (`T13.md:1078`). Con el lote de la página en esa llamada, su prueba R16 (corrida de un lote oculto) seguirá dando `[]`, pero ya por el lote de la corrida y no sólo por el filtro
   `seVe`. No toqué T13.
2. **T03 (R6).** `exigeValoresDelPaso` sigue aceptando como `desdeLecturaId` sólo una lectura MARCADA; con R4 el fin lleva la id de la vigente, que puede ser una corrección no marcada. Es la «Duda» 1
   de T11 y el paso 1 la mide (la línea de `correctsId` en `exigeValoresDelPaso`); hay que decidirla antes de construir. Además T03 sugiere que `convertirLibre` filtre las lecturas por la
   organización de la receta nueva: ver «Duda» 7.
3. **T00.** El paso 1 llama a `$GUIONES/t00-646.sh`: T00 tiene que dejarlo en esa ruta (la parte de R19 de T00 ya lo pide).

## Decisiones que quedan en «Dudas» de T11 (siete)

1 `desdeLecturaId` de una corrección vs. `exigeValoresDelPaso` · 2 dirección del fin medida de la serie · 3 `correctMeasurement` sigue sin copiar la corrida · 4 un Coffee Process Manager «puro» no
convierte (no ve lotes) · 5 rechazar o recortar si el hilo pasa por un lote que no se ve · 6 autorización por el cliente global dentro de la transacción (la casa autoriza antes) · 7 lecturas del hilo
y organización de la receta nueva.
