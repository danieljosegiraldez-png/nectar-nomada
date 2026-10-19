/**
 * Un id de apiario o de colmena que no tiene forma de UUID es uno que no existe, no una avería.
 *
 * **El defecto, medido el 2026-10-09** (`PENDING_IMPLEMENTATIONS/026`): `apiaries/[id]`,
 * `apiaries/[id]/etiquetas` y `apiaries/[id]/hives/[hiveId]` daban 500 con un id basura en la URL.
 * `getApiaryDetail` y `getHive` mandaban la cadena a `findUnique`, Postgres rechazaba la conversión a
 * `uuid` y Prisma lanzaba `P2007`. Ahora lanzan su propio «no existe» —`apiary_not_found`,
 * `hive_not_found`— y las tres páginas lo convierten en `notFound()`. Dos de ellas no atrapaban nada:
 * con un UUID que no existe también daban 500.
 *
 * **Las filas de cada función, y ninguna sobra:**
 *
 * 1. *El defecto* — un id basura lanza `ApiaryAccessError` con el mensaje de «no existe». Cae con el
 *    código de antes, con el error de Prisma.
 * 2. *Control: un UUID bien formado que no existe* da exactamente lo mismo.
 * 3. *Control: el apiario o la colmena que existe* se devuelve. Sin él, una guarda que rechazara
 *    todo pasaría las dos primeras.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "../../lib/db";
import { ApiaryAccessError, getApiaryDetail, getHive } from "../../lib/apiary/hives";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { createTestOrganization, deleteTestOrganizations } from "../helpers/testOrganization";
import { crearUsuarioConAcceso } from "../helpers/traceability";

const RUN_ID = `idmal-api-${Date.now()}`;

/** Ids que una URL puede traer y que Postgres no aceptaría como `uuid`. */
const IDS_BASURA = ["no-es-un-id", "123", "00000000-0000-0000-0000-00000000000"];

/** Platform Admin: pasa la comprobación de permiso, así que llega a cada consulta. */
let usuario: Awaited<ReturnType<typeof crearUsuarioConAcceso>>;
let apiarioId: string;
let colmenaId: string;

beforeAll(async () => {
  usuario = await crearUsuarioConAcceso();
  const organizationId = await createTestOrganization(RUN_ID);
  apiarioId = (
    await prisma.location.create({
      data: { locationType: "apiary_site", name: `TEST Apiario (${RUN_ID})`, organizationId, status: "approved", classification: "internal" },
    })
  ).id;
  // Directa y no con `createHive`, que abre una jornada y escribe auditoría: aquí sólo hace falta
  // que la fila exista.
  colmenaId = (await prisma.hive.create({ data: { identifier: `${RUN_ID}-H1`, locationId: apiarioId } })).id;
});

/**
 * El apiario, su colmena y la organización se descubren por el `RUN_ID`, así que se limpian aunque el
 * `beforeAll` muera después de crearlos. Lo que crea `crearUsuarioConAcceso` sólo se borra si el ayudante
 * llegó a devolverlo: si fallara a mitad, su persona y su cuenta quedarían, porque su marca no es el
 * `RUN_ID` de este archivo. El ámbito de plataforma que devuelve es el compartido y no se borra.
 */
afterAll(async () => {
  const apiarios = await prisma.location.findMany({ where: { name: { contains: RUN_ID } }, select: { id: true } });
  const idsDeApiarios = apiarios.map((a) => a.id);
  if (idsDeApiarios.length) {
    await prisma.hive.deleteMany({ where: assertDefinedWhere({ locationId: { in: idsDeApiarios } }) });
    await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: idsDeApiarios } }) });
  }
  await deleteTestOrganizations(RUN_ID);
  if (usuario) {
    await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: usuario.userAccountId }) });
    await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: usuario.userAccountId }) });
    await prisma.person.deleteMany({ where: assertDefinedWhere({ id: usuario.personId }) });
  }
});

/** Lo que las páginas de apiario convierten en `notFound()`: esta clase y este mensaje. */
async function esNoExiste(promesa: Promise<unknown>, mensaje: string) {
  const error = await promesa.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ApiaryAccessError);
  expect((error as Error).message).toBe(mensaje);
}

describe.each([
  ["getApiaryDetail", "apiary_not_found", (id: string) => getApiaryDetail(usuario.userAccountId, id), () => apiarioId],
  ["getHive", "hive_not_found", (id: string) => getHive(usuario.userAccountId, id), () => colmenaId],
] as const)("%s con un id de la URL", (_nombre, mensaje, leer, existente) => {
  it.each(IDS_BASURA)("«%s» se trata como uno que no existe", async (id) => {
    await esNoExiste(leer(id), mensaje);
  });

  it("control: un UUID bien formado que no existe da lo mismo", async () => {
    await esNoExiste(leer(randomUUID()), mensaje);
  });

  it("control: el que existe se devuelve", async () => {
    const leido = await leer(existente());
    expect(leido.id).toBe(existente());
  });
});
