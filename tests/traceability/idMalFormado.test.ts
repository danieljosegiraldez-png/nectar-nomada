/**
 * Un id que no tiene forma de UUID es un lote que no existe, no una avería.
 *
 * **El defecto, visto el 2026-10-09** verificando el PR #691: abrir
 * `/lots/no-es-un-id` hacía que `getLotDetail` mandara esa cadena a
 * `prisma.lot.findUnique`, Postgres la rechazaba al convertirla a `uuid`
 * («invalid input syntax for type uuid») y Prisma lanzaba un
 * `PrismaClientKnownRequestError`. La página sólo atrapa
 * `TraceabilityAccessError`, así que el error subía entero: una pantalla de
 * error (500) donde tocaba «no existe» (404). Lo mismo en las diez subrutas de
 * `/lots/[id]`, que pasan por `getLotSummary` o —el informe— por
 * `getLotDetail`.
 *
 * **Las tres filas de cada función, y ninguna sobra:**
 *
 * 1. *El defecto* — un id basura lanza `TraceabilityAccessError("lot_not_found")`,
 *    la misma clase que la página ya convierte en `notFound()`. Cae con el código
 *    de antes del arreglo, con el error de Prisma.
 * 2. *Control: un UUID válido que no existe* da exactamente lo mismo. Sin él, la
 *    fila 1 no distingue «el id basura se trata como inexistente» de «se lanza
 *    otra cosa con el mismo mensaje».
 * 3. *Control: el lote que sí existe* se devuelve. Sin él, una guarda que
 *    rechazara todo pasaría las dos primeras.
 *
 * Y una cuarta sólo para `getLotSummary`: el mismo id **en mayúsculas** también
 * se encuentra, porque Postgres acepta un `uuid` sin distinguir mayúsculas. Es la
 * fila que caza una guarda más estricta que la base, que convertiría en 404 un
 * enlace que hoy funciona.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "../../lib/db";
import { createLot, getLotDetail, getLotSummary, TraceabilityAccessError } from "../../lib/traceability/lots";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { createTestOrganization, deleteTestOrganizations } from "../helpers/testOrganization";

const RUN_ID = `idmal-${Date.now()}`;

/** Ids que una URL puede traer y que Postgres no aceptaría como `uuid`. */
const IDS_BASURA = ["no-es-un-id", "123", "00000000-0000-0000-0000-00000000000"];

let projectId: string;
/** `Farm Manager` de su propio proyecto, no `Platform Admin`: lo que se mide es su lote, no la base entera. */
let gerenteId: string;
let loteId: string;

beforeAll(async () => {
  const organizationId = await createTestOrganization(RUN_ID);
  projectId = (
    await prisma.project.create({
      data: { name: `TEST Id mal formado (${RUN_ID})`, status: "approved", classification: "internal" },
    })
  ).id;

  const persona = await prisma.person.create({
    data: { givenName: "TEST", familyName: "Gerente", displayName: `TEST Gerente (${RUN_ID})`, locale: "es" },
  });
  gerenteId = (
    await prisma.userAccount.create({ data: { personId: persona.id, authProvider: "credentials", status: "active" } })
  ).id;
  const perfil = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Manager" } });
  const scope =
    (await prisma.scope.findFirst({ where: { scopeType: "project", scopeRefId: projectId } })) ??
    (await prisma.scope.create({ data: { scopeType: "project", scopeRefId: projectId } }));
  await prisma.assignment.create({ data: { userAccountId: gerenteId, roleProfileId: perfil.id, scopeId: scope.id } });

  loteId = (await createLot(gerenteId, { lotCode: `${RUN_ID}-lote`, lotType: "green", organizationId, projectId })).id;
}, 30000);

/** Todo se descubre por el `RUN_ID`, así que una corrida que murió a mitad del `beforeAll` se limpia igual. */
afterAll(async () => {
  const personas = await prisma.person.findMany({
    where: { displayName: { contains: RUN_ID } },
    select: { userAccount: { select: { id: true } } },
  });
  const idsDeCuentas = personas.flatMap((p) => (p.userAccount ? [p.userAccount.id] : []));
  const proyectos = await prisma.project.findMany({ where: { name: { contains: RUN_ID } }, select: { id: true } });

  await prisma.lot.deleteMany({ where: assertDefinedWhere({ lotCode: { startsWith: RUN_ID } }) });
  if (idsDeCuentas.length) {
    await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: idsDeCuentas } }) });
  }
  // El `Scope` se borra DESPUÉS del `Assignment`, que lo referencia con RESTRICT.
  if (proyectos.length) {
    await prisma.scope.deleteMany({ where: assertDefinedWhere({ scopeRefId: { in: proyectos.map((p) => p.id) } }) });
  }
  if (idsDeCuentas.length) {
    await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: idsDeCuentas } }) });
  }
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN_ID } }) });
  await prisma.project.deleteMany({ where: assertDefinedWhere({ name: { contains: RUN_ID } }) });
  await deleteTestOrganizations(RUN_ID);
}, 30000);

/** Lo que la página necesita para dar 404: esta clase y este mensaje, nada más. */
async function esNoExiste(promesa: Promise<unknown>) {
  const error = await promesa.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(TraceabilityAccessError);
  expect((error as Error).message).toBe("lot_not_found");
}

describe.each([
  ["getLotDetail", getLotDetail],
  ["getLotSummary", getLotSummary],
] as const)("%s con un id de la URL", (_nombre, leer) => {
  it.each(IDS_BASURA)("«%s» se trata como un lote que no existe", async (id) => {
    await esNoExiste(leer(gerenteId, id));
  });

  it("control: un UUID bien formado que no existe da lo mismo", async () => {
    await esNoExiste(leer(gerenteId, randomUUID()));
  });

  it("control: el lote que existe se devuelve", async () => {
    const leido = await leer(gerenteId, loteId);
    const id = "lot" in leido ? leido.lot.id : leido.id;
    expect(id).toBe(loteId);
  });
});

it("getLotSummary: el mismo UUID en mayúsculas también se encuentra, como lo acepta Postgres", async () => {
  const lote = await getLotSummary(gerenteId, loteId.toUpperCase());
  expect(lote.id).toBe(loteId);
});
