/**
 * El detector del inventario de acceso, **puro** y sobre el AST: recibe las
 * fuentes y la lista de modelos, y devuelve una fila por operación que toca la
 * base. Sin `fs`, sin `process`, sin `RAIZ`.
 *
 * **Por qué el AST y no texto.** `PENDING_IMPLEMENTATIONS/007`. El troceo por
 * expresiones regulares reconocía *formas escritas*, y cada vez que falló, falló
 * igual: **descarte silencioso** (la operación no existe) o **identidad falsa**
 * (existe con el nombre de otra cosa, y cuadra en todos los recuentos). La
 * enumeración no converge: el siguiente método, el siguiente alias del cliente,
 * la siguiente forma de declarar vuelven a fallar del mismo modo. Un nodo no se
 * enumera.
 *
 * `ts.createSourceFile` es **sólo sintaxis** — sin `Program` ni comprobador de
 * tipos, así que no hay coste de resolución y `typescript` ya es dependencia.
 *
 * **Lo que cierra, medido el 2026-10-04 contra `origin/main` = `966ada98d1`:**
 * seis operaciones invisibles porque su cliente se llama `db`; tres promovidas
 * a «guardia directo» por **un comentario**; y las formas que el troceo por
 * `^` no podía ver (método de clase, declaración indentada, `export default`
 * sin nombre), que hoy tienen cero apariciones y quedan como red.
 *
 * **Lo que NO arregla, y conviene no confundirlo.** Que el guardia sea el
 * **debido**: un `requireLotAccess` con el permiso equivocado pasa con cualquier
 * AST — es la ficha `005`. Y la **identidad del símbolo** del guardia:
 * `require\w*(Access|Admin|Override)` sigue siendo una convención de nombres, y
 * sólo la cierra el escalón 2 (comprobador de tipos), que es decisión del dueño
 * por su coste en CI.
 */
import ts from "typescript";

/**
 * **Ya no se exporta ninguna expresión regular con `/g`, y es deliberado.** El
 * CLI preguntaba «¿este archivo autoriza?» con `GUARDIAS.test(texto)`, y eso
 * tenía dos defectos medidos el 2026-10-04:
 *
 * - **`lastIndex`.** Un `/g` guarda estado, y el `filter` de `--llamadores`
 *   reponía el `lastIndex` **después** del recorrido entero, así que a partir
 *   del segundo llamador la búsqueda arrancaba a mitad del archivo: **46 → 42**
 *   operaciones «necesitan juicio humano», y las cuatro que cambiaban imprimían
 *   `MIRAR` encima de una lista de llamadores **todos en ✓**. Reponer el
 *   `lastIndex` a mano deja la trampa armada para el siguiente `.test()`; lo que
 *   se arregla es no exponer la regex.
 * - **El texto.** `app/lots/[id]/page.tsx` salía «autoriza» por un **comentario**
 *   de su línea 520 que nombra `requireLotAccess("view", …)`. Un comentario no
 *   es una llamada.
 *
 * En su lugar se exportan las dos preguntas ya resueltas sobre el árbol.
 */

/** La misma convención, anclada al nombre: un nodo ya trae el nombre aislado. */
const GUARDIA = /^(?:require[A-Z]\w*(?:Access|Admin|Override)|can|resolvedPermissionKeys|permissionKeysAnywhere)$/;

/** `resolveLotVisibility(userAccountId)` y familia: el `where` sale del alcance. */
const RESOLUTOR = /^resolve\w*Visibility$/;

/**
 * Los métodos de Prisma. Siguen enumerados —son una API cerrada y conocida— pero
 * ahora son un `Set` sobre el nombre de un nodo, así que la trampa de
 * `findUniqueOrThrow` contra `findUnique\b` **no puede repetirse**: un nombre de
 * nodo casa entero o no casa.
 */
const METODOS = new Set([
  "findMany", "findFirstOrThrow", "findFirst", "findUniqueOrThrow", "findUnique",
  "createManyAndReturn", "createMany", "create", "updateManyAndReturn", "updateMany",
  "update", "upsert", "deleteMany", "delete", "count", "aggregate", "groupBy",
]);

/** El SQL crudo no tiene modelo que capturar, y es el que más importa ver. */
const CRUDO = /^\$(?:query|execute)Raw(?:Unsafe)?$/;

function arbol(archivo, texto) {
  return ts.createSourceFile(
    archivo,
    texto,
    ts.ScriptTarget.Latest,
    true,
    archivo.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
}

/**
 * Las unidades de un archivo: `function`, `const`, **método de clase** y
 * `export default` sin nombre.
 *
 * Ya no hay «corte hasta la siguiente declaración de nivel superior», y con él
 * desaparecen las dos familias a la vez: el cuerpo de una unidad es su
 * **subárbol**, no un fragmento de texto entre dos coincidencias. El troceo
 * viejo usaba `^` con `m`, así que una declaración indentada no existía y una
 * sin nombre dejaba sus consultas atribuidas a la constante de al lado.
 *
 * `ts.getCombinedModifierFlags` sobre una `VariableDeclaration` sube sola hasta
 * su `VariableStatement` — eso es lo que significa «Combined»; no hay que buscar
 * el padre a mano.
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

/**
 * Un acceso es `<cualquier receptor>.<modelo>.<método>(`, con el modelo en la
 * lista que declara el esquema.
 *
 * Eso es lo que cierra el descarte silencioso: el receptor puede llamarse `db`,
 * `cliente`, `this.db` o ser `(tx ?? prisma)` — da igual, porque lo que se
 * reconoce es el **modelo**, que sí tiene una autoridad (`prisma/schema.prisma`)
 * en vez de una lista escrita a mano. La enumeración `prisma|aiPrisma|tx|client`
 * dejó seis operaciones fuera del inventario, entre ellas
 * `ubicacionesEmparentadas`.
 *
 * **`$queryRaw` es casi siempre un tagged template, NO una llamada.** Medido el
 * 2026-10-04: las **17** del árbol son tagged templates y **ninguna** es una
 * `CallExpression`. Un recorrido que sólo mire `n.expression` las pierde todas,
 * o sea comete el descarte silencioso que este archivo existe para cerrar. Por
 * eso se mira también `n.tag`.
 */
function accesos(nodo, modelos) {
  const vistos = new Set();
  let crudo = false;
  const mirar = (callee) => {
    if (!callee || !ts.isPropertyAccessExpression(callee)) return;
    const metodo = callee.name.text;
    if (CRUDO.test(metodo)) { crudo = true; return; }
    if (!METODOS.has(metodo)) return;
    const recv = callee.expression;
    if (ts.isPropertyAccessExpression(recv) && modelos.has(recv.name.text)) vistos.add(recv.name.text);
  };
  (function walk(n) {
    if (ts.isCallExpression(n)) mirar(n.expression);
    else if (ts.isTaggedTemplateExpression(n)) mirar(n.tag);
    ts.forEachChild(n, walk);
  })(nodo);
  const lista = [...vistos];
  // `SQL-crudo` va al final, como en la versión de texto.
  if (crudo) lista.push("SQL-crudo");
  return lista;
}

/** Los nombres que una unidad invoca. Un comentario no invoca nada. */
function llamadas(nodo) {
  const ns = new Set();
  (function walk(n) {
    const t = ts.isCallExpression(n) ? n.expression : ts.isTaggedTemplateExpression(n) ? n.tag : null;
    if (t) {
      if (ts.isIdentifier(t)) ns.add(t.text);
      else if (ts.isPropertyAccessExpression(t)) ns.add(t.name.text);
    }
    ts.forEachChild(n, walk);
  })(nodo);
  return ns;
}

/**
 * ¿Aparece ese identificador en el subárbol? Un comentario **no** es un
 * identificador, y ahí está el quinto caso de la ficha:
 * `irregularidadesOfrecidas()` no tiene un solo argumento y se clasificó
 * «recibe principal» porque el comentario de la función de abajo decía «No
 * recibe `userAccountId`». Con nodos, la prosa no puede votar.
 */
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
 * Acotado por construcción: hay un `where` cuyo valor usa el principal, así que
 * la consulta no puede devolver lo ajeno.
 *
 * El detector de texto usaba `/where:\s*\{[^}]*userAccountId/s`, y `[^}]*` **no
 * puede cruzar una llave**: un `where: { assignment: { some: {…} }, userAccountId }`
 * no casaba. Sobre el árbol la anidación deja de ser un problema.
 *
 * **Sólo cuenta dentro de un `where`.** Hubo una segunda regla que casaba
 * cualquier línea terminada en `userAccountId,`, y eso son sobre todo **sellos
 * de actor** (`createdBy: userAccountId`): firmar una escritura no es filtrar
 * una lectura. Medido el 2026-09-21: 14 operaciones eran «acotadas» sólo por esa
 * regla y **ninguna** filtraba por el principal.
 */
function acotadoPorElPrincipal(nodo) {
  let si = false;
  (function walk(n) {
    if (si) return;
    if (
      ts.isPropertyAssignment(n) &&
      ts.isIdentifier(n.name) &&
      n.name.text === "where" &&
      usa(n.initializer, "userAccountId")
    ) { si = true; return; }
    ts.forEachChild(n, walk);
  })(nodo);
  return si;
}

/**
 * Qué nombres entran en un archivo por un `import`. Un guardia de otro archivo
 * cuenta **si está importado aquí**; si no, es una homonimia y no guarda nada.
 *
 * Sustituye a `/import\s*\{([^}]+)\}\s*from\s*"([^"]+)"/g`, que exigía comillas
 * dobles y una sola línea. Y **se salta `import type`**: un tipo no puede
 * guardar nada, así que contarlo como guardia visible era un falso positivo que
 * el texto no podía distinguir.
 */
function importsDe(sf, fuentes, archivo) {
  const deDonde = new Map();
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !st.importClause) continue;
    if (st.importClause.isTypeOnly) continue;
    if (!ts.isStringLiteral(st.moduleSpecifier)) continue;
    const destino = resolver(fuentes, archivo, st.moduleSpecifier.text);
    if (!destino) continue;
    const nb = st.importClause.namedBindings;
    if (!nb || !ts.isNamedImports(nb)) continue;
    for (const el of nb.elements) {
      if (el.isTypeOnly) continue;
      deDonde.set(el.name.text, destino);
    }
  }
  return deDonde;
}

/** Resolución de rutas relativas contra el conjunto de fuentes. */
function resolver(fuentes, archivoOrigen, especificador) {
  if (!especificador.startsWith(".")) return null;
  const partes = archivoOrigen.split("/").slice(0, -1);
  for (const seg of especificador.split("/")) {
    if (seg === "." || seg === "") continue;
    if (seg === "..") partes.pop();
    else partes.push(seg);
  }
  const base = partes.join("/");
  for (const cand of [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
    if (fuentes.has(cand)) return cand;
  }
  return null;
}

/**
 * Una consulta delegada a un ayudante **no exportado** desaparecía entera: lo
 * encontró la revisión independiente del 2026-08-31 y se comprobó por mutación.
 * Una operación exportada **absorbe** a los ayudantes privados que llama,
 * transitivamente; y un ayudante privado con acceso al que no llega ninguna
 * exportada se emite como operación propia, para que tampoco ése se esconda.
 *
 * Sobre el árbol la absorción es una **unión de conjuntos**, no un pegado de
 * texto: deja de depender de que el texto concatenado sea parseable.
 */
function absorber(h, privadas) {
  const acc = new Set(h.accesos);
  const lla = new Set(h.llamadas);
  let usaPrincipal = h.usaPrincipal;
  let acotado = h.acotado;
  let resolutor = h.resolutor;
  const alcanza = new Set([h.nombre]);
  for (let cambio = true; cambio; ) {
    cambio = false;
    for (const [nombre, p] of privadas) {
      if (alcanza.has(nombre)) continue;
      if (!lla.has(nombre)) continue;
      for (const a of p.accesos) acc.add(a);
      for (const l of p.llamadas) lla.add(l);
      usaPrincipal = usaPrincipal || p.usaPrincipal;
      acotado = acotado || p.acotado;
      resolutor = resolutor || p.resolutor;
      alcanza.add(nombre);
      cambio = true;
    }
  }
  // `SQL-crudo` al final, como en la versión de texto.
  const modelos = [...acc].filter((m) => m !== "SQL-crudo");
  if (acc.has("SQL-crudo")) modelos.push("SQL-crudo");
  return { ...h, accesos: modelos, llamadas: lla, usaPrincipal, acotado, resolutor, alcanza };
}

/**
 * `fuentes` es un `Map<ruta, texto>`; `modelos`, lo que devuelve
 * `modelosDelEsquema`. Devuelve una fila por operación con acceso, con los ocho
 * campos que consume el resto del sistema — de los cuales las tres compuertas
 * leen cinco: `archivo`, `nombre`, `clase`, `acotado` y `guardias`.
 */
/**
 * Qué nombres invoca cada archivo, **como nodos**. Sustituye a buscar
 * `\bnombre\s*\(` en el texto, que contaba comentarios y cadenas: medido el
 * 2026-10-04, el texto atribuía **cuatro** llamadores a `listScopeChoices`
 * —`lib/apiary/hives.ts`, `lib/research/access.ts` y su propio archivo— cuando
 * el AST dice que tiene **uno**.
 */
export function invocacionesPorArchivo(fuentes) {
  const out = new Map();
  for (const [archivo, texto] of fuentes) out.set(archivo, llamadas(arbol(archivo, texto)));
  return out;
}

/**
 * Qué archivos autorizan: alguno de sus nodos **llama** al servicio de
 * autorización o a un guardia por convención de nombre.
 *
 * **Lo que esto NO puede ver, y hay que decirlo donde se usa:** una página que
 * autoriza llamando a un servicio que **lanza** un error de acceso y lo
 * convierte en `notFound()`. Medido el 2026-10-04: `app/plots/[id]/page.tsx`,
 * `app/field-sessions/[id]/page.tsx` y `app/lots/[id]/page.tsx` autorizan así y
 * aquí salen como que no. Resolverlo exige seguir la llamada hasta el servicio,
 * o sea el escalón 2 de `PENDING_IMPLEMENTATIONS/007`.
 */
export function archivosQueGuardan(fuentes) {
  const out = new Set();
  for (const [archivo, nombres] of invocacionesPorArchivo(fuentes)) {
    if ([...nombres].some((n) => GUARDIA.test(n))) out.add(archivo);
  }
  return out;
}

export function analizar(fuentes, modelos) {
  const arboles = new Map();
  for (const [archivo, texto] of fuentes) arboles.set(archivo, arbol(archivo, texto));

  const hechosPorArchivo = new Map();
  for (const [archivo, sf] of arboles) {
    const lista = unidades(sf).map((u) => {
      const lla = llamadas(u.nodo);
      return {
        archivo,
        nombre: u.nombre,
        exportada: u.exportada,
        accesos: accesos(u.nodo, modelos),
        llamadas: lla,
        usaPrincipal: usa(u.nodo, "userAccountId"),
        acotado: acotadoPorElPrincipal(u.nodo),
        resolutor: [...lla].some((n) => RESOLUTOR.test(n)),
      };
    });
    hechosPorArchivo.set(archivo, lista);
  }

  /**
   * Qué funciones guardan de verdad — exportadas **o no**, y **por archivo, no
   * global**. Era un `Set` de nombres sueltos de todo el árbol, así que una
   * función llamada como un guardia de cualquier otro archivo promovía la
   * operación a «guardia directo» sin que nada resolviera el símbolo. Lo señaló
   * la revisión independiente del 2026-08-31. Un guardia local guarda en **su**
   * archivo; los que cruzan archivos se reconocen por `import`.
   */
  const guardanPorArchivo = new Map();
  for (const [archivo, lista] of hechosPorArchivo) {
    guardanPorArchivo.set(
      archivo,
      new Set(lista.filter((h) => [...h.llamadas].some((n) => GUARDIA.test(n))).map((h) => h.nombre))
    );
  }

  const importados = new Map();
  for (const [archivo, sf] of arboles) importados.set(archivo, importsDe(sf, fuentes, archivo));

  const guardanVisiblesEn = (archivo) => {
    const propios = guardanPorArchivo.get(archivo) ?? new Set();
    // Un nombre importado cuenta sólo si guarda **en el archivo del que viene**.
    const traidos = [...(importados.get(archivo) ?? new Map())]
      .filter(([nombre, destino]) => (guardanPorArchivo.get(destino) ?? new Set()).has(nombre))
      .map(([nombre]) => nombre);
    return new Set([...propios, ...traidos]);
  };

  const filas = [];
  for (const [archivo, lista] of hechosPorArchivo) {
    const privadas = new Map(lista.filter((h) => !h.exportada).map((h) => [h.nombre, h]));
    const exportadas = lista.filter((h) => h.exportada).map((h) => absorber(h, privadas));
    const alcanzadas = new Set(exportadas.flatMap((o) => [...o.alcanza]));
    const huerfanas = lista
      .filter((h) => !h.exportada && !alcanzadas.has(h.nombre))
      .map((h) => absorber(h, privadas));

    for (const o of [...exportadas, ...huerfanas]) {
      if (o.accesos.length === 0) continue;
      const visibles = guardanVisiblesEn(archivo);
      const propios = [...o.llamadas].filter((n) => GUARDIA.test(n));
      const locales = [...visibles].filter((n) => n !== o.nombre && o.llamadas.has(n));
      const guardias = [...new Set([...propios, ...locales])];
      /**
       * **`transitivo` son los que guardan SIN tener forma de guardia.** Hasta el
       * 2026-10-04 `locales` y `transitivo` eran la misma expresión y `guardias`
       * su unión, así que `transitivo.length > 0` implicaba `guardias.length > 0`
       * y la rama «guardia transitivo» era **inalcanzable por construcción**:
       * medido, 0 operaciones de 618, y el flip la llevaba a 66. Se reportaban
       * «guardia directo», que dice algo distinto de lo que ocurre — ahí nadie
       * llama a un guardia, se llama a algo que guarda. `guardias` sigue siendo
       * la unión porque es el campo que consume
       * `tests/arquitectura/acotado-por-construccion.test.ts`; lo que cambia es
       * cuál de las dos listas decide la clase.
       */
      const transitivo = locales.filter((n) => !GUARDIA.test(n));
      const publica = /discover\/service/.test(archivo);
      // `lib/auth/config.ts` es el flujo de autenticación en sí: corre **antes**
      // de que exista sesión, así que no hay principal contra el que autorizar.
      const preSesion = /actions\/auth|lib\/auth\/config/.test(archivo);
      const firma = /webhooks/.test(archivo);

      /**
       * **`SIN CLASIFICAR` queda inalcanzable, y se dice en vez de taparlo.** En
       * la versión de texto `principal` usaba `\buserAccountId\b` y
       * `dependeDelLlamador` usaba `.includes("userAccountId")` — dos pruebas
       * **distintas**, y el hueco entre ellas era esta clase: una unidad con
       * `actorUserAccountId` y sin `userAccountId` suelto caía aquí. Medido:
       * **0 operaciones** en esa clase, así que el hueco estaba vacío. Con
       * identificadores exactos las dos son complementarias y el hueco se cierra.
       * La rama se conserva porque la Tarea 5 del plan trata justo las clases que
       * no se asignan nunca, y ahí se decide qué hacer con las dos.
       */
      const principal = o.usaPrincipal;
      const dependeDelLlamador = !o.usaPrincipal;

      let clase;
      if (propios.length) clase = "guardia directo";
      else if (transitivo.length) clase = "guardia transitivo";
      else if (o.acotado || o.resolutor) clase = "acotado por construcción";
      else if (publica) clase = "público por diseño";
      else if (preSesion) clase = "previo a la sesión";
      else if (firma) clase = "firma";
      else if (principal) clase = "recibe principal, sin guardia visible";
      else if (dependeDelLlamador) clase = "depende del llamador (verificar a mano)";
      else clase = "SIN CLASIFICAR";

      filas.push({
        archivo,
        nombre: o.nombre,
        cuerpo: undefined,
        modelos: o.accesos,
        guardias,
        principal,
        transitivo,
        acotado: o.acotado || o.resolutor,
        clase,
      });
    }
  }
  return filas;
}
