/**
 * La floración de una parcela — decisión de Daniel, 2026-10-01: «parcela, microparcela o bloque».
 *
 * Existe para poder decir que una aplicación cae en floración, que es cuando las fuentes de la
 * región piden no asperjar «con el fin de proteger la fauna benéfica, especialmente las abejas
 * nativas y otros polinizadores». En una operación con apiarios y meliponarios eso no es un riesgo
 * ambiental genérico: es daño a su propia miel.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "../../lib/db";
import { enFloracion, registrarFloracion, FloracionValidationError } from "../../lib/traceability/floracion";
import { TraceabilityAccessError } from "../../lib/traceability/lots";
import { createTestOrganization, deleteTestOrganizations } from "../helpers/testOrganization";

const RUN_ID = `flor-${Date.now()}`;
const dia = (s: string) => new Date(`${s}T00:00:00.000Z`);

let organizationId: string;
let finca: string;
let parcela: string;
let otraParcela: string;
let bloque: string;
let bloqueAjeno: string;
let gestorId: string;
let sinPermisoId: string;

beforeAll(async () => {
  organizationId = await createTestOrganization(RUN_ID);
  finca = (await prisma.location.create({ data: { name: `TEST Finca (${RUN_ID})`, locationType: "site", classification: "internal", organizationId } })).id;
  parcela = (await prisma.location.create({ data: { name: `TEST Parcela (${RUN_ID})`, locationType: "plot", classification: "internal", parentLocationId: finca } })).id;
  otraParcela = (await prisma.location.create({ data: { name: `TEST Parcela B (${RUN_ID})`, locationType: "plot", classification: "internal", parentLocationId: finca } })).id;
  bloque = (await prisma.plotBlock.create({ data: { locationId: parcela, name: `TEST Bloque (${RUN_ID})` } })).id;
  bloqueAjeno = (await prisma.plotBlock.create({ data: { locationId: otraParcela, name: `TEST Bloque B (${RUN_ID})` } })).id;

  const cuenta = async (n: string, perfil: string, sitio: string) => {
    const ua = await prisma.userAccount.create({
      data: {
        person: { create: { givenName: "TEST", familyName: n, displayName: `TEST ${n} (${RUN_ID})`, locale: "es" } },
        authProvider: "credentials", status: "active",
      },
    });
    const p = await prisma.roleProfile.findUniqueOrThrow({ where: { name: perfil } });
    const scope =
      (await prisma.scope.findFirst({ where: { scopeType: "location", scopeRefId: sitio } })) ??
      (await prisma.scope.create({ data: { scopeType: "location", scopeRefId: sitio } }));
    await prisma.assignment.create({ data: { userAccountId: ua.id, roleProfileId: p.id, scopeId: scope.id } });
    return ua.id;
  };
  gestorId = await cuenta("Gestor", "Farm Manager", finca);
  // Un sitio que NO es esta finca: su permiso no alcanza aquí.
  const otraOrg = await createTestOrganization(`${RUN_ID}-b`);
  const otroSitio = (await prisma.location.create({ data: { name: `TEST Ajeno (${RUN_ID})`, locationType: "site", classification: "internal", organizationId: otraOrg } })).id;
  sinPermisoId = await cuenta("Ajeno", "Farm Manager", otroSitio);
}, 30000);

afterAll(async () => {
  // Con reintentos y sin lanzar: la base es compartida y una limpieza que revienta deja basura.
  try {
    await prisma.plotBloom.deleteMany({ where: { location: { name: { contains: RUN_ID } } } });
    await prisma.plotBlock.deleteMany({ where: { name: { contains: RUN_ID } } });
    // Toma UN runId, no una lista: las dos organizaciones comparten el prefijo, así que
    // `RUN_ID` las barre a las dos —la `-b` lo lleva dentro—.
    await deleteTestOrganizations(RUN_ID);
  } catch {
    // Una carrera perdida al borrar no debe tumbar la suite.
  }
}, 30000);

describe("registrar una floración", () => {
  it("la anota en la parcela, y con el bloque cuando se da", async () => {
    const entera = await registrarFloracion(gestorId, { locationId: parcela, startsAt: dia("2026-03-01"), endsAt: dia("2026-03-20") });
    expect(entera.plotBlockId).toBeNull();
    const deBloque = await registrarFloracion(gestorId, { locationId: parcela, plotBlockId: bloque, startsAt: dia("2026-04-01") });
    expect(deBloque.plotBlockId).toBe(bloque);
  }, 20000);

  it("un bloque de OTRA parcela no se acepta", async () => {
    await expect(
      registrarFloracion(gestorId, { locationId: parcela, plotBlockId: bloqueAjeno, startsAt: dia("2026-05-01") }),
    ).rejects.toBeInstanceOf(FloracionValidationError);
  }, 20000);

  it("una ventana al revés se rechaza con una frase, no con un error de Postgres", async () => {
    await expect(
      registrarFloracion(gestorId, { locationId: parcela, startsAt: dia("2026-06-10"), endsAt: dia("2026-06-01") }),
    ).rejects.toBeInstanceOf(FloracionValidationError);
  }, 20000);

  it("sólo se anota en una parcela o microparcela, no en la finca", async () => {
    await expect(
      registrarFloracion(gestorId, { locationId: finca, startsAt: dia("2026-03-01") }),
    ).rejects.toBeInstanceOf(FloracionValidationError);
  }, 20000);

  it("quien no gestiona la finca no la anota — y el control de que el gestor SÍ puede", async () => {
    await expect(
      registrarFloracion(sinPermisoId, { locationId: parcela, startsAt: dia("2026-03-01") }),
    ).rejects.toBeInstanceOf(TraceabilityAccessError);
    // Sin esta mitad, un fallo que rechazara a TODO el mundo pasaría por un permiso que funciona.
    await expect(registrarFloracion(gestorId, { locationId: parcela, startsAt: dia("2026-07-01") })).resolves.toBeTruthy();
  }, 20000);
});

describe("¿estaba en floración ese día?", () => {
  it("dentro de una ventana cerrada, sí; fuera, no", async () => {
    const p = (await prisma.location.create({ data: { name: `TEST P cerrada (${RUN_ID})`, locationType: "plot", classification: "internal", parentLocationId: finca } })).id;
    await registrarFloracion(gestorId, { locationId: p, startsAt: dia("2026-03-01"), endsAt: dia("2026-03-20") });
    expect(await enFloracion(p, dia("2026-03-10"))).toHaveLength(1);
    expect(await enFloracion(p, dia("2026-03-01"))).toHaveLength(1); // el borde cuenta
    expect(await enFloracion(p, dia("2026-03-20"))).toHaveLength(1); // el otro borde también
    expect(await enFloracion(p, dia("2026-02-28"))).toHaveLength(0);
    expect(await enFloracion(p, dia("2026-03-21"))).toHaveLength(0);
  }, 20000);

  it("una ventana SIN CIERRE cuenta como abierta — que es el estado de campo mientras dura", async () => {
    const p = (await prisma.location.create({ data: { name: `TEST P abierta (${RUN_ID})`, locationType: "plot", classification: "internal", parentLocationId: finca } })).id;
    await registrarFloracion(gestorId, { locationId: p, startsAt: dia("2026-03-01") });
    // Tratar `endsAt` nulo como «ya terminó» haría que el aviso callara justo durante la floración.
    expect(await enFloracion(p, dia("2026-03-10"))).toHaveLength(1);
    expect(await enFloracion(p, dia("2027-01-01"))).toHaveLength(1);
    expect(await enFloracion(p, dia("2026-02-28"))).toHaveLength(0); // antes de empezar, no
  }, 20000);

  it("la floración de una parcela no se le atribuye a otra", async () => {
    const a = (await prisma.location.create({ data: { name: `TEST P aislada A (${RUN_ID})`, locationType: "plot", classification: "internal", parentLocationId: finca } })).id;
    const b = (await prisma.location.create({ data: { name: `TEST P aislada B (${RUN_ID})`, locationType: "plot", classification: "internal", parentLocationId: finca } })).id;
    await registrarFloracion(gestorId, { locationId: a, startsAt: dia("2026-03-01"), endsAt: dia("2026-03-20") });
    expect(await enFloracion(a, dia("2026-03-10"))).toHaveLength(1);
    expect(await enFloracion(b, dia("2026-03-10"))).toHaveLength(0);
  }, 20000);
});
