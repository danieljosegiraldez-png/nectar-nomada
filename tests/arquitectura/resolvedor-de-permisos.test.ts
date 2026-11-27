/**
 * **El resolvedor de permisos con entradas hostiles**, no sólo contra el árbol.
 *
 * `scripts/inventario/simbolos.mjs` lee qué permiso exige una operación. Desde el
 * 2026-10-11 lee también una **constante objeto** `{ resourceType: "…" }`: el
 * `GESTIONAR` de `lib/equipos/modelos.ts`, que dejaba ocho operaciones «sin permiso
 * resuelto» aunque exigen `equipment:manage` (ficha 005). Probarlo sólo contra el
 * árbol real lo deja sin probar en lo que el árbol no contiene: un `let`, un
 * parámetro, un objeto pasado a una función que no autoriza. Esos casos se
 * escriben aquí, en un proyecto de juguete con su propio `tsconfig`.
 *
 * Hermético: no lee la base. El Program es de cuatro archivos, no el del árbol.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { autorizacionPorSimbolo, clave } from "../../scripts/inventario/simbolos.mjs";

const RAIZ = mkdtempSync(join(tmpdir(), "resolvedor-"));
function escribir(ruta: string, texto: string) {
  mkdirSync(join(RAIZ, ruta, ".."), { recursive: true });
  writeFileSync(join(RAIZ, ruta), texto);
}

escribir("tsconfig.json", JSON.stringify({
  compilerOptions: { strict: true, target: "ES2022", module: "ESNext", moduleResolution: "Bundler", noEmit: true },
  include: ["lib/**/*.ts"],
}));
escribir("lib/rbac/service.ts", `
export async function can(u: string, action: string, resourceType: string, target: unknown, c: string) {
  return Boolean(u && action && resourceType && target && c);
}`);
escribir("lib/guardia.ts", `
import { can } from "./rbac/service";
export interface Permiso { resourceType: string; action: string }
export async function exige(u: string, p: Permiso) {
  if (!(await can(u, p.action, p.resourceType, {}, "internal"))) throw new Error("sin_acceso");
}
export function formatea(p: Permiso) { return p.resourceType; }`);
escribir("lib/casos.ts", `
import { can } from "./rbac/service";
import { exige, formatea } from "./guardia";
const CONSTANTE = { resourceType: "equipment", action: "manage" } as const;
let VARIABLE = { resourceType: "lot", action: "manage" };
VARIABLE = { resourceType: "lot", action: "view" };
export async function conConstante(u: string) { await exige(u, CONSTANTE); }
export async function conLiteralEnLinea(u: string) { await exige(u, { resourceType: "sample", action: "view" }); }
export async function propiedadEnCan(u: string) { await can(u, CONSTANTE.action, CONSTANTE.resourceType, {}, "internal"); }
export async function literalEnCan(u: string) { await can(u, "view", "location", {}, "internal"); }
export async function conVariable(u: string) { await exige(u, VARIABLE); }
export async function conParametro(u: string, p: { resourceType: string; action: string }) { await exige(u, p); }
export function aUnFormateador() { return formatea(CONSTANTE); }`);

const S = autorizacionPorSimbolo({ raiz: RAIZ });
const recurso = (nombre: string) => [...(S.recursos.get(clave("lib/casos.ts", nombre)) ?? [])].sort();

afterAll(() => rmSync(RAIZ, { recursive: true, force: true }));

describe("el resolvedor lee el permiso de una constante objeto, y sólo de ella", () => {
  /** La fila patrón: si el Program no ve los archivos, todo lo de abajo saldría vacío por la razón equivocada. */
  it("el control: un literal en `can` se lee, como siempre", () => {
    expect(S.archivos).toBe(3);
    expect(recurso("literalEnCan")).toEqual(["location"]);
  });

  it.each([
    ["una constante pasada a un guardia", "conConstante", ["equipment"]],
    ["un objeto literal en línea pasado a un guardia", "conLiteralEnLinea", ["sample"]],
    ["la propiedad de una constante en el tercer argumento de `can`", "propiedadEnCan", ["equipment"]],
  ])("se lee: %s", (_caso, nombre, esperado) => {
    expect(recurso(nombre)).toEqual(esperado);
  });

  it.each([
    ["un `let`, que puede cambiar antes de la llamada", "conVariable"],
    ["un parámetro: lo decide quien llama", "conParametro"],
    ["una constante pasada a una función que NO autoriza", "aUnFormateador"],
  ])("NO se lee: %s", (_caso, nombre) => {
    expect(recurso(nombre)).toEqual([]);
  });
});
