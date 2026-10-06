# Ronda de arreglo del plan de la Parte 2a — T09 y T12 (2026-10-05)

Alcance: **R9** (T09) y **R15** (T12) del registro, «2026-10-05 — revisión adversaria del plan». Sólo se editaron `tareas/T09.md` y `tareas/T12.md`, en su sitio, y este informe. No se tocó ningún otro archivo del plan, ningún
archivo del worktree (`git status --porcelain`: 0; HEAD `da048af2`; 0 archivos de código bajo `.superpowers/`), ninguna base y ninguna prueba con base. Todo lo que se compiló o se corrió se hizo en copias del scratchpad
(`rev-t09-t12`, `rev-t09-t12-final`).

## R9 — T09 (una corrida sin paso bajo una versión con pasos no hereda el ritmo de la fase)

**Qué cambió, con su sitio en `tareas/T09.md`:**

- **Decisión 9 nueva (`:135`)** y párrafo de la ronda en la cabecera (`:58`). La fase sólo vale si la versión del proceso no tiene pasos; «sin ritmo declarado» = en la cola, `ritmo` con los cuatro campos nulos (el estado sale «receta sin ritmo de secado»,
  la etiqueta que ya existía; **no se añade un estado nuevo**); en el tablero, `expectedHours` nulo y liberación `sin_duracion_declarada`. Las decisiones 1 y 3, «Interfaces → Produce/Consume» y el JSDoc de la edición 1 de la cola se ajustaron.
- **Código (los dos lectores piden `_count: { select: { steps: true } }` de la versión del proceso):** edición 4 de la cola (`:894`; `versionConPasos` y un ternario de tres ramas: paso, versión con pasos → nulos, fase); ediciones 2, 5, 6 y 7 del tablero
  (`procesoSelect`, la entrada del lote, `expectedHours` de la entrada y `duracionDeFase`; la ancla de la 7 creció dos líneas, `:439-445`). Las metas de la versión NO se tocaron (ver duda 1).
- **Pruebas (14 → 17):** el control de «dos secados de volteo distinto» pasó a una versión con fases y sin pasos (`antesDeLa2a` en la cola, `fermentaAntes` en el tablero); `receta()` gana un quinto parámetro, `fasesDeLaVersion` (con una guarda que prohíbe mezclarlo con pasos);
  **tres pruebas nuevas**, cada una con su control en la misma prueba: la desviación en la cola (`:689`), la entrada del tablero (`:1303`) y la liberación del tablero en un mundo propio (`:1342`; sola da `sin_duracion_declarada`, con el control bajo versión sin pasos da `a_las`).
  Las cuentas y las salidas esperadas de los pasos 4, 6, 11, 13, 18, 20 y 24 se reescribieron (cola 6; tablero 6; el rojo del paso 4 pasa a `5 failed | 1 passed (6)`, el del 11 a `5 failed | 7 passed (12)`, el del 18 a `3 failed | 14 passed (17)`).
- **Flip:** cola 6 filas (la nueva, `:1163`, `versionConPasos = false`); tablero 7 filas (`:1780-1786`): 1 horas del paso, 2 R9-entrada, 3 metas del paso, 4 `where` de la versión (ahora cae por R9-entrada y la curva, no por el control), 5 duración del paso,
  6 R9-liberación, 7 curva. **Se retiró** la fila «un paso sin horas hereda las de la fase» de `duracionDeFase`: con R9 es una mutación **equivalente** (la corrida con paso sin horas cae a «sin paso», su versión tiene pasos y la línea de R9 ya la manda a `null`),
  y una mutación que no cambia ningún resultado no mide nada. Está escrito en la tabla. Se juzgó **por lectura, no por ejecución**. Las filas 1 a 3 de la cola siguen siendo efectivas porque la rama del paso lee `faseDeSecado`, que no se anula.
- Se añadió al paso 1 la medición de la relación `steps` y de que las dos consultas aún no piden el conteo; la sección final «Lo que se midió en la ronda del 2026-10-05»; las dudas 4 a 6.

## R15 — T12 («calcular no escribe» y quién importa `avisosDeRecepcion`)

**Qué cambió, con su sitio en `tareas/T12.md`:**

- **La prueba «calcular no escribe nada…» (`:745`)** ya no cuenta filas: corre `avisosDeRecepcion` dentro de `prisma.$transaction` con `SET TRANSACTION READ ONLY` como primera sentencia. Control en dos mitades: una escritura sin efecto
  (`userAccount.updateMany` al estado que ya tiene) la rechaza la base dentro de la transacción de sólo lectura y la MISMA escritura pasa en una corriente (`count` 1); y el resultado leído (un aviso) es igual al del cliente global. Sigue siendo 1 prueba de las 18.
  No se afirma el texto del error de la base (depende del idioma). El módulo es **idéntico** byte a byte al de la ronda anterior.
- **Flip fila 20 (`:1763`):** tras el `return` temprano de «sin pasos de recepción», `await tx.processRecipeStep.updateMany({ where: { recipeVersionId }, data: { opcional: false } })` —un `UPDATE` que deja TODOS los recuentos iguales, el que la prueba anterior no veía—.
  El párrafo «lo que no tiene flip» (cabecera y paso 13) se reescribió: ya sólo carece de flip una mitad de «cada tipo está en la lista».
- **Guardia hermético nuevo (paso 9b, `:1355`):** `tests/arquitectura/avisos-de-recepcion-por-una-puerta.test.ts`, 25 pruebas (21 fuentes sintéticas —11 que cuentan y 10 que no—, una del cuadro y tres del árbol real). Fija que **sólo `lib/recetas/paraLasPantallas.ts`** importe la función. Mira el import del
  SÍMBOLO (no el nombre ni el módulo): ve alias, varias líneas, `type` en línea, `import *`, `export *`/`export { }`, `import()` y `require`; no marca `import type`, otro símbolo del módulo, comentarios (usa `tests/helpers/sinComentarios`), cadenas, un paquete homónimo ni otro módulo que se llame `recepcion` (resuelve `@/` y rutas relativas a una ruta del repositorio).
  Recorre el árbol entero salvo `node_modules`, `generated`, `tests` y directorios con punto (no una lista); control de que lee más de 200 archivos de `lib/` y de `app/` y ve el módulo; el detector se aplica a un importador real (la prueba de la 12) y al módulo que la define. No necesita base: va al carril hermético.
  El paso incluye su **rojo con una sonda** (un archivo nuevo, sin seguir, que se crea y se borra dentro del mismo bloque: no hay nada que restaurar desde `HEAD`).
- **Flip filas 21 a 25:** 21 un segundo archivo de producción la importa; 22 el detector no ve varias líneas; 23 marca cualquier import del módulo; 24 no resuelve la ruta; 25 no quita los comentarios. El arnés pasó de 20 a **26** mutaciones, y cada fila lleva su `archivo` y su `prueba`
  (nuevo guion `t12-campo.mjs`; el arnés suma los archivos sucios de TODOS los archivos que muta). El commit pasa de 5 a **6** archivos, y el mensaje, la allowlist (razón) y la nota del inventario nombran el guardia sin cambiar ninguna cifra ni el `--stat` esperado (la nota sigue en 7 líneas).
- Paso 1 (medidas nuevas), paso 10 (el guardia sí corre en el carril hermético), paso 12, la sección de la ronda en la cabecera, «Resuelto» y la duda 9.

## Lo que se midió (todo en la copia; cada cosa con su control)

- **T09, anclas:** las 18 sustituciones, extraídas del propio `T09.md` por guion y aplicadas en orden: cada ancla **exactamente una vez** y los 4 sha cambian; prueba armada: 17 pruebas, 4 `describe`.
- **T09, tipos:** `tsc` = 0 con todo aplicado (control: `--listFilesOnly` lista los archivos nuevos; un `TS2322` sembrado cae). **Las 16 mutaciones compilan** (6 cola, 7 tablero, 3 del commit 3): ancla única, dos sha distintos, 0 errores, sha restaurado; fila patrón sin mutar = 0;
  control de una mutación sembrada para no compilar (`horasSugeridasX`): 1 error `TS2551`.
- **T09, valores esperados** de las pruebas nuevas, con las funciones puras reales en vitest (3 pruebas, verdes): desviación → «receta sin ritmo de secado»; control con fase → «le toca volteo»; corrida sin paso de la prueba de las metas → «debe lectura»; liberación `sin_duracion_declarada` y `a_las` +10 h.
- **T12, el guardia se EJECUTÓ** (es hermético): verde 25/25; con la sonda 1 failed | 24 passed y la `×` es la esperada, con su mensaje nombrando la sonda; otra vez verde tras borrarla. **Filas 21 a 25 ejecutadas:** cada una hace caer exactamente las pruebas de su columna y ninguna otra
  (1, 1, 3, 1, 1), 0 errores de `tsc`, anclas únicas, sha restaurado. **Fila 20: sólo compilada** (0 errores). El guardia extraído del plan es idéntico byte a byte al que se probó; `eslint` = 0 sobre los 8 archivos nuevos o editados (control: un import prohibido en `app/` da 1).
- **Lo leído en el código instalado (no ejecutado):** `@prisma/adapter-pg` envía `BEGIN` y, sólo con nivel de aislamiento, `SET TRANSACTION ISOLATION LEVEL`; así `SET TRANSACTION READ ONLY` es la primera sentencia.
- **Cierre:** los shas de todo lo extraído del plan FINAL (4 archivos de `lib`, la prueba de la 9, el guardia, el módulo, el JSON de mutaciones) son iguales a los de lo compilado; la prueba de la 12 se recompiló después de un ajuste de comentario (`tsc` 0, `eslint` 0, guardia 25/25).
  En una corrida de todo `tests/arquitectura` en la copia hay 12 pruebas caídas, **ocho de entorno**, leídas en su mensaje (la copia no es un repositorio git —`git ls-files`/`git grep` dicen «not a git repository»— ni trae `docs/`, `protocolos/`, `public/`; y `colacion-de-la-base` intentó una conexión
  al puerto 55432 donde no escucha nada: con la URL falsa que usa `ci.sh`, no se conectó a ninguna base) **y cuatro que son las que el paso 8 de la 12 ya predice** (`acceso-a-datos` ×2 y `cifras-del-inventario` ×2: el módulo aún no está inventariado). El guardia nuevo pasa dentro de esa misma corrida.

## Tropiezos míos

- Mi primer arnés de compilación dio «48 errores» en las 13 filas, y después, con otra carpeta mía, «10 errores» en las 3 siguientes: **idénticos en todas**. Eran carpetas del scratchpad (copias de seguridad y de comparación) dentro del árbol que `tsc` lee. Lo cazó la fila patrón que el arnés imprime primero (sin mutar, debía dar 0). Las moví fuera y repetí: los 0 son de después.
- Mi primera idea de la liberación de R9 reutilizaba el mundo del `describe`, donde las camas de la prueba anterior siguen abiertas; la pasé a un mundo propio dentro de la prueba.
- Mi primer comentario de la prueba de sólo lectura afirmaba que Postgres no deja cambiar el modo tras la primera consulta; eso es cierto para el aislamiento y para pasar a lectura-escritura, no para `READ ONLY`. Lo reescribí sin esa afirmación.

## Dudas para el controlador

1. **Metas de la versión bajo una desviación (T09):** R9 dijo «el ritmo de la fase»; las metas de la versión (las sin paso) no salen de la fase, así que **siguen rigiendo** a una corrida sin paso (debe sus lecturas, la curva pinta su banda). Si se quiere también sin metas, es el mismo `where` en cola, tablero y `compareRunToTargets`, con su prueba (la actual fija lo contrario). Decisión 9 y duda 4.
2. **Etiqueta de la cola (T09):** una desviación sale «receta sin ritmo de secado»; no se añadió un estado nuevo. Pintar «desviación» y su motivo es de la 13.
3. **Ruta de la puerta (T12):** el guardia fija como literal `lib/recetas/paraLasPantallas.ts` (la que la adjudicación I1 da a la 13). Si la 13 la nombra distinto, el guardia cae por su nombre. T15 cita las filas I9 e I10 de la 9 y I12/I13 de la 12: siguen válidas (el texto de sus pruebas y las anclas no cambiaron).
4. **Nombre nuevo para la lista de Daniel:** `tests/arquitectura/avisos-de-recepcion-por-una-puerta.test.ts` (en `T12.md`, duda 9). Sin símbolos nuevos en `lib/`.
5. **Sin ejecutar:** la prueba de sólo lectura de la 12 (fila 20) y las 17 pruebas con base de la 9; quien construya las corre contra la base propia. El control en dos mitades de la primera dice por sí solo si el `SET` se aplicó.
