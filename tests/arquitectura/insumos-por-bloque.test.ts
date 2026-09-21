import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Arreglo de revisión, item 2a (Parte 2 de rutinas de estante): antes,
 * `app/instalaciones/[id]/page.tsx` resolvía `insumosDeLaInstalacion` UNA vez
 * con el id de la instalación y sólo la pasaba a SU PROPIO bloque —cada cama
 * ya resolvía el suyo, sin recibir el prop—, lo que dejaba a `insumosDeLugar`
 * (~línea 230 de `tests/rutinas/rutinasDeLugar.test.ts`) verde aunque alguien
 * volviera a pasarle `insumosDeLaInstalacion` a cada cama: esa prueba sólo
 * llama al servicio, nunca a la página.
 *
 * **Segunda vuelta (ronda de arreglos sobre este mismo guardia).** La primera
 * versión comprobaba SÓLO texto —`fuente.includes("insumos={insumosDeLaInsta…")`—,
 * y dos revisiones independientes (Claude y Codex) confirmaron que pasa igual
 * con dos regresiones reales:
 *
 *   1. `insumos={insumosParaBloque("cama", insumosDeLaInstalacion) ?? insumosDeLaInstalacion}`
 *      — el `??` deja la cadena de texto exacta que el guardia buscaba, y la
 *      instalación gana en cuanto `insumosParaBloque` alguna vez devuelva algo
 *      falsy que no sea `undefined` (o, más simple: basta con que el lector
 *      humano lea "sí pasa por insumosParaBloque" y no note el `??` después).
 *   2. `const insumosCama = insumosDeLaInstalacion; …
 *      insumos={insumosCama}` — la cadena `insumos={insumosDeLaInstalacion}`
 *      nunca aparece junto al JSX, así que el control negativo no la ve.
 *
 * Las dos comparten la forma: el TEXTO que el guardia buscaba seguía
 * "presente" o "ausente" en el lugar equivocado, porque un `grep` no entiende
 * la ESTRUCTURA — un operador binario o una variable intermedia bastan para
 * engañarlo. El arreglo usa el compilador de TypeScript (`typescript`, ya es
 * dependencia) para parsear la página de verdad y exigir, nodo por nodo, que
 * el atributo `insumos` de cada `<RutinasDeLugar>` sea EXACTAMENTE una llamada
 * a `insumosParaBloque("<bloque>", insumosDeLaInstalacion)` — ninguna otra
 * forma de expresión (identificador suelto, `??`, `||`, condicional, etc.)
 * pasa el chequeo `ts.isCallExpression`.
 *
 * No hay arnés de renderizado de páginas de servidor en este repositorio (ver
 * `tests/arquitectura/cama-con-su-permiso.test.ts`, mismo patrón de leer la
 * fuente); aquí se lee la fuente pero se analiza su AST, no su texto.
 *
 * **Su límite, dicho:** reconoce la llamada por el nombre literal
 * `insumosParaBloque` y el primer argumento como cadena literal. Si la función
 * cambia de nombre, o el primer argumento deja de ser un literal, hay que
 * actualizar este guardia.
 */
const RUTA = fileURLToPath(new URL("../../app/instalaciones/[id]/page.tsx", import.meta.url));

/** Los tres bloques que la página monta, clasificados por SU FORMA en el AST, no por texto. */
function analizarBloques() {
  const fuente = readFileSync(RUTA, "utf8");
  const sourceFile = ts.createSourceFile(RUTA, fuente, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  function esRutinasDeLugar(node: ts.Node): node is ts.JsxSelfClosingElement {
    return ts.isJsxSelfClosingElement(node) && ts.isIdentifier(node.tagName) && node.tagName.text === "RutinasDeLugar";
  }

  function recolectar(nodo: ts.Node, salida: ts.JsxSelfClosingElement[]) {
    nodo.forEachChild((hijo) => {
      if (esRutinasDeLugar(hijo)) salida.push(hijo);
      recolectar(hijo, salida);
    });
  }

  /** `<algo>.<prop>.map(callback)`: los bloques de cama/estante cuelgan de ahí. */
  function esMapaDePropiedad(node: ts.Node, prop: string): node is ts.CallExpression {
    return (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "map" &&
      ts.isPropertyAccessExpression(node.expression.expression) &&
      node.expression.expression.name.text === prop
    );
  }

  const camaBloques: ts.JsxSelfClosingElement[] = [];
  const estanteBloques: ts.JsxSelfClosingElement[] = [];
  const dentroDeMapa = new Set<ts.JsxSelfClosingElement>();
  const todos: ts.JsxSelfClosingElement[] = [];

  function visit(node: ts.Node) {
    if (esMapaDePropiedad(node, "camas")) {
      recolectar(node, camaBloques);
      camaBloques.forEach((n) => dentroDeMapa.add(n));
    } else if (esMapaDePropiedad(node, "estantes")) {
      recolectar(node, estanteBloques);
      estanteBloques.forEach((n) => dentroDeMapa.add(n));
    }
    if (esRutinasDeLugar(node)) todos.push(node);
    node.forEachChild(visit);
  }
  visit(sourceFile);

  const instalacionBloques = todos.filter((n) => !dentroDeMapa.has(n));

  return { camaBloques, estanteBloques, instalacionBloques };
}

/** El atributo JSX `insumos` de un `<RutinasDeLugar>`, o `undefined` si no lo lleva. */
function atributoInsumos(nodo: ts.JsxSelfClosingElement): ts.JsxAttribute | undefined {
  return nodo.attributes.properties.find(
    (p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && ts.isIdentifier(p.name) && p.name.text === "insumos",
  );
}

/**
 * `true` sólo si el valor del atributo es, LITERALMENTE en el AST, una llamada
 * a `insumosParaBloque("<tipoEsperado>", ...)` — nada envuelto en `??`, `||`,
 * un condicional, ni una variable intermedia.
 */
function esLlamadaExacta(attr: ts.JsxAttribute | undefined, tipoEsperado: string): boolean {
  if (!attr?.initializer || !ts.isJsxExpression(attr.initializer) || !attr.initializer.expression) return false;
  const expr = attr.initializer.expression;
  if (!ts.isCallExpression(expr)) return false;
  if (!ts.isIdentifier(expr.expression) || expr.expression.text !== "insumosParaBloque") return false;
  const primerArg = expr.arguments[0];
  return !!primerArg && ts.isStringLiteral(primerArg) && primerArg.text === tipoEsperado;
}

describe("app/instalaciones/[id]/page.tsx: insumos por bloque, estructural (AST, no texto)", () => {
  it("control positivo: el detector encuentra la instalación, al menos una cama y al menos un estante", () => {
    const { camaBloques, estanteBloques, instalacionBloques } = analizarBloques();
    expect(instalacionBloques.length).toBeGreaterThanOrEqual(1);
    expect(camaBloques.length).toBeGreaterThanOrEqual(1);
    expect(estanteBloques.length).toBeGreaterThanOrEqual(1);
  });

  it("cada bloque de INSTALACIÓN pasa insumos={insumosParaBloque(\"instalacion\", …)}, exactamente esa forma", () => {
    const { instalacionBloques } = analizarBloques();
    for (const nodo of instalacionBloques) {
      expect(esLlamadaExacta(atributoInsumos(nodo), "instalacion")).toBe(true);
    }
  });

  it("cada bloque de CAMA pasa insumos={insumosParaBloque(\"cama\", …)}, exactamente esa forma — ni ??, ni variable intermedia, ni el literal de la instalación", () => {
    const { camaBloques } = analizarBloques();
    for (const nodo of camaBloques) {
      expect(esLlamadaExacta(atributoInsumos(nodo), "cama")).toBe(true);
    }
  });

  it("cada bloque de ESTANTE pasa insumos={insumosParaBloque(\"estante\", …)}, exactamente esa forma", () => {
    const { estanteBloques } = analizarBloques();
    for (const nodo of estanteBloques) {
      expect(esLlamadaExacta(atributoInsumos(nodo), "estante")).toBe(true);
    }
  });
});
