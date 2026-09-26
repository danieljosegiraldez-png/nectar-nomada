# Las tres lecturas de la clasificación de café verde por malla — diseño

Daniel pidió el 2026-09-25 tres lecturas sobre la selección en **verde**, antes de tostar:

1. **Peso y porcentaje de cada malla** sobre la entrada, para leer el rendimiento por tamaño.
2. **Defectos por categoría de rechazo**, con su peso y su porcentaje.
3. **Comparar lotes entre sí** — si una cosecha saca más malla grande que otra.

La escritura ya existe (ADR-186, migración `20260924100000_seleccion_verde_por_malla`, en
producción). Esto es sólo la capa de lectura.

## Sus seis decisiones de diseño, 2026-09-25

| # | decisión |
|---|---|
| 1 | Las lecturas 1 y 2 van en un **bloque propio** que **sustituye** a la tabla genérica de cuajado en los lotes verdes. La de cereza queda intacta |
| 2 | En la lectura 3, **una fila por lote** — no por cosecha |
| 3 | La comparación lista **todos los lotes verdes clasificados que el permiso alcance**, con éste resaltado. Sin selector y sin filtro |
| 4 | Las lecturas 1 y 2 en la ficha; la **3 en su propia pantalla**, `/lots/[id]/clasificacion`, enlazada desde el bloque |
| 5 | Los lotes con malla **no medida entran igual** en la comparación, y cada fila **dice de qué está hecha** |
| 6 | En la tabla comparativa, **una columna por rango declarado**. Ninguna escala inventada |

La 4 revisa lo que él había dicho antes —«las tres en la ficha»— al saber que la 3 es una tabla
de todos los lotes y no una lectura de éste.

## Lo que ya existe, medido sobre `origin/main` en `068f7da4`

- `recordGreenGrading` (`lib/traceability/greenGrading.ts:99`) escribe con
  `transformationType: "selection"` — **el mismo tipo que la selección de cereza**.
- La ficha del lote hace `transformations.find(tr => tr.transformationType === "selection")` y se
  la pasa a `getSelectionOutturn` (`app/lots/[id]/page.tsx:364`).
- **Consecuencia, por lectura de código y no ejecutada:** en un lote verde ya clasificado la tabla
  «cuajado de la selección» **ya se está pintando hoy**, con una fila por fracción y una por lote
  de defecto, cada una con kilos y su porcentaje. Las lecturas 1 y 2 están medio construidas sin
  que nadie lo pidiera.
- **Ningún test cruza `recordGreenGrading` con `getSelectionOutturn`.** Comprobado recorriendo los
  `it(` de `tests/traceability/selection.test.ts`. Por eso la primera prueba de abajo existe.

Lo que a esas filas les falta, y es exactamente el hueco de las tres lecturas:

| lectura | qué hay | qué falta |
|---|---|---|
| 1 | una fila por fracción, con kilos y % | **no dice qué malla es**: sólo «Aceptado» y el código. `greenScreenMin/Max/System/Status` no salen |
| 2 | una fila por lote de defecto, con su categoría | **no agrupa**: dos lotes de la misma categoría son dos filas sin sumar |
| 3 | nada | todo |

**El vocabulario no sale del contrato.** `docs/beneficio/03_public_api.md` no menciona malla,
`screen` ni clasificación en sus 306 líneas; los nombres de este diseño vienen de ADR-186,
`lib/traceability/vocabularioDeMalla.ts` y las columnas `green_screen_*` del esquema. Se anota
aquí para que nadie lo busque allí y concluya que falta.

## Cómo se reconoce una clasificación de verde

Hoy comparte `transformationType` con la selección de cereza, así que el discriminador son **dos
condiciones a la vez**:

1. el lote de **entrada** es `green`, y
2. **al menos una salida** tiene `greenScreenStatus` no nulo.

Ninguna sola basta. La primera, porque `recordSelection` no prohíbe que le pasen un lote verde —
sólo la pantalla lo evita, con `canSelect = lot.lotType === "cherry"`. La segunda, porque
`greenScreenStatus` es un campo del **lote**, no del evento, y un lote verde puede traerlo de una
clasificación anterior. Que la segunda condición sea suficiente para distinguir fracciones de
defectos está medido: `screenStatus` es **obligatorio** en `GreenFractionInput`, así que toda
fracción escrita por `recordGreenGrading` lo lleva, y ningún lote de defecto lo lleva.

## Piezas

### `lib/traceability/clasificacionVerde.ts` — nuevo, sólo lectura

`selection.ts` y `getSelectionOutturn` **no se tocan**. La cereza conserva su tabla y su
vocabulario; «aceptado / rechazado» no significa nada en una clasificación por tamaño.

**`clasificacionDeLote(userAccountId, lotId)`** — para el bloque de la ficha. Devuelve `null` si
el lote no tiene clasificación verde. Si la tiene:

- `entradaKg` — la suma de las entradas de la transformación.
- `mallas[]` — una por fracción: `lotId`, `lotCode`, `rangoMin`, `rangoMax`, `sistema`, `estado`,
  `uniformidadPct`, `kg`, `pct`. Ordenadas de malla grande a pequeña. **«Sin rango declarado»
  significa los dos nulos**, y esas van al final; con uno solo se ordena por el que haya y se
  escribe `17–?`, como la ficha ya lo pinta hoy.
- `defectos[]` — **agrupados por categoría canónica y sumados**: `categoria`, `kg`, `pct`, y los
  `lotes[]` que la componen. Esto es lo que hoy falta.
- `mermaDeclaradaKg`, `noExplicadoKg` — el segundo leído del valor **guardado al escribir**, no
  recalculado, igual que ya hace `getSelectionOutturn`.

**`compararClasificacionVerde(userAccountId)`** — para la pantalla de comparación. Monta sobre
`resolveLotVisibility` / `lotWhereFromVisibility` (`lib/traceability/lots.ts`), la misma vía que
`getLotList`, y por eso hereda tres cosas sin reescribirlas: el recorte por permisos, el tope de
`LIST_LIMIT` con su truncado, y la bandera **`sinAmbito`** que distingue «no hay lotes» de «no
puedes ver ninguno». El comentario de `lots.ts:724` cuenta que esa distinción se aprendió a base
de decirle «nada en curso» a cuentas sin asignaciones; escribir un `where` propio la perdería.

Devuelve:

- `columnas[]` — la unión de los rangos presentes en los datos visibles. **La identidad de una
  columna es la terna `(sistema, min, max)`**: un 17/18 de malla redonda y un 17/18 de plana
  **no** son la misma columna. Más una columna final «sin malla declarada».
- `filas[]` — una por lote verde clasificado: `lotId`, `lotCode`, `clasificadoEl`, `entradaKg`,
  el reparto en porcentaje por columna, el porcentaje total de defectos, y **`estadoDelDato`**.
  La función no sabe desde qué lote se la mira: **resaltar la fila del lote de la ruta es cosa de
  la pantalla**, que sí tiene su id.
- `sinClasificar` — cuántos lotes verdes visibles **no** tienen clasificación, para decirlo al pie.
- `sinAmbito`, `truncado`.

**`estadoDelDato` es el peor de las fracciones del lote**, en el orden `measured` →
`supplier_declared` → `qualitative` → `unknown`. Un lote cuyo 17/18 lo pesó la finca y cuyo 15/16
lo dijo el proveedor no puede presentarse como medido.

**Registro obligatorio:** las dos funciones van a `docs/arquitectura/acceso-a-datos.allowlist.json`
con su razón, o `tests/arquitectura/acceso-a-datos.test.ts` tumba la compuerta. Después,
`node scripts/inventario-de-acceso.mjs` — las cifras de inventario nunca a mano.

### `app/components/traceability/ClasificacionPorMalla.tsx` — nuevo

Componente de servidor. Pinta las lecturas 1 y 2 y, al pie, el enlace «comparar con los demás
lotes» a `/lots/[id]/clasificacion`.

### `app/lots/[id]/page.tsx` — modificado

Carga `clasificacionDeLote` cuando `lot.lotType === "green"`. Si la hay, pinta el bloque nuevo; y
el bloque `outturn` pasa a pintarse **sólo cuando no hay clasificación verde**, para que las
mismas cifras no salgan dos veces en dos formatos. Es la única condición que cambia en la ficha.

### `app/lots/[id]/clasificacion/page.tsx` — nuevo

La lectura 3. Fuera de la ficha por dos razones medidas: la ficha ya tiene **1.395 líneas** y unas
veinte secciones, y un `<details>` en un componente de servidor **no ahorra la consulta** — el
contenido se renderiza aunque esté plegado, así que la consulta de todos los lotes correría en
cada carga de cada lote verde, la mire alguien o no.

## Cuando falta el dato

| caso | qué hace la pantalla |
|---|---|
| fracción sin rango declarado | fila «sin malla declarada», con sus kilos y su % reales. **Nunca 0** |
| estado `unknown` / `qualitative` / `supplier_declared` | entra en la tabla; el `estadoDelDato` del lote baja al peor de sus fracciones |
| lote verde sin clasificar | no es fila; se cuenta al pie: «hay N lotes verdes más sin clasificar», para que la ausencia no se lea como inexistencia |
| cuenta sin asignaciones | `sinAmbito`: aviso explícito, no una tabla vacía |
| merma no explicada | el valor guardado al escribir; `null` se dice «desconocido», no cero (ADR-080) |
| más lotes que `LIST_LIMIT` | el truncado que ya trae `getLotList`, dicho en pantalla |

## Pruebas

Las dos primeras existen porque hoy faltan, no para decorar.

1. **La que confirma lo que en este diseño sólo está leído.** Una clasificación escrita con
   `recordGreenGrading` tiene que ser reconocida por `clasificacionDeLote` y devolver sus
   fracciones con su malla. Hoy ningún test cruza la escritura con la lectura.
2. **Control positivo del agrupador de defectos:** un caso con **dos lotes de la misma categoría**,
   comprobando que salen como **una** fila sumada. Sin ese caso el agrupador no se ejerce y la
   prueba pasaría igual sin él — la trampa del escapado XML: una prueba que recorre datos que no
   disparan la transformación no es guardia de esa transformación.
3. Una fracción **sin rango**, para que «sin malla declarada» no se cuele como 0 ni desaparezca.
4. Una fracción `supplier_declared` junto a una `measured`, comprobando que el `estadoDelDato` del
   lote es el **peor** de las dos y no el de la primera.
5. `sinAmbito` sobre una cuenta sin asignaciones: la comparación **no** devuelve lista vacía.
6. Una selección de **cereza** no aparece como clasificación verde — el control negativo del
   discriminador de dos condiciones.

**Cada prueba que se llame guardia pasa flip-test:** mutar, comprobar que el archivo **compila**
—`ast.parse` no basta: importar el módulo y afirmar sobre lo que construye—, y ver caer la prueba
**por su nombre**. **Commitear antes de mutar**, porque el arnés restaura desde HEAD y se llevaría
lo no commiteado.

## Compuertas y orden de trabajo

Worktree `~/Developer/nectar-worktrees/clasificacion-verde`, creado con punto de partida explícito
desde `origin/main`, con `npm ci` dentro.

Por bloque: árbol limpio, `npm run verify`, `bash scripts/ci.sh`, y **`npm run build` de verdad** —
`vitest` no comprueba tipos y esto toca TypeScript. Pruebas con base sobre `nectar_test_verde`, que
ya tiene el esquema al día; **no se resetea la compartida de 55433**. Ninguna compuerta se lee
canalizada: se redirige a archivo y se lee el código de salida.

Cada bloque lo revisa **Codex** sobre el diff —no sobre un paquete—, con el brief de
`docs/CODEX_REVIEW.brief.md`, y cada hallazgo se atiende con evidencia antes de seguir.

Orden previsto, tres bloques:

1. `clasificacionVerde.ts` con sus pruebas y el registro en la allowlist. Sin UI.
2. El bloque de la ficha y la sustitución del `outturn` en lotes verdes.
3. La pantalla `/lots/[id]/clasificacion`.

## Fuera de este diseño

- **Comparar por cosecha.** Decisión 2: una fila por lote. Si más adelante quiere cosechas, se
  construye agrupando estas filas — `HarvestEvent` existe y cuelga del lote de cereza, así que un
  lote verde llega a su cosecha subiendo por la genealogía, como ya hace la miel (ADR-161). Un
  verde comprado no tiene cosecha detrás, y eso habrá que decidirlo entonces.
- **Selector de lotes a comparar.** Decisión 3: sin selector.
- **Guardar el reparto al clasificar.** Rompería la regla que el propio `selection.ts` ya lleva
  escrita: los porcentajes se calculan, nunca se guardan, porque una cantidad y su porcentaje
  guardados acaban discrepando.
- **Los pendientes del #477**, que no son de este tema: motivo de un tueste ausente, el código de
  muestra en el nombre de sesión de un informe externo, `recordQuantityEvent` y los saldos, la
  limpieza que deja `AuditEvent`, y la prueba de concurrencia del bloqueo de fila.
