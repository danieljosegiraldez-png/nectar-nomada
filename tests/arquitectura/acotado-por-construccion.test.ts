import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

/**
 * «Acotado por construcción» quiere decir que la consulta **filtra** por el
 * principal. Firmar una escritura con él —`createdBy: userAccountId`,
 * `actorUserAccountId: userAccountId` en el evento de auditoría— no filtra
 * nada, y hasta el 2026-09-21 el detector lo contaba igual: 14 operaciones
 * eran «acotadas» sólo por su sello de actor, y una no tenía autorización
 * ninguna (`declararCanal`, PR #464).
 *
 * Se mira el campo `acotado` y no la clase, porque la clase da prioridad al
 * guardia: `getPartnerProjects` es «guardia directo», y aun así su `where` por
 * `userAccountId` es el caso bueno que la regla no puede perder.
 *
 * El corpus sí contiene la entrada hostil —los sellos están en el árbol real—,
 * así que esto discrimina: con la regla vieja, los cinco primeros salen `true`.
 */
const ops = JSON.parse(
  execFileSync("node", ["scripts/inventario-de-acceso.mjs", "--json"], {
    cwd: new URL("../..", import.meta.url).pathname,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  })
) as { archivo: string; nombre: string; acotado: boolean }[];

const op = (archivo: string, nombre: string) => {
  const o = ops.find((x) => x.archivo === archivo && x.nombre === nombre);
  expect(o, `${archivo}:${nombre} no está en el inventario`).toBeDefined();
  return o!;
};

describe("acotado por construcción es filtrar por el principal, no firmar con él", () => {
  it.each([
    ["lib/notificaciones/canales.ts", "declararCanal"],
    ["lib/sync/devices.ts", "registerDevice"],
    ["lib/rbac/service.ts", "createAssignment"],
    ["lib/research/researchActivity.ts", "proposeResearchActivity"],
    ["lib/traceability/operations.ts", "crearConsumoEnTx"],
  ])("%s:%s sólo sella al actor — no cuenta", (archivo, nombre) => {
    expect(op(archivo, nombre).acotado).toBe(false);
  });

  it.each([
    ["lib/partner/workspace.ts", "getPartnerProjects"],
    ["lib/commerce/orders.ts", "getOrdersForUser"],
    ["lib/experiences/bookings.ts", "getBookingsForUser"],
  ])("%s:%s filtra su where por el principal — cuenta", (archivo, nombre) => {
    expect(op(archivo, nombre).acotado).toBe(true);
  });
});
