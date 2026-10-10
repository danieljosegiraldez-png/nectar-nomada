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
 * **Qué cuenta como «mirar».** Llamar a `negativaDelAparato` y que su resultado
 * gobierne un `if` con un `return` dentro. Llamarla y no usar lo que devuelve no
 * niega nada. Por eso los casos hostiles incluyen el resultado ignorado, el
 * `void`, el nombre sólo en un comentario o una cadena, y la comprobación hecha
 * en otro handler del mismo archivo.
 *
 * **Cómo se lee la fuente.** Con `ts.createSourceFile`, sólo sintaxis, como
 * `scripts/inventario/analizar.mjs`, y por la misma razón: un comentario no es
 * una llamada.
 *
 * **Lo que NO ve, dicho como límite:**
 * - que la comprobación vaya ANTES de la escritura. Eso lo prueba en conducta
 *   `tests/sync/aparatoDelToken.test.ts` para las rutas de hoy;
 * - un handler exportado de otra forma que `export (async) function POST` o
 *   `export const POST = …` con el cuerpo dentro (por ejemplo, envuelto en
 *   `withX(handler)`, o reexportado). Hoy hay cero rutas así; el control
 *   positivo de abajo sólo dice que el detector no se quedó ciego con las que
 *   existen;
 * - `resolverPrincipal` o `negativaDelAparato` importados con otro nombre.
 *
 * Hermético: sólo lee archivos.
 */

const RAIZ = new URL("../..", import.meta.url).pathname;
const METODOS_DE_ESCRITURA = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Rutas de escritura por token que no llaman a `negativaDelAparato` y no lo
 * necesitan, cada una con su razón. Si una deja de necesitarlo, o se borra, la
 * excepción falla y hay que quitarla.
 */
const EXENTAS: Record<string, string> = {
  "app/api/v1/sync/field-events/route.ts:POST":
    "Su servicio, `pushFieldEvents`, comprueba `revokedAt` del aparato del lote, y la ruta exige que ese " +
    "aparato sea el del token (`device_mismatch`). Una segunda consulta aquí sería la misma pregunta dos " +
    "veces. Lo vigila en conducta `tests/sync/aparatoDelToken.test.ts` («un token de aparato REVOCADO no " +
    "escribe aunque el cuerpo nombre a otro aparato vivo»).",
};

const recorrer = (nodo: ts.Node, visitar: (n: ts.Node) => void): void => {
  visitar(nodo);
  ts.forEachChild(nodo, (hijo) => recorrer(hijo, visitar));
};

const llamaA = (nodo: ts.Node, nombre: string): boolean =>
  ts.isCallExpression(nodo) && ts.isIdentifier(nodo.expression) && nodo.expression.text === nombre;

const contiene = (raiz: ts.Node, cumple: (n: ts.Node) => boolean): boolean => {
  let hay = false;
  recorrer(raiz, (n) => { if (cumple(n)) hay = true; });
  return hay;
};

/** Los handlers de escritura exportados de un archivo de ruta, con su cuerpo. */
function handlersDeEscritura(fuente: ts.SourceFile): { metodo: string; cuerpo: ts.Node }[] {
  const salida: { metodo: string; cuerpo: ts.Node }[] = [];
  for (const st of fuente.statements) {
    const exportado = ts.canHaveModifiers(st) &&
      (ts.getModifiers(st) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (!exportado) continue;
    if (ts.isFunctionDeclaration(st) && st.name && METODOS_DE_ESCRITURA.has(st.name.text) && st.body) {
      salida.push({ metodo: st.name.text, cuerpo: st.body });
    }
    if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && METODOS_DE_ESCRITURA.has(d.name.text) && d.initializer) {
          salida.push({ metodo: d.name.text, cuerpo: d.initializer });
        }
      }
    }
  }
  return salida;
}

/** ¿Gobierna el resultado de `negativaDelAparato` un `if` que devuelve? */
function niegaAlRevocado(cuerpo: ts.Node): boolean {
  const variables = new Set<string>();
  recorrer(cuerpo, (n) => {
    if (!ts.isVariableDeclaration(n) || !ts.isIdentifier(n.name) || !n.initializer) return;
    const valor = ts.isAwaitExpression(n.initializer) ? n.initializer.expression : n.initializer;
    if (llamaA(valor, "negativaDelAparato")) variables.add(n.name.text);
  });

  return contiene(cuerpo, (n) =>
    ts.isIfStatement(n) &&
    contiene(n.thenStatement, ts.isReturnStatement) &&
    contiene(n.expression, (m) =>
      llamaA(m, "negativaDelAparato") || (ts.isIdentifier(m) && variables.has(m.text))));
}

/** Para un archivo de ruta: cada handler de escritura que acepta el token, y si mira la revocación. */
function escriturasPorToken(texto: string): { metodo: string; mira: boolean }[] {
  const fuente = ts.createSourceFile("route.ts", texto, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  return handlersDeEscritura(fuente)
    .filter((h) => contiene(h.cuerpo, (n) => llamaA(n, "resolverPrincipal")))
    .map((h) => ({ metodo: h.metodo, mira: niegaAlRevocado(h.cuerpo) }));
}

const rutas = (dir: string): string[] => {
  const salida: string[] = [];
  for (const entrada of readdirSync(dir)) {
    if (entrada === "node_modules" || entrada.startsWith(".")) continue;
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) salida.push(...rutas(ruta));
    else if (/^route\.tsx?$/.test(entrada)) salida.push(ruta);
  }
  return salida;
};

describe("el detector, contra entradas escritas a mano", () => {
  const BIEN = `
    export async function POST(request: Request) {
      const user = await resolverPrincipal(request);
      if (!user) return Response.json({}, { status: 401 });
      const negativa = await negativaDelAparato(user.deviceId);
      if (negativa) return Response.json({ error: negativa }, { status: 403 });
      return escribir();
    }`;

  it("la forma de las rutas de hoy mira", () => {
    expect(escriturasPorToken(BIEN)).toEqual([{ metodo: "POST", mira: true }]);
  });

  it("la forma directa, sin variable, también mira", () => {
    expect(escriturasPorToken(`
      export async function POST(r: Request) {
        const u = await resolverPrincipal(r);
        if (await negativaDelAparato(u.deviceId)) return new Response(null, { status: 403 });
      }`)).toEqual([{ metodo: "POST", mira: true }]);
  });

  it("sin la llamada no mira", () => {
    expect(escriturasPorToken(`
      export async function POST(r: Request) {
        const u = await resolverPrincipal(r);
        return escribir(u);
      }`)).toEqual([{ metodo: "POST", mira: false }]);
  });

  it("el nombre en un comentario o en una cadena no es una llamada", () => {
    expect(escriturasPorToken(`
      export async function POST(r: Request) {
        // negativaDelAparato(u.deviceId) — pendiente
        const u = await resolverPrincipal(r);
        if (u) return Response.json({ nota: "negativaDelAparato(u.deviceId)" });
      }`)).toEqual([{ metodo: "POST", mira: false }]);
  });

  it("llamarla y no usar lo que devuelve no niega nada", () => {
    expect(escriturasPorToken(`
      export async function POST(r: Request) {
        const u = await resolverPrincipal(r);
        await negativaDelAparato(u.deviceId);
        const negativa = await negativaDelAparato(u.deviceId);
        void negativa;
        return escribir(u);
      }`)).toEqual([{ metodo: "POST", mira: false }]);
  });

  it("un if que no devuelve tampoco niega", () => {
    expect(escriturasPorToken(`
      export async function POST(r: Request) {
        const u = await resolverPrincipal(r);
        const negativa = await negativaDelAparato(u.deviceId);
        if (negativa) console.warn(negativa);
        return escribir(u);
      }`)).toEqual([{ metodo: "POST", mira: false }]);
  });

  it("la comprobación del GET no cubre al POST del mismo archivo", () => {
    expect(escriturasPorToken(`
      export async function GET(r: Request) {
        const u = await resolverPrincipal(r);
        if (await negativaDelAparato(u.deviceId)) return new Response(null, { status: 403 });
      }
      export async function POST(r: Request) {
        const u = await resolverPrincipal(r);
        return escribir(u);
      }`)).toEqual([{ metodo: "POST", mira: false }]);
  });

  it("un handler declarado como constante también se ve", () => {
    expect(escriturasPorToken(`
      export const PATCH = async (r: Request) => {
        const u = await resolverPrincipal(r);
        return escribir(u);
      };`)).toEqual([{ metodo: "PATCH", mira: false }]);
  });

  it("una lectura, o una escritura sin token, no entran", () => {
    expect(escriturasPorToken(`
      export async function GET(r: Request) {
        const u = await resolverPrincipal(r);
        return leer(u);
      }
      export async function POST(r: Request) {
        const u = await getCurrentUser();
        return escribir(u);
      }`)).toEqual([]);
  });
});

describe("el árbol: toda escritura por token mira la revocación", () => {
  const encontradas = new Map<string, boolean>();
  for (const archivo of rutas(join(RAIZ, "app"))) {
    for (const h of escriturasPorToken(readFileSync(archivo, "utf8"))) {
      encontradas.set(`${relative(RAIZ, archivo)}:${h.metodo}`, h.mira);
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
    const sinMirar = [...encontradas].filter(([k, mira]) => !mira && !(k in EXENTAS)).map(([k]) => k);
    expect(sinMirar, "Llama a negativaDelAparato y devuelve si niega, o exenta la ruta con su razón").toEqual([]);
  });

  it("no quedan excepciones que ya no hacen falta", () => {
    const sobran = Object.keys(EXENTAS).filter((k) => encontradas.get(k) !== false);
    expect(sobran, "La ruta ya mira, o ya no existe: bórrala de EXENTAS").toEqual([]);
  });
});
