/**
 * Un id de ubicación que no tiene forma de UUID es una ubicación que no existe, no una avería.
 *
 * **El defecto, medido el 2026-10-09** (`PENDING_IMPLEMENTATIONS/026`): ocho páginas daban 500 con un
 * id basura en la URL porque `requireLocationAttributeAccess` mandaba la cadena a
 * `prisma.location.findUnique`, Postgres rechazaba la conversión a `uuid` y Prisma lanzaba `P2007`.
 * Esas páginas sólo atrapan `LocationAccessError`. Seis son de `plots/[id]/…` y entran por
 * `getPlotDetail`; las otras dos son `bodegas/[id]` e `instalaciones/[id]`.
 *
 * **Las filas, y ninguna sobra:**
 *
 * 1. *El defecto* — un id basura lanza `LocationAccessError("location_not_found")`. Cae con el
 *    código de antes, con el error de Prisma.
 * 2. *Control: un UUID bien formado que no existe* da exactamente lo mismo. Es la regla: la
 *    respuesta a un id basura es la de un id que no existe, ni más ni menos.
 * 3. *Control: la parcela que existe* pasa. Sin él, una guarda que rechazara todo pasaría las dos
 *    primeras.
 *
 * Y el predicado que NO lanza, `puedeGestionarAtributosDeUbicacion`, que varias páginas usan para
 * decidir qué pintan: con un id basura tiene que contestar `false`, no reventar.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "../../lib/db";
import {
  LocationAccessError,
  puedeGestionarAtributosDeUbicacion,
  requireLocationAttributeAccess,
} from "../../lib/traceability/locations";
import { getPlotDetail } from "../../lib/traceability/plantingCohorts";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { crearParcela, crearUsuarioConAcceso } from "../helpers/traceability";

/** Ids que una URL puede traer y que Postgres no aceptaría como `uuid`. */
const IDS_BASURA = ["no-es-un-id", "123", "00000000-0000-0000-0000-00000000000"];

let usuario: Awaited<ReturnType<typeof crearUsuarioConAcceso>>;
let parcela: Awaited<ReturnType<typeof crearParcela>>;

beforeAll(async () => {
  usuario = await crearUsuarioConAcceso();
  parcela = await crearParcela();
});

/**
 * Lo mismo que limpia `tests/territorio/rejillaEnGetPlotDetail.test.ts`, que usa los mismos
 * ayudantes. El ámbito de plataforma que devuelve `crearUsuarioConAcceso` es el compartido y no se
 * borra. Estas lecturas no escriben auditoría.
 */
afterAll(async () => {
  if (parcela) {
    await prisma.location.deleteMany({
      where: assertDefinedWhere({ id: { in: [parcela.id, parcela.parentLocationId ?? parcela.id] } }),
    });
    await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: parcela.organizationId ?? "" }) });
  }
  if (usuario) {
    await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: usuario.userAccountId }) });
    await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: usuario.userAccountId }) });
    await prisma.person.deleteMany({ where: assertDefinedWhere({ id: usuario.personId }) });
  }
});

/** Lo que las páginas necesitan para dar su respuesta de «no existe»: esta clase y este mensaje. */
async function esNoExiste(promesa: Promise<unknown>) {
  const error = await promesa.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(LocationAccessError);
  expect((error as Error).message).toBe("location_not_found");
}

describe.each([
  ["requireLocationAttributeAccess", (id: string) => requireLocationAttributeAccess(usuario.userAccountId, id)],
  ["getPlotDetail", (id: string) => getPlotDetail(usuario.userAccountId, id)],
] as const)("%s con un id de la URL", (_nombre, leer) => {
  it.each(IDS_BASURA)("«%s» se trata como una ubicación que no existe", async (id) => {
    await esNoExiste(leer(id));
  });

  it("control: un UUID bien formado que no existe da lo mismo", async () => {
    await esNoExiste(leer(randomUUID()));
  });

  it("control: la parcela que existe pasa", async () => {
    // Si lanzara, la prueba caería con ese error.
    await leer(parcela.id);
  });
});

describe("puedeGestionarAtributosDeUbicacion con un id de la URL", () => {
  it.each(IDS_BASURA)("«%s» contesta que no, sin reventar", async (id) => {
    await expect(puedeGestionarAtributosDeUbicacion(usuario.userAccountId, id)).resolves.toBe(false);
  });

  it("control: la parcela que existe contesta que sí", async () => {
    await expect(puedeGestionarAtributosDeUbicacion(usuario.userAccountId, parcela.id)).resolves.toBe(true);
  });
});
