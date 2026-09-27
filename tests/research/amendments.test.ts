/**
 * S1 (docs/implementation/45_S1_SUELO_AMBIENTE_TAZA.md §2, semanas 10–14). La
 * aplicación de enmienda al terreno, y **Gate 0**.
 *
 * El bloque que más importa es el último: la compuerta se niega mientras falte
 * cualquiera de las cuatro condiciones firmadas, y se abre —no se salta— en
 * cuanto los datos existen. Un guardia que nunca pudiera pasar sería peor que
 * ninguno.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { ambitoDePlataforma } from "../helpers/ambitoDePlataforma";
import {
  applyAmendment,
  getGate0Status,
  Gate0NotPassedError,
  AmendmentValidationError,
  listAmendmentsForLocation,
} from "../../lib/research/amendments";
import { ResearchAccessError } from "../../lib/research/access";
import { createResearchProgram, createResearchQuestion, createHypothesis, createExperiment } from "../../lib/research/programs";
import { createProtocol, createProtocolVersion, activateProtocolVersion } from "../../lib/research/protocols";
import { createTreatmentBatch, TreatmentBatchValidationError } from "../../lib/research/treatments";
import { createSoilProfile } from "../../lib/traceability/soilProfiles";
import { createSoilSample } from "../../lib/traceability/soilSamples";
import { createBiocharBatch } from "../../lib/traceability/biocharBatches";
import { recordMeasurement, MeasurementValidationError } from "../../lib/traceability/measurements";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `enmienda-${Date.now()}`;

let organizationId: string;
let projectId: string;
let locationId: string;      // el bloque del ensayo, que irá pasando Gate 0
let locationVirgenId: string; // un bloque sin nada, para ver la compuerta cerrada
let researchUserId: string;
let researchScopeId: string;
let farmUserId: string;
let farmScopeId: string;
let sinAccesoUserId: string;
let protocolVersionId: string;
let dosisVariableId: string;
let metodoVariableId: string;
let borradorVersionId: string;
let biocharId: string;
let soilSampleId: string;
const muestrasExtra: string[] = [];
const bloquesExtra: string[] = [];
const batchIds: string[] = [];

async function createTestUserAccount(label: string) {
  const person = await prisma.person.create({
    data: { givenName: "TEST", familyName: label, displayName: `TEST ${label} (${RUN_ID})`, locale: "es" },
  });
  const ua = await prisma.userAccount.create({
    data: { personId: person.id, authProvider: "credentials", status: "active" },
  });
  return ua.id;
}

beforeAll(async () => {
  const organization = await prisma.organization.create({
    data: { organizationType: "farm", name: `TEST Farm (${RUN_ID})`, status: "approved", classification: "internal" },
  });
  organizationId = organization.id;
  const project = await prisma.project.create({
    data: { name: `TEST Enmienda (${RUN_ID})`, status: "approved", classification: "internal" },
  });
  projectId = project.id;

  const bloque = await prisma.location.create({
    data: { locationType: "plot", name: `TEST Bloque ensayo (${RUN_ID})`, organizationId, status: "approved", classification: "internal" },
  });
  locationId = bloque.id;
  const virgen = await prisma.location.create({
    data: { locationType: "plot", name: `TEST Bloque virgen (${RUN_ID})`, organizationId, status: "approved", classification: "internal" },
  });
  locationVirgenId = virgen.id;

  // Research Lead a nivel de plataforma: puede ejecutar protocolo y también
  // describir suelo, que es lo que hace falta para montar la línea base.
  researchUserId = await createTestUserAccount("EnmiendaLead");
  const lead = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Research Lead" } });
  const scope = { id: await ambitoDePlataforma() };
  researchScopeId = scope.id;
  await prisma.assignment.create({ data: { userAccountId: researchUserId, roleProfileId: lead.id, scopeId: scope.id } });

  // Dos usuarios y no uno con dos sombreros, porque así es como pasa: Bob
  // registra el suelo, la calicata y el biochar (Farm Operator,
  // `location:manage_attributes`); Daniel aplica el tratamiento (Research Lead,
  // `research:execute_protocol`). Un solo usuario con todo habría escondido que
  // la línea base y la enmienda las autorizan permisos distintos.
  farmUserId = await createTestUserAccount("EnmiendaFarmOperator");
  const farm = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  const farmScope = { id: await ambitoDePlataforma() };
  farmScopeId = farmScope.id;
  await prisma.assignment.create({ data: { userAccountId: farmUserId, roleProfileId: farm.id, scopeId: farmScope.id } });

  sinAccesoUserId = await createTestUserAccount("EnmiendaSinAcceso");

  const program = await createResearchProgram(researchUserId, { name: `TEST programa (${RUN_ID})` });
  const question = await createResearchQuestion(researchUserId, program.id, "TEST ¿cambia el biochar la taza?");
  const hypothesis = await createHypothesis(researchUserId, question.id, "TEST el biochar mejora la aireación");
  const experiment = await createExperiment(researchUserId, {
    researchProgramId: program.id,
    hypothesisId: hypothesis.id,
    projectId,
    name: `TEST experimento (${RUN_ID})`,
  });
  const protocol = await createProtocol(researchUserId, {
    experimentId: experiment.id,
    name: `TEST protocolo de enmienda (${RUN_ID})`,
    externalIdentifier: null,
    identifierConvention: null,
  });
  // El protocolo declara la dosis, el método y la profundidad. No son columnas
  // de `TreatmentBatch`: son lo que el protocolo VARÍA, y §10.1 del marco dice
  // que la dosis se fija en el Paso 8 y no antes. `createProtocolVersion` exige
  // al menos una variable, y aquí esa exigencia acierta.
  const v1 = await createProtocolVersion(researchUserId, {
    protocolId: protocol.id,
    notes: "TEST v1",
    variables: [
      { name: "Dosis de aplicación (t/ha)", valueType: "numeric" },
      { name: "Método de colocación", valueType: "closed_enum", enumValues: ["banda", "voleo", "hoyo"] },
      { name: "Profundidad de incorporación (cm)", valueType: "numeric" },
    ],
    requiredMeasurements: [],
  });
  protocolVersionId = v1.id;
  dosisVariableId = (
    await prisma.protocolVariable.findFirstOrThrow({
      where: { protocolVersionId, name: { contains: "Dosis" } },
    })
  ).id;
  metodoVariableId = (
    await prisma.protocolVariable.findFirstOrThrow({
      where: { protocolVersionId, name: { contains: "Método" } },
    })
  ).id;
  await activateProtocolVersion(researchUserId, protocolVersionId);

  // Un segundo protocolo que se queda en borrador: «protocolo escrito» no es
  // «protocolo empezado».
  const protocol2 = await createProtocol(researchUserId, {
    experimentId: experiment.id,
    name: `TEST protocolo borrador (${RUN_ID})`,
    externalIdentifier: null,
    identifierConvention: null,
  });
  const v2 = await createProtocolVersion(researchUserId, {
    protocolId: protocol2.id,
    notes: "TEST borrador",
    variables: [{ name: "Dosis de aplicación (t/ha)", valueType: "numeric" }],
    requiredMeasurements: [],
  });
  borradorVersionId = v2.id;

  const lote = await createBiocharBatch(farmUserId, {
    batchCode: `LN-BC-${RUN_ID}`,
    producedAtLocationId: locationId,
    provenanceClass: "original_record",
  });
  biocharId = lote.id;
});

afterAll(async () => {
  // **Todas las Locations del archivo en una sola lista.** Antes había dos
  // listas —la fija y `bloquesExtra`— y la limpieza borraba muestras sólo de
  // la primera: al añadir bloques con fixture propio, el borrado de Location
  // chocó con el `RESTRICT` de `soil_sample`. Una lista, y todo cuelga de ella.
  const todosLosBloques = [locationId, locationVirgenId, ...bloquesExtra];

  await prisma.treatmentBatchVariableValue.deleteMany({ where: assertDefinedWhere({ treatmentBatchId: { in: batchIds } }) });
  // Por bloque Y por id: el test de la puerta trasera crea uno por el camino
  // del café, que por definición **no tiene** locationId. Filtrar sólo por
  // bloque lo dejaba vivo y el borrado del protocolo chocaba con su FK.
  await prisma.treatmentBatch.deleteMany({
    where: assertDefinedWhere({ OR: [{ id: { in: batchIds } }, { locationId: { in: todosLosBloques } }] }),
  });
  await prisma.measurement.deleteMany({
    where: assertDefinedWhere({ OR: [{ biocharBatchId: biocharId }, { soilSampleId }] }),
  });
  await prisma.measurement.deleteMany({ where: assertDefinedWhere({ soilSample: { locationId: { in: todosLosBloques } } }) });
  await prisma.soilSample.deleteMany({ where: assertDefinedWhere({ locationId: { in: todosLosBloques } }) });
  await prisma.soilHorizon.deleteMany({ where: assertDefinedWhere({ soilProfile: { locationId: { in: todosLosBloques } } }) });
  await prisma.soilProfile.deleteMany({ where: assertDefinedWhere({ locationId: { in: todosLosBloques } }) });
  await prisma.biocharBatch.deleteMany({ where: assertDefinedWhere({ producedAtLocationId: { in: todosLosBloques } }) });
  await prisma.protocolVariable.deleteMany({ where: assertDefinedWhere({ protocolVersionId: { in: [protocolVersionId, borradorVersionId] } }) });
  await prisma.protocolVersion.deleteMany({ where: assertDefinedWhere({ id: { in: [protocolVersionId, borradorVersionId] } }) });
  await prisma.protocol.deleteMany({ where: assertDefinedWhere({ name: { contains: RUN_ID } }) });
  await prisma.experiment.deleteMany({ where: assertDefinedWhere({ name: { contains: RUN_ID } }) });
  await prisma.hypothesis.deleteMany({ where: assertDefinedWhere({ statement: { contains: "TEST el biochar mejora" } }) });
  await prisma.researchQuestion.deleteMany({ where: assertDefinedWhere({ questionText: { contains: "TEST ¿cambia el biochar" } }) });
  await prisma.researchProgram.deleteMany({ where: assertDefinedWhere({ name: { contains: RUN_ID } }) });

  const ids = [researchUserId, farmUserId, sinAccesoUserId];
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: ids } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: { in: [researchScopeId, farmScopeId] }, scopeType: { not: "platform" as const } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: ids } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN_ID } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: todosLosBloques } }) });
  await prisma.project.deleteMany({ where: assertDefinedWhere({ id: projectId }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
});

/**
 * Un bloque nuevo y VACÍO, propio del test que lo pide.
 *
 * Hizo falta al arreglar el hallazgo del panel: el control positivo de ese test
 * —una lectura de pH válida— abría «química base» en el bloque compartido y
 * tumbaba dos tests posteriores que lo esperaban vacío. Es el mismo estado
 * narrativo que la segunda revisión señaló, cometido otra vez al arreglar otra
 * cosa. Un bloque por test lo cierra.
 */
async function bloqueVirgen(etiqueta: string): Promise<string> {
  const bloque = await prisma.location.create({
    data: {
      locationType: "plot",
      name: `TEST Bloque ${etiqueta} (${RUN_ID})`,
      organizationId,
      status: "approved",
      classification: "internal",
    },
  });
  bloquesExtra.push(bloque.id);
  return bloque.id;
}

/** Fecha contra la que se juzga en los tests que traen su propio fixture. */
const FECHA_TRATAMIENTO = new Date("2026-07-10T00:00:00Z");

/**
 * Un bloque nuevo con Gate 0 ABIERTO, sin depender de ningún otro test.
 *
 * Existe porque la segunda revisión encontró que varios tests tomaban prestado
 * el estado que otro había dejado: en aislamiento, o reordenados, pasaban
 * porque `applyAmendment` lanzaba por Gate 0 y no por lo que decían medir.
 */
async function bloqueConGate0Abierto(etiqueta: string): Promise<string> {
  const bloque = await prisma.location.create({
    data: {
      locationType: "plot",
      name: `TEST Bloque ${etiqueta} (${RUN_ID})`,
      organizationId,
      status: "approved",
      classification: "internal",
    },
  });
  bloquesExtra.push(bloque.id);

  const muestra = await createSoilSample(farmUserId, {
    locationId: bloque.id,
    sampleCode: `SS-${etiqueta}-${RUN_ID}`,
    sampledAt: new Date("2026-05-02T00:00:00Z"),
    provenanceClass: "original_record",
  });
  muestrasExtra.push(muestra.id);
  await recordMeasurement(farmUserId, {
    soilSampleId: muestra.id,
    variable: "exchangeable_aluminium",
    value: 1.2,
    unit: "cmol/kg",
    occurredAt: new Date("2026-06-01T00:00:00Z"),
    provenanceClass: "measured_fact",
  });
  await createSoilProfile(farmUserId, {
    locationId: bloque.id,
    describedAt: new Date("2026-04-20T00:00:00Z"),
    provenanceClass: "direct_observation",
    rootingDepthCm: 45,
  });
  return bloque.id;
}

describe("Gate 0 — la compuerta que el marco firma", () => {
  it("un bloque sin nada las debe las tres que le corresponden", async () => {
    const faltan = await getGate0Status(researchUserId, {
      locationId: locationVirgenId,
      biocharBatchId: biocharId,
      protocolVersionId,
      startedAt: new Date("2026-07-01T00:00:00Z"),
    });
    // El protocolo SÍ está activo, así que ésa no falta.
    expect(faltan).toEqual([
      "baseline_soil_chemistry",
      "baseline_soil_physics",
      "characterised_biochar",
    ]);
  });

  it("sin lote de biochar no exige biochar caracterizado — el T3 no lleva", async () => {
    // §10.2, Tabla 8: T3 es enmienda orgánica SIN biochar. Exigir un lote
    // caracterizado ahí sería inventar una condición que la firma no pone.
    const faltan = await getGate0Status(researchUserId, { locationId: locationVirgenId, protocolVersionId });
    expect(faltan).not.toContain("characterised_biochar");
  });

  it("una calicata VACÍA no es física base", async () => {
    // Antes bastaba con que existiera la fila. El Paso 4 pide describir
    // horizontes, profundidad de raíces y señales; una fila con sólo la fecha
    // no describe nada y abría la compuerta igual.
    const vacia = await createSoilProfile(farmUserId, {
      locationId: locationVirgenId,
      describedAt: new Date("2026-04-20T00:00:00Z"),
      provenanceClass: "direct_observation",
    });
    expect(vacia.id).toBeTruthy();
    const faltan = await getGate0Status(researchUserId, {
      locationId: locationVirgenId,
      protocolVersionId,
      startedAt: new Date("2026-07-01T00:00:00Z"),
    });
    expect(faltan).toContain("baseline_soil_physics");
  });

  it("el servicio RECHAZA una variable que no es del panel del sujeto", async () => {
    // El agujero que encontró la cuarta revisión: `recordMeasurement` aceptaba
    // cualquier variable para cualquier sujeto, así que un POST con `brix`
    // sobre una muestra de suelo dejaba evidencia semánticamente falsa. La
    // autorización pasaba; lo que fallaba era la integridad.
    const bloque = await bloqueVirgen("panel");
    const muestra = await createSoilSample(farmUserId, {
      locationId: bloque,
      sampleCode: `SS-brix-${RUN_ID}`,
      sampledAt: new Date("2026-05-02T00:00:00Z"),
      provenanceClass: "original_record",
    });
    muestrasExtra.push(muestra.id);

    await expect(
      recordMeasurement(farmUserId, {
        soilSampleId: muestra.id,
        variable: "brix",
        value: 12,
        unit: "Bx",
        occurredAt: new Date("2026-06-01T00:00:00Z"),
        provenanceClass: "measured_fact",
      }),
    ).rejects.toThrow(MeasurementValidationError);

    // Control positivo: la misma muestra acepta una variable que SÍ es de
    // suelo. Sin esto, «rechaza» podría estar rechazando por cualquier motivo.
    const buena = await recordMeasurement(farmUserId, {
      soilSampleId: muestra.id,
      variable: "ph",
      value: 5.4,
      unit: "pH",
      occurredAt: new Date("2026-06-01T00:00:00Z"),
      provenanceClass: "measured_fact",
    });
    expect(buena.soilSampleId).toBe(muestra.id);
  });

  it("y Gate 0 tampoco la contaría si entrara por otra vía", async () => {
    // Defensa en profundidad: el servicio ya no la deja entrar, pero un
    // importador o una reparación operativa escriben directo. Gate 0 filtra por
    // panel, así que una fila así no abre «química base».
    const bloque = await bloqueVirgen("directa");
    const muestra = await createSoilSample(farmUserId, {
      locationId: bloque,
      sampleCode: `SS-directa-${RUN_ID}`,
      sampledAt: new Date("2026-05-02T00:00:00Z"),
      provenanceClass: "original_record",
    });
    muestrasExtra.push(muestra.id);
    await prisma.measurement.create({
      data: {
        soilSampleId: muestra.id,
        variable: "brix",
        value: 12,
        unit: "Bx",
        occurredAt: new Date("2026-06-01T00:00:00Z"),
        provenanceClass: "measured_fact",
        createdBy: farmUserId,
      },
    });

    const faltan = await getGate0Status(researchUserId, {
      locationId: bloque,
      protocolVersionId,
      startedAt: new Date("2026-07-01T00:00:00Z"),
    });
    expect(faltan).toContain("baseline_soil_chemistry");
  });

  it("una calicata descrita DESPUÉS del tratamiento no es física base", async () => {
    // El test que había aquí no probaba nada: preguntaba por un bloque que en
    // ese punto del archivo **no tenía evidencia ninguna**, así que las dos
    // condiciones faltaban con o sin comprobación temporal. Mi propio
    // comentario lo admitía —«anterior a toda la evidencia que el fixture crea
    // después»— y no lo vi. Es el patrón que CLAUDE.md ya nombra: ausencia de lo
    // malo sobre contenido ausente. Lo destapó la segunda revisión.
    //
    // Éste sí: se describe una calicata de verdad, y se pregunta con una fecha
    // ANTERIOR a ella. La física sigue faltando porque la evidencia es
    // posterior, no porque no exista.
    const bloque = await prisma.location.create({
      data: {
        locationType: "plot",
        name: `TEST Bloque calicata tardía (${RUN_ID})`,
        organizationId,
        status: "approved",
        classification: "internal",
      },
    });
    bloquesExtra.push(bloque.id);
    await createSoilProfile(farmUserId, {
      locationId: bloque.id,
      describedAt: new Date("2026-08-20T00:00:00Z"),
      provenanceClass: "direct_observation",
      rootingDepthCm: 40,
    });

    // Control positivo: con una fecha posterior a la calicata, la física deja
    // de faltar. Sin esto, «falta» podría estar faltando por cualquier motivo.
    const despues = await getGate0Status(researchUserId, {
      locationId: bloque.id,
      protocolVersionId,
      startedAt: new Date("2026-09-01T00:00:00Z"),
    });
    expect(despues).not.toContain("baseline_soil_physics");

    const antes = await getGate0Status(researchUserId, {
      locationId: bloque.id,
      protocolVersionId,
      startedAt: new Date("2026-07-01T00:00:00Z"),
    });
    expect(antes).toContain("baseline_soil_physics");
  });

  it("un resultado FECHADO DESPUÉS del tratamiento no es línea base", async () => {
    // El caso que de verdad pasa: la muestra se toma en mayo, el laboratorio
    // responde en agosto, y la enmienda se aplicó en julio. La muestra es
    // anterior; el RESULTADO no. Sin filtrar por `occurredAt` esto abría la
    // compuerta, y filtrar sólo por la fecha de muestreo no lo detecta.
    const bloque = await bloqueVirgen("tarde");
    const muestra = await createSoilSample(farmUserId, {
      locationId: bloque,
      sampleCode: `SS-tarde-${RUN_ID}`,
      sampledAt: new Date("2026-05-02T00:00:00Z"),
      provenanceClass: "original_record",
    });
    muestrasExtra.push(muestra.id);
    await recordMeasurement(farmUserId, {
      soilSampleId: muestra.id,
      variable: "exchangeable_aluminium",
      value: 1.1,
      unit: "cmol/kg",
      occurredAt: new Date("2026-08-15T00:00:00Z"),
      provenanceClass: "measured_fact",
    });

    const faltan = await getGate0Status(researchUserId, {
      locationId: bloque,
      protocolVersionId,
      startedAt: new Date("2026-07-01T00:00:00Z"),
    });
    expect(faltan).toContain("baseline_soil_chemistry");
  });

  it("un protocolo en borrador no es un protocolo escrito", async () => {
    const faltan = await getGate0Status(researchUserId, {
      locationId: locationVirgenId,
      protocolVersionId: borradorVersionId,
    });
    expect(faltan).toContain("written_protocol");
  });

  it("una muestra enviada y SIN resultado no es química recibida", async () => {
    // El marco dice «química de suelo completa RECIBIDA». Una muestra en
    // tránsito parece progreso y no lo es.
    const muestra = await createSoilSample(farmUserId, {
      locationId,
      sampleCode: `SS-${RUN_ID}`,
      sampledAt: new Date("2026-05-02T00:00:00Z"),
      provenanceClass: "original_record",
    });
    soilSampleId = muestra.id;

    const faltan = await getGate0Status(researchUserId, { locationId, biocharBatchId: biocharId, protocolVersionId });
    expect(faltan).toContain("baseline_soil_chemistry");
  });
});

describe("applyAmendment", () => {
  it("rechaza a quien no puede ejecutar protocolos", async () => {
    // La CLASE del error, no sólo que lance. Con un `.toThrow()` pelado este
    // test pasaba aunque el guardia de RBAC no existiera: en ese momento Gate 0
    // todavía no había pasado, así que lanzaba de todos modos y el flip-test
    // salía verde. Lo destapó mutar el guardia y ver que nada caía.
    await expect(
      applyAmendment(sinAccesoUserId, {
        protocolVersionId,
        locationId,
        batchLabel: "T1",
        startedAt: new Date("2026-07-01T00:00:00Z"),
        provenanceClass: "original_record",
      }),
    ).rejects.toThrow(ResearchAccessError);
  });

  it("el guardia de RBAC corre ANTES de Gate 0", async () => {
    // Si Gate 0 corriera primero, un usuario sin permiso sabría por el mensaje
    // qué le falta a un bloque que no debería poder mirar. El orden es parte
    // de la frontera, no una preferencia de estilo.
    const error = await applyAmendment(sinAccesoUserId, {
      protocolVersionId,
      locationId: locationVirgenId,
      batchLabel: "T1",
      startedAt: new Date("2026-07-01T00:00:00Z"),
      provenanceClass: "original_record",
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ResearchAccessError);
    expect(error).not.toBeInstanceOf(Gate0NotPassedError);
  });

  it("rechaza una etiqueta de tratamiento vacía", async () => {
    await expect(
      applyAmendment(researchUserId, {
        protocolVersionId,
        locationId,
        batchLabel: "   ",
        startedAt: new Date("2026-07-01T00:00:00Z"),
        provenanceClass: "original_record",
      }),
    ).rejects.toThrow(AmendmentValidationError);
  });

  it("SE NIEGA mientras Gate 0 no pase, y dice qué falta", async () => {
    // El corazón de todo esto. Enmendar antes de medir no retrasa la ciencia:
    // la imposibilita, porque una línea base no se reconstruye después.
    const error = await applyAmendment(researchUserId, {
      protocolVersionId,
      locationId,
      biocharBatchId: biocharId,
      batchLabel: "T1",
      startedAt: new Date("2026-07-01T00:00:00Z"),
      provenanceClass: "original_record",
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Gate0NotPassedError);
    expect((error as Gate0NotPassedError).faltan).toContain("baseline_soil_chemistry");
    expect((error as Gate0NotPassedError).faltan).toContain("baseline_soil_physics");
    expect((error as Gate0NotPassedError).faltan).toContain("characterised_biochar");

    // Y no dejó nada escrito.
    expect(await prisma.treatmentBatch.count({ where: { locationId } })).toBe(0);
  });

  it("la compuerta SE ABRE cuando el Año 0 ha hecho su trabajo", async () => {
    // Un guardia que nunca pudiera pasar sería peor que ninguno. Se completan
    // las tres condiciones que faltaban, una a una.
    await recordMeasurement(farmUserId, {
      soilSampleId,
      variable: "exchangeable_aluminium",
      value: 1.2,
      unit: "cmol/kg",
      occurredAt: new Date("2026-06-01T00:00:00Z"),
      provenanceClass: "measured_fact",
    });
    // Descrita de verdad, no una fila vacía: desde el 2026-09-01 la compuerta
    // exige que la calicata tenga algo dentro —horizontes, profundidad de
    // raíces o alguna señal de anaerobiosis—. Una `SoilProfile` con sólo fecha
    // abría «física base» sin describir nada.
    await createSoilProfile(farmUserId, {
      locationId,
      describedAt: new Date("2026-04-20T00:00:00Z"),
      provenanceClass: "direct_observation",
      rootingDepthCm: 45,
      mottling: "present",
    });
    await recordMeasurement(farmUserId, {
      biocharBatchId: biocharId,
      variable: "ph",
      value: 9.4,
      unit: "pH",
      occurredAt: new Date("2026-06-01T00:00:00Z"),
      provenanceClass: "measured_fact",
    });

    expect(await getGate0Status(researchUserId, { locationId, biocharBatchId: biocharId, protocolVersionId })).toEqual([]);

    const batch = await applyAmendment(researchUserId, {
      protocolVersionId,
      locationId,
      biocharBatchId: biocharId,
      batchLabel: "T1",
      startedAt: new Date("2026-07-01T00:00:00Z"),
      provenanceClass: "original_record",
    });
    batchIds.push(batch.id);

    expect(batch.locationId).toBe(locationId);
    // Terreno, no material: el sujeto es exclusivo y el CHECK de la base lo
    // impone además del servicio.
    expect(batch.lotId).toBeNull();
    expect(batch.biocharBatchId).toBe(biocharId);
    expect(batch.batchLabel).toBe("T1");
  });

  it("la dosis viaja por el mecanismo de variables, no por columnas nuevas", async () => {
    // «10 t/ha de biochar» describe un volumen, no un tratamiento, hasta que la
    // dosis está registrada (§10.1). Va como valor de variable de protocolo
    // porque es lo que el protocolo varía — tres columnas propias habrían
    // bifurcado el mecanismo de RO1 para el primer protocolo que las use.
    const batch = await applyAmendment(researchUserId, {
      protocolVersionId,
      locationId,
      biocharBatchId: biocharId,
      batchLabel: "T2",
      startedAt: new Date("2026-07-02T00:00:00Z"),
      provenanceClass: "original_record",
      variableValues: [{ protocolVariableId: dosisVariableId, numericValue: 10 }],
    });
    batchIds.push(batch.id);
    expect(batch.variableValues).toHaveLength(1);
    expect(Number(batch.variableValues[0]?.numericValue)).toBe(10);
  });

  it("rechaza un valor fuera del enum cerrado que declara el protocolo", async () => {
    // **Fixture propio, y clase de error concreta.** Antes usaba un
    // `.toThrow()` pelado y dependía de que un test anterior hubiera abierto
    // Gate 0: en aislamiento lanzaba `Gate0NotPassedError` y pasaba por una
    // razón que no tiene nada que ver con el enum. Volví a cometer el mismo
    // error que había arreglado horas antes en este archivo; lo destapó la
    // segunda revisión independiente.
    const bloque = await bloqueConGate0Abierto("enum-malo");
    await expect(
      applyAmendment(researchUserId, {
        protocolVersionId,
        locationId: bloque,
        batchLabel: "T4",
        startedAt: FECHA_TRATAMIENTO,
        provenanceClass: "original_record",
        variableValues: [{ protocolVariableId: metodoVariableId, textValue: "a lo loco" }],
      }),
    ).rejects.toThrow(TreatmentBatchValidationError);
  });

  it("acepta el mismo campo con un valor que SÍ está en el enum", async () => {
    // El control positivo, también con fixture propio: sin él, «rechaza»
    // podría estar rechazando por cualquier otra razón.
    const bloque = await bloqueConGate0Abierto("enum-bueno");
    const batch = await applyAmendment(researchUserId, {
      protocolVersionId,
      locationId: bloque,
      batchLabel: "T4",
      startedAt: FECHA_TRATAMIENTO,
      provenanceClass: "original_record",
      variableValues: [{ protocolVariableId: metodoVariableId, textValue: "banda" }],
    });
    batchIds.push(batch.id);
    expect(batch.variableValues[0]?.textValue).toBe("banda");
  });

  it("rechaza un valor de una variable que ese protocolo no declara", async () => {
    await expect(
      applyAmendment(researchUserId, {
        protocolVersionId,
        locationId,
        batchLabel: "T3",
        startedAt: new Date("2026-07-03T00:00:00Z"),
        provenanceClass: "original_record",
        variableValues: [{ protocolVariableId: "00000000-0000-0000-0000-000000000000", numericValue: 1 }],
      }),
    ).rejects.toThrow(AmendmentValidationError);
  });

  // La atomicidad NO se prueba aquí: cuando nada falla, las dos filas existen
  // igual aunque el audit vaya por su cuenta. Lo señaló la segunda revisión
  // independiente. Que el audit viaje CON la transacción lo comprueba
  // `tests/arquitectura/audit-atomico.test.ts`, leyendo la fuente; y que el
  // mecanismo revierta de verdad, `plantingCohorts.test.ts`, forzando el fallo.
  // Esto sólo comprueba que la operación quedó auditada, que también importa.
  it("deja el AuditEvent de la operación", async () => {
    const evento = await prisma.auditEvent.findFirst({
      where: assertDefinedWhere({
        entityType: "treatment_batch",
        entityId: batchIds[0],
        operation: "treatment_batch.apply_amendment",
      }),
    });
    expect(evento).not.toBeNull();
  });

  it("la base rechaza un TreatmentBatch con lote Y terreno", async () => {
    // La restricción no es sólo del servicio: un script que escriba directo
    // tampoco puede dejar la fila ambigua.
    await expect(
      prisma.treatmentBatch.create({
        data: {
          protocolVersionId,
          lotId: (await prisma.lot.findFirstOrThrow()).id,
          locationId,
          batchLabel: "ambiguo",
          startedAt: new Date(),
          provenanceClass: "original_record",
        },
      }),
    ).rejects.toThrow();
  });
});

describe("listAmendmentsForLocation", () => {
  it("devuelve lo aplicado a ese bloque, con su lote de biochar", async () => {
    // Una enmienda SIN biochar sobre este mismo bloque —el T3 de la Tabla 8 es
    // enmienda orgánica sin char—, para que el listado tenga las dos clases.
    // Antes venía de otro test; desde que los del enum traen su propio bloque,
    // este test tiene que crear lo que mide.
    const sinChar = await applyAmendment(researchUserId, {
      protocolVersionId,
      locationId,
      batchLabel: "T3",
      startedAt: new Date("2026-07-06T00:00:00Z"),
      provenanceClass: "original_record",
    });
    batchIds.push(sinChar.id);

    const filas = await listAmendmentsForLocation(researchUserId, locationId);
    // Conjunto exacto contra la base, no un número escrito a mano: un `take`
    // en la consulta del servicio pasaría inadvertido, y un número fijo se
    // rompe cada vez que otro test añade una enmienda.
    const todas = new Set(
      (await prisma.treatmentBatch.findMany({ where: { locationId }, select: { id: true } })).map((t) => t.id),
    );
    expect(new Set(filas.map((f) => f.id))).toEqual(todas);
    // Se busca la fila, no se asume la posición: el orden es por `startedAt`
    // descendente, y el T4 —que no lleva biochar, como el T3 de la Tabla 8—
    // es más reciente que el T1 que sí lo lleva.
    const conBiochar = filas.filter((f) => f.biocharBatchId != null);
    expect(conBiochar.length).toBeGreaterThan(0);
    // Y toda fila que lleva lote lleva EL lote: la relación se resuelve, no se
    // queda en un id suelto.
    expect(conBiochar.every((f) => f.biocharBatch?.batchCode === `LN-BC-${RUN_ID}`)).toBe(true);
    // El T4 no lleva ninguno, como el T3 de la Tabla 8: enmienda sin biochar.
    expect(filas.some((f) => f.biocharBatchId == null)).toBe(true);
  });

  it("rechaza a quien no puede ejecutar protocolos", async () => {
    await expect(listAmendmentsForLocation(sinAccesoUserId, locationId)).rejects.toThrow(
      ResearchAccessError,
    );
  });
});

/**
 * La pregunta que la revisión independiente del 2026-09-01 dejó escrita y no
 * pudo responder: **¿hay una puerta trasera a Gate 0?**
 *
 * `createTreatmentBatch` sigue siendo público y no sabe nada de la compuerta.
 * Si pudiera crear un tratamiento con `locationId`, todo lo que
 * `applyAmendment` comprueba sería opcional — bastaría con llamar al otro.
 *
 * Comprobado el 2026-09-01 leyendo el código: en todo el repositorio hay **tres**
 * escritores de `TreatmentBatch` —`createTreatmentBatch`, `endTreatmentBatch`
 * (que sólo escribe `endedAt`) y `applyAmendment`—, ningún SQL crudo contra
 * `treatment_batch`, y ni el importador de Cafelino ni la semilla lo tocan.
 *
 * Pero eso es un hecho sobre el código de hoy, no una regla. Estos dos tests lo
 * convierten en una: el primero fija el comportamiento, el segundo la forma.
 */
describe("Gate 0 no tiene puerta trasera por createTreatmentBatch", () => {
  it("un tratamiento creado por el camino del café NUNCA lleva terreno", async () => {
    // Se le pasa `locationId` a la fuerza, como haría un llamador que no
    // supiera lo que hace o un tipo que alguien ampliara sin pensarlo. La fila
    // tiene que salir sin terreno igual.
    const batch = await createTreatmentBatch(researchUserId, {
      protocolVersionId,
      batchLabel: "T-cafe",
      startedAt: new Date("2026-07-05T00:00:00Z"),
      provenanceClass: "original_record",
      variableValues: [],
      ...({ locationId } as Record<string, unknown>),
    });
    batchIds.push(batch.id);
    expect(batch.locationId).toBeNull();
  });

  it("y su entrada no declara `locationId`", async () => {
    // El primero pasaría igual si alguien añadiera el campo al tipo pero se
    // olvidara de escribirlo. Éste mira la forma: si el campo apareciera en la
    // entrada, el camino del café empezaría a ofrecer algo que no debe.
    const fuente = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("../../lib/research/treatments.ts", import.meta.url), "utf8"),
    );
    const entrada = fuente.slice(
      fuente.indexOf("export interface CreateTreatmentBatchInput"),
      fuente.indexOf("export async function createTreatmentBatch"),
    );
    expect(entrada.length).toBeGreaterThan(0);
    expect(entrada).not.toContain("locationId");
  });
});
