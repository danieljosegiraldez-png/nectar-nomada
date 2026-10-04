/**
 * **Escalón 2 de `PENDING_IMPLEMENTATIONS/007`: el guardia como SÍMBOLO, no como
 * nombre.**
 *
 * `analizar.mjs` reconoce un guardia por convención de nombre
 * (`require\w*(Access|Admin|Override)|can|…`), y la ficha dice qué cuesta eso:
 * *«una función que no hace nada con ese nombre cuenta como guardia»*. Esto lo
 * cierra por el único camino que lo cierra — un `ts.Program` con comprobador de
 * tipos— y **no sustituye la clasificación: la verifica**. Es deliberado: la
 * allowlist y las tres compuertas se apoyan en las clases de `analizar.mjs`, y
 * cambiarlas de substrato sería otro cambio con otra discusión.
 *
 * **Qué hace.** Resuelve cada llamada hasta la **declaración real** de su
 * símbolo —siguiendo los alias de `import`, que es lo que distingue el `can` de
 * `lib/rbac/service.ts` del homónimo de `lib/rbac/resolve.ts`— y calcula qué
 * funciones **alcanzan** el servicio de autorización, directa o
 * transitivamente.
 *
 * **El coste, medido el 2026-10-04 sobre este árbol**, porque era la decisión
 * que la ficha dejaba al dueño: `createProgram` 4,1 s, el recorrido con
 * resolución de las **19.996** llamadas 3,8 s, **~8 s en total y ~1,9 GB**. Las
 * 19.996 resuelven al **100 %**. Por eso vive detrás de `--simbolos` y de su
 * propia compuerta, en vez de encarecer las tres que ya existen.
 *
 * **Y lo que arregla gratis**, medido el mismo día: la casa tiene guardias en
 * español que la convención no ve —`exigePoderAnotar`, `exigeReportarEnJornada`,
 * `exigePermiso`— y 50 funciones `exige*` de las que la mayoría son
 * **validadores**. Meterlas todas en la convención habría marcado 36
 * operaciones como guardadas por la fuerza de un validador de fechas. Con
 * símbolos no hay nada que enumerar: los tres que autorizan alcanzan el
 * servicio y `exigeFecha`, `exigeNombre`, `exigePct` y `exigeEnteroContado` no.
 */
import ts from "typescript";

/** El servicio de autorización, y las tres puertas por las que se pasa. */
export const SERVICIO = "lib/rbac/service.ts";
export const RAICES = ["can", "resolvedPermissionKeys", "permissionKeysAnywhere"];

export const clave = (archivo, nombre) => `${archivo}:${nombre}`;

/**
 * La unidad de **nivel superior** que contiene un nodo — la misma que enumera
 * `unidades()` en `analizar.mjs`, o las claves no casarían y el cruce daría
 * cero en silencio.
 *
 * **Subir sólo hasta la primera declaración que aparezca no sirve**, y costó una
 * medición: en `exigePermiso` la llamada vive en
 * `const ok = … ? … : await can(…)`, así que se atribuía a la variable local
 * `ok` y la función quedaba sin su arista. El efecto era un detector que decía
 * que `exigePermiso` no autoriza — teniendo el `can` dos líneas más abajo. Hay
 * que subir hasta la sentencia cuyo padre es el archivo.
 */
export function unidadDe(nodo) {
  let st = nodo;
  while (st.parent && !ts.isSourceFile(st.parent)) st = st.parent;
  if (ts.isFunctionDeclaration(st)) return st.name?.text ?? "default";
  if (ts.isVariableStatement(st)) {
    const d = st.declarationList.declarations[0];
    return d && ts.isIdentifier(d.name) ? d.name.text : "(desestructurado)";
  }
  if (ts.isClassDeclaration(st)) {
    const cl = st.name?.text ?? "(clase anónima)";
    for (let x = nodo; x && x !== st; x = x.parent) {
      if (ts.isConstructorDeclaration(x)) return `${cl}.constructor`;
      if (ts.isClassStaticBlockDeclaration(x)) return `${cl}.(static)`;
      if ((ts.isMethodDeclaration(x) || ts.isPropertyDeclaration(x) ||
           ts.isGetAccessor(x) || ts.isSetAccessor(x)) && x.name) {
        return `${cl}.${ts.isIdentifier(x.name) ? x.name.text : x.name.getText()}`;
      }
    }
    return cl;
  }
  if (ts.isExportAssignment(st)) return "default";
  return "(nivel superior)";
}

/**
 * Resuelve un identificador hasta la declaración **real** de su símbolo.
 *
 * El `getAliasedSymbol` no es un detalle: sin él, una llamada a `can()` resuelve
 * a la cláusula `import { can }` del archivo que la llama, no a la función. El
 * primer spike del 2026-10-04 dio «2 llamadas resueltas» apuntando a
 * `lib/traceability/lots.ts` — un resultado plausible de algo que no medía.
 */
function declaracionReal(checker, id) {
  let s = checker.getSymbolAtLocation(id);
  if (!s) return null;
  if (s.flags & ts.SymbolFlags.Alias) {
    try { s = checker.getAliasedSymbol(s); } catch { /* no resoluble: se queda el alias */ }
  }
  const d = s?.declarations?.[0];
  if (!d) return null;
  return { archivo: d.getSourceFile().fileName, nombre: s.getName() };
}

/**
 * Construye el grafo de llamadas por símbolo y devuelve qué alcanza el servicio
 * de autorización.
 *
 * `raiz` es el directorio del proyecto. Devuelve claves **relativas** a él.
 */
export function autorizacionPorSimbolo({ raiz = process.cwd(), servicio = SERVICIO, raices = RAICES } = {}) {
  const prefijo = raiz.endsWith("/") ? raiz : `${raiz}/`;
  const cfgPath = ts.findConfigFile(raiz, ts.sys.fileExists, "tsconfig.json");
  if (!cfgPath) throw new Error(`No hay tsconfig.json bajo ${raiz}: sin él no hay Program que construir.`);
  const parsed = ts.parseJsonConfigFileContent(
    ts.readConfigFile(cfgPath, ts.sys.readFile).config, ts.sys, raiz
  );
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  const checker = program.getTypeChecker();

  const propios = parsed.fileNames.filter(
    (f) => !f.includes("node_modules") && (f.includes("/app/") || f.includes("/lib/"))
  );
  if (propios.length === 0) {
    throw new Error("El Program no incluye ni un archivo de app/ o lib/: no se puede analizar nada.");
  }

  const aristas = new Map();
  /**
   * **El tercer argumento de `can(…)`, que es el que dice QUÉ se autoriza.**
   * `can(userAccountId, action, resourceType, target, classification)`. Medido el
   * 2026-10-04: de las **109** llamadas al `can` real, **103 lo pasan literal**
   * (94 %) y las 6 restantes son un acceso a propiedad. Esto es lo que convierte
   * «¿es el guardia debido?» en algo medible: el permiso que se exige, contra el
   * dato que se toca.
   */
  const recursoPropio = new Map();
  let llamadas = 0;
  let resueltas = 0;
  for (const f of propios) {
    const sf = program.getSourceFile(f);
    if (!sf) continue;
    const rel = f.replace(prefijo, "");
    (function walk(n) {
      const callee = ts.isCallExpression(n) ? n.expression
                   : ts.isTaggedTemplateExpression(n) ? n.tag : null;
      if (callee) {
        const id = ts.isIdentifier(callee) ? callee
                 : ts.isPropertyAccessExpression(callee) ? callee.name : null;
        if (id) {
          llamadas++;
          const d = declaracionReal(checker, id);
          if (d) {
            resueltas++;
            if (!d.archivo.includes("node_modules")) {
              const de = clave(rel, unidadDe(n));
              if (!aristas.has(de)) aristas.set(de, new Set());
              const hacia = clave(d.archivo.replace(prefijo, ""), d.nombre);
              aristas.get(de).add(hacia);
              if (hacia === clave(servicio, "can") && ts.isCallExpression(n)) {
                const arg = n.arguments[2];
                if (arg && ts.isStringLiteral(arg)) {
                  if (!recursoPropio.has(de)) recursoPropio.set(de, new Set());
                  recursoPropio.get(de).add(arg.text);
                }
              }
            }
          }
        }
      }
      ts.forEachChild(n, walk);
    })(sf);
  }

  const puertas = new Set(raices.map((n) => clave(servicio, n)));
  // Cierre transitivo hacia atrás: quién llega a una puerta, directa o por saltos.
  const autorizan = new Set(puertas);
  for (let cambio = true; cambio; ) {
    cambio = false;
    for (const [de, hacia] of aristas) {
      if (autorizan.has(de)) continue;
      for (const h of hacia) {
        if (autorizan.has(h)) { autorizan.add(de); cambio = true; break; }
      }
    }
  }
  /**
   * **El permiso se hereda del envoltorio.** Sólo 83 unidades llaman a `can`
   * directamente, y hay 396 operaciones «guardia directo»: casi todas pasan por
   * un `requireLotAccess` o un `exigePermiso`, que es quien pasa el literal. Sin
   * propagar, el cruce sólo vería una quinta parte del árbol.
   */
  const recursos = new Map([...recursoPropio].map(([k, v]) => [k, new Set(v)]));
  for (let cambio = true; cambio; ) {
    cambio = false;
    for (const [de, hacia] of aristas) {
      for (const h of hacia) {
        const t = recursos.get(h);
        if (!t) continue;
        if (!recursos.has(de)) recursos.set(de, new Set());
        const antes = recursos.get(de).size;
        for (const x of t) recursos.get(de).add(x);
        if (recursos.get(de).size !== antes) cambio = true;
      }
    }
  }

  return { aristas, puertas, autorizan, recursos, archivos: propios.length, llamadas, resueltas };
}
