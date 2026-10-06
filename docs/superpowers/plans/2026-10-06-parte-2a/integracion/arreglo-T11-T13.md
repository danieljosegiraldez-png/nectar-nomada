# Arreglo de T11 y T13 — ronda del segundo cruce (C8, C9, C11, CI-INERTE) — 2026-10-04

Worktree `recetas-parte-2a`, `git status --porcelain` = 0 al empezar y al terminar (sólo se editaron `tareas/T11.md` y `tareas/T13.md`, y se escribió este informe;
`.superpowers/` está en `info/exclude`). Ninguna base se tocó, ningún guion se creó fuera del scratchpad. Todo lo compilado y corrido vive en
`scratchpad/c8/` (`t11/` copia del árbol de verificación de T10-T11, `t13/` copia del árbol final de T13, `t13red/` el árbol «justo antes del commit 5»).
T11.md: 3211 líneas (antes 3119). T13.md: 8547 líneas (antes 8474). Los bloques de código de los dos archivos tienen número par de vallas.

## C8 — convertir una Libre: autoría + `requireLotAccess(view)`, no `manage`

**T11.** `convertirLibre` y `puedeConvertirLibre` pasan de `requireLotAccess(userAccountId, "manage", [lote])` a `"view"`; el orden sigue siendo vista primero, después
`exigeAutoriaDeReceta` / `puedeAutoriaDeReceta` (quien no ve el lote sale con el rechazo de acceso, quien lo ve sin escribir recetas con `sin_permiso_de_autoria`).
Cambiado en el código del paso 18, en el docblock («Quién»), en la prosa de después del código, en la cabecera de la tarea, en «Interfaces → La oferta de la tarea 13», en la nota del
inventario y en la razón de la allowlist (paso 21), en el mensaje del commit 2 y en «Conflictos con el esqueleto» («Ya resuelto…»). **La duda 1 de T11 se borró** (queda una línea en cursiva
que dice quién la resolvió) y las otras dos se renumeran 1 y 2.

*La prueba de quién (paso 15) se reescribió:* cuentas nuevas `lector` (Coffee Process Manager + Project Viewer: escribe recetas, VE el lote, no lo gestiona) y
`lectorDeOtraParcela` (lo mismo con su ámbito en OTRA parcela de la misma organización: tiene la autoría y no ve este lote; una parcela hermana no se alcanza, `conAncestros`). Para eso la
prueba gana una segunda `Location` y un segundo `Scope` (creados en `beforeAll`, borrados en `afterAll` después de las asignaciones y antes de las ubicaciones), el perfil `Project Viewer` en el tipo `Perfil`,
y `lector` y `lectorDeOtraParcela` en la lista de actores cuyo `AuditEvent` borra el `afterEach` (convertir con `lector` escribe dos eventos). Resultado del `it`:
Farm Operator y Farm Manager (con `edit_beneficio`) → `sin_permiso_de_autoria`; Coffee Process Manager sin perfil de lectura, `lectorDeOtraParcela` y `ajeno` → `TraceabilityAccessError`;
`lector` y `encargado` → `puedeConvertirLibre` verdadero, y `lector` CONVIERTE (resuelve) sin gestionar el lote. Controles de cuentas antes de los rechazos: `puedeAutoriaDeReceta` de `soloAutor`
y de `lectorDeOtraParcela` verdadero; `puedeGestionarLote(lector)` falso; `requireLotAccess(lector, "view")` resuelve y los de `soloAutor` y `lectorDeOtraParcela` rechazan.
Paso 1 mide ahora también que existe el perfil `Project Viewer` (`<base>|1|1|24|1|1`).

**Un error de la versión anterior, encontrado al reescribir:** la prueba rechazaba con `sin_permiso_de_autoria` a `encargado` (Farm Operator + Coffee Process Manager) y UNAS LÍNEAS DESPUÉS lo convertía con éxito;
sobre código correcto habría caído. Era `jefe` (el Farm Manager). Ninguna corrida con base lo había visto (no se podía correr).

*Flip (paso 24).* Las filas 12 a 16 llevan el nombre nuevo de la prueba; la 14 pasa a quitar `requireLotAccess(…, "view", …)`; la 13 explica qué cae. **Dos filas nuevas, 26 y 27:** volver a `manage` en
`convertirLibre` (ancla con la línea de arriba) y en `puedeConvertirLibre` (ancla con su `try {`). Caen en la prueba de quién por el `lector`. Texto de cabecera: 27 mutaciones.

**T13.** La página NO cambia de código (el bloque `convertible` ya sólo miraba `puedeConvertirLibre`, nunca `puedeGestionar`); sí cambian comentarios (docblock de `convertirLibreAction`, de `ConvertirLibreForm`, comentario de
`process/page.tsx`), la cabecera, «Consume → Tarea 11», la decisión de la Parte E, el mensaje del commit 5, el recorrido 8 del paso 50 (ahora: Coffee Process Manager + Project Viewer, y un CPM que no ve el lote no ve ni la página: 404),
el recorrido 5 del paso 40 y la duda 3. **Prueba nueva en `paginaDelProceso.test.ts`:** «la oferta no depende de gestionar el lote (C8)» (`puedeGestionarLote` falso, `puedeConvertirLibre` verdadero → se pinta el formulario, la página sigue diciendo
`soloLecturaEnEsteLote` y sigue sin ofrecer abrir; si el servicio dice que no, no se pinta). **Fila 13 del flip del commit 5** (`convertible` condicionado a `puedeGestionar`). Paso 41 mide además que T11 tiene
`requireLotAccess(userAccountId, "view"` ×2 y `"manage"` ×0, y se para si no. Cifras al día: página 12→18 (6 nuevas), total del commit 5 `90 passed (90)` = 32+13+18+13+14, rojo `14 failed | 63 passed (77)`, 14 mutaciones, 17 pruebas herméticas nuevas.

## C9 — nombre de la base

T11 y T13 leen `$OUT/t00-base.txt` con `nectar_test_recetas_2a` por omisión y `<base>_shadow` (mismo patrón que T08). T11: bloque de entorno reordenado (`OUT` antes), fila patrón del paso 1 `<base>|…`, `EXISTE` del flip con `'$BASE'`,
prosa de la regla. T13: `t13-entorno.sh` (heredoc) con `BASE`, «si la base no sale…» sin literal, `EXISTE` de `t13-flip.sh` con `'$BASE'` y «existe» imprime el nombre, los dos «`next dev` con `DATABASE_URL` de `nectar_test_recetas_2a`» → `$DATABASE_URL`.
Ninguna comprobación aborta por un nombre sucesor. Quedan literales sólo como valor por omisión.

## C11 — guarda del trailer

La línea literal del encargo (`[ "$(grep -c 'TRAILER-DE-LA-REGLA-4' <archivo>)" = 0 ] || { echo "ABORTA: falta sustituir el trailer"; exit 1; }`) delante de los 2 `git commit -F` de T11 (`t11-a-commit.txt`, `t11-b-commit.txt`) y los 5 de T13
(`t13-commit-1…5.txt`), con una frase en cada «Esperado» (el bloque se detiene a propósito con el marcador; se sustituye y se repite). Probada con un mensaje con y sin marcador: sale 1 / 0.

## CI-INERTE — método de T01/T02

Sustituidos T11 `:1418–1419` (paso 12) y `:2905` (paso 22), y los cuatro de T13 (pasos 11, 20, 37 y 47, que además tenían controles «≥ 1» que habrían dado 0 con todo en orden): se reconstruye la selección con las dos líneas de `ci.sh`
(`EXCLUIDAS`, `A_CORRER`), se compara la cifra de «CI correrá N» con la reconstruida, y las comprobaciones son `grep -c -x -F` (nombre exacto, no subcadena) sobre `A_CORRER` / `EXCLUIDAS` con sus controles (conocida hermética sí, de base sí en la lista de exclusión).
Medido sobre las copias: igual cifra (204 y 211), `0/1/1` en T11, `0/2/1` en T13 con las dos líneas de exclusión puestas; y el flip del método (quitar la línea de exclusión de `convertir.test.ts`) da `1` donde antes `0`, así que discrimina. En la copia de T13 sin esas dos líneas el mismo bloque da `2` y `0`: el control lo delata.

## Qué se midió (y qué NO)

- **T11:** los bloques de `convertir.test.ts` (728 líneas) y `convertir.ts` (296) del plan son byte a byte los archivos compilados; `tsc -p tsconfig.scratch.json` = 0, 0 bytes; control con un tipo roto = 2 y 1 error. Las **27 mutaciones**
  (las 24 anteriores con su `"view"` y las 26 y 27) se aplican cada una con su ancla EXACTAMENTE una vez y compilan (`tsc=0`, 0 errores), sha antes/después distintos y restaurado. Las filas 24 y 25 (herméticas) se corrieron: caen `control: la lista trae los cuatro códigos…` y
  las dos de textos, más la de fuente de `friendlyError` que ya caía antes por no llevar la copia la tarea 3 (igual que en la integración). `inventario-de-acceso.mjs --json`: `convertirLibre` y `puedeConvertirLibre` siguen `guardia directo` (el nivel no cambia la clase),
  `lecturasCandidatasDeCierre` y `marcarLecturasDeCierre` `depende del llamador`.
- **T13:** `tsc` sobre la copia con las ediciones: 0 errores fuera de `etapas/` (los 35 de siempre son del directorio auxiliar). Las cinco pruebas de la Parte E corren `Test Files 5 passed (5) · Tests 90 passed (90)` (con la antigua: 89); en el árbol rojo (`t13red`, antes del commit 5 + la prueba nueva):
  `14 failed | 63 passed (77)`, `pantallasDePaso` no carga, la prueba de C8 entre las que caen. Fila 13: ancla única, `tsc` 0 errores fuera de `etapas/`, y cae **exactamente una** prueba, «la oferta no depende de gestionar el lote (C8)» (`1 failed | 17 passed (18)`).
  Filas 0 a 12 (las de antes), corridas ahora con `vitest` por fila sobre la copia: las 13 aplican con su ancla única y **cada una cae por su nombre** (0 `FALTA`), cada archivo restaurado (sha igual). Por tanto las 14 de la tabla caen por su nombre. Los guardias
  de arquitectura y de pantallas del paso 46 (18 archivos: `accion-que-no-puedes-no-se-ofrece`, `claves-de-traduccion-existen`, `confirmacion-que-se-lee`, `acciones-traducen-sus-errores`, `proceso-por-el-resolvedor`, `ritmo-con-quien-lo-lea`, las cinco pruebas de la Parte E…) pasan sobre la copia editada: `18 passed (18)`, `450 passed (450)`; mis comentarios no disparan ninguno.
- **NO se pudo medir (prohibido tocar base):** que pasen `convertir.test.ts` (9 con base) ni qué prueba cae en las filas 1–23, 26 y 27 de T11 (su columna «tiene que caer» es lo que se espera por lo que cada prueba afirma; la 26 y la 27 caen por el `lector`:
  resuelve donde la regla de antes lo rechazaba). Tampoco `bash scripts/ci.sh` ni `npm run build`; ni nada visual.
- Un arnés completo de las 14 mutaciones con `tsc` por fila se intentó y se cortó: la máquina estaba a carga 23–27 (otras sesiones) y el primer `tsc` completo pasaba de siete minutos (al cortarlo, un archivo quedó mutado en la copia; se restauró y se comprobó el sha). La fila nueva sí se midió con `tsc`; las otras trece, con `vitest` sin `tsc` por fila:
  su compilación con mutación se midió al integrar T13 (122 filas, `tsc=0`) y esta ronda no cambió el código de esos archivos, sólo comentarios, que el `tsc` completo de arriba ya cubre. **Dicho sin adorno: «las trece de antes compilan con su mutación» NO se volvió a medir hoy.**
- Un tropiezo propio, ya limpiado: `source ./env.sh` del árbol de verificación de T13 hace `cd` al árbol ORIGINAL (`t13int`); un `tsc` y un `vitest` míos corrieron ahí. No modifican nada versionado; borré el único artefacto (`.c8.tsbuildinfo`) y los dos `.txt` que dejé en el scratchpad.

## Dudas

1. **Un Coffee Process Manager «puro» no convierte, porque el perfil no lleva `lot:view`** (T03; el ruling C4 tampoco se lo da en la 2a). C8 dice «Process Manager que ve el lote → pasa»: hoy «ve el lote» exige llevar además otro perfil
   (Project Viewer, Farm Operator, Farm Manager…). Si Daniel quiere que el perfil solo baste, es una fila de permisos en T03 y cambiar la prueba `soloAutor` de «rechazado» a «convierte». Quedó escrita como duda 3 de T11.
2. `convertirLibre` sigue lanzando `proceso_no_encontrado` ANTES de mirar el acceso (lee el proceso con el cliente global): cualquier cuenta con sesión distingue «no existe» de «existe y no lo veo». Es anterior a C8 y no se tocó; se señala.
3. Las filas 1–23, 26 y 27 de T11 y la prueba nueva de la quién no se han corrido contra una base: la primera vez que se ejecute el paso 15 es cuando se sabrá si la cuenta `lectorDeOtraParcela` (ámbito en una parcela hermana) queda de verdad fuera, como dice el `conAncestros` de `lib/rbac/service.ts` («un HERMANO sigue fuera»).

## Archivos

- `/Users/danielsan/Developer/nectar-worktrees/recetas-parte-2a/.superpowers/plan-2a/tareas/T11.md`
- `/Users/danielsan/Developer/nectar-worktrees/recetas-parte-2a/.superpowers/plan-2a/tareas/T13.md`
- este informe.
