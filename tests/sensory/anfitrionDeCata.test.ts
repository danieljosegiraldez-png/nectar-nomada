/**
 * El anfitrión de una cata puede montarla — y hasta hoy no podía nadie salvo un
 * administrador de plataforma.
 *
 * **El hallazgo (2026-09-06).** `sensory:manage_session` lo tenían Platform
 * Admin y Sensory Head Judge; el acceso a muestras, Platform Admin y Farm
 * Operator. Sólo el admin tenía los dos, así que el head judge veía la
 * herramienta ofrecida y no alcanzaba ni una muestra — la misma forma que la
 * lente de «formularios que ofrecen lo que el servicio niega», pero en el
 * catálogo de permisos.
 *
 * **La corrección de Daniel:** dirigir una cata y juzgar una competencia son dos
 * usos distintos. `Cupping Host` es el primero; `Sensory Head Judge`, `Sensory
 * Judge` y un futuro director de jueces son el segundo.
 *
 * Y una pieza que faltaba entera: **invitar participantes**. Sin ella una cata
 * la puntúa quien alguien metiera a mano en la base, o nadie.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import {
  crearSesionDeCata,
  listarMuestrasParaCata,
  invitarParticipante,
  listarParticipantes,
  listarInvitables,
  SesionDeCataError,
} from "../../lib/sensory/sessions";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN = `host-${Date.now()}`;
let orgId: string, plotId: string, scopeId: string;
let anfitrion: string, catador: string, ajeno: string;
let versionId: string, m1: string, m2: string, sesionId: string;
let roast1: string, roast2: string;

async function cuenta(label: string) {
  const p = await prisma.person.create({
    data: { givenName: "TEST", familyName: label, displayName: `TEST ${label} (${RUN})`, locale: "es" },
  });
  return (await prisma.userAccount.create({
    data: { personId: p.id, authProvider: "credentials", status: "active" },
  })).id;
}

beforeAll(async () => {
  orgId = (await prisma.organization.create({
    data: { organizationType: "farm", name: `TEST ${RUN}`, status: "approved", classification: "internal" },
  })).id;
  plotId = (await prisma.location.create({
    data: { locationType: "plot", name: `TEST plot ${RUN}`, organizationId: orgId, status: "approved", classification: "internal" },
  })).id;

  anfitrion = await cuenta("Anfitrion");
  catador = await cuenta("Catador");
  ajeno = await cuenta("Ajeno");

  scopeId = (await prisma.scope.create({ data: { scopeType: "location", scopeRefId: plotId } })).id;

  // El anfitrión se asigna a nivel PLATAFORMA, no a una parcela. Una sesión de
  // cata no cuelga de una ubicación —se catan muestras de donde sea—, y
  // `manage_session` se comprueba a escala de plataforma, igual que en
  // calibración. Un ámbito estrecho nunca implica uno más amplio (RBAC.md §3),
  // así que asignarlo a la parcela lo dejaba sin poder montar nada: eso lo
  // descubrió esta prueba.
  const host = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Cupping Host" } });
  const plataforma =
    (await prisma.scope.findFirst({ where: { scopeType: "platform" } })) ??
    (await prisma.scope.create({ data: { scopeType: "platform", scopeRefId: null } }));
  await prisma.assignment.create({ data: { userAccountId: anfitrion, roleProfileId: host.id, scopeId: plataforma.id } });

  const proto = await prisma.sensoryProtocol.create({
    data: { domain: "coffee", name: `TEST proto ${RUN}`, status: "active", standardLicenseStatus: "adapted_original" },
  });
  const v = await prisma.sensoryProtocolVersion.create({
    data: { protocolId: proto.id, version: 1, scoreMin: 0, scoreMax: 10, status: "active" },
  });
  versionId = v.id;
  await prisma.sensoryAttribute.create({
    data: { protocolVersionId: v.id, name: "Aroma", displayOrder: 0, scaleMin: 0, scaleMax: 10, section: "descriptive" },
  });

  const muestra = async (c: string) =>
    (await prisma.sample.create({
      data: {
        sampleCode: `${c}-${RUN}`,
        sampleType: "green",
        organizationId: orgId,
        locationId: plotId,
        status: "approved",
        classification: "internal",
        createdBy: anfitrion,
      },
    })).id;
  m1 = await muestra("H1");
  m2 = await muestra("H2");
  roast1 = (await prisma.roastSession.create({
    data: { purpose: "sample", sourceSampleId: m1, startedAt: new Date(), createdBy: anfitrion },
  })).id;
  roast2 = (await prisma.roastSession.create({
    data: { purpose: "sample", sourceSampleId: m2, startedAt: new Date(), createdBy: anfitrion },
  })).id;
});

afterAll(async () => {
  const ids = [anfitrion, catador, ajeno];
  if (sesionId) {
    await prisma.assignment.deleteMany({ where: assertDefinedWhere({ scope: { scopeType: "session" as const, scopeRefId: sesionId } }) });
    await prisma.scope.deleteMany({ where: assertDefinedWhere({ scopeType: "session" as const, scopeRefId: sesionId }) });
    await prisma.sensorySession.deleteMany({ where: assertDefinedWhere({ id: sesionId }) });
  }
  await prisma.roastSession.deleteMany({ where: assertDefinedWhere({ id: { in: [roast1, roast2] } }) });
  await prisma.sample.deleteMany({ where: assertDefinedWhere({ createdBy: { in: ids } }) });
  const ver = await prisma.sensoryProtocolVersion.findUnique({ where: { id: versionId } });
  await prisma.sensoryAttribute.deleteMany({ where: assertDefinedWhere({ protocolVersionId: versionId }) });
  await prisma.sensoryProtocolVersion.deleteMany({ where: assertDefinedWhere({ id: versionId }) });
  if (ver) await prisma.sensoryProtocol.deleteMany({ where: assertDefinedWhere({ id: ver.protocolId }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: ids } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: scopeId }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: ids } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: plotId }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: orgId }) });
});

describe("el anfitrión de cata monta la cata", () => {
  it("alcanza las muestras con `sample:view`, sin poder cambiarlas", async () => {
    const suyas = (await listarMuestrasParaCata(anfitrion)).map((m) => m.id);
    expect(suyas, "sin esto el anfitrión ve la pantalla y no puede elegir nada").toEqual(
      expect.arrayContaining([m1, m2]),
    );
  });

  it("crea la sesión con su propósito y su tipo", async () => {
    const s = await crearSesionDeCata(anfitrion, {
      name: `Cata ${RUN}`,
      protocolVersionId: versionId,
      muestras: [m1, m2],
      roastSessions: [roast1, roast2],
      purpose: "characterize",
      subject: "intermediate_product",
    });
    sesionId = s.id;
    const leida = await prisma.sensorySession.findUniqueOrThrow({ where: { id: s.id } });
    expect(leida.purpose, "sin propósito, una cata de QC y una de competencia se guardan iguales").toBe("characterize");
    expect(leida.subject).toBe("intermediate_product");
  });

  /**
   * El control que da sentido al de arriba: alguien sin el perfil no puede.
   * Sin esto, «el anfitrión puede» pasaría también si el servicio no guardara.
   */
  it("alguien sin el perfil no puede montar una", async () => {
    await expect(
      crearSesionDeCata(ajeno, { name: "No", protocolVersionId: versionId, muestras: [m1] }),
    ).rejects.toBeInstanceOf(SesionDeCataError);
  });
});

describe("una cata es de varios", () => {
  it("empieza sin participantes, y el invitado aparece en la lista", async () => {
    expect(await listarParticipantes(anfitrion, sesionId), "control: nadie antes de invitar").toEqual([]);

    await invitarParticipante(anfitrion, { sessionId: sesionId, invitadoUserAccountId: catador });

    const dentro = await listarParticipantes(anfitrion, sesionId);
    expect(dentro.map((p) => p.userAccountId)).toEqual([catador]);
    expect(dentro[0]!.perfil, "entra como juez de ESTA sesión, no como algo global").toBe("Sensory Judge");
  });

  it("invitar dos veces no duplica", async () => {
    await invitarParticipante(anfitrion, { sessionId: sesionId, invitadoUserAccountId: catador });
    expect(await listarParticipantes(anfitrion, sesionId)).toHaveLength(1);
  });

  it("no ofrece como invitable a quien ya está dentro", async () => {
    const invitables = (await listarInvitables(anfitrion, sesionId)).map((i) => i.id);
    expect(invitables).not.toContain(catador);
    expect(invitables, "control: sí ofrece a quien no está").toContain(ajeno);
  });
});
