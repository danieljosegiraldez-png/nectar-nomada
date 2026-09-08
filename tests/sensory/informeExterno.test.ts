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
import {
  registrarInformeExterno,
  opcionesParaInforme,
  InformeExternoError,
} from "../../lib/sensory/informeExterno";
import { ATRIBUTOS_CVA_AFECTIVO, FORMULA_CVA_AFECTIVO } from "../../lib/sensory/puntajeCva";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN = `ext-${Date.now()}`;
let orgId: string, plotId: string;
let admin: string, sinPermiso: string;
let qGraderPersonId: string;
let versionId: string;
const atributos = new Map<string, string>();
let m1: string, m2: string, m3: string, m4: string, m5: string, m6: string;
let versionCvaId: string;
let ilegiblePersonId: string;

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
  m5 = await muestra("M5");
  m6 = await muestra("M6");

  // Una fila ilegible como la que ya existe en la base — `date_earned: null` en
  // vez de ausente. La pantalla tiene que seguir abriéndose con ella dentro.
  ilegiblePersonId = (
    await prisma.person.update({
      where: { id: (await persona("Ilegible")).id },
      data: {
        sensoryCertifications: [
          { certifying_body: "CQI", certification_name: "Q Grader", date_earned: null, level_or_rank: null },
        ],
      },
    })
  ).id;

  // Una versión que SÍ calcula el total, para las tazas: bajo `scoreFormula:
  // null` el resolver ni las mira, así que probarlas ahí no probaría nada.
  const protocoloCva = await prisma.sensoryProtocol.create({
    data: { domain: "coffee", name: `TEST CVA ${RUN}`, status: "active", standardLicenseStatus: "adapted_original" },
  });
  const versionCva = await prisma.sensoryProtocolVersion.create({
    data: {
      protocolId: protocoloCva.id,
      version: 1,
      scoreMin: 58,
      scoreMax: 100,
      status: "active",
      scoreFormula: FORMULA_CVA_AFECTIVO,
    },
  });
  versionCvaId = versionCva.id;
  for (const [i, nombre] of ATRIBUTOS_CVA_AFECTIVO.entries()) {
    await prisma.sensoryAttribute.create({
      data: { protocolVersionId: versionCva.id, name: nombre, displayOrder: i, scaleMin: 1, scaleMax: 9, section: "affective" },
    });
  }
});

afterAll(async () => {
  const sesiones = await prisma.sensorySession.findMany({
    where: assertDefinedWhere({ createdBy: admin }),
    select: { id: true },
  });
  await prisma.sensorySession.deleteMany({ where: assertDefinedWhere({ id: { in: sesiones.map((s) => s.id) } }) });
  await prisma.sample.deleteMany({ where: assertDefinedWhere({ createdBy: admin }) });
  for (const id of [versionId, versionCvaId]) {
    const ver = id ? await prisma.sensoryProtocolVersion.findUnique({ where: { id } }) : null;
    if (!ver) continue;
    await prisma.sensoryAttribute.deleteMany({ where: assertDefinedWhere({ protocolVersionId: id }) });
    await prisma.sensoryProtocolVersion.deleteMany({ where: assertDefinedWhere({ id }) });
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

/**
 * **Las tazas del informe, que el camino externo perdía.**
 *
 * Medido el 2026-09-08: `InformeExterno` no tenía dónde traerlas, así que el
 * resolver las daba por 0 y un informe que declara tazas no uniformes se
 * guardaba por encima de lo que dice el papel. La cata interna sí las pasaba
 * desde siempre —`app/actions/sensory.ts`—; era este camino, el del trabajo que
 * se paga, el que las descartaba.
 */
describe("las tazas no uniformes y defectuosas del informe", () => {
  const cva = (sampleId: string, extra: Record<string, unknown> = {}) => ({
    sampleId,
    protocolVersionId: versionCvaId,
    evaluadorPersonId: qGraderPersonId,
    sourceReference: "PDF del informe CVA",
    respuestas: ATRIBUTOS_CVA_AFECTIVO.map((name) => ({ attributeName: name, value: 7 })),
    ...extra,
  });

  it("sin tazas marcadas, el total es el que sale de los ocho atributos", async () => {
    const v = await registrarInformeExterno(admin, cva(m5));
    // 0,65625 × 56 + 52,75 = 89,5 — la fórmula medida contra la calculadora
    // pública de la SCA, no deducida del estándar cifrado.
    expect(Number(v.overallScore)).toBe(89.5);
    expect(v.nonUniformCups).toBe(0);
  });

  it("una taza no uniforme resta dos puntos, y los MISMOS ocho atributos", async () => {
    const v = await registrarInformeExterno(admin, cva(m6, { tazasNoUniformes: 1 }));
    expect(Number(v.overallScore), "89,5 − 2").toBe(87.5);
    expect(v.nonUniformCups).toBe(1);
    // El control de que la diferencia viene de la taza y no de otra cosa: los
    // atributos son idénticos a los de la prueba de arriba.
    expect(v.attributeResponses.every((r) => Number(r.value) === 7)).toBe(true);
  });
});

/**
 * Lo que la pantalla pide para ofrecer listas en vez de campos en blanco.
 * Los atributos NO se teclean: salen del protocolo elegido, y sus nombres son
 * la autoridad con la que el servicio casa.
 */
describe("las opciones de la pantalla", () => {
  it("sin protocolo elegido no hay atributos que pintar todavía", async () => {
    const o = await opcionesParaInforme(admin);
    expect(o.atributos, "el segundo paso no existe hasta elegir protocolo").toBeNull();
    expect(o.calculaTotal).toBeNull();
    expect(o.usaTazas).toBeNull();
    expect(o.protocolos.some((p) => p.label.includes(RUN)), "el protocolo de esta corrida debe estar").toBe(true);
  });

  it("con el CVA elegido trae sus ocho atributos, en orden, y dice que calcula", async () => {
    const o = await opcionesParaInforme(admin, versionCvaId);
    expect(o.atributos?.map((a) => a.name)).toEqual([...ATRIBUTOS_CVA_AFECTIVO]);
    expect(o.calculaTotal, "con fórmula el total no se teclea").toBe(true);
    expect(o.usaTazas, "el CVA cuenta tazas").toBe(true);
    expect(o.atributos?.[0]?.min).toBe(1);
    expect(o.atributos?.[0]?.max).toBe(9);
  });

  /**
   * El control positivo del anterior: sin este, un lector que devolviera
   * siempre `true` en las dos banderas pasaría la prueba de arriba entera.
   */
  it("con un protocolo SIN fórmula, ni calcula el total ni cuenta tazas", async () => {
    const o = await opcionesParaInforme(admin, versionId);
    expect(o.calculaTotal, "sin fórmula el informe trae el total escrito").toBe(false);
    expect(o.usaTazas, "las tazas son del CVA; aquí el resolver las ignoraría").toBe(false);
    expect(o.atributos?.map((a) => a.name)).toEqual(["Aroma", "Flavor"]);
  });

  it("la certificación va en la etiqueta: es lo que distingue a un Q-grader", async () => {
    const o = await opcionesParaInforme(admin);
    const firmante = o.evaluadores.find((e) => e.id === qGraderPersonId);
    expect(firmante?.label).toContain("Q Arabica Grader");
    expect(firmante?.label).toContain("CQI");
  });

  /**
   * **Una fila ilegible degrada a esa persona, no a la lista.** Sin esto, la
   * persona con `date_earned: null` que hay en la base dejaba la pantalla
   * entera sin abrirse: nadie podía registrar ningún informe por culpa de una
   * fila ajena. Lo destapó esta suite el 2026-09-08, no una lectura del código.
   */
  it("una certificación ilegible no tumba la lista: esa persona sale sin credencial", async () => {
    const o = await opcionesParaInforme(admin);
    const roto = o.evaluadores.find((e) => e.id === ilegiblePersonId);
    expect(roto, "la persona sigue estando: se puede elegir igual").toBeDefined();
    expect(roto!.label, "y no se le afirma una credencial que no se pudo leer").not.toContain("Q Grader");
    // El control positivo al lado: en la MISMA lista, la que sí parsea la trae.
    expect(o.evaluadores.find((e) => e.id === qGraderPersonId)?.label).toContain("Q Arabica Grader");
  });

  it("y sin permiso no devuelve listas, que es lo que la pantalla mira para no pintarse", async () => {
    await expect(opcionesParaInforme(sinPermiso)).rejects.toThrow(new InformeExternoError("no_manage_access"));
  });
});
