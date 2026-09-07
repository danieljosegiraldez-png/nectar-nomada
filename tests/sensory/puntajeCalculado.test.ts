/**
 * El puntaje total, al enviar una valoración de verdad.
 *
 * `tests/sensory/puntajeCva.test.ts` prueba la aritmética contra lo medido en la
 * calculadora de la SCA. Esto prueba lo otro, que es donde vive el error caro:
 * que el servidor **use** esa aritmética, que empareje cada valor con el
 * atributo que le toca, y que **no** cambie nada para los protocolos que ya
 * existen — seis versiones en producción sin `scoreFormula`, cuyo total lo
 * teclea quien cata desde siempre.
 *
 * El control positivo de todo el archivo es la primera prueba del bloque
 * clásico: si un protocolo sin fórmula dejara de guardar el total tecleado,
 * ninguna de las de abajo lo diría.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { submitAssessment, SensoryAccessError } from "../../lib/sensory/service";
import { ATRIBUTOS_CVA_AFECTIVO, FORMULA_CVA_AFECTIVO } from "../../lib/sensory/puntajeCva";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN = `cva-${Date.now()}`;

let orgId: string, plotId: string, scopeId: string;
let juez: string;
let versionCva: string, versionClasica: string;
/** attributeId por nombre, para cada protocolo. */
const atributosCva = new Map<string, string>();
const atributosClasicos = new Map<string, string>();
let cieganCva: string[] = [];
let ciegaClasica: string;

async function cuenta(label: string) {
  const p = await prisma.person.create({
    data: { givenName: "TEST", familyName: label, displayName: `TEST ${label} (${RUN})`, locale: "es" },
  });
  return (
    await prisma.userAccount.create({ data: { personId: p.id, authProvider: "credentials", status: "active" } })
  ).id;
}

async function protocolo(
  nombre: string,
  scoreFormula: string | null,
  atributos: ReadonlyArray<{ name: string; scaleMin: number; scaleMax: number }>,
  destino: Map<string, string>,
) {
  const p = await prisma.sensoryProtocol.create({
    data: {
      domain: "coffee",
      name: `TEST ${nombre} ${RUN}`,
      status: "active",
      standardLicenseStatus: "adapted_original",
    },
  });
  const v = await prisma.sensoryProtocolVersion.create({
    data: {
      protocolId: p.id,
      version: 1,
      scoreMin: 0,
      scoreMax: scoreFormula ? 100 : 10,
      scoreFormula,
      status: "active",
    },
  });
  for (const [i, a] of atributos.entries()) {
    const fila = await prisma.sensoryAttribute.create({
      data: {
        protocolVersionId: v.id,
        name: a.name,
        displayOrder: i,
        scaleMin: a.scaleMin,
        scaleMax: a.scaleMax,
        section: scoreFormula ? "affective" : "descriptive",
      },
    });
    destino.set(a.name, fila.id);
  }
  return v.id;
}

/** Sesión con un vuelo y `cuantas` muestras ciegas; devuelve sus ids. */
async function sesionCon(protocolVersionId: string, cuantas: number) {
  const s = await prisma.sensorySession.create({
    data: {
      name: `TEST sesión ${RUN} ${protocolVersionId.slice(0, 8)}`,
      protocolVersionId,
      status: "in_progress",
      classification: "internal",
      createdBy: juez,
    },
  });
  const vuelo = await prisma.sensoryFlight.create({ data: { sessionId: s.id, name: "Vuelo 1", sequenceOrder: 0 } });
  const ids: string[] = [];
  for (let i = 0; i < cuantas; i++) {
    const c = await prisma.sensoryBlindSample.create({
      data: { flightId: vuelo.id, blindCode: String.fromCharCode(65 + i) },
    });
    ids.push(c.id);
  }
  return ids;
}

/** Las ocho respuestas del CVA, todas al mismo valor salvo las que se indiquen. */
function respuestasCva(valor: number, excepciones: Partial<Record<string, number>> = {}) {
  return ATRIBUTOS_CVA_AFECTIVO.map((nombre) => ({
    attributeId: atributosCva.get(nombre)!,
    value: excepciones[nombre] ?? valor,
  }));
}

beforeAll(async () => {
  orgId = (
    await prisma.organization.create({
      data: { organizationType: "farm", name: `TEST ${RUN}`, status: "approved", classification: "internal" },
    })
  ).id;
  plotId = (
    await prisma.location.create({
      data: {
        locationType: "plot",
        name: `TEST plot ${RUN}`,
        organizationId: orgId,
        status: "approved",
        classification: "internal",
      },
    })
  ).id;

  juez = await cuenta("Juez");
  scopeId = (await prisma.scope.create({ data: { scopeType: "location", scopeRefId: plotId } })).id;

  // `sensory:submit_assessment` lo tiene Sensory Judge; se asigna a plataforma
  // porque un ámbito estrecho nunca implica uno amplio (RBAC.md §3) y la
  // sesión de prueba no cuelga de la parcela.
  const judge = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Sensory Judge" } });
  const plataforma =
    (await prisma.scope.findFirst({ where: { scopeType: "platform" } })) ??
    (await prisma.scope.create({ data: { scopeType: "platform", scopeRefId: null } }));
  await prisma.assignment.create({ data: { userAccountId: juez, roleProfileId: judge.id, scopeId: plataforma.id } });

  versionCva = await protocolo(
    "cva afectivo",
    FORMULA_CVA_AFECTIVO,
    ATRIBUTOS_CVA_AFECTIVO.map((name) => ({ name, scaleMin: 1, scaleMax: 9 })),
    atributosCva,
  );
  versionClasica = await protocolo(
    "clásico sin fórmula",
    null,
    [{ name: "Aroma", scaleMin: 0, scaleMax: 10 }],
    atributosClasicos,
  );

  cieganCva = await sesionCon(versionCva, 6);
  ciegaClasica = (await sesionCon(versionClasica, 1))[0]!;
});

afterAll(async () => {
  const sesiones = await prisma.sensorySession.findMany({
    where: assertDefinedWhere({ createdBy: juez }),
    select: { id: true },
  });
  await prisma.sensorySession.deleteMany({
    where: assertDefinedWhere({ id: { in: sesiones.map((s) => s.id) } }),
  });
  for (const v of [versionCva, versionClasica]) {
    const ver = await prisma.sensoryProtocolVersion.findUnique({ where: { id: v } });
    if (!ver) continue;
    await prisma.sensoryAttribute.deleteMany({ where: assertDefinedWhere({ protocolVersionId: v }) });
    await prisma.sensoryProtocolVersion.deleteMany({ where: assertDefinedWhere({ id: v }) });
    await prisma.sensoryProtocol.deleteMany({ where: assertDefinedWhere({ id: ver.protocolId }) });
  }
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: juez }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: scopeId }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: juez }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: plotId }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: orgId }) });
});

describe("un protocolo sin fórmula sigue funcionando igual", () => {
  it("guarda el total tal como lo tecleó quien cató, y sin cuentas de tazas", async () => {
    const a = await submitAssessment(juez, {
      blindSampleId: ciegaClasica,
      overallScore: 8.25,
      attributeResponses: [{ attributeId: atributosClasicos.get("Aroma")!, value: 7 }],
    });
    expect(a.overallScore?.toNumber()).toBe(8.25);
    // Un 0 aquí afirmaría «se contaron y no había ninguna» sobre una cata donde
    // nadie contó nada. Null es lo único honesto.
    expect(a.nonUniformCups).toBeNull();
    expect(a.defectiveCups).toBeNull();
  });
});

describe("un protocolo con la fórmula del CVA afectivo", () => {
  it("calcula el total a partir de los ocho atributos", async () => {
    const a = await submitAssessment(juez, {
      blindSampleId: cieganCva[0]!,
      attributeResponses: respuestasCva(9),
      nonUniformCups: 0,
      defectiveCups: 0,
    });
    expect(a.overallScore?.toNumber()).toBe(100);
  });

  it("descuenta las tazas no uniformes y las defectuosas", async () => {
    const a = await submitAssessment(juez, {
      blindSampleId: cieganCva[1]!,
      attributeResponses: respuestasCva(9),
      nonUniformCups: 1,
      defectiveCups: 1,
    });
    expect(a.overallScore?.toNumber()).toBe(94);
    expect(a.nonUniformCups).toBe(1);
    expect(a.defectiveCups).toBe(1);
  });

  /**
   * **La prueba que distingue «empareja» de «lee por posición», y costó dos
   * intentos.** La primera versión mandaba los ocho valores del revés y
   * esperaba el mismo total: no probaba nada, porque el puntaje es una SUMA y
   * una permutación de los mismos ocho números da idéntico resultado. Su
   * flip-test salió verde y lo dijo.
   *
   * Lo que sí lo distingue es un envío de ocho respuestas donde una repite
   * atributo y otra falta — un cliente que manda dos veces el mismo campo.
   * Emparejando por nombre, `Sweetness` no aparece y esto se rechaza.
   * Leyendo por posición hay ocho valores, sale un puntaje, y nadie se entera
   * de que uno de los ocho atributos nunca se puntuó.
   */
  it("rechaza un envío que repite un atributo y se salta otro", async () => {
    const respuestas = respuestasCva(9);
    respuestas[6] = { attributeId: atributosCva.get("Flavor")!, value: 1 };

    await expect(
      submitAssessment(juez, {
        blindSampleId: cieganCva[2]!,
        attributeResponses: respuestas,
        nonUniformCups: 0,
        defectiveCups: 0,
      }),
    ).rejects.toThrow(new SensoryAccessError("responses_incomplete"));
  });

  it("ignora un total tecleado en vez de guardarlo junto a uno calculado", async () => {
    const a = await submitAssessment(juez, {
      blindSampleId: cieganCva[3]!,
      overallScore: 5,
      attributeResponses: respuestasCva(1),
      nonUniformCups: 0,
      defectiveCups: 0,
    });
    expect(a.overallScore?.toNumber()).toBe(58);
  });

  it("rechaza que falte un atributo en vez de calcular sobre siete", async () => {
    await expect(
      submitAssessment(juez, {
        blindSampleId: cieganCva[4]!,
        attributeResponses: respuestasCva(9).slice(0, 7),
        nonUniformCups: 0,
        defectiveCups: 0,
      }),
    ).rejects.toThrow(new SensoryAccessError("responses_incomplete"));
  });

  it("rechaza un valor fuera de la escala 1–9 aunque el formulario lo deje pasar", async () => {
    await expect(
      submitAssessment(juez, {
        blindSampleId: cieganCva[5]!,
        attributeResponses: respuestasCva(9, { Flavor: 90 }),
        nonUniformCups: 0,
        defectiveCups: 0,
      }),
    ).rejects.toThrow(new SensoryAccessError("score_out_of_range"));
  });
});
