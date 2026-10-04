# El inventario de acceso con AST — plan de implementación

> **Para quien lo ejecute:** SUB-SKILL OBLIGATORIA: `superpowers:subagent-driven-development`
> o `superpowers:executing-plans`, tarea por tarea. Los pasos llevan `- [ ]`.

**Objetivo.** Sustituir el troceo por expresiones regulares de
`scripts/inventario-de-acceso.mjs` por un recorrido del AST de TypeScript, para que
una operación que toca la base sea un **nodo** y no un fragmento de texto entre dos
coincidencias.

**Arquitectura.** `ts.createSourceFile` — sólo sintaxis, sin `Program` ni
comprobador de tipos, así que no hay coste de resolución. La enumeración de nombres
de cliente (`prisma|aiPrisma|tx|client`) **desaparece**: un acceso es
`<cualquier receptor>.<modelo>.<método>(` donde `<modelo>` pertenece a la lista
derivada de `prisma/schema.prisma` y `<método>` a la de Prisma. El detector se
parte en un módulo puro, invocable con entrada hostil, y un CLI que conserva su
contrato.

**Stack.** Node 24, `typescript 6.0.3` (ya es dependencia: **esto no añade
paquetes**), vitest 4.1.10.

**Spec.** `PENDING_IMPLEMENTATIONS/007-el-inventario-lee-texto-no-programa.md` —
es el spec y no se duplica. Lleva los dos escalones, qué arregla cada uno, qué
**no** arregla, y las mutaciones con las que se sabrá que funcionó. Este plan
ejecuta **sólo el escalón 1**; el 2 (comprobador de tipos para resolver el símbolo
del guardia) sigue siendo una decisión de Daniel por su coste en CI.

---

## Restricciones globales

Valen para **todas** las tareas. Son instrucciones de la casa o hechos medidos el
2026-10-04 contra `origin/main` = `966ada98d1`.

- **Node no está en el PATH.** Antes de cualquier `npm`/`npx`:
  `export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"`
- **`tsc` y `build` necesitan montón explícito.** Medido: `npx tsc --noEmit` sale
  **134** (SIGABRT) con el montón por omisión **aunque la máquina esté al 57 %
  libre**; con `NODE_OPTIONS="--max-old-space-size=6144"` sale **0** y 0 bytes.
- **Este trabajo NO necesita base de datos.** Las tres compuertas del inventario
  corren en el carril hermético con una URL que no conecta a nada:
  `TEST_DATABASE_URL="postgresql://postgres@127.0.0.1:55432/no-se-conecta"`.
  Prohibido, sin excepción: `npm run test:db -- reset`, `prisma migrate reset`,
  `prisma db push --force-reset`, borrar bases, fijar
  `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`, y **aplicar migraciones** a la
  base compartida del 55433 (`nectar_test`).
- **Las compuertas se corren sin tubería**, con el código de salida en **su propia
  línea** (un `echo` en medio devuelve el código del `echo`, no el de la
  compuerta), y se leen **las DOS** líneas de vitest: `Test Files` **y** `Tests`.
  «`Tests N passed` con cero `×`» no es verde si `Test Files` dice `failed`.
- **`git commit -F <archivo>`, nunca `-m`** (en un `-m` entre comillas dobles la
  shell ejecuta los backticks y borra la palabra en silencio). **Nunca
  `git add -A`**: archivo por archivo, y `git show --stat` **contando** antes de
  empujar.
- **El contrato del `--json` que hay que conservar.** Las tres compuertas invocan
  `execFileSync("node", ["scripts/inventario-de-acceso.mjs", "--json"])` y consumen
  exactamente cinco campos — medido: `archivo`, `nombre`, `clase`, `acotado`,
  `guardias`. `modelos`, `principal` y `transitivo` sólo se usan para imprimir.
  Quien los quite rompe las compuertas sin que el tipo avise.
- **La línea base, que decide si algo se arregló o sólo se movió:**
  **618 operaciones en 168 archivos**, y las tres compuertas en verde
  (`Test Files 3 passed`, `Tests 28 passed`, salida 0, cero `×`).

### Los cuatro defectos medidos que este plan cierra

Están medidos, no supuestos, y cada uno trae el control que lo sostiene:

| defecto | medición | el control |
|---|---|---|
| **descarte silencioso** por el nombre del receptor | **6 operaciones invisibles** (618 → 624) en 5 archivos, entre ellas `ubicacionesEmparentadas` | añadir `db` a la enumeración las hace aparecer; 4 de las 6 caen en «depende del llamador» |
| **la clase `guardia transitivo` no se asigna nunca** | 66 operaciones que sólo guardan transitivamente se reportan «guardia directo» | flip: hacer alcanzable la rama la lleva de **0 → 66** |
| **la prosa decide la clase** | un comentario realista (`// la hace requireLotAccess() en la pantalla`) promovió **3 operaciones** a «guardia directo» | antes `guardias=[]`, después `["requireLotAccess"]`; el resto del árbol no se movió |
| **`lastIndex` sucio en `--llamadores`** | **46 → 42** «necesitan juicio humano» | las 4 que cambiaron imprimían `MIRAR` encima de llamadores **todos en ✓** |

### Lo que este plan NO arregla, y conviene no confundirlo

- **Que el guardia sea el debido.** Un `requireLotAccess` con el permiso
  equivocado sigue pasando con cualquier AST. Es `PENDING_IMPLEMENTATIONS/005`.
- **La identidad de símbolo del guardia.** `require\w*(Access|Admin|Override)` sigue
  siendo una convención de nombres: una función que no haga nada con ese nombre
  sigue contando. Sólo lo cierra el escalón 2.
- **El SQL crudo** sigue sin modelo que capturar: se registra como `SQL-crudo` para
  que exista como operación y haya que explicarla.

---

## Estructura de archivos

| archivo | responsabilidad |
|---|---|
| **Crear** `scripts/inventario/analizar.mjs` | el detector **puro**: recibe las fuentes y la lista de modelos, devuelve las filas. Sin `fs`, sin `process`, invocable con entrada hostil. |
| **Crear** `scripts/inventario/esquema.mjs` | `modelosDelEsquema(texto)` → `Set` de nombres de modelo en camelCase, derivados de `prisma/schema.prisma`. |
| **Modificar** `scripts/inventario-de-acceso.mjs` | queda como CLI: recorre `app/` y `lib/`, lee el esquema, llama a `analizar`, imprime los tres modos. **El `--json` no cambia de forma.** |
| **Crear** `tests/arquitectura/el-inventario-ve-toda-forma.test.ts` | el guardia que decide: llama a `analizar` con formas sintácticas que nadie enumeró. |
| **Modificar** `docs/arquitectura/acceso-a-datos.allowlist.json` | las altas que el AST destapa, cada una con su razón escrita. |
| **Modificar** `docs/arquitectura/inventario-de-acceso.md` | las cifras nuevas, que `cifras-del-inventario.test.ts` compara contra lo medido. |

**Por qué se parte en módulo y CLI, y no es gusto.** El guardia que importa es el
que **llama a la función con la entrada hostil**, y hoy eso es imposible: el guion
recorre `app/` y `lib/` del disco, así que ninguna prueba puede darle un método de
clase inventado y ver qué hace. Esa incomodidad es el aviso. El patrón ya existe en
esta casa: `tests/arquitectura/proceso-por-el-resolvedor.test.ts` alimenta al
detector con fragmentos literales (líneas 182-217).

---
## Tarea 1 · Partir el guion en módulo puro y CLI, sin mover ni una cifra

Refactor mecánico: la lógica de hoy se muda tal cual a un módulo invocable. **No se
cambia una sola regla.** Su verificación es la más fuerte que tendrá este plan: la
salida `--json` debe quedar **idéntica byte a byte** a la línea base.

**Archivos**
- Crear: `scripts/inventario/esquema.mjs`
- Crear: `scripts/inventario/analizar.mjs`
- Modificar: `scripts/inventario-de-acceso.mjs`

**Interfaces**
- Produce: `analizar(fuentes, modelos) -> Fila[]`, donde `fuentes` es un
  `Map<string, string>` de ruta a texto y `modelos` un `Set<string>` de nombres de
  modelo en camelCase. `Fila` lleva **al menos** `{ archivo, nombre, modelos,
  guardias, principal, transitivo, acotado, clase }`.
- Produce: `modelosDelEsquema(texto) -> Set<string>`.
- Consume (Tareas 2, 3, 5, 6 y el guardia nuevo): las dos funciones de arriba.

- [ ] **Paso 1: guardar la línea base, que es el criterio de esta tarea**

```bash
export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"
node scripts/inventario-de-acceso.mjs --json > /tmp/inv-base.json
node scripts/inventario-de-acceso.mjs            > /tmp/inv-base.txt
node scripts/inventario-de-acceso.mjs --llamadores > /tmp/inv-base-ll.txt
wc -c /tmp/inv-base.json   # la línea base medida fue 216036 bytes
```

- [ ] **Paso 2: crear `scripts/inventario/esquema.mjs`**

```js
/**
 * La lista de modelos sale del esquema, no de una enumeración a mano.
 *
 * Medido el 2026-10-04: el esquema declara **205** modelos, y de los **183**
 * nombres de modelo que el inventario reporta **ninguno** falta en esta lista.
 * Control negativo: un nombre inventado no entra. Por eso sustituye a la
 * enumeración de clientes `prisma|aiPrisma|tx|client`, que es la que produjo los
 * seis descartes silenciosos.
 */
export function modelosDelEsquema(texto) {
  const nombres = [...texto.matchAll(/^model ([A-Za-z]\w*)/gm)].map((m) => m[1]);
  if (nombres.length === 0) throw new Error("El esquema no declara ningún modelo: no se puede analizar nada.");
  return new Set(nombres.map((n) => n[0].toLowerCase() + n.slice(1)));
}
```

El `throw` no es defensivo de adorno: sin modelos, **toda** operación saldría con
`modelos.length === 0` y el inventario entero diría «cero operaciones», que es la
forma exacta de un verde vacío.

- [ ] **Paso 3: mover a `scripts/inventario/analizar.mjs`, sin tocar ninguna regla**

Se mudan tal cual: `GUARDIAS`, `METODOS`, `MODELOS`, `CRUDO`, `declaraciones`,
`operaciones`, `resolver`, el cálculo de `importados`, `guardanPorArchivo`,
`guardanVisiblesEn` y el `map` que produce `filas`. Lo único que cambia es la
frontera: en vez de leer de `fs` y de `RAIZ`, todo entra por los dos parámetros.
Los comentarios de cada regla **se mudan con ella** — son el registro de qué
incidente la puso ahí.

- [ ] **Paso 4: `scripts/inventario-de-acceso.mjs` queda como CLI**

Conserva `archivos()`, el `IGNORA`, la lectura del esquema y los tres modos de
salida (`--json`, `--llamadores`, resumen). Nada más.

- [ ] **Paso 5: verificar que no se movió nada — el criterio de la tarea**

```bash
node scripts/inventario-de-acceso.mjs --json > /tmp/inv-t1.json
diff /tmp/inv-base.json /tmp/inv-t1.json; echo "diff_json=$?"
node scripts/inventario-de-acceso.mjs > /tmp/inv-t1.txt
diff /tmp/inv-base.txt /tmp/inv-t1.txt;  echo "diff_txt=$?"
node scripts/inventario-de-acceso.mjs --llamadores > /tmp/inv-t1-ll.txt
diff /tmp/inv-base-ll.txt /tmp/inv-t1-ll.txt; echo "diff_ll=$?"
```

Los tres tienen que dar **0**. Y su **control positivo**, porque tres `diff` vacíos
también es lo que da comparar un archivo consigo mismo: comprobar que los archivos
no están vacíos y que un cambio artificial **sí** aparece.

```bash
wc -c /tmp/inv-t1.json          # ~216036; si da 0, el diff no medía nada
sed 's/guardia directo/XX/' /tmp/inv-t1.txt > /tmp/inv-ctl.txt
diff /tmp/inv-base.txt /tmp/inv-ctl.txt > /dev/null; echo "control_tiene_que_ser_1=$?"
```

- [ ] **Paso 6: las tres compuertas, como las corre CI**

```bash
TEST_DATABASE_URL="postgresql://postgres@127.0.0.1:55432/no-se-conecta" \
  npx vitest run tests/arquitectura/acceso-a-datos.test.ts \
                 tests/arquitectura/acotado-por-construccion.test.ts \
                 tests/arquitectura/cifras-del-inventario.test.ts > /tmp/g1.txt 2>&1
CODIGO=$?
echo "codigo_de_salida=$CODIGO"
grep -E '^ *(Test Files|Tests) ' /tmp/g1.txt
```

Esperado: `Test Files 3 passed`, `Tests 28 passed`, `codigo_de_salida=0`.

- [ ] **Paso 7: tipos y commit**

```bash
NODE_OPTIONS="--max-old-space-size=6144" npx tsc --noEmit -p tsconfig.json
echo "tsc=$?"
git add scripts/inventario/esquema.mjs scripts/inventario/analizar.mjs scripts/inventario-de-acceso.mjs
git show --stat HEAD >/dev/null; git diff --cached --stat   # contar: deben ser 3 archivos
git commit -F /tmp/msg-t1.txt
```

---

## Tarea 2 · El guardia que decide, en ROJO

El flip-test que la ficha nombra: *«mover una consulta a una forma sintáctica que
hoy nadie ha enumerado y ver que la compuerta la sigue viendo. Con el detector
actual no la ve. Ése es el flip-test que decide.»* Se escribe **antes** del AST y
se le ve fallar contra el detector de texto, que es lo único que distingue un
guardia de un adorno.

**Archivos**
- Crear: `tests/arquitectura/el-inventario-ve-toda-forma.test.ts`

**Interfaces**
- Consume: `analizar` y `modelosDelEsquema` de la Tarea 1.

- [ ] **Paso 1: escribir la prueba que falla**

```ts
/**
 * **El inventario ve una operación en cualquier forma sintáctica.**
 * `PENDING_IMPLEMENTATIONS/007`, el flip-test que decide.
 *
 * Por qué existe: el detector de texto reconocía *formas escritas*, y cada vez que
 * falló, falló igual — descarte silencioso o identidad falsa. Medido el
 * 2026-10-04 contra `origin/main`: **6 operaciones invisibles** sólo porque su
 * cliente se llamaba `db` en vez de `prisma`, entre ellas `ubicacionesEmparentadas`.
 *
 * Esto llama al detector con entrada hostil, que es lo que un corpus real no puede
 * hacer: un corpus prueba lo que contiene, no lo que alguien escribirá mañana.
 */
import { describe, expect, it } from "vitest";
import { analizar } from "../../scripts/inventario/analizar.mjs";

const MODELOS = new Set(["location", "auditEvent", "userAccount", "lot"]);
const ver = (src: string) => analizar(new Map([["lib/x.ts", src]]), MODELOS);
const nombres = (src: string) => ver(src).map((f) => f.nombre).sort();

describe("el inventario ve una operación en cualquier forma sintáctica", () => {
  it("un receptor que no se llama prisma — el caso de las seis invisibles", () => {
    const f = ver(`export async function emparentadas(id: string, db: Any) {
      return db.location.findMany({ where: { id } });
    }`);
    expect(f).toHaveLength(1);
    expect(f[0].modelos).toContain("location");
  });

  it("un método de clase", () => {
    expect(nombres(`export class Repo {
      async listar(cliente: Any) { return cliente.lot.findMany({}); }
    }`)).toContain("Repo.listar");
  });

  it("una función flecha exportada que devuelve otra", () => {
    const f = ver(`export const abrir = (u: string, c: Any) => async (tx: Any) => {
      await tx.auditEvent.create({ data: { actorUserAccountId: u } });
    };`);
    expect(f).toHaveLength(1);
    expect(f[0].modelos).toContain("auditEvent");
  });

  it("el cliente entre paréntesis, que ya costó el archivo lib/audit.ts entero", () => {
    const f = ver(`export async function sellar(tx?: Any) {
      await (tx ?? prisma).auditEvent.create({ data: {} });
    }`);
    expect(f[0].modelos).toContain("auditEvent");
  });

  /**
   * **Las 17 del árbol son tagged templates y NINGUNA es una llamada**, medido el
   * 2026-10-04. Un recorrido que sólo mire `CallExpression` las pierde todas — o
   * sea, comete el descarte silencioso que este cambio existe para cerrar.
   */
  it("el SQL crudo como tagged template, que no es una llamada", () => {
    const f = ver(`export async function bloquear(tx: Any, id: string) {
      await tx.$queryRaw\`SELECT id FROM traceability.lot WHERE id = \${id}::uuid FOR UPDATE\`;
    }`);
    expect(f[0].modelos).toContain("SQL-crudo");
  });

  it("export default sin nombre no absorbe a su vecina", () => {
    const f = ver(`export const dynamic = "force-dynamic";
    export default async function () { return prisma.lot.findMany({}); }`);
    expect(f.map((x) => x.nombre)).not.toContain("dynamic");
  });
});

describe("y NO ve lo que no es programa", () => {
  /**
   * El quinto caso de la ficha, del 2026-09-11: un comentario decidía la clase.
   * Medido el 2026-10-04 en main: un comentario realista promovió **tres**
   * operaciones a «guardia directo». Un comentario no es un nodo.
   */
  it("un comentario que nombra un guardia no guarda nada", () => {
    const f = ver(`export async function abrir(userAccountId: string, db: Any) {
      // Autorización: la hace requireLotAccess() en la pantalla.
      return db.location.findMany({ where: { id: userAccountId } });
    }`);
    expect(f[0].guardias).toEqual([]);
  });

  it("una consulta dentro de un comentario no es una operación", () => {
    expect(ver(`export function puro(a: number) {
      // antes esto hacía prisma.lot.findMany({})
      return a + 1;
    }`)).toHaveLength(0);
  });

  it("un comentario que nombra userAccountId no hace que lo reciba", () => {
    const f = ver(`export async function ofrecidas(db: Any) {
      // No recibe userAccountId y no autoriza.
      return db.lot.findMany({});
    }`);
    expect(f[0].principal).toBe(false);
  });
});
```

- [ ] **Paso 2: verlo fallar, y leer QUÉ falla por su nombre**

```bash
TEST_DATABASE_URL="postgresql://postgres@127.0.0.1:55432/no-se-conecta" \
  npx vitest run tests/arquitectura/el-inventario-ve-toda-forma.test.ts > /tmp/rojo.txt 2>&1
CODIGO=$?
echo "codigo_de_salida=$CODIGO"
grep -E '^ *(Test Files|Tests) ' /tmp/rojo.txt
grep -E '^ *×' /tmp/rojo.txt
```

**El paso no está hecho hasta anotar en el commit cuántas caen y cuáles.** Si cayeran
las nueve, sospechar del arnés antes que del detector: el detector de hoy **sí** ve
algunas de estas formas (el cliente entre paréntesis y el `export default` están
arreglados desde el 2026-08-31), así que un «9 de 9» significa que el módulo no
carga, no que el detector sea ciego. Esperado: caen unas, pasan otras.

- [ ] **Paso 3: commitear en rojo, a propósito**

Es el único estado del repositorio que prueba que el guardia distingue. Queda rojo
**una sola tarea**, y el mensaje lo dice. El carril completo **no** se corre aquí.

```bash
git add tests/arquitectura/el-inventario-ve-toda-forma.test.ts
git diff --cached --stat     # contar: 1 archivo
git commit -F /tmp/msg-t2.txt
```

---
## Tarea 3 · El recorrido del AST, dentro de `analizar.mjs`

Se sustituyen las internas de `analizar` por un recorrido de nodos. **La firma y
los campos de salida no cambian** — el contrato del `--json` es lo que leen las
tres compuertas.

**Archivos**
- Modificar: `scripts/inventario/analizar.mjs`

**Interfaces**
- Consume: `modelosDelEsquema` (Tarea 1).
- Produce: la misma `Fila[]` de la Tarea 1, con `clase` tomando los mismos ocho
  valores de hoy.

- [ ] **Paso 1: el troceo, que pasa a ser una lista de nodos**

```js
import ts from "typescript";

function arbol(archivo, texto) {
  return ts.createSourceFile(archivo, texto, ts.ScriptTarget.Latest, true,
    archivo.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}

/**
 * Las unidades de un archivo: función, `const`, **método de clase** y
 * `export default` sin nombre. Ya no hay «corte hasta la siguiente declaración»,
 * así que desaparecen a la vez el descarte silencioso y la identidad falsa — el
 * cuerpo de una unidad es su subárbol, no un fragmento de texto entre dos
 * coincidencias.
 */
function unidades(sf) {
  const out = [];
  const exportada = (n) => (ts.getCombinedModifierFlags(n) & ts.ModifierFlags.Export) !== 0;
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st)) {
      out.push({ nombre: st.name?.text ?? "default", exportada: exportada(st), nodo: st });
    } else if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (ts.isIdentifier(d.name)) out.push({ nombre: d.name.text, exportada: exportada(d), nodo: d });
      }
    } else if (ts.isClassDeclaration(st) && st.name) {
      const exp = exportada(st);
      for (const m of st.members) {
        if ((ts.isMethodDeclaration(m) || ts.isPropertyDeclaration(m)) && m.name && ts.isIdentifier(m.name)) {
          out.push({ nombre: `${st.name.text}.${m.name.text}`, exportada: exp, nodo: m });
        }
      }
    }
  }
  return out;
}
```

`ts.getCombinedModifierFlags` sobre una `VariableDeclaration` sube sola hasta su
`VariableStatement` — eso es lo que significa «Combined»; no hay que buscar el
padre a mano.

- [ ] **Paso 2: los accesos, SIN enumerar ningún cliente**

```js
const METODOS = new Set([
  "findMany", "findFirstOrThrow", "findFirst", "findUniqueOrThrow", "findUnique",
  "createManyAndReturn", "createMany", "create", "updateManyAndReturn", "updateMany",
  "update", "upsert", "deleteMany", "delete", "count", "aggregate", "groupBy",
]);
const CRUDO = /^\$(?:query|execute)Raw(?:Unsafe)?$/;

/**
 * Un acceso es `<cualquier receptor>.<modelo>.<método>(`, con `<modelo>` en la
 * lista que declara el esquema. Eso es lo que cierra el descarte silencioso: el
 * receptor puede llamarse `db`, `cliente`, `this.db` o ser `(tx ?? prisma)` — da
 * igual, porque lo que se reconoce es el **modelo**, que sí tiene una autoridad.
 *
 * **`$queryRaw` es casi siempre un tagged template, NO una llamada.** Medido el
 * 2026-10-04: las **17** del árbol son tagged templates y **ninguna** es una
 * llamada. Un recorrido que sólo mire `CallExpression` las pierde todas, o sea
 * comete el descarte silencioso que este cambio existe para cerrar. Por eso se
 * mira `n.tag` además de `n.expression`.
 */
function accesos(nodo, modelos) {
  const vistos = new Set();
  const mirar = (callee) => {
    if (!callee || !ts.isPropertyAccessExpression(callee)) return;
    const metodo = callee.name.text;
    if (CRUDO.test(metodo)) { vistos.add("SQL-crudo"); return; }
    if (!METODOS.has(metodo)) return;
    const recv = callee.expression;
    if (ts.isPropertyAccessExpression(recv) && modelos.has(recv.name.text)) vistos.add(recv.name.text);
  };
  (function walk(n) {
    if (ts.isCallExpression(n)) mirar(n.expression);
    else if (ts.isTaggedTemplateExpression(n)) mirar(n.tag);
    ts.forEachChild(n, walk);
  })(nodo);
  return [...vistos];
}
```

- [ ] **Paso 3: llamadas, principal y acotado — las tres como nodos**

```js
/** Los nombres que una unidad invoca. Un comentario no invoca nada. */
function llamadas(nodo) {
  const ns = new Set();
  (function walk(n) {
    const t = ts.isCallExpression(n) ? n.expression
            : ts.isTaggedTemplateExpression(n) ? n.tag : null;
    if (t && ts.isIdentifier(t)) ns.add(t.text);
    else if (t && ts.isPropertyAccessExpression(t)) ns.add(t.name.text);
    ts.forEachChild(n, walk);
  })(nodo);
  return ns;
}

/** ¿Aparece ese identificador en el subárbol? Un comentario no es un identificador. */
function usa(nodo, nombre) {
  let si = false;
  (function walk(n) {
    if (si) return;
    if (ts.isIdentifier(n) && n.text === nombre) { si = true; return; }
    ts.forEachChild(n, walk);
  })(nodo);
  return si;
}

/**
 * Acotado por construcción: hay un `where` cuyo valor usa el principal.
 *
 * El detector de texto usaba `/where:\s*\{[^}]*userAccountId/s`, y `[^}]*` **no
 * puede cruzar una llave**: un `where: { assignment: { some: {...} }, userAccountId }`
 * no casaba. Sobre el árbol la anidación deja de ser un problema.
 */
function acotadoPorElPrincipal(nodo) {
  let si = false;
  (function walk(n) {
    if (si) return;
    if (ts.isPropertyAssignment(n) && ts.isIdentifier(n.name) && n.name.text === "where"
        && usa(n.initializer, "userAccountId")) { si = true; return; }
    ts.forEachChild(n, walk);
  })(nodo);
  return si;
}
```

- [ ] **Paso 4: los imports, también como nodos**

Sustituye `/import\s*\{([^}]+)\}\s*from\s*"([^"]+)"/g`, que exige comillas dobles y
una sola línea. Con el árbol se usa `ts.isImportDeclaration` y
`st.importClause.namedBindings`, respetando `propertyName` para los `as`. **Y se
salta `importClause.isTypeOnly`**: un `import type` no puede guardar nada, así que
contarlo como guardia visible era un falso positivo que el texto no distinguía.

- [ ] **Paso 5: la absorción de ayudantes privados, por conjuntos**

En vez de concatenar textos, se calcula el cierre transitivo de ayudantes privados
alcanzados —con `llamadas()` sobre cada unidad— y se **unen** sus `accesos`,
`llamadas` y el `usa(..., "userAccountId")` de cada uno. El resultado es el mismo
que hoy y deja de depender de que el texto pegado sea parseable.

- [ ] **Paso 6: el guardia de la Tarea 2 pasa a verde**

```bash
TEST_DATABASE_URL="postgresql://postgres@127.0.0.1:55432/no-se-conecta" \
  npx vitest run tests/arquitectura/el-inventario-ve-toda-forma.test.ts > /tmp/v3.txt 2>&1
CODIGO=$?
echo "codigo_de_salida=$CODIGO"
grep -E '^ *(Test Files|Tests) ' /tmp/v3.txt
```

- [ ] **Paso 7: medir el movimiento contra la línea base, y nombrar cada alta**

```bash
node scripts/inventario-de-acceso.mjs --json > /tmp/inv-t3.json
node -e '
const f=require("fs");
const a=JSON.parse(f.readFileSync("/tmp/inv-base.json","utf8"));
const b=JSON.parse(f.readFileSync("/tmp/inv-t3.json","utf8"));
const k=x=>x.archivo+" "+x.nombre;
const A=new Map(a.map(x=>[k(x),x])), B=new Map(b.map(x=>[k(x),x]));
console.log("operaciones: "+a.length+" -> "+b.length);
console.log("ALTAS ("+[...B.keys()].filter(x=>!A.has(x)).length+"):");
for (const x of [...B.keys()].filter(x=>!A.has(x))) console.log("  + "+x+"  clase="+B.get(x).clase);
console.log("BAJAS ("+[...A.keys()].filter(x=>!B.has(x)).length+"):");
for (const x of [...A.keys()].filter(x=>!B.has(x))) console.log("  - "+x+"  clase="+A.get(x).clase);
const mov=[...B.keys()].filter(x=>A.has(x)&&A.get(x).clase!==B.get(x).clase);
console.log("CAMBIOS DE CLASE ("+mov.length+"):");
for (const x of mov) console.log("  ~ "+x+"  "+A.get(x).clase+" -> "+B.get(x).clase);
'
```

**Toda baja hay que explicarla una por una antes de seguir.** Una alta es cobertura
ganada; una baja puede ser cobertura **perdida**, que es la dirección peligrosa y es
exactamente el defecto que este plan cierra. Esperado: ≥6 altas (las medidas), 0
bajas. Si hay bajas, parar y mirarlas.

---

## Tarea 4 · La allowlist y el documento, al día

Las cifras y las entradas nuevas. `tests/arquitectura/cifras-del-inventario.test.ts`
compara el total escrito en el documento contra el medido, así que esta tarea es la
que vuelve a poner las tres compuertas en verde.

**Archivos**
- Modificar: `docs/arquitectura/acceso-a-datos.allowlist.json`
- Modificar: `docs/arquitectura/inventario-de-acceso.md`

- [ ] **Paso 1: escribir la razón de cada operación nueva**

Las cuatro altas medidas que caen en «depende del llamador» necesitan entrada en
`dependen_del_llamador` con `razon` **no vacía** — la compuerta lo exige. Y la razón
se mide, no se supone: `node scripts/inventario-de-acceso.mjs --llamadores` dice
quién llama a cada una y si ese llamador autoriza.

Las seis medidas el 2026-10-04 fueron:

| operación | clase que le toca |
|---|---|
| `lib/people/quienLoHizo.ts` `personasPermitidas()` | acotado por construcción |
| `lib/research/amendments.ts` `getGate0Status()` | guardia directo |
| `lib/traceability/entregasDeCosecha.ts` `parcelaDeOrigen()` | depende del llamador |
| `lib/traceability/intervenciones.ts` `intervencionesVigentes()` | depende del llamador |
| `lib/traceability/locations.ts` `nombreLibreBajo()` | depende del llamador |
| `lib/traceability/ubicacionesEmparentadas.ts` `ubicacionesEmparentadas()` | depende del llamador |

- [ ] **Paso 2: actualizar las cifras del documento** con las que imprime el
  resumen, y **leerlas** antes de escribirlas.

- [ ] **Paso 3: las tres compuertas más el guardia nuevo, en verde**

```bash
TEST_DATABASE_URL="postgresql://postgres@127.0.0.1:55432/no-se-conecta" \
  npx vitest run tests/arquitectura/acceso-a-datos.test.ts \
                 tests/arquitectura/acotado-por-construccion.test.ts \
                 tests/arquitectura/cifras-del-inventario.test.ts \
                 tests/arquitectura/el-inventario-ve-toda-forma.test.ts > /tmp/g4.txt 2>&1
CODIGO=$?
echo "codigo_de_salida=$CODIGO"
grep -E '^ *(Test Files|Tests) ' /tmp/g4.txt
```

- [ ] **Paso 4: commit** de las Tareas 3 y 4 juntas, archivo por archivo. Van en un
  solo commit **a propósito**: la Tarea 3 sola deja las compuertas en rojo, y aquí
  no se commitea rojo salvo el guardia de la Tarea 2.

---
## Tarea 5 · La clase `guardia transitivo`, que hoy no se asigna nunca

**El defecto.** `locales` (líneas 243-245 del guion de hoy) y `transitivo` (249-251)
son **la misma expresión**, y `guardias = propios ∪ locales`. Así que
`transitivo.length > 0` implica `guardias.length > 0`, y la rama
`else if (transitivo.length)` es **inalcanzable por construcción**. Medido:
`clase === "guardia transitivo"` sale **0** de 618, y el flip —hacer la rama
alcanzable— la lleva a **66**. Esas 66 se reportan hoy como «guardia directo»,
que dice algo distinto de lo que ocurre: nadie llama ahí a un guardia, se llama a
algo que guarda.

**Archivos**
- Modificar: `scripts/inventario/analizar.mjs`
- Modificar: `docs/arquitectura/inventario-de-acceso.md` (la tabla de patrones)

- [ ] **Paso 1: escribir la prueba que falla**, en
  `tests/arquitectura/el-inventario-ve-toda-forma.test.ts`, con entrada hostil: un
  archivo donde una función guarda con `can()` y otra la llama sin guardar por su
  cuenta. Esperado: la segunda sale `guardia transitivo`. Hoy sale
  `guardia directo`. Verla fallar y leer **qué** falla por su nombre.

- [ ] **Paso 2: separar las dos listas**

`propios` son los nombres con **forma** de guardia (`GUARDIAS`); `transitivo` son
los que **guardan** —resueltos por archivo o por import— y **no** tienen forma de
guardia. La cadena de clasificación pasa a mirar `propios` primero:

```js
const transitivo = [...visibles].filter((n) => n !== unidad.nombre && invocados.has(n) && !GUARDIA.test(n));
const guardias = [...new Set([...propios, ...transitivo])];   // la allowlist sigue leyendo esto
let clase;
if (propios.length) clase = "guardia directo";
else if (transitivo.length) clase = "guardia transitivo";
// ...el resto de la cadena, sin cambios
```

`guardias` **sigue siendo la unión** porque es el campo que consume
`tests/arquitectura/acotado-por-construccion.test.ts`; lo que cambia es sólo cuál
de las dos listas decide la clase.

- [ ] **Paso 3: la tabla de patrones del documento** gana la fila
  `guardia transitivo` con su cuenta, y `guardia directo` baja. `cifras-del-inventario`
  compara fila por fila, así que esto es obligatorio o la compuerta queda en rojo.

- [ ] **Paso 4: compuertas en verde y commit.**

---

## Tarea 6 · El `lastIndex` sucio de `--llamadores`

**El defecto.** `GUARDIAS` lleva `/g`, así que `.test()` guarda estado. En
`const guardados = llamadores.filter((f) => GUARDIAS.test(...))` el `lastIndex` sólo
se repone **después** del `filter` entero, así que a partir del segundo llamador la
búsqueda arranca a mitad del archivo. Medido: **46 → 42** «necesitan juicio humano»,
y las cuatro que cambiaron imprimían `MIRAR` **encima de una lista de llamadores
todos en ✓** — el guion ya se contradecía en pantalla:

```
lib/apiary/avisoDeEnjambrazon.ts  avisosDeEnjambrazon   ✓✓
lib/apiary/cierreDeCosecha.ts     bloquearCosechaEn     ✓✓
lib/apiary/origenDeColonia.ts     origenesDeColonia     ✓✓
lib/traceability/procesoDelLinaje.ts  loteDividido      ✓✓✓✓
```

**Archivos**
- Modificar: `scripts/inventario/analizar.mjs` y/o `scripts/inventario-de-acceso.mjs`

- [ ] **Paso 1: el arreglo es estructural, no reponer el `lastIndex` a mano.**
  Un `/g` no se usa nunca para `.test()`: se declara una copia sin `/g` para
  preguntar y se reserva el `/g` para `matchAll`.

```js
const GUARDIAS = /(?:require[A-Z]\w*(?:Access|Admin|Override)|can|resolvedPermissionKeys|permissionKeysAnywhere)\s*\(/g;
const GUARDIA_HAY = new RegExp(GUARDIAS.source);   // sin /g: `.test()` no guarda estado
```

  Reponer el `lastIndex` en cada sitio deja la trampa armada para el siguiente que
  añada un `.test()`. Con el AST de la Tarea 3 la mayoría de estos usos
  desaparecen; los que queden sobre texto usan la copia sin `/g`.

- [ ] **Paso 2: la prueba que lo fija.** Con entrada hostil: tres llamadores que
  **todos** guardan, y el veredicto tiene que ser `OK`. Hoy, con tres, el segundo y
  el tercero salen `✗`. Verla fallar primero.

- [ ] **Paso 3: comprobar si el documento fija el 46.** Si
  `docs/arquitectura/inventario-de-acceso.md` escribe esa cifra, actualizarla; si no,
  no inventar una fila.

```bash
grep -nE '\b4[0-9]\b.*(juicio|llamador)' docs/arquitectura/inventario-de-acceso.md
echo "grep=$?"   # 1 = no la fija, y entonces no se toca el documento
```

- [ ] **Paso 4: compuertas en verde y commit.**

---

## Tarea 7 · La compuerta entera, los flip-tests y el PR

- [ ] **Paso 1: el carril hermético completo, como lo corre CI, sin tubería**

```bash
export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"
NODE_OPTIONS="--max-old-space-size=6144" bash scripts/ci.sh > /tmp/ci.txt 2>&1
CODIGO=$?
echo "codigo_de_salida=$CODIGO"
grep -E '^ *(Test Files|Tests) |CI correrá' /tmp/ci.txt
```

Se leen **las dos** líneas de vitest. La línea «CI correrá N archivos» es la fila
patrón del propio `ci.sh`: si sale absurda, el verde de abajo no significa nada.

- [ ] **Paso 2: el `build`, que `verify` no corre**

```bash
NODE_OPTIONS="--max-old-space-size=6144" npm run build > /tmp/build.txt 2>&1
CODIGO=$?
echo "codigo_de_salida=$CODIGO"
grep -c 'Compiled successfully' /tmp/build.txt
```

Este cambio no toca TypeScript de la aplicación, así que el `build` es una red, no
el criterio. Se corre igual: `verify` no es `next build`.

- [ ] **Paso 3: las mutaciones que la ficha exige volver a pasar**

La ficha las nombra: *ayudante privado, homónimo no importado, homónimo importado
desde un módulo que no guarda, `export default`, operación nueva sin guardia,
entrada podrida, razón vacía.* Viven en
`tests/arquitectura/acceso-a-datos.test.ts`, así que el Paso 1 las corre — pero
correrlas **no es** pasarlas a propósito: hay que comprobar que siguen **cazando**.

Arnés de flip, con las cuatro cosas que exige esta casa: **commitear antes de
mutar**, el sha antes y después **distintos o abortar**, que el archivo **compile y
se importe**, y **qué prueba cae por su nombre**. Y una quinta, aprendida el
2026-10-02: el arnés **aborta si el mundo contra el que mide no existe**.

```bash
# El arnés restaura con `git checkout --`, que trae la versión del ÚLTIMO COMMIT.
# Commitear antes no es higiene: es lo que impide que se lleve trabajo sin commitear.
test -z "$(git status --porcelain)" || { echo "ABORTA: hay cambios sin commitear"; exit 1; }
```

Mutación nueva, la que decide: **mover una consulta real a un método de clase** y
comprobar que el inventario la sigue viendo. Con el detector de texto no la ve; con
el AST sí. Si el flip **no discrimina**, decirlo en vez de firmarlo.

- [ ] **Paso 4: revisión independiente** con el CLI de Codex, cerrando stdin (si no,
  se cuelga esperando y deja 39 bytes, que se leen como «no encontró nada»):

```bash
CODEX=/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex
[ -x "$CODEX" ] || { echo "ABORTA: no está el binario de Codex en esa ruta"; exit 1; }
"$CODEX" exec --cd "$PWD" --sandbox read-only "$(cat /tmp/brief-007.txt)" \
  < /dev/null > /tmp/codex-007.txt 2>&1
echo "salida=$?"
wc -c /tmp/codex-007.txt    # una revisión vacía y una limpia se parecen mucho
```

El brief se escribe para este cambio; **no se reusa `docs/CODEX_REVIEW.brief.md`**,
que lleva el encuadre del último cambio revisado.

- [ ] **Paso 5: contar el stat del commit Y el del PR, que no son lo mismo**

```bash
git diff --cached --stat                      # lo que va a entrar
git log origin/main..HEAD --oneline           # mis commits: DOS puntos
git diff --name-only origin/main...HEAD       # mis archivos: TRES puntos
```

Si el PR lleva más archivos que mis commits, la **base** está mal, y `git show --stat`
no puede verlo.

- [ ] **Paso 6: abrir el PR con `--body-file`**, nunca `--body "…"`, y **no
  fusionarlo**: todo merge pasa por Daniel.

```bash
gh pr create -R danieljosegiraldez-png/nectar-nomada --base main \
  --title "El inventario de acceso lee el programa, no el texto (007)" \
  --body-file /tmp/pr-007.md
```

El cuerpo del PR lleva: las cuatro mediciones de antes, el movimiento
`618 → N` con **cada alta y cada baja nombrada**, el resultado de los flip-tests
diciendo si discriminaron, y qué **no** cierra esto (el escalón 2 y la ficha 005).

---

## Auto-revisión del plan

**Cobertura del spec.** De la ficha 007: el escalón 1 lo cubren las Tareas 1-4; las
siete mutaciones existentes, el Paso 3 de la Tarea 7; la mutación nueva que «decide»,
el mismo paso; la línea base que pide guardar antes de empezar, el Paso 1 de la
Tarea 1. **Fuera de alcance a propósito:** el escalón 2 (decisión de Daniel por su
coste en CI) y la ficha 005 (si el guardia es el *debido*).

**Placeholders.** Ninguna tarea dice «añadir manejo de errores», «escribir pruebas
para lo anterior» ni «igual que la Tarea N». Las cifras del plan son medidas, con la
fecha y el commit contra el que se midieron.

**Consistencia de nombres.** `analizar(fuentes, modelos)` y `modelosDelEsquema(texto)`
se declaran en la Tarea 1 y se usan con esa firma exacta en las Tareas 2, 3, 5 y 6.
Los campos de la fila son los mismos ocho en todas. `GUARDIA` (sin `/g`, para
preguntar) y `GUARDIAS` (con `/g`, para `matchAll`) son dos cosas distintas y la
Tarea 6 las nombra así.

**Un riesgo que el ejecutor debe conocer.** Un método de clase pasa a identificarse
como `Clase.metodo`, y un `export default` sin nombre como `default`. Hoy no hay
ningún método de clase con acceso —los tres archivos invisibles lo eran por el
receptor `db`, no por su forma—, así que no debería haber churn de identidad en la
allowlist. **Si el Paso 7 de la Tarea 3 enseña bajas, eso es lo primero que hay que
mirar**, y una baja no se da por buena sin explicarla.
