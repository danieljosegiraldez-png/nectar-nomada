/**
 * El informe de un Q-grader al que se le paga el análisis.
 *
 * **El hueco que cierra (2026-09-07).** `assessment.evaluator_user_account_id`
 * era NOT NULL con FK a `user_account`, así que un evaluador externo —que por
 * definición no tiene cuenta— no cabía. El trabajo que se paga era justo el que
 * no se podía registrar.
 *
 * **Lo que estas pruebas vigilan de verdad**, y por qué la última tanda va
 * contra SQL crudo: la regla «exactamente un evaluador, y el externo trae
 * siempre el puntero a su original» vive en un CHECK de la base. Probarla sólo a
 * través del servicio comprobaría el servicio, no la regla — y una restricción
 * que sólo existe en TypeScript se la salta un importador, una reparación
 * operativa o SQL directo.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { registrarInformeExterno, InformeExternoError } from "../../lib/sensory/informeExterno";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN = `ext-${Date.now()}`;
let orgId: string, plotId: string;
let admin: string, sinPermiso: string;
let qGraderPersonId: string;
let versionId: string;
const atributos = new Map<string, string>();
let m1: string, m2: string, m3: string, m4: string;

async function persona(label: string) {
  return prisma.person.create({
    data: { givenName: "TEST", familyName: label, displayName: `TEST ${label} (${RUN})`, locale: "es" },
  });
}

async function cuenta(label: string) {
  const p = await persona(label);
  return (await prisma.userAccount.create({ data: { personId: p.id, authProvider: "credentials", status: "active" } })).id;
}

beforeAll(async () => {
  orgId = (
    await prisma.organization.create({
      data: { organizationType: "farm", name: `TEST ${RUN}`, status: "approved", classification: "internal" },
    })
  ).id;
  plotId = (
    await prisma.location.create({
      data: { locationType: "plot", name: `TEST plot ${RUN}`, organizationId: orgId, status: "approved", classification: "internal" },
    })
  ).id;

  admin = await cuenta("Admin");
  sinPermiso = await cuenta("SinPermiso");

  // La persona que firma el informe: SIN cuenta, que es el caso real, y con su
  // credencial en el campo que el esquema ya tenía y nadie usaba.
  const q = await persona("Q Grader");
  await prisma.person.update({
    where: { id: q.id },
    data: {
      sensoryCertifications: [
        {
          certifying_body: "CQI",
          certification_name: "Q Arabica Grader",
          level_or_rank: "Q",
          date_earned: "2024-05-01",
          certificate_reference: `TEST-${RUN}`,
        },
      ],
    },
  });
  qGraderPersonId = q.id;

  const plataforma =
    (await prisma.scope.findFirst({ where: { scopeType: "platform" } })) ??
    (await prisma.scope.create({ data: { scopeType: "platform", scopeRefId: null } }));
  const perfilAdmin = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Platform Admin" } });
  await prisma.assignment.create({ data: { userAccountId: admin, roleProfileId: perfilAdmin.id, scopeId: plataforma.id } });

  const protocolo = await prisma.sensoryProtocol.create({
    data: { domain: "coffee", name: `TEST protocolo ${RUN}`, status: "active", standardLicenseStatus: "adapted_original" },
  });
  const version = await prisma.sensoryProtocolVersion.create({
    data: { protocolId: protocolo.id, version: 1, scoreMin: 0, scoreMax: 10, status: "active" },
  });
  versionId = version.id;
  for (const [i, nombre] of ["Aroma", "Flavor"].entries()) {
    const a = await prisma.sensoryAttribute.create({
      data: { protocolVersionId: version.id, name: nombre, displayOrder: i, scaleMin: 0, scaleMax: 10, section: "descriptive" },
    });
    atributos.set(nombre, a.id);
  }

  const muestra = async (codigo: string) =>
    (
      await prisma.sample.create({
        data: {
          sampleCode: `${codigo}-${RUN}`,
          sampleType: "green",
          organizationId: orgId,
          locationId: plotId,
          status: "approved",
          classification: "internal",
          createdBy: admin,
        },
      })
    ).id;
  m1 = await muestra("M1");
  m2 = await muestra("M2");
  m3 = await muestra("M3");
  m4 = await muestra("M4");
});

afterAll(async () => {
  const sesiones = await prisma.sensorySession.findMany({
    where: assertDefinedWhere({ createdBy: admin }),
    select: { id: true },
  });
  await prisma.sensorySession.deleteMany({ where: assertDefinedWhere({ id: { in: sesiones.map((s) => s.id) } }) });
  await prisma.sample.deleteMany({ where: assertDefinedWhere({ createdBy: admin }) });
  const ver = await prisma.sensoryProtocolVersion.findUnique({ where: { id: versionId } });
  if (ver) {
    await prisma.sensoryAttribute.deleteMany({ where: assertDefinedWhere({ protocolVersionId: versionId }) });
    await prisma.sensoryProtocolVersion.deleteMany({ where: assertDefinedWhere({ id: versionId }) });
    await prisma.sensoryProtocol.deleteMany({ where: assertDefinedWhere({ id: ver.protocolId }) });
  }
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: [admin, sinPermiso] } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: [admin, sinPermiso] } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: plotId }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: orgId }) });
});

const base = (sampleId: string) => ({
  sampleId,
  protocolVersionId: versionId,
  evaluadorPersonId: qGraderPersonId,
  sourceReference: "PDF del informe, Drive/informes/2026-03-12.pdf",
  respuestas: [
    { attributeName: "Aroma", value: 8 },
    { attributeName: "Flavor", value: 7.5 },
  ],
  overallScore: 8,
});

describe("registrar el informe de un evaluador sin cuenta", () => {
  it("lo guarda atado a la muestra real, con su firmante y su procedencia", async () => {
    const v = await registrarInformeExterno(admin, base(m1));

    expect(v.evaluatorUserAccountId, "un informe externo no tiene cuenta detrás").toBeNull();
    expect(v.externalEvaluatorPersonId).toBe(qGraderPersonId);
    expect(v.sourceReference).toContain("Drive/informes");
    expect(v.overallScore?.toNumber()).toBe(8);
    expect(v.attributeResponses).toHaveLength(2);

    // Lo que hace que el puntaje sirva para algo: se puede volver del número al
    // café. Sin el mapeo, el informe sería un número suelto.
    const conMapeo = await prisma.assessment.findUniqueOrThrow({
      where: { id: v.id },
      include: { blindSample: { include: { blindMapping: true } }, externalEvaluator: true },
    });
    expect(conMapeo.blindSample.blindMapping?.sampleId).toBe(m1);
    expect(conMapeo.externalEvaluator?.displayName).toContain("Q Grader");
    // La credencial vive donde el esquema ya la tenía prevista.
    expect(JSON.stringify(conMapeo.externalEvaluator?.sensoryCertifications)).toContain("Q Arabica Grader");
  });

  it("sin `sensory:manage_session` no se puede registrar", async () => {
    await expect(registrarInformeExterno(sinPermiso, base(m2))).rejects.toThrow(
      new InformeExternoError("no_manage_access"),
    );
  });

  it("rechaza un atributo que el protocolo no tiene, en vez de ignorarlo", async () => {
    // Ignorarlo dejaría entrar un informe de otro estándar a medias, con su
    // total calculado sobre los atributos que casaron.
    await expect(
      registrarInformeExterno(admin, {
        ...base(m3),
        respuestas: [{ attributeName: "Aroma", value: 8 }, { attributeName: "Body", value: 7 }],
      }),
    ).rejects.toThrow(/unknown_attribute:Body/);
  });

  it("exige el puntero al informe original", async () => {
    await expect(registrarInformeExterno(admin, { ...base(m4), sourceReference: "   " })).rejects.toThrow(
      new InformeExternoError("source_reference_required"),
    );
  });

  it("el mismo evaluador no entra dos veces sobre la misma muestra ciega", async () => {
    const v = await registrarInformeExterno(admin, base(m2));
    await expect(
      prisma.assessment.create({
        data: {
          blindSampleId: v.blindSampleId,
          externalEvaluatorPersonId: qGraderPersonId,
          sourceReference: "otro",
        },
      }),
    ).rejects.toThrow();
  });
});

/**
 * **La regla, contra la base y no contra el servicio.** Estas cuatro escriben
 * SQL/Prisma directo a propósito: comprueban el `CHECK`, que es lo único que un
 * importador o una reparación operativa no se puede saltar.
 */
describe("el CHECK `assessment_un_solo_evaluador`", () => {
  async function crearCruda(data: Record<string, unknown>) {
    const ciega = await prisma.sensoryBlindSample.findFirstOrThrow({
      where: assertDefinedWhere({ flight: { session: { createdBy: admin } } }),
    });
    return prisma.assessment.create({ data: { blindSampleId: ciega.id, ...data } as never });
  }

  it("rechaza una valoración sin ningún evaluador", async () => {
    await expect(crearCruda({})).rejects.toThrow(/assessment_un_solo_evaluador/);
  });

  it("rechaza una valoración con los dos evaluadores", async () => {
    await expect(
      crearCruda({
        evaluatorUserAccountId: admin,
        externalEvaluatorPersonId: qGraderPersonId,
        sourceReference: "algo",
      }),
    ).rejects.toThrow(/assessment_un_solo_evaluador/);
  });

  it("rechaza un evaluador externo sin puntero a su original", async () => {
    await expect(crearCruda({ externalEvaluatorPersonId: qGraderPersonId })).rejects.toThrow(
      /assessment_un_solo_evaluador/,
    );
  });

  it("rechaza un puntero que es sólo espacios", async () => {
    await expect(
      crearCruda({ externalEvaluatorPersonId: qGraderPersonId, sourceReference: "   " }),
    ).rejects.toThrow(/assessment_un_solo_evaluador/);
  });

  /**
   * **El control positivo de las cuatro de arriba.** Sin esto, un CHECK que
   * rechazara absolutamente todo las pasaría las cuatro.
   */
  it("y acepta una valoración interna normal, con cuenta y sin procedencia externa", async () => {
    const creada = await crearCruda({ evaluatorUserAccountId: sinPermiso });
    expect(creada.externalEvaluatorPersonId).toBeNull();
    await prisma.assessment.delete({ where: { id: creada.id } });
  });
});
