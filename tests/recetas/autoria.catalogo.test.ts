/**
 * El permiso de autoría de recetas y el perfil que lo lleva — Parte 2a, tarea 3 (2026-10-04), decisión de Daniel V16.
 *
 * **Hermética:** lee el catálogo (`lib/rbac/catalog.ts`) y el código de `lib/`, no toca la base. La corre `scripts/ci.sh`; NO va
 * en `scripts/pruebas-por-compuerta.txt`. Su gemela con base, `tests/recetas/autoria.test.ts`, prueba que la regla RECHAZA o
 * deja pasar según lo que la base tiene sembrado; ésta prueba lo que el catálogo DECLARA, que es lo que la semilla siembra.
 *
 * **Lo que fija, y por qué cada línea:**
 * - el permiso `lot:approve_exception` lo llevan Coffee Process Manager y Platform Admin y NINGÚN otro perfil. Que **el Farm
 *   Manager no lo reciba de serie** es la decisión de Daniel V13 (2026-10-04): liberar es una decisión comercial y escribir la
 *   receta es otra. Dárselo es la mutación que esta prueba existe para cazar;
 * - el perfil lleva EXACTAMENTE ese permiso y las dos clasificaciones que su comprobación necesita, y nada operativo. La lista
 *   está escrita a mano a propósito: añadir un permiso a este perfil —la 2b lo hará— exige cambiar esta prueba a conciencia;
 * - ADR-091: el permiso nace con el código que lo comprueba. **`lot` es un recurso con comodín** (muchas llamadas a `can(…, "lot", …)`
 *   deciden la acción en tiempo de ejecución), así que el escáner de `permissionCoverage.test.ts` daría el permiso por comprobado
 *   aunque ninguna línea lo nombrara. Por eso aquí se pide la clave EXACTA.
 */
import { describe, expect, it } from "vitest";
import { PERMISSIONS, ROLE_PROFILES } from "../../lib/rbac/catalog";
import { scanPermissionUsage } from "../helpers/permissionUsage";

const lleva = (perfil: (typeof ROLE_PROFILES)[number], recurso: string, accion: string) =>
  perfil.permissions.some(([r, a]) => r === recurso && a === accion);
const perfil = (nombre: string) => ROLE_PROFILES.find((p) => p.name === nombre);

describe("el permiso de autoría de recetas (V16) y el perfil que lo lleva", () => {
  it("control: los perfiles con los que se compara existen y el catálogo se lee", () => {
    expect(perfil("Farm Manager"), "Farm Manager no está en el catálogo: la prueba no mide nada").toBeDefined();
    expect(perfil("Farm Operator"), "Farm Operator no está en el catálogo: la prueba no mide nada").toBeDefined();
    expect(PERMISSIONS.length).toBeGreaterThan(50);
    // Y la fila hermana, que sí existe hoy: el lector de `lleva` encuentra un permiso que se sabe concedido.
    expect(lleva(perfil("Farm Manager")!, "location", "edit_beneficio")).toBe(true);
  });

  it("está en el catálogo, y su descripción dice qué cubre hoy y qué le añade la 2b", () => {
    const fila = PERMISSIONS.find((p) => p.resourceType === "lot" && p.action === "approve_exception");
    expect(fila, "lot:approve_exception no está en PERMISSIONS").toBeDefined();
    expect(fila!.description).toMatch(/recetas/i);
    expect(fila!.description, "debe decir que la 2b le añade las excepciones").toMatch(/2b/);
    expect(fila!.description, "debe decir que edit_beneficio ya no basta").toMatch(/edit_beneficio/);
  });

  it("lo llevan Coffee Process Manager y Platform Admin, y ningún otro perfil: ni Farm Manager ni Farm Operator", () => {
    const quienes = ROLE_PROFILES.filter((p) => lleva(p, "lot", "approve_exception"))
      .map((p) => p.name)
      .sort();
    expect(quienes).toEqual(["Coffee Process Manager", "Platform Admin"]);
  });

  it("Coffee Process Manager lleva ese permiso y las dos clasificaciones que su comprobación necesita, y nada operativo", () => {
    const p = perfil("Coffee Process Manager");
    expect(p, "el perfil Coffee Process Manager no está en ROLE_PROFILES").toBeDefined();
    expect(p!.permissions.map(([r, a]) => `${r}:${a}`).sort()).toEqual([
      "classification:clear_internal",
      "classification:clear_partner",
      "lot:approve_exception",
    ]);
    // El mismo hecho dicho al revés, para que el mensaje de un fallo diga QUÉ se coló.
    for (const operativo of [
      ["lot", "manage"],
      ["lot", "view"],
      ["lot", "release"],
      ["location", "edit_beneficio"],
    ] as const) {
      expect(lleva(p!, operativo[0], operativo[1]), `no opera: no lleva ${operativo.join(":")}`).toBe(false);
    }
  });

  it("ADR-091: el permiso nace con el código que lo comprueba, nombrado con su clave exacta", () => {
    const uso = scanPermissionUsage();
    expect(uso.exact.has("lot:approve_exception"), 'ninguna llamada `can(…, "approve_exception", "lot", …)` en lib/, app/ ni scripts/').toBe(true);
    // Control del escáner: una clave que se sabe comprobada con la misma forma de llamada literal.
    expect(uso.exact.has("location:edit_beneficio")).toBe(true);
  });
});
