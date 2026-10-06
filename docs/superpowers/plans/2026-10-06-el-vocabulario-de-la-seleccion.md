# El vocabulario de la selección — plan de implementación

> **Para quien lo ejecute:** SUB-SKILL REQUERIDA: usar `superpowers:subagent-driven-development`
> (recomendada) o `superpowers:executing-plans`, tarea por tarea. Los pasos llevan casilla
> (`- [ ]`) para seguirlos.

**Objetivo:** que los nombres del esquema dejen de enseñar lo contrario de la regla —
`subdivisionReason` pasa a `motivoDeLaSeleccion`, `SubdivisionReason` a `MotivoDeSeleccion`, el
comentario del bloque cita el ADR en vez de decir «es una ZONA, no una lista de plantas», y
`micro_plot` queda declarado muerto con un guardia que lo sostiene.

**Arquitectura:** el renombrado va **en lockstep** —nombre de Prisma, columna y tipo de PostgreSQL
cambian juntos— porque 1692 de los 1693 campos con `@map` de esta casa lo cumplen, y la única
excepción nació así, no se renombró. Eso obliga a **una migración escrita a mano**: Prisma no
detecta renombres (propone `DROP COLUMN` + `ADD COLUMN` para una columna, y para un enum propuso un
intercambio de tipo que, según su propia migración, «REVIENTA para cualquier fila»). `micro_plot` NO
se quita: decisión de Daniel del 2026-10-06, y la medición la respalda —`core.location` tiene 5
disparadores con `UPDATE OF "location_type"` y 0 precedentes de soltarlos—.

**Tecnologías:** Prisma ^7.9.1 (generator `prisma-client`, salida `generated/prisma`, gitignorada),
PostgreSQL multi-esquema (`core`, `traceability`, `apiary`), vitest 4, TypeScript 6, Next.js 16.

**Spec:** `docs/superpowers/specs/2026-10-03-la-seleccion-no-resta-design.md`, **§3.3** (líneas
225-237) y la última fila de **§5** (el guardia del comentario). Quien ejecute lee las dos.

---

## Precondición que bloquea el plan entero

- [ ] **El PR #657 está fusionado en `main`.**

`ADR-196` **no existe en `main`**: vive sólo en el #657 (OPEN al escribir esto, commit `5c3de101`,
`docs/architecture/DECISIONS.md` líneas 12736-12785). Todo este plan cita ese ADR desde comentarios
del esquema y desde un guardia, así que ejecutarlo antes deja citas que apuntan a nada.

Comprobarlo **contra el registro**, no contra un informe, en líneas separadas y sin `&&`:

```bash
git fetch origin main --quiet
git show origin/main:docs/architecture/DECISIONS.md | grep -cE '^## ADR-196([^0-9]|$)'
git show origin/main:docs/architecture/DECISIONS.md | grep -oE '^## ADR-[0-9]+' | grep -oE '[0-9]+' | sort -n | tail -1
```

La primera cifra tiene que ser **1**. La segunda dice el ADR más alto: al medir esto era **195** sin
el #657. Si la primera da 0, **parar y decírselo a Daniel**: el plan no se ejecuta.

---

## Restricciones globales

Valen para **todas** las tareas. Están copiadas con sus valores exactos; no se razonan de nuevo.

- **La base del puerto 55433 (`nectar_test`) NO SE TOCA NUNCA.** Prohibido sobre ella:
  `npm run test:db -- reset`, `prisma migrate reset`, `prisma migrate dev`, `prisma db push`,
  borrarla, o poner `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`. Cualquier migración o carril con
  base se corre sobre una base **desechable** cuyo nombre case `^(nectar_test|nectar_ci|nn_flip_)` y
  que **no sea** `nectar_test`. Se crea con la colación de esta casa o cuatro suites fallan por la
  colación y no por el código:

  ```sql
  CREATE DATABASE "nectar_ci_vocab" TEMPLATE template0 ENCODING 'UTF8'
    LOCALE_PROVIDER builtin BUILTIN_LOCALE 'C.UTF-8';
  ```

  El identificador va **entre comillas**. Comprobar el plegado antes de usarla:
  `select lower('FERRETERÍA') = 'ferretería';` tiene que dar `t`, y `select upper('ñ');` tiene que
  dar `Ñ`.
- **Hay una credencial de producción en esta máquina:** `~/Developer/nectar-nomada-package/.env`
  lleva un `DATABASE_URL` de `neon.tech`. `~/.zshrc` no lo exporta. **Ninguna tarea de este plan
  toca producción.** Si hace falta una cuenta de filas en producción, la mide Daniel en el SQL
  Editor de Neon; un paso que diga «corre esto en producción» no es ejecutable por una sesión.
- **`psql "$VAR"` con `$VAR` vacía NO es un error de sintaxis:** psql cae a sus valores por omisión
  y puede conectar a otra base. Exigir que la variable tenga valor, y que la medición **imprima a
  qué base se conectó** —`select current_database();` y el host— en la misma fila que las cifras.
- **Antes de creerse un rojo de tipos, regenerar el cliente.** `generated/prisma` está gitignorado
  (línea 6 del `.gitignore`) y puede no existir en el worktree. El 2026-10-03 esto costó leer 13
  errores de tipos como un defecto del código: `npx prisma generate` los pasó a 0.
- **Nunca `git add -A`.** Se añade archivo por archivo, y **antes de commitear se cuenta el stat**:
  `git diff --cached --stat`. Si el mensaje dice tres archivos y el stat dice nueve, manda el stat.
- **`git commit -F <archivo>`**, nunca `-m`: los backticks dentro de un `-m` entre comillas dobles
  los ejecuta la shell y borra la palabra en silencio. Igual para los PR: `gh pr create --body-file`.
- **Las compuertas se corren sin tubería**, y el código de salida va en su **propia línea**:
  `npm run verify; echo "codigo=$?"`. Una tubería devuelve el código del último comando. Y de vitest
  se leen **las dos** líneas de veredicto: `Test Files` **y** `Tests`.
- **Una medición con controles no se encadena con `&&`**: un `grep` que no encuentra sale con 1 y
  aborta la cadena, y la ausencia de los controles se lee igual que un cero. Líneas separadas o `;`,
  cada una con su etiqueta impresa.
- **El `grep` de esta máquina es `ugrep`:** un patrón que empieza por `-` se lee como opción. Usar
  `grep -F -e "<patron>"` o `grep -- "<patron>"`. Y `git grep -E` **no entiende `\b`**: para límites
  de palabra, `-P` o `([^A-Za-z0-9_]|$)`.
- **`subdivisionReason` casa dentro de `subdivisionReasonNote`.** Toda cuenta de este plan usa el
  patrón delimitado y dice cuál usó. Medido el 2026-10-06: con delimitador **35** líneas, sin
  delimitador **41** — y son líneas, no apariciones.
- **`prisma/migrations/` no se edita, ni sus comentarios.** Cambiar el texto de una migración
  aplicada cambia su suma de verificación y `migrate deploy` se niega. Cualquier `sed` o reemplazo
  masivo **excluye `prisma/migrations/`**. Lo que haya que corregir ahí se corrige en una migración
  **nueva** o en un doc fechado, que es el precedente de la casa.
- **Antes de mutar para un flip-test, commitear.** El arnés de flip restaura desde `HEAD`, así que
  mutar sin commitear se lleva el trabajo sin guardar. Y todo flip imprime tres cosas antes del
  veredicto: el sha del archivo **antes y después** (distintos o abortar), si el archivo **compila**,
  y **qué test cayó por su nombre**. Si un flip no discrimina, se dice.
- **Trabajar en un worktree creado con punto de partida explícito:**
  `git worktree add ~/Developer/nectar-worktrees/vocabulario -b <rama> origin/main`. El `origin/main`
  no es decorativo: sin él la rama nace donde estuviera el árbol, que puede ser trabajo sin fusionar
  de otra sesión.
- **`export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"`** antes de cualquier `npm`/`npx`, y
  `NODE_OPTIONS="--max-old-space-size=6144"` delante de `typecheck` y de los carriles.
- **Toda edición de `SESSION_STATE.md` pasa por la sesión que lleva el turno.** Ninguna tarea de
  este plan lo edita.
- **Los cuatro valores del enum —`altitude`, `shade`, `slope`, `other`— quedan INTACTOS.** No es
  cosmética: son el `value` de los `<option>`, el sufijo de las claves i18n `motivo_${m}`
  (`messages/{es,en}.json:3712-3715`) y las etiquetas del tipo de PostgreSQL. `app/actions/fincas.ts:133`
  compara contra `"other"` literal. Tocar un valor rompe un rótulo sin que lo vea ningún test.

---

## Estructura de archivos

Qué toca cada archivo y de qué responde. Las líneas son del commit `36d942d4` (`origin/main` al
escribir el plan); **volver a localizarlas** antes de editar, porque el archivo se mueve.

| archivo | de qué responde en este plan |
|---|---|
| `docs/architecture/DECISIONS.md` | ADR-196 gana la sección del vocabulario. Es la única fuente que los comentarios citan |
| `prisma/schema.prisma` | 5 regiones: el comentario huérfano (812-816), el enum (830-837), los dos campos (974-975), el valor `micro_plot` (698), el doc de `PlotBlock` (7139-7142) y el de `PlotBloom` (5015-5017) |
| `prisma/migrations/20261006120000_motivo_de_la_seleccion/migration.sql` | **nuevo.** Renombra la columna y el tipo. Escrito a mano |
| `lib/traceability/motivosDeSubdivision.ts` | el envoltorio del catálogo. Se renombra el archivo y la constante |
| `lib/traceability/locations.ts` | el `import type` (19), el tipo de entrada (621-622) y la escritura (695-696) |
| `app/actions/fincas.ts` | la acción de servidor: el import (14), la validación (131, 133) y la escritura (138-139) |
| `app/components/traceability/NuevaMicroparcelaForm.tsx` | el import del catálogo (6). El `name="motivo"` del formulario **no cambia** |
| `tests/arquitectura/vocabulario-de-la-seleccion.test.ts` | **nuevo.** Guardia hermético: el comentario cita el ADR, no dice «ZONA», y `micro_plot` no se escribe en producción |
| `scripts/pruebas-por-compuerta.txt` | declara el carril del guardia nuevo |
| los 8 archivos de `tests/` de `base-sembrada` que nombran el campo | sus llamadas a `createMicrolot` y sus aserciones |

**Ningún archivo del allowlist entra en este plan, y conviene decir por qué**, porque la medición que
lo sostiene dijo primero lo contrario. Una de las cinco dimensiones afirmó que
`docs/arquitectura/permiso-por-dominio.json` tenía «2 líneas de `razon` que citan el nombre viejo, en
679 y 800». Es falso por dos lados: ese archivo tiene **175** líneas —así que la 679 no existe— y
`subdivisionReason` aparece **0** veces en él. Las líneas 679 y 800 son de
`docs/arquitectura/acceso-a-datos.allowlist.json` (1521 líneas, 322 `razon`), y lo que dicen es
«parcela, microparcela o bloque»: hablan de *microparcela*, no del campo. Medido con control positivo
—`razon` sale 322 y `locationId` 18 en ese archivo, así que el `grep` lo lee—:
`subdivisi`, `subdivid` y `subdivisionReason` dan **0, 0 y 0**. No hay nada que editar ahí.

**Lo que este plan NO toca, dicho para que no se cuente dos veces:**

- `puedeSubdividirParcela` (12 apariciones) y los códigos `beneficio_no_se_subdivide`,
  `secado_no_se_subdivide`, `bodega_no_se_subdivide`. Las pruebas los comprueban **por su texto**, así
  que renombrarlos cambia contrato de pruebas sin que §3.3 lo pida. Queda la palabra «subdividir»
  cerca del campo nuevo: es una verruga declarada, no un olvido.
- El rótulo que ve una persona: «Por qué se maneja aparte» / «Why it is managed separately»
  (`Fincas.motivo` y `Fincas.error_motivo_invalido`, 4 líneas). La palabra «subdivisión» **no aparece
  nunca en pantalla** (0 en `es`, 0 en `en`). Cambiar ese texto es redacción en dos idiomas y es
  decisión de Daniel.
- Los 34 `*.md` que nombran el campo. **Ninguna es prosa viva**: son planes ejecutados, auditorías
  fechadas y el archivo de estado, que se declara «registro, no control». Un find/replace sobre
  `docs/` reescribiría historia. Las 5 que sí siguen al código están en la tabla de arriba.
- `micro_plot` **no se quita del enum** (decisión de Daniel, 2026-10-06).

---

### Task 1: ADR-196 gana la sección del vocabulario

**Archivos:**
- Modificar: `docs/architecture/DECISIONS.md` — dentro del cuerpo de `## ADR-196`, que el #657 añade
  al final del archivo

**Interfaces:**
- Consume: nada
- Produce: la cita `ADR-196` con contenido sobre el vocabulario. Las tareas 2 y 3 la citan desde
  comentarios del esquema, y el guardia de la tarea 3 comprueba que la cita existe

**Por qué se enmienda el ADR-196 y no se escribe un ADR-197.** §3.3 es parte de la misma decisión —
los nombres enseñan lo contrario de la regla que ADR-196 fija— y el spec dice «el comentario se
reescribe citando **el** ADR», en singular. Medido además: ADR-196 hoy **no menciona** el vocabulario
(0 apariciones de `motivoDeLaSeleccion`, `MotivoDeSeleccion`, `micro_plot` ni `subdivisionReason`),
así que sin esta tarea §3.3 no tiene ningún ADR detrás. Y un encabezado `## ADR-196` **duplicado**
pondría rojo a `tests/arquitectura/numeros-de-adr-unicos.test.ts`, que sólo exime el 107.

- [ ] **Paso 1: localizar el cuerpo del ADR-196 y contar los encabezados**

```bash
grep -nE '^## ADR-196([^0-9]|$)' docs/architecture/DECISIONS.md
grep -cE '^## ADR-196([^0-9]|$)' docs/architecture/DECISIONS.md
grep -oE '^## ADR-[0-9]+' docs/architecture/DECISIONS.md | grep -oE '[0-9]+' | sort -n | tail -1
```

Esperado: una sola línea, cuenta **1**, y el máximo **196**. Si la cuenta es 2, parar: alguien añadió
otro y el guardia va a caer.

- [ ] **Paso 2: añadir la sección, dentro del cuerpo del ADR-196**

El texto va al final del cuerpo del ADR-196, **antes** del siguiente `## ADR-`, o al final del
archivo si es el último. No se crea ningún encabezado nuevo de nivel `##`.

```markdown
### El vocabulario, porque hoy enseña lo contrario

Tres nombres decían que una selección parte a su madre, que es justo lo que esta decisión niega:

- **`subdivisionReason` pasa a `motivoDeLaSeleccion`** y **`SubdivisionReason` a
  `MotivoDeSeleccion`**, con sus cuatro valores intactos (`altitude`, `shade`, `slope`, `other`). Es
  el motivo por el que se **selecciona** un trozo, no por el que se parte. El campo hermano
  `subdivisionReasonNote` lo acompaña como `notaDelMotivoDeLaSeleccion`: el propio comentario del
  esquema los ataba —«`other` always pairs with subdivisionReasonNote»— y renombrar uno solo partiría
  el vocabulario en dos.
- **El comentario de `PlotBlock` decía que un bloque «es una ZONA, no una lista de plantas».** Es
  falso: sus rangos son coordenadas **de la parcela** —hilera y planta—, o sea una lista de plantas
  expresada por tramos, y no le restan nada a la parcela. El comentario cita esta decisión.
- **`micro_plot` se declara MUERTO y se queda en el enum.** Nada en producción lo escribe: los seis
  sitios de `lib/` que lo nombran sólo lo leen o lo filtran, y el único camino que podría
  reproducirlo es `locations.ts` copiando el tipo del padre. Se queda porque quitarlo no es gratis:
  `core.location` tiene **5** disparadores con `UPDATE OF "location_type"`
  (`location_bodega_padre`, `location_con_ambiente_quieto`, `location_arbol_de_estante`,
  `location_rejilla_solo_en_parcela`, `location_rejilla_al_retipar_el_padre`) y en 203 migraciones no
  hay **ningún** `DROP TRIGGER`, o sea ningún precedente de soltarlos y recrearlos. Un guardia
  sostiene que siga muerto, con la lista de los seis sitios de lectura declarada.

**Y esto revoca una decisión anterior que no tenía ADR.** La migración `20260911230000` introdujo
`micro_plot` con una decisión del 2026-09-11 según la cual una microparcela **era** esa Location. El
2026-09-19 Daniel decidió lo contrario —una microparcela es una Location `plot` hija de otra `plot`,
creada con `createMicrolot`— y esa corrección nunca llegó a un ADR: vivía sólo en comentarios. Queda
dicha aquí. El encabezado de aquella migración no se puede editar sin romper su suma de
verificación, así que esta es la enmienda.
```

- [ ] **Paso 3: comprobar que no se creó ningún encabezado nuevo, y correr el guardia de los ADR**

```bash
grep -cE '^## ADR-196([^0-9]|$)' docs/architecture/DECISIONS.md
grep -cE '^## ADR-197([^0-9]|$)' docs/architecture/DECISIONS.md
npx vitest run tests/arquitectura/numeros-de-adr-unicos.test.ts
echo "codigo=$?"
```

Esperado: **1**, **0**, y las 4 pruebas en verde. Leer **las dos** líneas de vitest.

- [ ] **Paso 4: commit**

```bash
git add docs/architecture/DECISIONS.md
git diff --cached --stat
git commit -F /tmp/msg-adr.txt
```

El stat tiene que decir **un** archivo.

---

### Task 2: los comentarios del esquema dejan de contradecirse

**Archivos:**
- Modificar: `prisma/schema.prisma` — cinco regiones (812-816, 698, 5015-5017, 7139-7142, y el hueco
  sobre 830/974)

**Interfaces:**
- Consume: la sección del vocabulario del ADR-196 (Task 1)
- Produce: el texto que el guardia de la Task 3 comprueba — la cadena `ADR-196` presente en el doc
  de `PlotBlock`, y la cadena `ZONA, no una lista de plantas` **ausente** del archivo entero

**Lo que hay que saber antes de editar, porque la intuición falla aquí.** Tres cosas medidas el
2026-10-06, las tres contrarias a lo que el spec sugiere:

1. El comentario «Subdivisión … es una ZONA, no una lista de plantas» (líneas **7139-7142**) es el
   doc de **`model PlotBlock`**, no del campo `subdivisionReason`. Son dos conceptos distintos.
2. **El campo `subdivisionReason` y el enum `SubdivisionReason` no tienen hoy ningún comentario
   adyacente.** El `//` que los explica (**812-816**) quedó pegado encima de `enum GridOrigin`
   (línea 821) desde el commit `7afb8883` (#586): está 18 líneas por encima del enum que describe,
   con otro enum en medio. Quien edite «donde está el texto viejo» edita el bloque de `GridOrigin`.
3. **Dos comentarios del propio esquema se contradicen sobre `micro_plot`:** la línea **7130** dice
   que «ese valor del enum de arriba existe pero nada lo produce», y la **5016** (doc de
   `model PlotBloom`) dice que `locationId` «es un `plot` o un `micro_plot`». Hay una tercera versión
   en `prisma/migrations/20260919150000_bloque_sin_microparcela:1-2`, que dice que una microparcela
   **es** la Location `micro_plot` — y esa **no se toca**, porque es una migración aplicada.

- [ ] **Paso 1: volver a localizar las cinco regiones, porque el archivo se mueve**

```bash
grep -nE '^enum SubdivisionReason|^  subdivisionReason |^  micro_plot$|^model PlotBlock |^model PlotBloom ' prisma/schema.prisma
grep -nF -e 'ZONA, no una lista de plantas' prisma/schema.prisma
grep -nF -e 'the reason a microlot was subdivided' prisma/schema.prisma
grep -nF -e 'un `plot` o un `micro_plot`' prisma/schema.prisma
```

Apuntar los números que salgan. Si alguno da 0 líneas, parar: el archivo cambió más de lo que este
plan supone.

- [ ] **Paso 2: el doc de `PlotBlock` cita el ADR**

Sustituir las cuatro líneas `///` que abren `model PlotBlock` por:

```prisma
/// Subdivisión con nombre de una parcela — «bloque», término aprobado por el dueño
/// (F2 §3). Sirve para saber en qué parte del lote está cada trampa y comparar
/// bloques a lo largo del tiempo. Opcional en los dos sentidos: una parcela puede
/// no tener bloques y una trampa puede no tener bloque.
///
/// **No le resta nada a su parcela, y no es una zona opuesta a una lista de plantas**
/// (ADR-196): sus rangos son coordenadas DE la parcela —hilera y planta—, o sea una
/// lista de plantas expresada por tramos. El comentario anterior decía lo contrario.
```

- [ ] **Paso 3: el comentario huérfano vuelve a su sitio, como `///` y sobre el enum**

Borrar las cinco líneas `//` de 812-816 y poner, **inmediatamente encima de `enum SubdivisionReason`**
(que la Task 4 renombrará), este doc en el estilo que Prisma lee:

```prisma
/// El motivo por el que un trozo de parcela se **selecciona** y se maneja aparte
/// (ADR-196) — no el motivo por el que la parcela se parte, que es lo que el nombre
/// viejo `SubdivisionReason` daba a entender. Se registra en la Location HIJA (la
/// selección misma), no en la madre, y sólo tiene sentido cuando `parentLocationId`
/// está puesto; nulo en cualquier otro caso, como el resto de atributos de F1 §2.
/// `other` va siempre con su nota: la regla de «valor tipado + nota libre» (§1).
```

- [ ] **Paso 4: `micro_plot` queda declarado muerto donde vive**

Encima del valor `micro_plot` del `enum LocationType`:

```prisma
  /// **MUERTO (ADR-196).** Ninguna escritura de producción lo produce: una
  /// microparcela es una Location `plot` hija de otra `plot`, creada con
  /// `createMicrolot` (decisión de Daniel, 2026-09-19, que revocó la del
  /// 2026-09-11 con la que este valor nació). Se queda en el enum porque
  /// quitarlo exige el intercambio de tipo y `core.location` tiene 5
  /// disparadores con `UPDATE OF "location_type"`. Lo sostiene
  /// `tests/arquitectura/vocabulario-de-la-seleccion.test.ts`.
  micro_plot
```

- [ ] **Paso 5: cerrar la contradicción del doc de `PlotBloom`**

En el doc de `model PlotBloom`, sustituir `—que es un `plot` o un `micro_plot`—` por:

```prisma
/// un `plot` (una microparcela también lo es: es una `plot` hija de otra, ADR-196)
```

- [ ] **Paso 6: comprobar que la contradicción se fue, con su control positivo**

```bash
grep -cF -e 'ZONA, no una lista de plantas' prisma/schema.prisma
grep -cF -e 'ADR-196' prisma/schema.prisma
grep -cF -e 'o un `micro_plot`' prisma/schema.prisma
grep -cF -e 'MUERTO (ADR-196)' prisma/schema.prisma
grep -cF -e 'model PlotBlock' prisma/schema.prisma
```

Esperado: **0**, **4 o más**, **0**, **1**, y la última es el control positivo: tiene que dar **1**,
porque si diera 0 el `grep` no estaría leyendo este archivo y los ceros de arriba no significarían
nada.

- [ ] **Paso 7: que el esquema siga siendo válido**

```bash
npx prisma validate
echo "codigo=$?"
```

Esperado: código **0**. Esta tarea no cambia ningún nombre, así que no necesita migración y
`tests/derivaDeMigraciones.test.ts` no se mueve.

- [ ] **Paso 8: commit**

```bash
git add prisma/schema.prisma
git diff --cached --stat
git commit -F /tmp/msg-comentarios.txt
```

---

### Task 3: el guardia que sostiene las dos cosas

**Archivos:**
- Crear: `tests/arquitectura/vocabulario-de-la-seleccion.test.ts`
- Modificar: `scripts/pruebas-por-compuerta.txt`

**Interfaces:**
- Consume: el texto del esquema que deja la Task 2
- Produce: un guardia hermético. No exporta nada

**Por qué el guardia va acotado a `lib/` y `app/`, y no al árbol entero.** Un guardia que dijera
«nada escribe `micro_plot`» nacería **rojo**: dos pruebas lo crean a propósito como fixture
(`tests/traceability/floracion.test.ts:37-38` y `tests/traceability/ubicacionesEmparentadas.test.ts:49`),
y tienen razón en hacerlo —prueban que un sitio así se trata como parcela—. Un guardia que no puede
pasar nunca enseña a ignorar una línea roja. En **producción** la medición es distinta: los seis
sitios de `lib/` que nombran el literal sólo lo **leen**, y ésos van en una lista declarada con su
razón, como hace `numeros-de-adr-unicos.test.ts` con sus duplicados heredados.

- [ ] **Paso 1: escribir el guardia**

```ts
/**
 * El vocabulario de la selección no vuelve a enseñar lo contrario de la regla.
 *
 * **Qué caza, y la mutación de cada cosa (ADR-196, spec §3.3 y §5).**
 *  - el doc de `PlotBlock` cita el ADR → la mutación es restaurar el comentario viejo
 *  - la frase «ZONA, no una lista de plantas» no vuelve → misma mutación
 *  - `micro_plot` sigue muerto en producción → la mutación es escribirlo en `lib/` o `app/`
 *
 * **Por qué la lista de lecturas está declarada y no prohibida.** Seis sitios de `lib/` leen el
 * literal para aceptar una microparcela donde se acepta una parcela. Eso es correcto y tiene que
 * seguir pasando; lo que no puede volver es una ESCRITURA. Un guardia que prohibiese el literal
 * entero nacería rojo sobre código bueno, y eso enseña a esquivarlo.
 *
 * Hermético: lee archivos, no toca la base.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const RAIZ = process.cwd();
const ESQUEMA = readFileSync(join(RAIZ, "prisma/schema.prisma"), "utf8");

/**
 * Los sitios de producción que LEEN `micro_plot`, cada uno con su razón. Si aparece uno nuevo,
 * esta prueba cae y quien lo añadió decide si es lectura (va a la lista) o escritura (no va).
 */
const LECTURAS_DECLARADAS: ReadonlyMap<string, string> = new Map([
  ["lib/apiary/hives.ts", "acota el selector de sitios de abejas a site|plot|micro_plot"],
  ["lib/traceability/fincaTrampas.ts", "acota el where de trampas a plot|micro_plot, a propósito"],
  ["lib/traceability/fincas.ts", "acepta una microparcela donde acepta una parcela"],
  ["lib/traceability/floracion.ts", "idem, para la floración"],
  ["lib/traceability/intervenciones.ts", "idem, para una intervención"],
  ["lib/traceability/tiposDeBloque.ts", "sólo lo nombra en un comentario, para distinguirlo"],
]);

/** Todos los `.ts`/`.tsx` bajo una raíz, sin seguir a `node_modules` ni a `generated`. */
function fuentes(dir: string): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(join(RAIZ, dir))) {
    if (entrada === "node_modules" || entrada === "generated" || entrada.startsWith(".")) continue;
    const rel = `${dir}/${entrada}`;
    if (statSync(join(RAIZ, rel)).isDirectory()) salida.push(...fuentes(rel));
    else if (rel.endsWith(".ts") || rel.endsWith(".tsx")) salida.push(rel);
  }
  return salida;
}

/** Una ESCRITURA es `locationType:` seguido del literal: lo que crea o actualiza una fila. */
const ESCRITURA = /locationType\s*:\s*["'`]micro_plot["'`]/;

describe("el vocabulario de la selección", () => {
  const archivos = [...fuentes("lib"), ...fuentes("app")];

  it("se leyó de verdad: hay centenares de fuentes y el esquema es grande", () => {
    // Fila patrón. Sin esto, una raíz mal escrita daría CERO escrituras de `micro_plot` y cero
    // frases prohibidas, que es exactamente el veredicto que este guardia busca. Un cero se lee
    // como «limpio» cuando significa «no miré».
    expect(archivos.length).toBeGreaterThan(200);
    expect(ESQUEMA.length).toBeGreaterThan(100_000);
  });

  it("el doc del bloque cita el ADR-196", () => {
    const i = ESQUEMA.indexOf("model PlotBlock ");
    expect(i, "no se encontró `model PlotBlock` en el esquema").toBeGreaterThan(0);
    // El doc `///` va inmediatamente encima del modelo: se mira la ventana anterior.
    const doc = ESQUEMA.slice(Math.max(0, i - 900), i);
    expect(doc).toContain("ADR-196");
  });

  it("la frase que decía lo contrario no vuelve", () => {
    expect(ESQUEMA).not.toContain("ZONA, no una lista de plantas");
  });

  it("`micro_plot` sigue declarado muerto donde vive", () => {
    expect(ESQUEMA).toContain("MUERTO (ADR-196)");
  });

  it("ninguna fuente de producción ESCRIBE micro_plot", () => {
    const culpables = archivos.filter((a) => ESCRITURA.test(readFileSync(join(RAIZ, a), "utf8")));
    expect(culpables).toEqual([]);
  });

  it("y el detector de escrituras funciona: reconoce una", () => {
    // Control positivo de la de arriba. Sin él, un regex roto daría la lista vacía sobre
    // cualquier árbol, y «ninguna escritura» significaría «no sé buscar escrituras».
    expect(ESCRITURA.test(`data: { locationType: "micro_plot" }`)).toBe(true);
    expect(ESCRITURA.test(`locationType: { in: ["plot", "micro_plot"] }`)).toBe(false);
  });

  it("los sitios que LEEN micro_plot son los declarados, ni uno más", () => {
    const leen = archivos.filter((a) => readFileSync(join(RAIZ, a), "utf8").includes("micro_plot"));
    const nuevos = leen.filter((a) => !LECTURAS_DECLARADAS.has(a));
    expect(
      nuevos,
      "sitio nuevo que nombra micro_plot: si lo LEE, decláralo con su razón; si lo ESCRIBE, no puede",
    ).toEqual([]);
  });

  it("y los declarados siguen ahí: si uno se va, sobra de la lista", () => {
    // Control positivo del de arriba. Sin él, borrar la comprobación dejaría la lista como un
    // adorno que no vigila nada.
    const leen = new Set(
      archivos.filter((a) => readFileSync(join(RAIZ, a), "utf8").includes("micro_plot")),
    );
    for (const [ruta, razon] of LECTURAS_DECLARADAS) {
      expect(leen.has(ruta), `${ruta} ya no nombra micro_plot (${razon}): quítalo de la lista`).toBe(
        true,
      );
    }
  });
});
```

- [ ] **Paso 2: declarar el carril — es hermético, así que NO va en la lista**

`scripts/pruebas-por-compuerta.txt` nombra los archivos que necesitan base. Este guardia sólo lee
archivos. Comprobar qué espera el guardia de cobertura:

```bash
npx vitest run tests/ci-cobertura.test.ts
echo "codigo=$?"
```

Si `ci-cobertura` exige que **todo** archivo nuevo esté declarado, añadirlo bajo la cabecera del
grupo `maquina` o la que su mensaje de error nombre — y decir en el commit cuál fue y por qué. Si
pasa en verde sin tocar nada, **no** se añade: declarar un hermético como `base-sembrada` lo saca
del carril que sí corre en un PR de sólo documentación.

- [ ] **Paso 3: correrlo y verlo en verde**

```bash
npx vitest run tests/arquitectura/vocabulario-de-la-seleccion.test.ts
echo "codigo=$?"
```

Esperado: 8 pruebas en verde. Leer **las dos** líneas de veredicto.

- [ ] **Paso 4: commit, ANTES de mutar**

```bash
git add tests/arquitectura/vocabulario-de-la-seleccion.test.ts
git diff --cached --stat
git commit -F /tmp/msg-guardia.txt
```

- [ ] **Paso 5: el flip-test, con sus tres filas**

Tres mutaciones, una por cosa que el guardia dice cazar. Cada una imprime el sha antes y después,
que el archivo sigue siendo válido, y **qué prueba cayó por su nombre**.

```bash
# Mutación A: restaurar la frase vieja en el doc de PlotBlock
shasum -a 256 prisma/schema.prisma | cut -c1-12
python3 - <<'PY'
p = "prisma/schema.prisma"
s = open(p, encoding="utf8").read()
VIEJO = "/// **No le resta nada a su parcela, y no es una zona opuesta a una lista de plantas**"
NUEVO = "/// Es una ZONA, no una lista de plantas: sirve para saber en qué parte del"
assert s.count(VIEJO) == 1, f"ancla: {s.count(VIEJO)}"
open(p, "w", encoding="utf8").write(s.replace(VIEJO, NUEVO))
print("mutado")
PY
shasum -a 256 prisma/schema.prisma | cut -c1-12
npx prisma validate > /tmp/valida-A.txt 2>&1; echo "valida=$?"
npx vitest run tests/arquitectura/vocabulario-de-la-seleccion.test.ts > /tmp/flip-A.txt 2>&1; echo "vitest=$?"
grep -E '✓|×|Tests |Test Files ' /tmp/flip-A.txt
git checkout -- prisma/schema.prisma
```

Los dos sha tienen que ser **distintos** —si no, el reemplazo no casó y el flip no midió nada—,
`valida` tiene que seguir en 0 —si el esquema no es válido, el rojo no es del guardia— y el log tiene
que nombrar **`la frase que decía lo contrario no vuelve`** o **`el doc del bloque cita el ADR-196`**.

```bash
# Mutación B: una escritura de micro_plot en producción
shasum -a 256 lib/traceability/fincas.ts | cut -c1-12
python3 - <<'PY'
p = "lib/traceability/fincas.ts"
s = open(p, encoding="utf8").read()
ANCLA = 'if (parcela.locationType !== "plot" && parcela.locationType !== "micro_plot") return false;'
assert s.count(ANCLA) == 1, f"ancla: {s.count(ANCLA)}"
open(p, "w", encoding="utf8").write(s.replace(ANCLA, ANCLA + '\n  const _mut = { locationType: "micro_plot" };'))
print("mutado")
PY
shasum -a 256 lib/traceability/fincas.ts | cut -c1-12
npx tsc --noEmit > /tmp/tsc-B.txt 2>&1; echo "tsc=$?"
npx vitest run tests/arquitectura/vocabulario-de-la-seleccion.test.ts > /tmp/flip-B.txt 2>&1; echo "vitest=$?"
grep -E '✓|×|Tests |Test Files ' /tmp/flip-B.txt
git checkout -- lib/traceability/fincas.ts
```

Tiene que caer **`ninguna fuente de producción ESCRIBE micro_plot`**. Si `tsc` sale distinto de 0,
regenerar el cliente antes de culpar al código: `npx prisma generate`.

```bash
# Mutación C: un sitio nuevo que nombra micro_plot sin declararlo
shasum -a 256 lib/traceability/locations.ts | cut -c1-12
python3 - <<'PY'
p = "lib/traceability/locations.ts"
s = open(p, encoding="utf8").read()
assert "micro_plot" not in s, "este archivo ya lo nombra: elige otro para la mutación C"
open(p, "w", encoding="utf8").write("// micro_plot\n" + s)
print("mutado")
PY
shasum -a 256 lib/traceability/locations.ts | cut -c1-12
npx vitest run tests/arquitectura/vocabulario-de-la-seleccion.test.ts > /tmp/flip-C.txt 2>&1; echo "vitest=$?"
grep -E '✓|×|Tests |Test Files ' /tmp/flip-C.txt
git checkout -- lib/traceability/locations.ts
```

Tiene que caer **`los sitios que LEEN micro_plot son los declarados, ni uno más`**.

- [ ] **Paso 6: dejar el árbol limpio y comprobarlo**

```bash
git status --porcelain
```

Esperado: **vacío**. Si sale algún archivo, un `git checkout --` no se corrió.

---

### Task 4: el renombrado, en lockstep, con su migración a mano

**Archivos:**
- Modificar: `prisma/schema.prisma` — el enum (830-837) y los dos campos (974-975)
- Crear: `prisma/migrations/20261006120000_motivo_de_la_seleccion/migration.sql`

**Interfaces:**
- Consume: los comentarios de la Task 2
- Produce: el campo `motivoDeLaSeleccion`, el campo `notaDelMotivoDeLaSeleccion`, el tipo
  `MotivoDeSeleccion` y las columnas `motivo_de_la_seleccion` / `nota_del_motivo_de_la_seleccion`.
  Las tareas 5 y 6 los consumen

**Por qué la migración se escribe a mano y no con `prisma migrate dev`.** Prisma **no detecta
renombres**: para una columna propone `DROP COLUMN` + `ADD COLUMN`, que pierde datos, y para un enum
propuso un intercambio de tipo que, en palabras de la propia migración
`20260917192422_vocabulario_del_dueno:9-13`, «REVIENTA para cualquier fila que valga 'apinada'». Esa
migración y `20261003120000_tres_columnas_a_enum` son los dos precedentes de la casa, y las dos están
escritas a mano.

**Por qué se renombra también la columna y el tipo.** Dejar `@map("subdivision_reason")` sería cero
SQL, pero rompe el lockstep que cumplen **1692 de los 1693** campos con `@map` de este esquema —y la
única excepción nació así, no se renombró—. Y el tipo no tiene salida: de los **151** enums, **cero**
llevan `@@map`, así que el tipo de PostgreSQL sigue el nombre del enum.

- [ ] **Paso 1: medir las filas ANTES de migrar, y decir sobre qué base**

El precedente lo exige: `20261003120000_tres_columnas_a_enum` lleva la cuenta dentro de su cabecera.
Esta cuenta **no se puede medir desde una sesión** —la base que importa es producción, y esa es de
Daniel—. Dos opciones, y la migración dice cuál se usó:

```sql
-- Para que Daniel lo corra en el SQL Editor de Neon:
select current_database(), count(*) as filas,
       count(subdivision_reason) as con_motivo,
       count(subdivision_reason_note) as con_nota
  from core.location;
```

Si Daniel no da la cifra, la migración lo dice así —y sigue siendo correcta, porque
`ALTER ... RENAME` **preserva los datos por definición**, que es justo por lo que se elige en vez del
intercambio—.

- [ ] **Paso 2: escribir la migración**

`prisma/migrations/20261006120000_motivo_de_la_seleccion/migration.sql`:

```sql
-- El vocabulario de la selección deja de enseñar lo contrario de la regla (ADR-196, spec §3.3).
--
-- **El defecto que cierra.** `subdivisionReason` decía «el motivo por el que esto se partió», y una
-- selección no parte a su madre: el nombre enseñaba justo lo que ADR-196 niega. El campo, su nota y
-- el tipo pasan a nombrarse por lo que son.
--
-- **Por qué está escrito a mano.** Prisma no detecta renombres: para una columna propone
-- `DROP COLUMN` + `ADD COLUMN` —pérdida de datos— y para un enum propuso un intercambio de tipo que
-- «REVIENTA para cualquier fila», según la cabecera de 20260917192422_vocabulario_del_dueno. Las dos
-- migraciones de renombrado de esta casa están escritas a mano por lo mismo.
--
-- **Por qué `RENAME` y no un intercambio.** `ALTER TABLE ... RENAME COLUMN` y
-- `ALTER TYPE ... RENAME TO` preservan los datos por definición: renombran la etiqueta, no la fila.
-- No hace falta `USING` ni decidir qué pasa con ningún valor, y por eso esta migración es segura
-- aunque la cuenta de filas no se haya medido.
--
-- **Lo que NO arrastra.** `subdivision_reason` no tiene índices (0 de los 4 `@@index`/`@@unique` de
-- Location la nombran), ni `CHECK`, ni disparador, ni `DEFAULT`. El único sitio donde el tipo o las
-- columnas se nombran en las 203 migraciones anteriores es 20260813063826_f1_operacion_finca_esquema
-- (líneas 14, 43 y 44), que las creó.
--
-- **Los cuatro valores quedan intactos** (`altitude`, `shade`, `slope`, `other`): son el `value` de
-- los `<option>`, el sufijo de las claves i18n `motivo_${m}` y las etiquetas del tipo. Renombrar un
-- valor rompería un rótulo sin que lo viese ningún test.

ALTER TYPE "core"."SubdivisionReason" RENAME TO "MotivoDeSeleccion";

ALTER TABLE "core"."location" RENAME COLUMN "subdivision_reason" TO "motivo_de_la_seleccion";
ALTER TABLE "core"."location" RENAME COLUMN "subdivision_reason_note" TO "nota_del_motivo_de_la_seleccion";
```

- [ ] **Paso 3: cambiar el esquema para que diga lo mismo**

En `prisma/schema.prisma`, el enum pasa a:

```prisma
enum MotivoDeSeleccion {
  altitude
  shade
  slope
  other

  @@schema("core")
}
```

y los dos campos de `model Location` a:

```prisma
  motivoDeLaSeleccion         MotivoDeSeleccion? @map("motivo_de_la_seleccion")
  notaDelMotivoDeLaSeleccion  String?            @map("nota_del_motivo_de_la_seleccion")
```

- [ ] **Paso 4: que el esquema sea válido y que no quede ningún nombre viejo en él**

```bash
npx prisma validate
echo "codigo=$?"
grep -cP 'subdivisionReason(?![A-Za-z0-9_])' prisma/schema.prisma
grep -cF -e 'SubdivisionReason' prisma/schema.prisma
grep -cF -e 'subdivision_reason' prisma/schema.prisma
grep -cF -e 'MotivoDeSeleccion' prisma/schema.prisma
```

Esperado: **0**, **0**, **0** y **0**, **0**, y el último **2 o más** — que es el control: si diera 0
no se habría escrito nada.

- [ ] **Paso 5: regenerar el cliente ANTES de creerse cualquier rojo de tipos**

```bash
npx prisma generate
echo "codigo=$?"
ls generated/prisma | head -3
```

Sin esto, `tsc` ve el cliente de antes y da errores que no son del código. Pasó el 2026-10-03: 13
errores que un `generate` dejó en 0.

- [ ] **Paso 6: el typecheck, que ahora sí dirá la verdad — y fallará, a propósito**

```bash
NODE_OPTIONS="--max-old-space-size=6144" npx tsc --noEmit > /tmp/tsc-t4.txt 2>&1
echo "codigo=$?"
grep -cE 'error TS' /tmp/tsc-t4.txt
grep -E 'error TS' /tmp/tsc-t4.txt | head -20
```

**Esperado: que FALLE.** Ésos son los sitios de llamada que la Task 5 arregla, y verlos en rojo
primero es lo que distingue este plan de uno que se cree su propio diff. Apuntar la cifra: será el
control de la Task 5.

- [ ] **Paso 7: commit del esquema y la migración juntos**

Van en el mismo commit a propósito: `tests/derivaDeMigraciones.test.ts` compara las migraciones con
el esquema y cae si divergen, así que separarlos deja un commit roto en el medio.

```bash
git add prisma/schema.prisma prisma/migrations/20261006120000_motivo_de_la_seleccion/migration.sql
git diff --cached --stat
git commit -F /tmp/msg-renombrado.txt
```

El stat tiene que decir **dos** archivos.

---

### Task 5: los sitios de llamada y el envoltorio del catálogo

**Archivos:**
- Renombrar: `lib/traceability/motivosDeSubdivision.ts` → `lib/traceability/motivosDeSeleccion.ts`
- Modificar: `lib/traceability/locations.ts:19,621,622,695,696`
- Modificar: `app/actions/fincas.ts:14,131,133,138,139`
- Modificar: `app/components/traceability/NuevaMicroparcelaForm.tsx:6`

**Interfaces:**
- Consume: `motivoDeLaSeleccion`, `notaDelMotivoDeLaSeleccion` y `MotivoDeSeleccion` (Task 4)
- Produce: `MOTIVOS_DE_SELECCION` (antes `MOTIVOS_DE_SUBDIVISION`), y los campos
  `motivoDeLaSeleccion` / `notaDelMotivoDeLaSeleccion` del tipo de entrada de `createMicrolot`. La
  Task 6 los consume desde las pruebas

**El dato que hace falta antes de tocar nada: «9 usos» no es lo que su nombre dice.** Son **9
líneas** en la unión de tres cosas. Sólo **3** llevan el campo delimitado; **3** son
`subdivisionReasonNote` y **4** el tipo —y una línea, `locations.ts:621`, lleva campo y tipo—. Fuera
de esas 9 hay **6** líneas más del envoltorio (`MOTIVOS_DE_SUBDIVISION`, `motivosDeSubdivision.ts`).

- [ ] **Paso 1: renombrar el archivo del catálogo con git, para que el historial lo siga**

```bash
git mv lib/traceability/motivosDeSubdivision.ts lib/traceability/motivosDeSeleccion.ts
git status --porcelain
```

- [ ] **Paso 2: su contenido**

**Y su comentario de cabecera enseña hoy la misma falsedad que §3.3 persigue**, así que se reescribe
en la misma tarea: dice «los motivos por los que una parcela **se parte** en microparcelas». Es el
nombre del campo otra vez, en prosa.

`lib/traceability/motivosDeSeleccion.ts` queda **entero** así:

```ts
/**
 * Los motivos por los que un trozo de parcela se **selecciona** y se maneja aparte, en el orden en
 * que se ofrecen. Una selección no le resta nada a su parcela (ADR-196): el comentario anterior
 * decía «los motivos por los que una parcela se parte en microparcelas», que es justo lo contrario.
 * Módulo aparte y sin base de datos para que un formulario del navegador pueda importarlo.
 * `satisfies` hace que el compilador avise si el enum de Prisma cambia.
 */
import type { MotivoDeSeleccion } from "../../generated/prisma/client";

export const MOTIVOS_DE_SELECCION = ["altitude", "shade", "slope", "other"] as const satisfies readonly MotivoDeSeleccion[];
```

El `satisfies` es lo que ata el catálogo al enum: si alguien añade un valor al enum y no aquí, o al
contrario, `tsc` lo dice. Se conserva tal cual, y por eso la línea se copia literal en vez de
describirse.

- [ ] **Paso 3: `lib/traceability/locations.ts`**

- línea 19: en el `import type`, `SubdivisionReason` pasa a `MotivoDeSeleccion` (la lista va en orden
  alfabético: colocarlo donde le toque)
- líneas 621-622, en el tipo de entrada de `createMicrolot`:

```ts
  motivoDeLaSeleccion: MotivoDeSeleccion;
  notaDelMotivoDeLaSeleccion?: string | null;
```

- líneas 695-696, en la escritura:

```ts
      motivoDeLaSeleccion: input.motivoDeLaSeleccion,
      notaDelMotivoDeLaSeleccion: input.notaDelMotivoDeLaSeleccion ?? null,
```

- [ ] **Paso 4: `app/actions/fincas.ts`**

- línea 14: `import { MOTIVOS_DE_SELECCION } from "../../lib/traceability/motivosDeSeleccion";`
- línea 131: `if (!(MOTIVOS_DE_SELECCION as readonly string[]).includes(motivo)) ...`
- línea 133: **no se toca.** Compara contra `"other"`, que es un valor y los valores quedan intactos
- líneas 138-139:

```ts
      motivoDeLaSeleccion: motivo as (typeof MOTIVOS_DE_SELECCION)[number],
      notaDelMotivoDeLaSeleccion: nota,
```

- [ ] **Paso 5: `app/components/traceability/NuevaMicroparcelaForm.tsx`**

- línea 6: `import { MOTIVOS_DE_SELECCION } from "../../../lib/traceability/motivosDeSeleccion";`
- y su uso en el `.map()` del `<select>`
- **el `name="motivo"` del campo NO cambia.** Medido: la única frontera serializada de este campo es
  el `FormData` de `crearMicroparcelaAction`, y sus claves son `motivo`, `nota`, `nombre` y
  `parentLocationId` — ninguna lleva el nombre de Prisma. Cambiar `name="motivo"` rompería la acción
  sin que `tsc` lo viese. Tampoco cambian las claves i18n: salen del **valor**
  (``t(`motivo_${m}`)``), no del nombre del campo

- [ ] **Paso 6: el barrido que `tsc` NO puede hacer**

Tres sitios meten el nombre por una puerta que el compilador no mira, y sólo un `grep` los caza:

```bash
grep -rnP 'subdivisionReason(?![A-Za-z0-9_])' lib app tests scripts
grep -rnF -e 'subdivisionReasonNote' lib app tests scripts
grep -rnF -e 'MOTIVOS_DE_SUBDIVISION' lib app tests scripts
grep -rnF -e 'motivosDeSubdivision' lib app tests scripts
```

Los tres ciegos a `tsc`, por su nombre, para que nadie los busque dos veces:
`tests/instalaciones/bodegas.test.ts:82` (`as never`),
`tests/territorio/microparcelaConRango.test.ts:140-145` (`as never`) y
`tests/traceability/fincas.test.ts:75` (un `extra: Record<string, unknown>` esparcido). Los arregla
la Task 6; aquí sólo se listan.

- [ ] **Paso 7: el typecheck, que ahora tiene que bajar a cero**

```bash
npx prisma generate
echo "generate=$?"
NODE_OPTIONS="--max-old-space-size=6144" npx tsc --noEmit > /tmp/tsc-t5.txt 2>&1
echo "tsc=$?"
grep -cE 'error TS' /tmp/tsc-t5.txt
```

Esperado: `tsc=0` y **0** errores, contra la cifra que la Task 4 apuntó en rojo. Ese par de cifras
—N antes, 0 después— es el flip-test regalado de esta tarea: una sola acción lo cambió.

- [ ] **Paso 8: commit**

```bash
git add lib/traceability/motivosDeSeleccion.ts lib/traceability/locations.ts app/actions/fincas.ts app/components/traceability/NuevaMicroparcelaForm.tsx
git diff --cached --stat
git commit -F /tmp/msg-llamadas.txt
```

El stat tiene que decir **cuatro** archivos más el borrado del renombrado (`git mv` lo escenifica
solo). Si dice más, parar y mirar qué entró.

---

### Task 6: las pruebas, y los dos carriles sobre una base desechable

**Archivos:**
- Modificar: `tests/traceability/f1.test.ts:209,224,225,231`
- Modificar: `tests/traceability/fincas.test.ts:75,287,288`
- Modificar: `tests/traceability/editarBeneficio.test.ts:167,171,179,183`
- Modificar: `tests/traceability/fincaTrampas.test.ts:133`
- Modificar: `tests/traceability/plotBlocks.test.ts:287`
- Modificar: `tests/traceability/traps.test.ts:154,709`
- Modificar: `tests/instalaciones/bodegas.test.ts:82`
- Modificar: `tests/territorio/microparcelaConRango.test.ts:143`

**Interfaces:**
- Consume: todo lo anterior
- Produce: nada. Es la última tarea

**Los ocho archivos de prueba están todos en `base-sembrada`**, ninguno es hermético. O sea que el
carril hermético sólo ve este renombrado a través de `npm run verify` (el typecheck); la ejecución
real está únicamente en `compuerta-con-base`, que **no corre en un PR de sólo documentación**. Este PR
no lo es, así que correrá.

**Y una base NUEVA por cada corrida del carril, no por cada sesión.** `ci-con-base.sh` **no es
re-ejecutable sobre la misma base**: la semilla tiene su propio guardia de colisión de
organización, así que la segunda vuelta muere **antes de correr una sola prueba** y sin línea
`Test Files` — que se lee como una avería del carril. Lo mismo si hay que **editar la migración
después de aplicarla**: Prisma guarda su suma de verificación, `migrate deploy` se niega, y la base
local queda inservible. En los dos casos se tira la base y se crea otra con el mismo comando; no se
intenta arreglar `_prisma_migrations` a mano.

- [ ] **Paso 1: crear la base desechable, con la colación de la casa**

```bash
PG=/Applications/Postgres.app/Contents/Versions/latest/bin/psql
"$PG" -h 127.0.0.1 -p 55433 -U postgres -d postgres -c "CREATE DATABASE \"nectar_ci_vocab\" TEMPLATE template0 ENCODING 'UTF8' LOCALE_PROVIDER builtin BUILTIN_LOCALE 'C.UTF-8';"
echo "codigo=$?"
"$PG" -h 127.0.0.1 -p 55433 -U postgres -d nectar_ci_vocab -c "select current_database(), lower('FERRETERÍA') = 'ferretería' as plegado, upper('ñ') as ene;"
```

La fila tiene que decir `nectar_ci_vocab`, `plegado = t` y `ene = Ñ`. Si el plegado sale `f`, cuatro
suites van a fallar por la colación y no por el código. **`nectar_test` no se toca.**

- [ ] **Paso 2: la base de sombra, que `migrate dev` necesita**

```bash
node scripts/crear-base-de-sombra.mjs
echo "codigo=$?"
```

- [ ] **Paso 3: aplicar la migración sobre la desechable, y comprobar que el guardia la deja pasar**

```bash
DATABASE_URL="postgresql://postgres@127.0.0.1:55433/nectar_ci_vocab" npx prisma migrate deploy
echo "codigo=$?"
```

`scripts/migrate-guard.ts` bloquea esto contra una base remota y lo deja pasar contra una local. Si
dijera «bloquear», leer a qué URL apuntó: la variable tiene que tener valor, porque vacía psql y
Prisma caen a sus valores por omisión.

- [ ] **Paso 4: comprobar en la base que el renombrado llegó, no leer un log**

```bash
PG=/Applications/Postgres.app/Contents/Versions/latest/bin/psql
"$PG" -h 127.0.0.1 -p 55433 -U postgres -d nectar_ci_vocab -c "select current_database(), column_name from information_schema.columns where table_schema='core' and table_name='location' and column_name like '%motivo%' or column_name like '%subdivision%';"
"$PG" -h 127.0.0.1 -p 55433 -U postgres -d nectar_ci_vocab -c "select current_database(), typname from pg_type where typname in ('MotivoDeSeleccion','SubdivisionReason');"
```

Esperado: las dos columnas `motivo_de_la_seleccion` y `nota_del_motivo_de_la_seleccion`, **ninguna**
`subdivision_*`, y el tipo `MotivoDeSeleccion` y **no** `SubdivisionReason`. Las dos consultas
imprimen `current_database()` en la misma fila que el dato, para que se vea de qué base hablan.

- [ ] **Paso 5: los sitios de prueba, uno por uno**

En los ocho archivos, cada `subdivisionReason:` de una llamada a `createMicrolot` pasa a
`motivoDeLaSeleccion:`, y cada `subdivisionReasonNote:` a `notaDelMotivoDeLaSeleccion:`. Las dos
aserciones de `f1.test.ts:231` pasan a `expect(microlot.motivoDeLaSeleccion).toBe("altitude");`.

Los tres que `tsc` no ve, con su razón para que nadie los dé por hechos:
- `tests/instalaciones/bodegas.test.ts:82` — va con `as never`, y además **sigue en verde con el
  nombre viejo** porque `createMicrolot` lanza `bodega_no_se_subdivide` antes de leer el motivo. Es
  el peligroso: queda mal y nadie lo ve
- `tests/territorio/microparcelaConRango.test.ts:143` — `as never`, y nada afirma el motivo
- `tests/traceability/fincas.test.ts:75` — entra por un `extra: Record<string, unknown>`; falla
  ruidoso en `beforeAll` y hunde el archivo entero, pero **sólo en el carril con base**

- [ ] **Paso 6: comprobar que los allowlist siguen limpios, con su control positivo**

Al escribir el plan **ninguno** de los dos los nombraba, y conviene volver a medirlo en vez de darlo
por hecho: una `razon` que cite un nombre inexistente es una razón falsa, y esos archivos tienen su
propia compuerta de cifras.

```bash
grep -cF -e 'subdivisionReason' docs/arquitectura/acceso-a-datos.allowlist.json
grep -cF -e 'subdivisionReason' docs/arquitectura/permiso-por-dominio.json
grep -ciF -e 'subdivisi' docs/arquitectura/acceso-a-datos.allowlist.json
grep -ciF -e 'razon' docs/arquitectura/acceso-a-datos.allowlist.json
```

Las tres primeras tienen que dar **0**. La cuarta es el control positivo y daba **322**: si saliera 0,
el `grep` no estaría leyendo el archivo y los tres ceros no significarían nada. Si alguna de las tres
primeras sale distinta de 0, alguien añadió una razón que cita el nombre viejo entre que se escribió
este plan y hoy: se edita en este mismo commit.

- [ ] **Paso 7: que no quede ningún nombre viejo en el código, con control positivo**

```bash
grep -rnP 'subdivisionReason(?![A-Za-z0-9_])' lib app tests scripts prisma/schema.prisma
grep -rnF -e 'subdivisionReasonNote' lib app tests scripts prisma/schema.prisma
grep -rnF -e 'SubdivisionReason' lib app tests scripts prisma/schema.prisma
grep -rncF -e 'motivoDeLaSeleccion' lib app tests
```

Las tres primeras: **ninguna línea**. La cuarta es el control positivo y tiene que salir **distinta
de cero** — si saliera 0, el `grep` no estaría mirando estos directorios y los tres vacíos de arriba
no significarían nada. **`prisma/migrations/` queda fuera a propósito:** sus nombres viejos son
correctos y editarlos rompe la suma de verificación.

- [ ] **Paso 8: los dos carriles, uno tras otro, en una sola orden y sin `&` dentro**

Un `( … ) &` anidado dentro de una llamada de fondo deja una zombi que compite por la misma base, y
el seed se niega con `DemoOrganizationCollisionError` — que leído solo parece un defecto del seed.

```bash
export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"
export NODE_OPTIONS="--max-old-space-size=6144"
export DATABASE_URL="postgresql://postgres@127.0.0.1:55433/nectar_ci_vocab"
npm run verify > /tmp/verify.txt 2>&1
echo "verify=$?"
npm run build > /tmp/build.txt 2>&1
echo "build=$?"
bash scripts/ci.sh > /tmp/hermetico.txt 2>&1
echo "hermetico=$?"
bash scripts/ci-con-base.sh > /tmp/con-base.txt 2>&1
echo "con_base=$?"
grep -E 'Test Files |Tests ' /tmp/hermetico.txt
grep -E 'Test Files |Tests ' /tmp/con-base.txt
grep -cE ' × ' /tmp/hermetico.txt
grep -cE ' × ' /tmp/con-base.txt
```

**`npm run build` va aquí y no es redundante: `npm run verify` NO corre `next build`.** Corre
tipos, estado, rutas y lint. El 2026-09-14 eso costó una hora de producción sirviendo un build
viejo: una clase exportada desde un archivo `"use server"` dejó 69 errores en 26 archivos, los PR
salieron verdes y sólo `next build` lo vio. La regla de esta casa es explícita — si la tarea toca
TypeScript, el plan dice `npm run build` **en esa misma tarea**.

Los cuatro códigos en **0**, y de cada carril se leen **las dos** líneas de veredicto, no una. La cuenta
de `×` tiene que ser **0** en los dos.

**Para demostrar que un archivo corrió, no grepear su nombre en el log: contar.** Vitest **no imprime
el nombre de un archivo que pasa**, así que buscarlo da 0 incluso cuando corrió. Lo que mide es la
fila patrón:

```bash
grep -cE '^[^#]' scripts/pruebas-por-compuerta.txt
grep -E 'Test Files ' /tmp/con-base.txt
```

Cuántos declara el grupo contra cuántos ejecutó el runner.

- [ ] **Paso 9: commit y PR**

```bash
git add tests/traceability/f1.test.ts tests/traceability/fincas.test.ts tests/traceability/editarBeneficio.test.ts tests/traceability/fincaTrampas.test.ts tests/traceability/plotBlocks.test.ts tests/traceability/traps.test.ts tests/instalaciones/bodegas.test.ts tests/territorio/microparcelaConRango.test.ts
git diff --cached --stat
git commit -F /tmp/msg-pruebas.txt
git push origin <rama>
git rev-parse HEAD
git rev-parse @{u}
gh pr create --base main --title "El vocabulario de la selección" --body-file /tmp/pr.txt
```

Los dos `rev-parse` tienen que dar **el mismo sha**: así se verifica un push, no leyendo su salida.

- [ ] **Paso 10: medir el archivo RESULTANTE, no el del PR**

`docs/architecture/DECISIONS.md` es acumulativo y el #657 añade su ADR **al final del mismo
archivo**, así que un conflicto textual es casi seguro si los dos están abiertos. Y el verde de un PR
apilado no vale para nada acumulativo: GitHub re-dispara los workflows en `synchronize`, no en un
cambio de base.

```bash
git fetch origin main --quiet
git fetch origin pull/<n>/head:refs/remotes/pr/<n> --quiet --force
git merge-tree --write-tree origin/main refs/remotes/pr/<n>
echo "codigo=$?"
```

Código **0** es sin conflicto; **1** nombra cada archivo en conflicto. **`main` contra sí mismo
también da 0, así que no sirve de control:** el control bueno es un PR que GitHub ya marque
`CONFLICTING`. Y si el merge-tree da árbol, contar los encabezados del ADR en el resultado:

```bash
T=$(git merge-tree --write-tree origin/main refs/remotes/pr/<n>)
git cat-file -p "$T:docs/architecture/DECISIONS.md" | grep -cE '^## ADR-196([^0-9]|$)'
```

Tiene que dar **1**. Si da 2, el guardia de números de ADR va a caer en cuanto se fusione.

**Y si hay que juntar `main`, el typecheck va DESPUÉS del merge aunque git no se haya quejado.** Una
fusión sin un solo marcador de conflicto puede dejar código que no compila: pasó en el #445, donde
git auto-fusionó dos cambios que no se solapaban textualmente y dejó una variable fuera de alcance.
Lo cazó `tsc`, no la lectura del diff.

```bash
git merge origin/main --no-edit
echo "merge=$?"
npx prisma generate
echo "generate=$?"
NODE_OPTIONS="--max-old-space-size=6144" npx tsc --noEmit
echo "tsc=$?"
```

- [ ] **Paso 11: tirar la base desechable**

```bash
PG=/Applications/Postgres.app/Contents/Versions/latest/bin/psql
"$PG" -h 127.0.0.1 -p 55433 -U postgres -d postgres -c "select current_database();"
"$PG" -h 127.0.0.1 -p 55433 -U postgres -d postgres -c "DROP DATABASE IF EXISTS \"nectar_ci_vocab\";"
echo "codigo=$?"
"$PG" -h 127.0.0.1 -p 55433 -U postgres -d postgres -c "select datname from pg_database where datname like 'nectar%' order by datname;"
```

La última lista es el control: `nectar_test` tiene que **seguir ahí** y `nectar_ci_vocab` tiene que
**haber desaparecido**. El nombre va entre comillas y se nombra entero: nunca un `DROP` por patrón.

---

## Lo que queda dicho y no se hace aquí

- **Los documentos que dicen algo falso sobre `micro_plot` y no llevan marca de corrección:**
  `docs/.../seccion-finca-design.md:150`, `BRECHAS` (52, 105, 114), `CROSSWALK:38` y `CONTRATO:31`
  afirman que una microparcela **es** `micro_plot`. Daniel lo corrigió el 2026-09-19 y la corrección
  sólo vive en dos sitios. Lo más parecido a un glosario de esta casa es `BRECHAS:108-116`, **y está
  mal**. No se arregla con un find/replace: el precedente de la casa es corregirlo en un doc fechado,
  no reescribir el viejo. Es una decisión de Daniel porque toca cómo se lee la historia del proyecto.
- **El nombre del campo queda PERSISTIDO en los JSON de auditoría.** `lib/audit.ts:51-52` guarda el
  `after` tal cual, y una docena de sitios le pasan la fila entera de `Location`. Tras el renombrado,
  los eventos nuevos llevan la clave nueva y los viejos la vieja: dos nombres para la misma cosa en
  la misma tabla. No rompe nada que se haya encontrado —ningún lector accede a esa clave—, pero la
  cifra «9 usos» no lo ve, porque la clave no aparece escrita en ninguna de esas líneas.
- **`ALTER TYPE ... RENAME TO` como forma final no tiene precedente en esta casa:** el único
  `RENAME TO` de las 203 migraciones es a `_old`, dentro de un intercambio. Es SQL estándar y
  preserva los datos, pero conviene saber que es la primera vez.
- **El formulario de microparcela no tiene ninguna prueba que lo ejecute** (0 pruebas importan
  `app/actions/fincas`). El renombrado de `fincas.ts:138` sólo lo verá el compilador. Escribir esa
  prueba es trabajo aparte y se nombra para que no se cuente como hecho.
- **`Fincas.motivo_*` no tiene guardia.** `claves-de-traduccion-existen.test.ts` excluye por
  construcción las claves con plantilla, y la página de microparcela nueva usa dos namespaces, que es
  otro caso que ese guardia salta. Las 8 claves del motivo no están cubiertas por nada.

---

## Autorrevisión del plan

**1. Cobertura del spec.** §3.3 tiene tres filas y las tres tienen tarea: el comentario de
`schema.prisma` (Task 2, con la corrección de que es el doc de `PlotBlock`), el renombrado del campo
y del enum (Task 4 + Task 5), y `micro_plot` (Task 2 lo marca, Task 3 lo sostiene). La última fila de
§5 —el guardia del comentario— es la Task 3, con su mutación exacta. **Un hueco encontrado y
cubierto:** §3.3 no nombra `subdivisionReasonNote`, y el plan lo renombra con su razón escrita en el
ADR. **Un segundo hueco, declarado y no cubierto:** §3.3 tampoco nombra la columna
`subdivision_reason` ni el envoltorio `MOTIVOS_DE_SUBDIVISION`; el plan los incluye porque dejarlos
rompería el lockstep y dejaría el catálogo con el nombre viejo.

**1.bis Dos defectos que esta autorrevisión encontró en el propio plan, anotados porque los dos
devolvían un valor plausible.**

- **Una cita del allowlist era falsa**, y venía de una de las cinco mediciones que sostienen el plan:
  decía que `permiso-por-dominio.json` tenía dos `razon` con el nombre viejo en las líneas 679 y 800.
  Ese archivo tiene 175 líneas y **0** menciones; las 679 y 800 son de
  `acceso-a-datos.allowlist.json` y hablan de *microparcela*, no del campo. Un hallazgo de un
  subagente es una **afirmación**, no un dato, y ésta se cayó con un `grep` y su control. El paso que
  mandaba editar esas dos líneas se cambió por uno que **comprueba** que siguen limpias.
- **Mi primer barrido de marcadores de posición no discriminaba:** `grep -i` de «TODO» dio **6**
  aciertos, y los seis eran la palabra española **«todo»**. Con `\bTODO\b` sensible a mayúsculas da
  **0**, y el único `TBD` del archivo es esta propia prosa diciendo que no hay ninguno. Es la trampa
  de `lots` dentro de `plots` otra vez, aplicada a mi propia verificación.

**2. Marcadores de posición.** Ninguno. No hay «TBD», ni «añadir manejo de errores», ni «pruebas para
lo anterior», ni un paso de código sin su bloque. Los tres `<rama>` y `<n>` de la Task 6 son valores
que sólo existen al ejecutar.

**3. Consistencia de tipos y nombres.** `MotivoDeSeleccion` (el tipo), `motivoDeLaSeleccion` (el
campo), `notaDelMotivoDeLaSeleccion` (la nota), `MOTIVOS_DE_SELECCION` (la constante),
`motivosDeSeleccion.ts` (el archivo), `motivo_de_la_seleccion` y `nota_del_motivo_de_la_seleccion`
(las columnas): cada uno aparece con la misma forma en todas las tareas que lo nombran, y el bloque
**Interfaces** de las tareas 4, 5 y 6 los encadena. Los cuatro valores del enum no cambian en ninguna
tarea, y la Task 5 Paso 4 dice explícitamente que `fincas.ts:133` no se toca por eso.

**4. Lo que este plan NO verifica, dicho porque la medición que lo respalda no pudo correr.** Las
mediciones que lo sostienen se hicieron **sin tocar ninguna base y sin ejecutar `tsc`** (el worktree
no tenía `generated/prisma`). Por tanto: que `tsc` falle exactamente en los sitios que la Task 5
arregla es lectura de código, no ejecución; que Prisma proponga un `DROP`/`CREATE` ante un renombrado
de enum está citado de la cabecera de `20260917192422_vocabulario_del_dueno`, no medido; y **no hay
cuenta de filas** de `core.location` con `subdivision_reason` no nulo ni con
`location_type = 'micro_plot'`. Lo último no bloquea el plan —`RENAME` preserva los datos por
definición— pero sí bloquearía quitar `micro_plot`, que es parte de por qué no se quita.
