/**
 * Crear el apiario — la puerta que faltaba.
 *
 * **El hueco, medido el 2026-09-09.** La aplicación dejaba registrar colmenas,
 * colonias, inspecciones, eventos de colonia, cosechas de miel y visitas — y no
 * dejaba registrar **el sitio donde ocurre todo eso**. Los tres apiarios que
 * existían salieron de `prisma/seed.ts` y de `scripts/import-cafelino-pe.ts`;
 * el único `location.create` de la aplicación era `createMicrolot`, que
 * subdivide una parcela que ya existe y no sirve para esto.
 *
 * **Lo que estas pruebas vigilan de verdad** es la puerta: quién puede crear
 * uno y quién no. Un servicio de creación sin ese lado es la mitad del trabajo,
 * y es la mitad que `CLAUDE.md` §57 llama obligatoria.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { ApiaryAccessError, crearApiario, organizacionesParaApiario, getApiaryDetail } from "../../lib/apiary/hives";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN = `crear-apiario-${Date.now()}`;

let organizationId: string;
let projectId: string;
let conAcceso: string;
let sinAcceso: string;
const creados: string[] = [];

async function cuenta(label: string) {
  const person = await prisma.person.create({
    data: { givenName: "TEST", familyName: label, displayName: `TEST ${label} (${RUN})`, locale: "es" },
  });
  return (await prisma.userAccount.create({ data: { personId: person.id, authProvider: "credentials", status: "active" } })).id;
}

beforeAll(async () => {
  organizationId = (
    await prisma.organization.create({
      data: { organizationType: "farm", name: `TEST finca ${RUN}`, status: "approved", classification: "internal" },
    })
  ).id;
  projectId = (
    await prisma.project.create({ data: { name: `TEST proyecto ${RUN}`, status: "approved", classification: "internal" } })
  ).id;

  conAcceso = await cuenta("ConAcceso");
  sinAcceso = await cuenta("SinAcceso");

  // Ámbito de PLATAFORMA a propósito: un apiario recién creado no tiene
  // colmenas, y la visibilidad de apiarios cuelga de ellas, así que sólo quien
  // ve todos puede crear uno sin dejarlo huérfano. Lo cazó esta misma prueba.
  const admin = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Platform Admin" } });
  const plataforma =
    (await prisma.scope.findFirst({ where: { scopeType: "platform" } })) ??
    (await prisma.scope.create({ data: { scopeType: "platform", scopeRefId: null } }));
  await prisma.assignment.create({ data: { userAccountId: conAcceso, roleProfileId: admin.id, scopeId: plataforma.id } });

  // Y el de proyecto, que ahora es el caso RECHAZADO y no el permitido.
  const operador = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  const scope = await prisma.scope.create({ data: { scopeType: "project", scopeRefId: projectId } });
  await prisma.assignment.create({ data: { userAccountId: sinAcceso, roleProfileId: operador.id, scopeId: scope.id } });
});

afterAll(async () => {
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: creados } }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: [conAcceso, sinAcceso] } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ scopeRefId: projectId }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: [conAcceso, sinAcceso] } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN } }) });
  await prisma.project.deleteMany({ where: assertDefinedWhere({ id: projectId }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
});

describe("crear un apiario", () => {
  it("lo crea como sitio de apiario, colgado de su finca y su proyecto", async () => {
    const sitio = await crearApiario(conAcceso, {
      name: `TEST Apiario ${RUN}`,
      organizationId,
      projectId,
      latitude: 8.7,
      longitude: -82.4,
    });
    creados.push(sitio.id);

    expect(sitio.locationType, "si no es apiary_site no sale en /apiaries").toBe("apiary_site");
    expect(sitio.organizationId).toBe(organizationId);
    expect(Number(sitio.latitude)).toBeCloseTo(8.7, 5);
    expect(sitio.createdBy, "quién lo creó, que es la mitad de la procedencia").toBe(conAcceso);

    // Y el control que importa: **se puede volver a leer por la pantalla**.
    // Un sitio creado que la lista no ve es peor que no haberlo creado.
    const detalle = await getApiaryDetail(conAcceso, sitio.id);
    expect(detalle, "el apiario recién creado tiene que poder abrirse").not.toBeNull();
  });

  it("deja rastro de auditoría, en la misma transacción", async () => {
    const sitio = await crearApiario(conAcceso, { name: `TEST Auditado ${RUN}`, organizationId, projectId });
    creados.push(sitio.id);
    const evento = await prisma.auditEvent.findFirst({
      where: assertDefinedWhere({ entityId: sitio.id, operation: "location.create_apiary" }),
    });
    expect(evento, "sin AuditEvent no hay quién ni cuándo").not.toBeNull();
    expect(evento!.actorUserAccountId).toBe(conAcceso);
  });

  /**
   * **El caso que la primera version dejaba pasar.** Un Farm Operator con
   * ambito de proyecto podia crear el sitio... y despues no verlo, porque la
   * visibilidad de apiarios cuelga de las colmenas y un sitio nuevo no tiene.
   */
  it("rechaza a quien sólo tiene ámbito de proyecto: crearía un sitio que no puede ver", async () => {
    await expect(
      crearApiario(sinAcceso, { name: `TEST Prohibido ${RUN}`, organizationId, projectId }),
    ).rejects.toThrow(/apiary_create_needs_platform_scope/);
  });

  it("rechaza un nombre vacío antes de tocar la base", async () => {
    await expect(crearApiario(conAcceso, { name: "   ", organizationId, projectId })).rejects.toThrow(/name_required/);
  });

  it("rechaza una finca que no existe", async () => {
    await expect(
      crearApiario(conAcceso, { name: `TEST Huérfano ${RUN}`, organizationId: projectId, projectId }),
    ).rejects.toThrow(/organization_not_found/);
  });

  /**
   * El control positivo de la puerta: sin esto, un `crearApiario` que
   * rechazara SIEMPRE pasaría los tres rechazos de arriba y ninguno lo diría.
   */
  it("y la pantalla ofrece fincas a quien sí puede", async () => {
    const orgs = await organizacionesParaApiario(conAcceso);
    expect(orgs.some((o) => o.id === organizationId), "la finca de la prueba debe ofrecerse").toBe(true);
    expect(await organizacionesParaApiario(sinAcceso), "a quien no gestiona no se le ofrece ninguna").toEqual([]);
  });
});
