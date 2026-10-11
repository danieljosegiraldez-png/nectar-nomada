import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Toda ruta que ESCRIBE y acepta el token de un aparato mira si ese aparato
 * está revocado.
 *
 * **Por qué existe.** El access de un aparato se verifica por firma, sin la
 * base, así que el de uno revocado vale hasta que caduca (una hora). El
 * 2026-10-10 se midió que dos rutas de escritura por token no lo miraban:
 * `field-media` firmaba subidas y creaba fotos, y `POST /api/v1/devices` daba de
 * alta otros aparatos. Se arreglaron llamando a `negativaDelAparato`, y Daniel
 * decidió ese día que la comprobación fuera OBLIGATORIA para cualquier ruta
 * nueva, no una frase del docstring de `lib/sync/deviceTokens.ts`.
 *
 * **Qué rutas mira.** Todo `app/**​/route.{ts,tsx,js,jsx,mjs}` que IMPORTA
 * `resolverPrincipal` —con el nombre que sea—, y de él cada handler exportado
 * POST/PUT/PATCH/DELETE. Se dispara por la importación y no por encontrar la
 * llamada, para que una forma que el detector no sepa leer no lo deje callado:
 * un handler envuelto (`withX(handler)`), reexportado o desestructurado sale
 * como NO ANALIZABLE y la compuerta falla. Lo mismo un archivo que importe
 * `interpretarAutorizacion` o `verificarAccess`, el carril del token sin pasar
 * por `resolverPrincipal`. Y la última prueba cierra el mundo: fuera de las
 * rutas y de sus dos módulos, nadie llama a esas tres funciones —un ayudante
 * que envolviera `resolverPrincipal` sería un camino que este archivo no ve—.
 *
 * **Qué cuenta como «mirar»: una forma canónica, a propósito estrecha.**
 * En el nivel superior del cuerpo del handler:
 *
 *     const user = await resolverPrincipal(request);
 *     …
 *     const negativa = await negativaDelAparato(user.deviceId);
 *     if (negativa) return Response.json({ error: negativa }, { status: 403 });
 *
 * o `if (await negativaDelAparato(user.deviceId)) return …`. Y antes de ese `if`
 * no se espera nada más que `resolverPrincipal`. Lo que la revisión del
 * 2026-10-11 (Codex y tres revisores) encontró aceptado por la versión anterior,
 * y que ésta rechaza: `negativaDelAparato(null)` o con el `deviceId` del cuerpo,
 * `if (!negativa)`, una condición compuesta o comparada con un código, un
 * `return` que sólo vive en una función anidada, la comprobación dentro de una
 * función que nadie llama, y la comprobación después de escribir.
 *
 * **Lo que rechaza siendo correcto, dicho para no exentar por comodidad:** un
 * `throw` en vez de `return`, un ternario, `Promise.all`. Ante eso, se escribe
 * la forma canónica; la excepción es para una ruta que no necesita la
 * comprobación, no para una que la escribe distinto.
 *
 * **Lo que NO ve:**
 * - una escritura que no se espera (`void escribir()`) antes de la comprobación;
 * - que el `return` devuelva un 403 —sólo que devuelve—;
 * - que `negativaDelAparato` haga bien su trabajo: eso lo prueba en conducta
 *   `tests/sync/aparatoDelToken.test.ts`.
 *
 * Hermético: sólo lee archivos. Lee la fuente con `ts.createSourceFile`, como
 * `scripts/inventario/analizar.mjs`, para que un comentario no cuente.
 */

const RAIZ = new URL("../..", import.meta.url).pathname;
const METODOS_DE_ESCRITURA = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const CARRIL_SIN_RESOLVER = ["interpretarAutorizacion", "verificarAccess"];

/**
 * Rutas de escritura por token que no llaman a `negativaDelAparato` y no lo
 * necesitan, cada una con su razón. Si una deja de necesitarlo, o se borra, la
 * excepción falla y hay que quitarla.
 */
const EXENTAS: Record<string, string> = {
  "app/api/v1/sync/field-events/route.ts:POST":
    "Su servicio, `pushFieldEvents`, comprueba `revokedAt` del aparato del lote antes de escribir, y la " +
    "ruta exige que ese aparato sea el del token (`device_mismatch`). Una segunda consulta sería la misma " +
    "pregunta dos veces. Lo vigilan en conducta, en el carril con base: tests/sync/aparatoDelToken.test.ts " +
    "(«field-events: el aparato revocado con su propio id tampoco escribe», que con el cuerpo casado con el " +
    "token sólo puede pararlo `pushFieldEvents`) y tests/sync/pushFieldEvents.test.ts («un dispositivo " +
    "revocado no escribe nada, y el lote entero se niega»).",
};

type Resultado = { metodo: string; mira: boolean; motivo?: string };

const recorrer = (nodo: ts.Node, visitar: (n: ts.Node) => void): void => {
  visitar(nodo);
  ts.forEachChild(nodo, (hijo) => recorrer(hijo, visitar));
};

/** Recorre sin entrar en funciones anidadas: lo que se ejecuta en ESTE cuerpo. */
const recorrerSinAnidar = (nodo: ts.Node, visitar: (n: ts.Node) => void): void => {
  visitar(nodo);
  ts.forEachChild(nodo, (hijo) => { if (!ts.isFunctionLike(hijo)) recorrerSinAnidar(hijo, visitar); });
};

const sinEnvoltorio = (e: ts.Expression): ts.Expression => {
  let x = e;
  while (ts.isParenthesizedExpression(x) || ts.isAsExpression(x) || ts.isNonNullExpression(x) ||
         ts.isSatisfiesExpression(x)) x = x.expression;
  return x;
};

/** Nombres locales con que el archivo importa cada símbolo, alias incluidos. */
function importados(fuente: ts.SourceFile): Map<string, Set<string>> {
  const nombres = new Map<string, Set<string>>();
  for (const st of fuente.statements) {
    const enlaces = ts.isImportDeclaration(st) ? st.importClause?.namedBindings : undefined;
    if (!enlaces || !ts.isNamedImports(enlaces)) continue;
    for (const el of enlaces.elements) {
      const original = (el.propertyName ?? el.name).text;
      if (!nombres.has(original)) nombres.set(original, new Set());
      nombres.get(original)!.add(el.name.text);
    }
  }
  return nombres;
}

const llamaA = (nodo: ts.Node, nombres: Set<string>): nodo is ts.CallExpression =>
  ts.isCallExpression(nodo) && ts.isIdentifier(nodo.expression) && nombres.has(nodo.expression.text);

const esperaA = (e: ts.Expression | undefined, nombres: Set<string>): ts.CallExpression | null => {
  if (!e) return null;
  const x = sinEnvoltorio(e);
  if (!ts.isAwaitExpression(x)) return null;
  const llamada = sinEnvoltorio(x.expression);
  return llamaA(llamada, nombres) ? llamada : null;
};

type Handler = { metodo: string; funcion?: ts.FunctionLikeDeclaration; motivo?: string };

const funcionDe = (nodo: ts.Node | undefined): ts.FunctionLikeDeclaration | undefined => {
  if (!nodo) return undefined;
  if (ts.isFunctionDeclaration(nodo)) return nodo;
  if (ts.isVariableDeclaration(nodo) && nodo.initializer) {
    const v = sinEnvoltorio(nodo.initializer);
    if (ts.isArrowFunction(v) || ts.isFunctionExpression(v)) return v;
  }
  return undefined;
};

/** Cada handler de escritura exportado, de cualquier forma; si no se puede leer, con su motivo. */
function handlersDeEscritura(fuente: ts.SourceFile): Handler[] {
  const locales = new Map<string, ts.Node>();
  for (const st of fuente.statements) {
    if (ts.isFunctionDeclaration(st) && st.name) locales.set(st.name.text, st);
    if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name)) locales.set(d.name.text, d);
    }
  }
  const exportado = (st: ts.Statement) =>
    ts.canHaveModifiers(st) && (ts.getModifiers(st) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

  const salida: Handler[] = [];
  const conFuncion = (metodo: string, nodo: ts.Node | undefined, comoNoSeLee: string) => {
    const funcion = funcionDe(nodo);
    salida.push(funcion ? { metodo, funcion } : { metodo, motivo: comoNoSeLee });
  };
  for (const st of fuente.statements) {
    if (ts.isFunctionDeclaration(st) && exportado(st) && st.name && METODOS_DE_ESCRITURA.has(st.name.text)) {
      conFuncion(st.name.text, st, "sin cuerpo");
    }
    if (ts.isVariableStatement(st) && exportado(st)) {
      for (const d of st.declarationList.declarations) {
        if (ts.isIdentifier(d.name)) {
          if (METODOS_DE_ESCRITURA.has(d.name.text)) {
            conFuncion(d.name.text, d, "no analizable: el handler no es una función escrita aquí (¿envuelto?)");
          }
        } else {
          for (const el of d.name.elements) {
            if (ts.isBindingElement(el) && ts.isIdentifier(el.name) && METODOS_DE_ESCRITURA.has(el.name.text)) {
              salida.push({ metodo: el.name.text, motivo: "no analizable: handler desestructurado" });
            }
          }
        }
      }
    }
    if (ts.isExportDeclaration(st)) {
      if (!st.exportClause) {
        salida.push({ metodo: "*", motivo: "no analizable: `export *` puede traer handlers de otro módulo" });
        continue;
      }
      if (!ts.isNamedExports(st.exportClause)) continue;
      for (const el of st.exportClause.elements) {
        if (!METODOS_DE_ESCRITURA.has(el.name.text)) continue;
        if (st.moduleSpecifier) {
          salida.push({ metodo: el.name.text, motivo: "no analizable: reexportado de otro módulo" });
        } else {
          conFuncion(el.name.text, locales.get((el.propertyName ?? el.name).text),
            "no analizable: el handler no es una función escrita aquí (¿envuelto?)");
        }
      }
    }
  }
  return salida;
}

/** La forma canónica de negar al aparato revocado; `null` si está, el motivo si no. */
function porQueNoNiega(funcion: ts.FunctionLikeDeclaration, resolver: Set<string>, negativa: Set<string>): string | null {
  if (!funcion.body || !ts.isBlock(funcion.body)) return "el cuerpo no es un bloque";
  const sentencias = funcion.body.statements;

  // Los principales: `const user = await resolverPrincipal(…)` en el nivel superior.
  const principales = new Set<string>();
  // Las variables con la negativa: `const negativa = await negativaDelAparato(user.deviceId)`.
  const variables = new Set<string>();
  const argumentoEsDelPrincipal = (llamada: ts.CallExpression) => {
    if (llamada.arguments.length !== 1) return false;
    const a = sinEnvoltorio(llamada.arguments[0]!);
    return ts.isPropertyAccessExpression(a) && a.name.text === "deviceId" &&
      ts.isIdentifier(a.expression) && principales.has(a.expression.text);
  };
  const devuelveYa = (s: ts.Statement) =>
    ts.isReturnStatement(s) || (ts.isBlock(s) && s.statements.some(ts.isReturnStatement));

  let llamadaConOtroArgumento = false;
  for (const s of sentencias) {
    if (ts.isVariableStatement(s) && (s.declarationList.flags & ts.NodeFlags.Const)) {
      for (const d of s.declarationList.declarations) {
        if (!ts.isIdentifier(d.name)) continue;
        if (esperaA(d.initializer, resolver)) principales.add(d.name.text);
        const llamada = esperaA(d.initializer, negativa);
        if (llamada) {
          if (argumentoEsDelPrincipal(llamada)) variables.add(d.name.text);
          else llamadaConOtroArgumento = true;
        }
      }
    }
    if (ts.isIfStatement(s) && devuelveYa(s.thenStatement)) {
      const cond = sinEnvoltorio(s.expression);
      const directa = esperaA(cond, negativa);
      if (directa && !argumentoEsDelPrincipal(directa)) llamadaConOtroArgumento = true;
      if ((ts.isIdentifier(cond) && variables.has(cond.text)) || (directa && argumentoEsDelPrincipal(directa))) {
        return null;
      }
    }
    // Antes de la negación no se espera nada más que al principal y a la propia negativa.
    let esperaOtraCosa = false;
    recorrerSinAnidar(s, (n) => {
      if (ts.isAwaitExpression(n) && !esperaA(n, resolver) && !esperaA(n, negativa)) esperaOtraCosa = true;
    });
    if (esperaOtraCosa) return "antes de negar al revocado ya se espera otra cosa (¿se escribe antes de mirar?)";
  }
  return llamadaConOtroArgumento
    ? "`negativaDelAparato` no recibe el `deviceId` del principal"
    : "no hay `if (negativa) return …` en el nivel superior del handler";
}

/** Para un archivo de ruta: cada handler de escritura del carril del token, y si niega al revocado. */
function escriturasPorToken(texto: string, nombre = "route.ts"): Resultado[] {
  const tipo = /\.(tsx|jsx)$/.test(nombre) ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const fuente = ts.createSourceFile(nombre, texto, ts.ScriptTarget.Latest, true, tipo);
  const nombres = importados(fuente);
  if (CARRIL_SIN_RESOLVER.some((n) => nombres.has(n))) {
    return [{ metodo: "*", mira: false, motivo: "no analizable: usa el carril del token sin `resolverPrincipal`" }];
  }
  const resolver = nombres.get("resolverPrincipal");
  if (!resolver) return [];
  const negativa = nombres.get("negativaDelAparato") ?? new Set<string>();
  return handlersDeEscritura(fuente).map((h) => {
    if (!h.funcion) return { metodo: h.metodo, mira: false, motivo: h.motivo };
    const motivo = porQueNoNiega(h.funcion, resolver, negativa);
    return motivo ? { metodo: h.metodo, mira: false, motivo } : { metodo: h.metodo, mira: true };
  });
}

/** Quién llama a las tres funciones del carril del token, por nombre original, alias incluidos. */
function llamadasAlCarril(texto: string, nombre: string): string[] {
  const fuente = ts.createSourceFile(nombre, texto, ts.ScriptTarget.Latest, true);
  const nombres = importados(fuente);
  const locales = new Map<string, string>();
  for (const original of ["resolverPrincipal", ...CARRIL_SIN_RESOLVER]) {
    locales.set(original, original); // llamada desde el propio módulo que la define
    for (const local of nombres.get(original) ?? []) locales.set(local, original);
  }
  const salida: string[] = [];
  recorrer(fuente, (n) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && locales.has(n.expression.text)) {
      salida.push(locales.get(n.expression.text)!);
    }
  });
  return salida;
}

const archivos = (dir: string, acepta: RegExp): string[] => {
  const salida: string[] = [];
  for (const entrada of readdirSync(dir)) {
    if (entrada === "node_modules" || entrada.startsWith(".")) continue;
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) salida.push(...archivos(ruta, acepta));
    else if (acepta.test(entrada)) salida.push(ruta);
  }
  return salida;
};
const ES_RUTA = /^route\.(ts|tsx|js|jsx|mjs)$/;

const IMPORTS = `
  import { resolverPrincipal } from "../../../../lib/sync/requestPrincipal";
  import { negativaDelAparato } from "../../../../lib/sync/deviceTokens";`;
const ruta = (cuerpo: string) => `${IMPORTS}\n${cuerpo}`;
const post = (cuerpo: string) => ruta(`export async function POST(request: Request) {\n${cuerpo}\n}`);
const PRINCIPAL = `
  const user = await resolverPrincipal(request);
  if (!user) return Response.json({ error: "not_authenticated" }, { status: 401 });`;
const NIEGA = `
  const negativa = await negativaDelAparato(user.deviceId);
  if (negativa) return Response.json({ error: negativa }, { status: 403 });`;
const mira = (texto: string) => escriturasPorToken(texto).map(({ metodo, mira }) => ({ metodo, mira }));

describe("el detector, con formas que SÍ niegan", () => {
  it("la forma de las rutas de hoy", () => {
    expect(mira(post(`${PRINCIPAL}${NIEGA}\n  return escribir(await request.json());`)))
      .toEqual([{ metodo: "POST", mira: true }]);
  });

  it("la forma directa, el bloque, y el resultado entre paréntesis o con `as`", () => {
    expect(mira(post(`${PRINCIPAL}
      if (await negativaDelAparato(user.deviceId)) { return new Response(null, { status: 403 }); }`)))
      .toEqual([{ metodo: "POST", mira: true }]);
    expect(mira(post(`${PRINCIPAL}
      const negativa = (await negativaDelAparato(user.deviceId)) as string | null;
      if ((negativa)) return new Response(null, { status: 403 });`)))
      .toEqual([{ metodo: "POST", mira: true }]);
  });

  it("con alias en las importaciones", () => {
    expect(mira(`
      import { resolverPrincipal as quien } from "x";
      import { negativaDelAparato as vetado } from "y";
      export async function PUT(request: Request) {
        const yo = await quien(request);
        const no = await vetado(yo.deviceId);
        if (no) return new Response(null, { status: 403 });
      }`)).toEqual([{ metodo: "PUT", mira: true }]);
  });

  it("exportado en una lista, con o sin cambio de nombre", () => {
    expect(mira(ruta(`
      async function POST(request: Request) {${PRINCIPAL}${NIEGA} }
      const borrar = async (request: Request) => {${PRINCIPAL}${NIEGA} };
      export { POST, borrar as DELETE };`)))
      .toEqual([{ metodo: "POST", mira: true }, { metodo: "DELETE", mira: true }]);
  });
});

describe("el detector, con formas que NO niegan", () => {
  const noNiega = (texto: string, metodo = "POST") => expect(mira(texto)).toEqual([{ metodo, mira: false }]);

  it("sin la llamada", () => noNiega(post(`${PRINCIPAL}\n  return escribir();`)));

  it("el nombre en un comentario o en una cadena no es una llamada", () => noNiega(post(`${PRINCIPAL}
    // const negativa = await negativaDelAparato(user.deviceId); if (negativa) return x;
    if (user) return Response.json({ nota: "negativaDelAparato(user.deviceId)" });`)));

  it("llamarla y no usar lo que devuelve", () => noNiega(post(`${PRINCIPAL}
    await negativaDelAparato(user.deviceId);
    const negativa = await negativaDelAparato(user.deviceId);
    void negativa;
    return escribir();`)));

  it("un if que no devuelve", () => noNiega(post(`${PRINCIPAL}
    const negativa = await negativaDelAparato(user.deviceId);
    if (negativa) console.warn(negativa);
    return escribir();`)));

  // Sin ninguna otra espera delante, para que lo que lo rechace sea el argumento
  // y no la regla del orden: por eso se afirma también el motivo.
  it("con otro aparato que el del principal: null, el del cuerpo o una constante", () => {
    for (const arg of ["null", "body.deviceId", "otro.deviceId", "user.id"]) {
      const r = escriturasPorToken(post(`${PRINCIPAL}
        const body = { deviceId: "x" }; const otro = { deviceId: null };
        const negativa = await negativaDelAparato(${arg});
        if (negativa) return new Response(null, { status: 403 });
        return escribir();`));
      expect(r, arg).toEqual([{ metodo: "POST", mira: false, motivo: "`negativaDelAparato` no recibe el `deviceId` del principal" }]);
    }
  });

  it("con la polaridad al revés, comparada con un código, o compuesta", () => {
    for (const cond of ["!negativa", 'negativa === "device_not_found"', "negativa && estricto", "cfg.negativa"]) {
      noNiega(post(`${PRINCIPAL}
        const estricto = false; const cfg = { negativa: null };
        const negativa = await negativaDelAparato(user.deviceId);
        if (${cond}) return new Response(null, { status: 403 });
        return escribir();`));
    }
  });

  it("con `let`, que se puede pisar antes del if", () => noNiega(post(`${PRINCIPAL}
    let negativa = await negativaDelAparato(user.deviceId);
    negativa = null;
    if (negativa) return new Response(null, { status: 403 });
    return escribir();`)));

  it("con el return sólo dentro de una función anidada, o la comprobación en una que nadie llama", () => {
    noNiega(post(`${PRINCIPAL}
      const negativa = await negativaDelAparato(user.deviceId);
      if (negativa) { const f = () => { return 403; }; }
      return escribir();`));
    noNiega(post(`${PRINCIPAL}
      const nunca = async () => { const n = await negativaDelAparato(user.deviceId); if (n) return 403; };
      return escribir();`));
  });

  it("con la comprobación DESPUÉS de escribir", () => noNiega(post(`${PRINCIPAL}
    await escribir(await request.json());
    ${NIEGA}
    return Response.json({ ok: true });`)));

  it("con la comprobación sólo en el GET del mismo archivo", () => {
    expect(mira(ruta(`
      export async function GET(request: Request) {${PRINCIPAL}${NIEGA} }
      export async function POST(request: Request) {${PRINCIPAL}\n return escribir(); }`)))
      .toEqual([{ metodo: "POST", mira: false }]);
  });

  it("todos los métodos de escritura entran, de cualquier forma de declararlos", () => {
    noNiega(ruta(`export async function PUT(request: Request) {${PRINCIPAL}\n return escribir(); }`), "PUT");
    noNiega(ruta(`export async function DELETE(request: Request) {${PRINCIPAL}\n return escribir(); }`), "DELETE");
    noNiega(ruta(`export const PATCH = async (request: Request) => {${PRINCIPAL}\n return escribir(); };`), "PATCH");
  });
});

describe("el detector, con formas que no sabe leer: fallan en vez de callar", () => {
  const noAnalizable = (texto: string, metodo = "POST") => {
    const r = escriturasPorToken(texto);
    expect(r.map(({ metodo, mira }) => ({ metodo, mira }))).toEqual([{ metodo, mira: false }]);
    expect(r[0]!.motivo).toMatch(/^no analizable/);
  };

  it("un handler envuelto", () => noAnalizable(ruta(`
    const handler = async (request: Request) => {${PRINCIPAL}${NIEGA} };
    export const POST = withX(handler);`)));

  it("reexportado o traído con `export *`", () => {
    noAnalizable(ruta(`export { POST } from "./otro";`));
    noAnalizable(ruta(`export * from "./otro";`), "*");
  });

  it("desestructurado", () => noAnalizable(ruta(`export const { POST } = fabricar();`)));

  it("el carril del token sin pasar por resolverPrincipal", () => noAnalizable(`
    import { interpretarAutorizacion } from "../../../../lib/sync/deviceTokens";
    export async function POST(request: Request) { return escribir(interpretarAutorizacion(null)); }`, "*"));
});

describe("el detector, con lo que no es suyo", () => {
  it("una lectura, un POST sin token, o un POST que no se exporta, no entran", () => {
    expect(mira(ruta(`
      export async function GET(request: Request) {${PRINCIPAL}\n return leer(); }
      async function POST(request: Request) {${PRINCIPAL}\n return escribir(); }`))).toEqual([]);
    expect(mira(`
      import { getCurrentUser } from "x";
      export async function POST() { const u = await getCurrentUser(); return escribir(u); }`)).toEqual([]);
  });
});

describe("el árbol: toda escritura por token mira la revocación", () => {
  const rutas = archivos(join(RAIZ, "app"), ES_RUTA);
  const encontradas = new Map<string, Resultado>();
  for (const archivo of rutas) {
    for (const r of escriturasPorToken(readFileSync(archivo, "utf8"), archivo)) {
      encontradas.set(`${relative(RAIZ, archivo)}:${r.metodo}`, r);
    }
  }

  // Control positivo: si el detector dejara de ver las formas que existen, la
  // lista saldría vacía y «ninguna incumple» se leería igual que «no miré».
  it("control: encuentra las rutas de escritura por token que se sabe que existen", () => {
    expect([...encontradas.keys()]).toEqual(expect.arrayContaining([
      "app/api/v1/devices/route.ts:POST",
      "app/api/v1/sync/field-events/route.ts:POST",
      "app/api/v1/sync/field-media/route.ts:POST",
    ]));
  });

  it("ninguna escribe sin mirar, salvo las exentas con su razón", () => {
    const sinMirar = [...encontradas]
      .filter(([k, r]) => !r.mira && !(k in EXENTAS))
      .map(([k, r]) => `${k} — ${r.motivo}`);
    expect(sinMirar, "Escribe la forma canónica de la cabecera; exentar es sólo para una ruta que no la necesita")
      .toEqual([]);
  });

  it("no quedan excepciones que ya no hacen falta", () => {
    const sobran = Object.keys(EXENTAS).filter((k) => encontradas.get(k)?.mira !== false);
    expect(sobran, "La ruta ya mira, o ya no existe: bórrala de EXENTAS").toEqual([]);
  });

  it("nadie fuera de las rutas llama al carril del token: un ayudante sería un camino que esto no ve", () => {
    // Los dos módulos del carril se llaman entre ellos: `requestPrincipal.ts`
    // usa `interpretarAutorizacion`, y ésta usa `verificarAccess`.
    const PROPIOS = new Set(["lib/sync/requestPrincipal.ts", "lib/sync/deviceTokens.ts"]);
    const enRutas: string[] = [];
    const fuera: string[] = [];
    for (const archivo of [...archivos(join(RAIZ, "app"), /\.(ts|tsx|js|jsx|mjs)$/),
                           ...archivos(join(RAIZ, "lib"), /\.(ts|tsx|js|jsx|mjs)$/)]) {
      const rel = relative(RAIZ, archivo);
      const llamadas = llamadasAlCarril(readFileSync(archivo, "utf8"), archivo);
      if (!llamadas.length) continue;
      if (ES_RUTA.test(rel.split("/").pop()!)) enRutas.push(rel);
      else if (!PROPIOS.has(rel)) fuera.push(`${rel}: ${llamadas.join(", ")}`);
    }
    // Control: el recorrido ve las cinco rutas que hoy llaman a resolverPrincipal.
    expect(enRutas.length).toBeGreaterThanOrEqual(5);
    expect(fuera).toEqual([]);
  });
});
