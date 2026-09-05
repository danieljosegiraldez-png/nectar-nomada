/**
 * La organización que acompaña a un lote viene acotada a lo que se pinta.
 *
 * **Qué defiende.** El gate de `getLotList`/`getLotDetail` es la clasificación
 * del **lote**. La organización tiene la suya y no se comprueba ahí, así que
 * `organization: true` cargaba `contactEmail`, `contactPhone`, `websiteUrl` y
 * `attributes` de una organización que puede estar clasificada por encima.
 *
 * **Lo que esto NO era, dicho para no inflarlo.** Medido el 2026-09-05: ningún
 * consumidor usaba más que `name`, los componentes cliente reciben `{id, name}`
 * y la exportación sólo escribe el nombre — así que nada llegaba al navegador
 * ni a un archivo. Y en producción no había ni un lote menos restringido que su
 * organización (0 de 43). Era sobre-lectura latente, no una fuga viva.
 *
 * Lo que la vuelve un defecto es que eso lo garantizaban los datos y el hábito.
 * Este test lo garantiza el código: el día que alguien vuelva a `organization:
 * true`, falla — con el par peligroso construido a mano, que en producción hoy
 * no existe.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { getLotDetail, getLotList } from "../../lib/traceability/lots";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `orgacot-${Date.now()}`;
const SECRETO = "no-deberia-salir@example.invalid";
let organizationId: string;
let projectId: string;
let locationId: string;
let userAccountId: string;
let lotId: string;

beforeAll(async () => {
  // El par que hoy no existe en producción: organización CONFIDENCIAL con datos
  // de contacto, y un lote INTERNAL colgando de ella.
  organizationId = (await prisma.organization.create({
    data: { organizationType: "farm", name: `TEST ${RUN_ID}`, status: "approved",
            classification: "confidential", contactEmail: SECRETO, contactPhone: "+507-000-0000" } })).id;
  projectId = (await prisma.project.create({
    data: { name: `TEST ${RUN_ID}`, status: "approved", classification: "internal" } })).id;
  locationId = (await prisma.location.create({
    data: { locationType: "plot", name: `TEST ${RUN_ID}`, organizationId, status: "approved", classification: "internal" } })).id;
  const persona = await prisma.person.create({
    data: { givenName: "TEST", familyName: "Org", displayName: `TEST Org (${RUN_ID})`, locale: "es" } });
  userAccountId = (await prisma.userAccount.create({
    data: { personId: persona.id, authProvider: "credentials", status: "active" } })).id;
  const perfil = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  const scope = await prisma.scope.create({ data: { scopeType: "location", scopeRefId: locationId } });
  await prisma.assignment.create({ data: { userAccountId, roleProfileId: perfil.id, scopeId: scope.id } });
  lotId = (await prisma.lot.create({
    data: { lotCode: RUN_ID, lotType: "cherry", organizationId, locationId, projectId,
            classification: "internal", status: "approved" } })).id;
});

afterAll(async () => {
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: lotId }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ scopeRefId: locationId }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: userAccountId }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN_ID } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: locationId }) });
  await prisma.project.deleteMany({ where: assertDefinedWhere({ id: projectId }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
});

const campos = (o: unknown) => Object.keys((o ?? {}) as Record<string, unknown>).sort();

describe("la organización que acompaña a un lote", () => {
  it("en el detalle viene sólo con id y nombre", async () => {
    const detalle = (await getLotDetail(userAccountId, lotId)) as { lot: { organization: unknown } };
    expect(campos(detalle.lot.organization)).toEqual(["id", "name"]);
  });

  it("en la lista, igual", async () => {
    const { items } = await getLotList(userAccountId);
    const fila = items.find((l) => l.id === lotId);
    expect(fila, "el lote propio tiene que estar").toBeDefined();
    expect(campos((fila as { organization: unknown }).organization)).toEqual(["id", "name"]);
  });

  /**
   * El control positivo: la fila SÍ existe con esos datos. Sin esto, los dos
   * tests de arriba pasarían igual sobre una organización sin correo — que es
   * el verde vacío de siempre.
   */
  it("y la organización sí tiene esos datos: no se está comprobando sobre una vacía", async () => {
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
    expect(org.contactEmail).toBe(SECRETO);
    expect(org.classification).toBe("confidential");
  });
});
