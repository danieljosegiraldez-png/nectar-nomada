# Ronda de arreglo — T02 y T05 (2026-10-04, tras el segundo cruce C1–C16)

Editados EN SU SITIO, y sólo ellos: `tareas/T02.md` (2308 → 2337 líneas) y `tareas/T05.md` (2022 → 2342). El worktree sigue limpio
(`git status --porcelain` → 0) y no se creó `out/`. Ninguna orden habló con una base de datos: las pruebas se corrieron en una copia del
scratchpad (`…/scratchpad/t02t05/arbol`: rsync del worktree sin `node_modules` —enlazado—, `.next`, `.git`), con `TEST_DATABASE_URL` a un puerto
sin servicio (`127.0.0.1:55432/no-se-conecta`, como `ci.sh`). Sin `git` en la copia: la restauración de cada mutación fue un `cp` y se comprobó por sha.

## Qué se hizo, por ruling

| Ruling | Dónde | Cómo se comprobó |
|---|---|---|
| **C7** (T02) | paso 14b: la frase pasa a «la decisión de tocar producción es de Daniel; el SQL lo corre él en el SQL Editor de Neon; la sesión no corre nada contra producción» | `grep -i credencial` sobre T02 y T05: 0 |
| **C15** (T02) | «Dudas», punto 5 nuevo, y una viñeta en «Lo que esta tarea NO hace»: `agua` y `capacidad_sin_recipiente` esperan a la 2c | leído `2026-10-04-parte-2c-equipos-y-capacidades-design.md` §3.1, §5.2, §10 (por `git show HEAD:`); los cinco valores de `capacidad` y la prueba que los fija (`vocabulario.test.ts`) están nombrados en la duda |
| **C10** (T02) | `contar-semi-lavados.sql` se queda en `out/`: dos frases lo dicen (cabecera «Archivos» y paso 14b), con la regla 14 ampliada | T02 no crea ningún `.mjs/.cjs/.js/.ts` en `out/` |
| **C11** | T02: 1 guarda (paso 17); T05: 2 (pasos 5 y 18). Idéntica a la de T15, con el nombre real del archivo | flip en bash y zsh: con marcador → `ABORTA` y salida 1; sin marcador → continúa, salida 0; archivo inexistente → aborta, salida 1 |
| **C9** | T02: 7 bloques de órdenes; T05: el bloque de entorno, la comprobación del paso 19 y el paso 1. `BASE` se lee de `$OUT/t00-base.txt`, por omisión `nectar_test_recetas_2a`, sombra `${BASE}_shadow`; `OUT` se define antes | texto de un bloque, sacado del propio `.md` y ejecutado en bash y zsh con `OUT` a una carpeta de scratch: con sucesora `_c` → `…/nectar_test_recetas_2a_c` y `…_c_shadow`; sin archivo → la de siempre; con el archivo vacío → la de siempre. Ningún nombre literal queda en una URL (`grep -cF` → 0). Ninguna comprobación aborta por un nombre sucesor |
| **CI-INERTE** | T02: **ya estaba** en el método bueno (paso 15; lo puso la ronda anterior): nada que cambiar. T05: el paso 15 no tenía el patrón roto pero tampoco el control que discrimina; ahora reconstruye la selección de `ci.sh` con los tres controles de T01/T02 y la cuenta | snippet extraído del `.md` y ejecutado en zsh y bash sobre la copia (con las dos pruebas con base creadas y apuntadas): `203 archivos` (el mismo N que las dos líneas literales de `ci.sh`), `0 y 0`, `1 y 1`, `1 y 0`, `1`; **flip**: sin apuntarlas, `1 y 1` / `0 y 0` |
| **C12** (T05) | duda 1 borrada; «Resueltas» lo explica; el paso 13 y «Produce» dicen que `recetaDemoVersionId` es contrato con T07 | **confirmado en T07.md**: cabecera (l. 37–39, 64–68), paso 1 (l. 139, ≥ 2 apariciones), paso 8c (l. 996–1054) busca los pasos `fermentation` y `drying` con `recetaDemoVersionId`. Y en `prisma/seed.ts`: `const blindCodes` en :880 y el `for` de las tandas en :883, así que la declaración de T05 (antes de `blindCodes`) queda ANTES del bucle |
| **C13** (T05) | medido en el paso 1 y construido: paso 10 punto 6 (rama en `friendlyError`), paso 11 (clave `error_roast_version_no_publicada`, es/en), hermética nueva, filas 23–25 del flip | ver abajo |
| **C14** (T05) | `recipe_archived` y `recipe_version_not_found` entran en `CODIGOS_DE_PROCESO_TRADUCIDOS` (pasos 6 y 11), con sus claves es/en, en la lista de `mensajesDeProceso.test.ts` y en la hermética, filas 26–29 del flip | ver abajo |

## C13: la medición, y por qué es un cambio y no una nota

`friendlyError` traduce toda `RoastSessionValidationError` con `t("error_roast", { detail: error.message })`, y las dos acciones del tueste
(`elegirPerfilDeTuesteAction`, `recordRoastSessionAction`) pasan por él (líneas medidas: la rama genérica 1, la frase propia 0, las dos acciones con
`friendlyError(t, error)` 1 y 1, control del rango de `sed` 39 líneas). O sea: `version_no_publicada` salía como «No se pudo guardar el tueste:
version_no_publicada». Mecanismo de hoy para un código de una clase: una rama `instanceof` + `error.message ===` delante de la genérica
(`screen_system_invalid`, `green_sample_before_reposo`). No se creó una lista nueva.

**Lo que se midió de camino y no estaba escrito:** ni `tsc` ni `claves-de-traduccion-existen` vigilan que la clave exista. Con la clave quitada
de los dos JSON, `tsc --noEmit` sigue en 0, y la guardia salta el archivo (sólo mira archivos con UNA llamada a `getTranslations`; la acción lleva 63,
de dos espacios). Por eso la hermética nueva lee los JSON. Quedó dicho en el paso 10.

## La hermética nueva: `tests/recetas/frasesDeLaRecetaObligatoria.test.ts` (18 pruebas)

Ejecuta de verdad `friendlyError` por tres acciones (`abrirProcesoAction`, `elegirPerfilDeTuesteAction`, `recordRoastSessionAction`), con los servicios
simulados que RECHAZAN y las clases de error reales (patrón de `accionesQueNoCapturaban.test.ts`). No va a `pruebas-por-compuerta.txt`: la corre `ci.sh`.

- **Rojo contra el código de hoy:** 13 caen, 5 pasan (las cinco «control»). Las 13 caen con la aserción esperada (`error_lot_process|<código>` en vez de
  `error_proceso_<código>`; `falta es:<clave>`), no con un error de importación.
- **Verde con los pasos 10 y 11:** 18 de 18; `tsc` 0; `eslint` 0 sobre los cuatro archivos tocados (control: el mismo `eslint` da 1 sobre un
  `import` restringido en `app/`). Primer intento de control con `var x`: dio 0 y **no discriminaba**; se cambió por el import restringido.
- **Una prueba que arrastraba a la siguiente:** con `vi.clearAllMocks()`, la fila 24 hacía caer DOS pruebas (la que debe y la de al lado, por un
  `mockRejectedValueOnce` sin consumir). Cambiado a `vi.resetAllMocks()`: cae una. El `.md` lleva el archivo ya corregido.
- Los bloques de código del `.md` (la prueba, la rama de `friendlyError`, los cinco códigos de la lista, los de la prueba de mensajes y las seis líneas de cada
  JSON) se **compararon byte a byte** con los archivos compilados: los 6 coinciden.

### Flip-test de las siete filas nuevas (23–29), corridas COMPLETAS, con la versión final de la prueba

Cada una: ancla UNA vez, dos sha distintos, compila (`tsc` 0 para `.ts`; JSON válido para `.json`), cae por su nombre lo que dice la tabla y nada más, restaurada con el mismo sha.

| # | Archivo | Mutación | Cae |
|---|---|---|---|
| 23 | `app/actions/traceability.ts` | quitar la rama del tueste | las dos del tueste (elegir y registrar) |
| 24 | `app/actions/traceability.ts` | quitar `&& error.message === "version_no_publicada"` | «control: otro rechazo del tueste sigue por el genérico…» (sólo ésa) |
| 25 | `messages/en.json` | `error_roast_version_no_publicada` → `""` | «error_roast_version_no_publicada» (sólo ésa) |
| 26 | `errorDeProceso.ts` | borrar `"recipe_archived"` | «recipe_archived sale con su frase» + el control de `mensajesDeProceso` |
| 27 | `errorDeProceso.ts` | borrar `"recipe_version_not_found"` | «recipe_version_not_found sale con su frase» + el mismo control |
| 28 | `messages/es.json` | `error_proceso_recipe_archived` → `""` | «error_proceso_recipe_archived» + «cada código tiene … en los dos idiomas» |
| 29 | `messages/es.json` | `error_proceso_recipe_version_not_found` → una frase que enseña el código crudo | «error_proceso_recipe_version_not_found» (sólo ésa) |

Y las neighbours, sobre el estado aplicado: `mensajesDeProceso`, `acciones-traducen-sus-errores`, `claves-de-traduccion-existen`, `acceso-a-datos`,
`cifras-del-inventario`, `use-server-solo-async`, `audit-atomico`, `proceso-por-el-resolvedor`, `accionesQueNoCapturaban`, `ci-cobertura` y la nueva:
**11 archivos, 555 pruebas, verde**. Y los 24 archivos herméticos que leen `messages/*.json` (frases, vocabulario del menú, `un-solo-termino-para-el-vacio`,
etc.): 25 archivos verdes tras copiar `protocolos/`, que el rsync inicial había dejado fuera.

## Cambios derivados que el `.md` de T05 ya refleja

- Archivos tocados por el commit 2: **15 → 17** (`app/actions/traceability.ts` y la hermética); `git show --stat … | tail -21`.
- Claves de `Traceability`: **3 → 6** por idioma (1464 → 1470 en la copia). Códigos de `CODIGOS_DE_PROCESO_TRADUCIDOS`: 3 → 5.
- Paso 9: 12 → **25** pruebas que caen por su nombre (`5 failed | 1 passed (6)`); paso 14: `Test Files  25 passed (25)` y un control nuevo (13 y 18).
- Las anclas de otras tareas sobre el texto de T05 siguen casando: T07, T08, T10 y T11 anclan en `] as const;` de `errorDeProceso.ts` y añaden claves por guion
  al final de `Traceability`; T13 ancla en `  "process_already_closed",` (queda una vez, antes de los códigos de T05) y en el cierre de la lista de
  `mensajesDeProceso.test.ts`; T03 ancla en la línea de `ProcessTargetError`, posterior a la rama del tueste. Ninguna cita `error_roast`.
- Anclas del repositorio que T05 usa por primera vez, medidas en el worktree (`HEAD da048af2`): `  "process_already_closed",` en `errorDeProceso.ts` 1 y en
  `mensajesDeProceso.test.ts` 1; la línea del tueste en la acción 1 (y la de `ProcessTargetError`, control, 1); las dos anclas multilínea de `messages/` 1 y 1.

## Lo que NO se ejecutó (dicho, no tapado)

- **Nada contra una base.** No corrieron: `recetaObligatoria`, `tuesteSoloConPublicadas` ni el resto de `base-sembrada` de T05; el paso 16 (semilla en `nn_flip_*`); las
  25 filas viejas del flip de T05 que necesitan base; la fila 17 de T02; `contar-semi-lavados.sql`; ni ninguna consulta `psql`.
- `bash scripts/ci.sh` entero **no** se corrió (corre `prisma generate`, `verify` y toda la selección): se corrieron sus dos líneas de selección y las pruebas herméticas
  relevantes. El `203 archivos` es la selección de la copia, que no lleva las tareas 1–4.
- **T02 no tenía nada que cambiar en CI-INERTE**; se verificó leyéndolo, no ejecutándolo (su paso 15 depende de que T02 esté construida).

## Dudas que quedan

1. **El tueste lanza también `recipe_version_not_found`** (`roasting.ts:147` y `:403`, con `RoastSessionValidationError`) y sale crudo por `error_roast`, igual que salía
   `version_no_publicada`. No es de este encargo (C13 nombra sólo `version_no_publicada`) y sólo se provoca con un formulario fabricado: queda en las «Dudas» de T05
   (punto 2), señalado y no arreglado.
2. **El tueste sigue aceptando por id una receta archivada** (ya estaba como duda 2 de T05; ahora es la 1).
3. **El registro (Ruling C15) pide que T03 diga lo mismo que T02 sobre `agua`/`capacidad_sin_recipiente`**: lo menciona T02 y lo deja a T03, que no es de este encargo y que no leí.
4. **La guarda de C11 usa `exit 1`**, como la de T15: dentro de una shell interactiva cierra la shell. Con un archivo de mensaje inexistente también aborta, con el
   mismo texto («falta sustituir el trailer»), que en ese caso no es la causa; es lo seguro, no lo exacto.
5. **`T02.md` pide `psql` para comprobar la fila `0 · base | <$BASE>`** a ojo, no con una aserción: una comparación mecánica con `$BASE` sería posible y no se añadió
   (no estaba en el encargo).
