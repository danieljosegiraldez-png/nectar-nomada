# Ronda de arreglo tras la revisión adversaria — T14 (2026-10-05)

Archivo editado EN SU SITIO: `.superpowers/plan-2a/tareas/T14.md` (7736 → 7998 líneas; respaldo del texto de antes en
`scratchpad/ronda-t14-r7r8/T14.antes-r7r8.md`, sha `d9f275dd2b4ef390`; el de ahora, `b33df02f2f1ee68e`). Ninguna otra cosa del worktree: `git status --short`
vacío; ni `add`, ni `commit`, ni `stash`, ni `checkout`, ni `push`, ni `npm install`, ninguna base (las pruebas de la copia
mockean `lib/db`; la URL que llevan apunta a un puerto donde no escucha nadie). Las copias de verificación viven en `scratchpad/ronda-t14-r7r8/` (`arbol/`
es una copia del árbol de la tarea 14 tras la Parte D, con su propio `.git`).
**HEAD no es el de la orden (`da048af2`):** al terminar estaba en `06b2e2e9`, un commit de la sesión de la 2b (09:15) que toca **un** archivo de documentación,
`docs/superpowers/specs/2026-10-02-parte-2b-lo-que-la-receta-vigila-design.md` (`git diff --stat da048af2 HEAD`: 1 archivo, 9 inserciones, 1 borrado). No es mío ni toca
código ni nada de lo que mide esta ronda (todo se midió sobre las copias del scratchpad, no sobre el HEAD).

## R7 — `listRecipes` autoriza y filtra por organización

- **Qué.** `listRecipes` deja de autorizar contra «un lote cualquiera de la base» y devolver todas. Decide cada receta por SU organización: la ve quien
  OPERA ALGÚN lote de ella (`lot:manage`, preguntado por los ámbitos distintos de todos sus lotes, no por el primero que devuelva la base) o quien puede
  escribirla (`puedeAutoriaDeReceta`, la gemela de la tarea 3), **en los dos caminos a la vez**: un Coffee Process Manager con un perfil operativo de más ya
  no eludía el filtro. Las plantillas (organización nula): quien opera algún lote en cualquier parte o tiene la autoría de plataforma, como hasta hoy.
  Sin ninguna a la vista: `[]` si la cuenta opera algún lote o puede escribir recetas en alguna parte, y la negativa de siempre
  (`TraceabilityAccessError`) si no (el Project Viewer sigue sin leer).
- **Cómo.** Un ayudante privado `ambitosDeLosLotes(organizationId | null)` (consulta agrupada por proyecto, ubicación y clasificación) y la guardia
  `requireLotAccess(…, "manage", ámbitos)` dentro de la función (esa guardia aprueba en cuanto UNO de los candidatos pasa, que es justo «algún lote»).
  `getRecipeForEditor` usa el mismo criterio con las recetas que no son Libres: si no, la lista ofrecería a un operario de una parcela lo que la lectura le
  negaba (o, para una plantilla, a cualquier operario lo que sólo abría con «el primer lote de toda la base»).
- **Prueba** (`lecturasDeRecetas`, de 10 a **18** casos): cuatro organizaciones (A y D con recetas y lotes; B con lotes y sin recetas; S con receta y sin
  lotes) y una de DOS parcelas (D) cuyo lote de la parcela 1 se crea primero. «Gestionar A lee A y no D ni S» (el capataz de A; control: el administrador las
  ve todas); «el operario de UNA de las parcelas ve sus recetas aunque la base devuelva primero el lote de la otra» (lista y lectura); «escribe en A y opera
  D» (`mixto`: CPM en A + Farm Operator en la parcela 2 de D) ve A y D y no S; el Process Manager de la finca sigue viendo sólo la suya (control: el de
  plataforma, todas); y los rechazos de siempre.
- **Flip** (filas L3 a L7 del paso 39; L1 y L2 conservan su id y su sentido): `visibles = recetas` → caen 6; quitar el rechazo → 1; quitar la puerta de
  «escribe en alguna parte» → 1; «el lote más antiguo» en vez de «todos los ámbitos» → 3 (más la plantilla, según el lote más antiguo de la base).

## R8 — la Libre, en el servicio y por su lote

- **Qué.** (a) `listRecipes` filtra `esLibre: false` en el servicio (la pantalla lo repite como segunda red, y su prueba le pasa una Libre dentro).
  (b) `getRecipeForEditor` de una Libre exige `requireLotAccess(…, "view", …)` sobre el lote de cada proceso que usa alguna de sus versiones, **antes** de
  la rama de la autoría y sin dejarla pasar: el Coffee Process Manager no lleva `lot:view`, así que no la lee. Una Libre que usan varios lotes (la división
  copia la versión a cada parte) sólo la lee quien los ve TODOS (se pregunta lote por lote: la guardia aprueba con uno). Una Libre que ningún proceso usa no se
  abre a nadie, tampoco al administrador.
- **Prueba** (en la misma `lecturasDeRecetas`): las Libres nacen como una receta publicada corriente con un proceso abierto en cada lote
  (`abrirProcesoDePrueba`) y SÓLO DESPUÉS se marcan Libres (`abrirProceso` rechaza una Libre por id: `receta_libre_no_se_elige`, tarea 10). «Quien no ve el
  lote no lee su Libre»: el administrador, el capataz y el visor sí; el Process Manager de la finca, el de plataforma y el operario de otra organización no;
  **control** en la misma prueba: la MISMA cuenta que se rechaza abre la receta corriente de su organización. Más: la Libre de la división (D1 y D2: el
  operario de la parcela 2 no; control: una Libre de un solo lote suyo sí), la que ningún proceso usa, y la lista sin Libres (control: la misma receta, sin
  marcar, sí sale, para quien opera y para quien escribe).
- **Flip** (filas L6, L8, L9, L10, L11): quitar el filtro de la lista → 1; la rama de la Libre nunca se toma → 3; basta con ver UNO de los lotes → 1; la
  autoría se salta la regla de la Libre (el defecto del C4 solo) → 2; sin la guarda de «ningún proceso» → 1.

## Lo medido, y con qué

Sobre una copia con las tareas 1 a 4 y 10 y la 14 hasta la Parte D, cada medición escrita a un archivo y leída con su código de salida:

- Las cuatro sustituciones del paso 32c casan cada una **exactamente una vez** contra el `processTargets.ts` previo al paso (762 líneas) y contra el de HEAD de
  la rama (737). **El texto del plan, ensamblado, reproduce byte a byte el código y la prueba verificados** (sha `e9a14a77…` y `7857a786…`), con control
  positivo: el mismo comprobador sobre el T14 de antes dice «DIFIEREN».
- `tsc` sobre `processTargets.ts` y sobre la prueba nueva con sus ayudantes: 0; `eslint` sobre los dos: 0.
- Inventario de acceso: **631 operaciones antes y después**, las tres lecturas en «guardia directo»; `getRecipeForEditor` pasa a tocar `lotProcess` y el
  ayudante no es una operación propia (lo absorbe el inventario). Ningún comentario nuevo escribe `requireLotAccess` pegado a un paréntesis (el inventario
  atribuye a la declaración anterior el comentario de la siguiente: Ruling INV).
- Anclaje de la tarea 15 (sección A): en el cuerpo de cada una de las tres lecturas sigue habiendo una llamada a `puedeAutoriaDeReceta(`.
- Guardias vecinos —`proceso-por-el-resolvedor`, `audit-atomico`, `accion-que-no-puedes-no-se-ofrece`, `ritmo-con-quien-lo-lea`,
  `claves-de-traduccion-existen`, `campos-con-dos-puertas`, `acciones-traducen-sus-errores`, `quien-lista-limpia-lo-que-lista`, `use-server-solo-async`,
  `ci-cobertura`—: en verde; caen tres de `acceso-a-datos` y `cifras-del-inventario`, **igual que con el código de antes** (el inventario documentado de la
  copia está desfasado): `diff` de los dos conjuntos de fallos, vacío.
- **La lógica de las ramas, ejecutada con la base y las reglas simuladas** (17 pruebas con los MISMOS títulos que las de la prueba con base y las mismas
  cuentas y aserciones; la decimoctava, el control de cuentas, no depende del código): `15 failed | 2 passed` con el código de antes, `17 passed` con el de
  después, y las once mutaciones L1–L11, cada una con sha distinto, `tsc` en 0 y cayendo por su nombre lo que su fila dice (L1: 4; L2: 3; L3: 6; L4: 1; L5: 1;
  L6: 1; L7: 3; L8: 3; L9: 1; L10: 2; L11: 1). Una primera L8 (`if (false && …)`) no compilaba (`recipe` queda posiblemente nulo): se cambió por una que sí.
  Cada restauración volvió al sha original.

**No medido** (pide la base, prohibida en esta ronda): que `lecturasDeRecetas` pase contra la base de verdad (sus 18 casos, con procesos abiertos de verdad); su
rojo previo (`15 failed | 3 passed` está razonado y simulado; el de la lectura «el operario de UNA de las parcelas… abre sus recetas» depende del orden en que la
base devuelva las filas y puede dar `14 y 4`); las once filas L contra la base real (la L7, en particular); `mismas-filas` (la consulta ahora cuenta también
`lot_process`); que `abrirProceso` acepte las recetas de la prueba; el coste de la consulta agrupada en producción.

## Lo que cambia en el texto de la tarea

Encabezado, lista de archivos y «Lo que esta tarea decide» (R7 y R8, con su porqué y su coste); el paso 32c entero (la prueba, el rojo y el verde con sus cifras
de hoy —`15 failed | 3 passed (18)`, `Tests  22 passed (22)`, `80` líneas añadidas y `10` quitadas—, las ediciones (2) y (4)); el comentario de la pantalla de
la lista; el mensaje del commit 4; la tabla de flips (de 34 a **40** filas); «Conflictos» (una línea más) y «Dudas» (1, 2, 6 y 8 reescritas; 9 a 12 nuevas); y,
en «Consume», las tareas 5 y 10 para la prueba nueva.

## Lo que esta ronda deja a otras tareas

- **T03 — `pasosDeLaVersion` abre los pasos de una Libre** (con la `intencion` de cada paso) a quien puede escribir recetas de la organización o a quien opera
  sus lotes: `exigeLecturaDeLosPasos` no mira si la receta es Libre ni su lote. Con el R8, el nombre y la descripción quedan cerrados y los pasos no, por esa
  otra puerta. Es de la tarea 3, fuera de mi archivo: se señala (Dudas, 9) con el arreglo propuesto.
- **T15** — sus filas de la sección A leen `puedeAutoriaDeReceta(` en el cuerpo de las tres lecturas (se mantiene) y citan «su flip L1» (L1 conserva id y sentido).
  Ninguna de sus cifras depende de las que esta ronda cambia.
- **T10** — su «Conflictos, 4» («las Libres seguirán saliendo en la pantalla de recetas… tarea 14») queda resuelto por el R8.

## Dudas (también en la tarea)

1. **«Más las plantillas» (R7):** lo cumplí para quienes ya las veían (operan algún lote en cualquier parte o tienen plataforma): el Process Manager de UNA finca
   no las ve ni las deriva. Si la intención era que toda cuenta que entra las ve, son dos líneas y se invierten dos aserciones (Dudas, 2).
2. **Una Libre de varios lotes: «todos» o «alguno».** Elegí «todos» (la lectura más cerrada; no cuesta nada visible porque ninguna pantalla enlaza a una Libre).
   «Basta uno» es la fila L9 hecha código (Dudas, 10).
3. **Una negativa de `getRecipeForEditor` es un `TraceabilityAccessError` que las pantallas no atrapan** (página de error, no 404): es lo de hoy para cualquier
   receta ajena y la Libre lo hereda (Dudas, 11).
4. **`listRecipeOrganizations` sigue mirando un lote de muestra** por organización (Dudas, 1): lo de antes, no era del encargo; el arreglo es darle el mismo ayudante.
5. **Costo de «algún lote»:** una consulta agrupada por organización con recetas y la guardia por ámbito; no medido en producción (Dudas, 12).
