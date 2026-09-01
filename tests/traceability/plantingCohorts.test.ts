/**
 * P1 (docs/implementation/42_P1_LAND_FOUNDATION.md §7). Real Postgres,
 * RUN_ID-scoped fixtures, same discipline as f1.test.ts — whose location-scoped
 * Farm Operator setup this reuses, since a cohort is gated by
 * `location:manage_attributes` exactly as a Location's own attributes are.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { LocationAccessError, updateLocationAttributes } from "../../lib/traceability/locations";
import {
  createPlantingCohort,
  listPlantingCohorts,
  recordHarvestSources,
  updatePlantingCohort,
  getHarvestSourceContext,
  renovatePlantingCohort,
  PlantingCohortValidationError,
} from "../../lib/traceability/plantingCohorts";
import { recordHarvestEvent } from "../../lib/traceability/harvest";
import { recordAuditEvent } from "../../lib/audit";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `p1-${Date.now()}`;

let organizationId: string;
let projectId: string;
let plotAId: string;
let plotBId: string;
let plotCId: string;
let otherPlotId: string;
let authorizedUserAccountId: string;
let wrongLocationUserAccountId: string;
/** Alcanza el bloque A y NO el B: el único perfil que puede exponer la fuga. */
let soloPlotAUserAccountId: string;

let caturraValueId: string;
let catuaiAliasValueId: string;
let catuaiCanonicalValueId: string;
let desconocidoValueId: string;

async function createTestUserAccount(label: string) {
  const person = await prisma.person.create({
    data: { givenName: "TEST", familyName: label, displayName: `TEST ${label} (${RUN_ID})`, locale: "en" },
  });
  const account = await prisma.userAccount.create({
    data: { personId: person.id, authProvider: "credentials", status: "active" },
  });
  return account.id;
}

async function assignFarmOperator(userAccountId: string, locationRefId: string) {
  const profile = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  // Reutiliza el Scope si ya existe: (scopeType, scopeRefId) es único, así que
  // dar el mismo bloque a un segundo usuario reventaba el setup entero.
  const scope =
    (await prisma.scope.findFirst({ where: { scopeType: "location", scopeRefId: locationRefId } })) ??
    (await prisma.scope.create({ data: { scopeType: "location", scopeRefId: locationRefId } }));
  await prisma.assignment.create({ data: { userAccountId, roleProfileId: profile.id, scopeId: scope.id } });
}

async function plot(name: string) {
  const location = await prisma.location.create({
    data: {
      locationType: "plot",
      name: `TEST ${name} (${RUN_ID})`,
      organizationId,
      status: "approved",
      classification: "internal",
    },
  });
  return location.id;
}

async function cultivarValue(value: string) {
  const row = await prisma.variableCatalogValue.findFirstOrThrow({
    where: { value, catalog: { key: "cultivar" } },
  });
  return row.id;
}

beforeAll(async () => {
  const organization = await prisma.organization.create({
    data: { organizationType: "farm", name: `TEST Farm (${RUN_ID})`, status: "approved", classification: "internal" },
  });
  organizationId = organization.id;

  const project = await prisma.project.create({
    data: { name: `TEST Project (${RUN_ID})`, status: "approved", classification: "internal" },
  });
  projectId = project.id;

  plotAId = await plot("Plot A");
  plotBId = await plot("Plot B");
  plotCId = await plot("Plot C");
  otherPlotId = await plot("Other Plot");

  authorizedUserAccountId = await createTestUserAccount("P1Operator");
  for (const id of [plotAId, plotBId, plotCId]) await assignFarmOperator(authorizedUserAccountId, id);

  wrongLocationUserAccountId = await createTestUserAccount("P1WrongLocation");
  await assignFarmOperator(wrongLocationUserAccountId, otherPlotId);

  soloPlotAUserAccountId = await createTestUserAccount("P1SoloPlotA");
  await assignFarmOperator(soloPlotAUserAccountId, plotAId);

  caturraValueId = await cultivarValue("Caturra");
  catuaiAliasValueId = await cultivarValue("Catuai");
  catuaiCanonicalValueId = await cultivarValue("Catuaí");
  desconocidoValueId = await cultivarValue("desconocido");
});

afterAll(async () => {
  const locationIds = [plotAId, plotBId, plotCId, otherPlotId];
  const harvestEvents = await prisma.harvestEvent.findMany({ where: { locationId: { in: locationIds } } });
  const harvestEventIds = harvestEvents.map((h) => h.id);
  const lotIds = harvestEvents.map((h) => h.resultingLotId);

  await prisma.harvestEventSource.deleteMany({ where: assertDefinedWhere({ harvestEventId: { in: harvestEventIds } }) });
  await prisma.harvestEvent.deleteMany({ where: assertDefinedWhere({ id: { in: harvestEventIds } }) });
  await prisma.quantityEvent.deleteMany({ where: assertDefinedWhere({ lotId: { in: lotIds } }) });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: lotIds } }) });
  await prisma.plantingCohort.deleteMany({ where: assertDefinedWhere({ locationId: { in: locationIds } }) });

  const userIds = [authorizedUserAccountId, wrongLocationUserAccountId, soloPlotAUserAccountId];
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: userIds } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ scopeRefId: { in: locationIds } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: userIds } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN_ID } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: locationIds } }) });
  await prisma.project.deleteMany({ where: assertDefinedWhere({ id: projectId }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
});

describe("PlantingCohort — partial knowledge is the normal case", () => {
  it("accepts a cohort with a cultivar and no plant count", async () => {
    const cohort = await createPlantingCohort(authorizedUserAccountId, {
      locationId: plotAId,
      cultivarValueId: caturraValueId,
      plantedAt: new Date("2019-01-01"),
      plantedPrecision: "year",
      provenanceClass: "original_record",
    });

    expect(cohort.plantCount).toBeNull();
    expect(cohort.status).toBe("active");
    // A cohort with a cultivar and no count is useful. One with an invented
    // count is worse than nothing.
    expect(cohort.cultivarValueId).toBe(caturraValueId);
  });

  it("refuses a planted date with no stated precision", async () => {
    await expect(
      createPlantingCohort(authorizedUserAccountId, {
        locationId: plotAId,
        plantedAt: new Date("2019-03-14"),
        provenanceClass: "original_record",
      }),
    ).rejects.toThrow(PlantingCohortValidationError);
  });

  it("requires dataQuality when the cultivar is recorded as unknown", async () => {
    await expect(
      createPlantingCohort(authorizedUserAccountId, {
        locationId: plotAId,
        cultivarValueId: desconocidoValueId,
        provenanceClass: "direct_observation",
      }),
    ).rejects.toThrow(PlantingCohortValidationError);

    const withQuality = await createPlantingCohort(authorizedUserAccountId, {
      locationId: plotAId,
      cultivarValueId: desconocidoValueId,
      provenanceClass: "direct_observation",
      dataQuality: "unconfirmed",
    });
    expect(withQuality.dataQuality).toBe("unconfirmed");
  });
});

describe("cultivar aliases resolve to the canonical row", () => {
  it("stores a cohort created with 'Catuai' against the canonical 'Catuaí'", async () => {
    const cohort = await createPlantingCohort(authorizedUserAccountId, {
      locationId: plotBId,
      cultivarValueId: catuaiAliasValueId,
      provenanceClass: "original_record",
    });

    // Otherwise grouping by cultivar silently splits one plant across spellings.
    expect(cohort.cultivarValueId).toBe(catuaiCanonicalValueId);
    expect(cohort.cultivarValueId).not.toBe(catuaiAliasValueId);
  });
});

describe("a block holds several cohorts at once", () => {
  it("keeps two cultivars with different planting years side by side on one plot", async () => {
    await createPlantingCohort(authorizedUserAccountId, {
      locationId: plotCId,
      cultivarValueId: caturraValueId,
      plantedAt: new Date("2015-01-01"),
      plantedPrecision: "year",
      plantCount: 1200,
      provenanceClass: "original_record",
    });
    await createPlantingCohort(authorizedUserAccountId, {
      locationId: plotCId,
      cultivarValueId: catuaiCanonicalValueId,
      plantedAt: new Date("2021-01-01"),
      plantedPrecision: "year",
      plantCount: 800,
      provenanceClass: "original_record",
    });

    const cohorts = await listPlantingCohorts(authorizedUserAccountId, plotCId);
    expect(cohorts).toHaveLength(2);
    expect(cohorts.map((c) => c.plantCount)).toEqual(expect.arrayContaining([1200, 800]));
  });
});

describe("renovation is a new cohort, never an edit", () => {
  it("closes the old cohort with its original values intact and opens a new one", async () => {
    const original = await createPlantingCohort(authorizedUserAccountId, {
      locationId: plotBId,
      cultivarValueId: caturraValueId,
      plantedAt: new Date("2010-01-01"),
      plantedPrecision: "year",
      plantCount: 2000,
      provenanceClass: "original_record",
    });

    const removedAt = new Date("2027-06-01");
    const { closed, replacement } = await renovatePlantingCohort(authorizedUserAccountId, {
      cohortId: original.id,
      removedAt,
      reason: "Soca completa",
      replacement: {
        cultivarValueId: catuaiCanonicalValueId,
        plantedAt: new Date("2027-01-01"),
        plantedPrecision: "year",
        plantCount: 2100,
        provenanceClass: "original_record",
      },
    });

    expect(closed.status).toBe("renovated");
    expect(closed.removedAt).toEqual(removedAt);
    // The block was Caturra in 2010 and that stays true — a yield figure from
    // then is only interpretable against the population that produced it.
    expect(closed.cultivarValueId).toBe(caturraValueId);
    expect(closed.plantCount).toBe(2000);

    expect(replacement).not.toBeNull();
    expect(replacement!.status).toBe("active");
    expect(replacement!.cultivarValueId).toBe(catuaiCanonicalValueId);
  });

  it("refuses to renovate a cohort that is already closed", async () => {
    const cohort = await createPlantingCohort(authorizedUserAccountId, {
      locationId: plotBId,
      provenanceClass: "original_record",
    });
    await renovatePlantingCohort(authorizedUserAccountId, { cohortId: cohort.id, removedAt: new Date() });

    await expect(
      renovatePlantingCohort(authorizedUserAccountId, { cohortId: cohort.id, removedAt: new Date() }),
    ).rejects.toThrow(PlantingCohortValidationError);
  });
});

describe("Location.areaHectares", () => {
  it("records a declared block area", async () => {
    const updated = await updateLocationAttributes(authorizedUserAccountId, {
      locationId: plotAId,
      areaHectares: 1.75,
    });
    expect(Number(updated.areaHectares)).toBe(1.75);
  });
});

describe("multi-block harvest", () => {
  it("records three contributing blocks, leaves the primary plot untouched, and reports the difference", async () => {
    const { harvestEvent } = await recordHarvestEvent(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-multiblock`,
      locationId: plotAId,
      organizationId,
      projectId,
      harvestedAt: new Date(),
      cherryWeightKg: 300,
      provenanceClass: "measured_fact",
    });

    const reconciliation = await recordHarvestSources(authorizedUserAccountId, {
      harvestEventId: harvestEvent.id,
      sources: [
        { locationId: plotAId, cherryWeightKg: 150 },
        { locationId: plotBId, cherryWeightKg: 90 },
        { locationId: plotCId, cherryWeightKg: 55 },
      ],
    });

    const sources = await prisma.harvestEventSource.findMany({ where: { harvestEventId: harvestEvent.id } });
    expect(sources).toHaveLength(3);

    // The primary plot is unchanged — sources are additional contributions.
    const reloaded = await prisma.harvestEvent.findUniqueOrThrow({ where: { id: harvestEvent.id } });
    expect(reloaded.locationId).toBe(plotAId);

    // 300 declared, 295 from blocks. Reported, not rejected: nobody weighs each
    // block on a calibrated scale before tipping it into the same hopper.
    expect(reconciliation.declaredTotalKg).toBe(300);
    expect(reconciliation.sourceTotalKg).toBe(295);
    expect(reconciliation.differenceKg).toBe(5);
  });

  it("reports an unknown difference as null when no contribution was weighed", async () => {
    const { harvestEvent } = await recordHarvestEvent(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-unweighed`,
      locationId: plotAId,
      organizationId,
      projectId,
      harvestedAt: new Date(),
      cherryWeightKg: 100,
      provenanceClass: "measured_fact",
    });

    const reconciliation = await recordHarvestSources(authorizedUserAccountId, {
      harvestEventId: harvestEvent.id,
      sources: [{ locationId: plotBId }, { locationId: plotCId }],
    });

    // Unknown, not zero — ADR-080's distinction applied to intake.
    expect(reconciliation.sourceTotalKg).toBeNull();
    expect(reconciliation.differenceKg).toBeNull();
  });
});

describe("RBAC", () => {
  it("denies an operator scoped to a different location", async () => {
    await expect(
      createPlantingCohort(wrongLocationUserAccountId, {
        locationId: plotAId,
        provenanceClass: "original_record",
      }),
    ).rejects.toThrow(LocationAccessError);
  });

  it("denies recording sources for a block the operator cannot manage", async () => {
    const { harvestEvent } = await recordHarvestEvent(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-rbac`,
      locationId: plotAId,
      organizationId,
      projectId,
      harvestedAt: new Date(),
      provenanceClass: "measured_fact",
    });

    await expect(
      recordHarvestSources(authorizedUserAccountId, {
        harvestEventId: harvestEvent.id,
        // otherPlotId is outside this operator's scope, even though the
        // harvest's own primary plot is inside it.
        sources: [{ locationId: otherPlotId, cherryWeightKg: 10 }],
      }),
    ).rejects.toThrow(LocationAccessError);
  });
});

describe("una cohorte nombrada tiene que ser del lote que la acompaña", () => {
  it("rechaza una cohorte que vive en otro lote", async () => {
    // El caso que importa: el rendimiento por bloque sale de estas filas, así
    // que atribuir la cereza de un bloque a los árboles de otro no es un error
    // de captura, es un dato falso con aspecto de medición.
    const cohortEnB = await createPlantingCohort(authorizedUserAccountId, {
      locationId: plotBId,
      cultivarValueId: caturraValueId,
      plantCount: 100,
      provenanceClass: "direct_observation",
    });
    const harvestEvent = await recordHarvestEvent(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-cohorte-cruzada`,
      locationId: plotAId,
      organizationId,
      projectId,
      harvestedAt: new Date(),
      cherryWeightKg: 50,
      provenanceClass: "measured_fact",
    });

    await expect(
      recordHarvestSources(authorizedUserAccountId, {
        harvestEventId: harvestEvent.harvestEvent.id,
        sources: [{ locationId: plotAId, plantingCohortId: cohortEnB.id, cherryWeightKg: 50 }],
      }),
      // El código exacto, no la clase: con `toThrow(PlantingCohortValidationError)`
      // este test pasaba también si fallaba por `planting_cohort_not_found`, que
      // es justo el caso que NO está probando. Lo señaló una revisión
      // independiente.
    ).rejects.toThrow("cohort_not_in_location");

    // Y no deja nada a medias: la transacción no llegó a abrirse.
    const escritas = await prisma.harvestEventSource.count({
      where: { harvestEventId: harvestEvent.harvestEvent.id },
    });
    expect(escritas).toBe(0);
  });

  it("acepta la misma cohorte cuando sí es del lote nombrado", async () => {
    const cohortEnA = await createPlantingCohort(authorizedUserAccountId, {
      locationId: plotAId,
      cultivarValueId: caturraValueId,
      plantCount: 120,
      provenanceClass: "direct_observation",
    });
    const harvestEvent = await recordHarvestEvent(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-cohorte-correcta`,
      locationId: plotAId,
      organizationId,
      projectId,
      harvestedAt: new Date(),
      cherryWeightKg: 40,
      provenanceClass: "measured_fact",
    });

    const reconciliacion = await recordHarvestSources(authorizedUserAccountId, {
      harvestEventId: harvestEvent.harvestEvent.id,
      sources: [{ locationId: plotAId, plantingCohortId: cohortEnA.id, cherryWeightKg: 40 }],
    });
    expect(reconciliacion.differenceKg).toBe(0);
  });

  it("rechaza una cohorte inexistente con un error que dice qué pasó", async () => {
    const harvestEvent = await recordHarvestEvent(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-cohorte-fantasma`,
      locationId: plotAId,
      organizationId,
      projectId,
      harvestedAt: new Date(),
      provenanceClass: "measured_fact",
    });
    await expect(
      recordHarvestSources(authorizedUserAccountId, {
        harvestEventId: harvestEvent.harvestEvent.id,
        sources: [
          { locationId: plotAId, plantingCohortId: "00000000-0000-0000-0000-000000000000" },
        ],
      }),
    ).rejects.toThrow("planting_cohort_not_found");
  });

  it("rechaza un aporte de peso negativo", async () => {
    const harvestEvent = await recordHarvestEvent(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-peso-negativo`,
      locationId: plotAId,
      organizationId,
      projectId,
      harvestedAt: new Date(),
      cherryWeightKg: 10,
      provenanceClass: "measured_fact",
    });
    await expect(
      recordHarvestSources(authorizedUserAccountId, {
        harvestEventId: harvestEvent.harvestEvent.id,
        sources: [{ locationId: plotAId, cherryWeightKg: -5 }],
      }),
    ).rejects.toThrow("negative_cherry_weight");
  });
});

describe("el contexto de la pantalla ofrece sólo lo que se puede usar", () => {
  it("no lista bloques fuera del alcance del operador", async () => {
    const harvestEvent = await recordHarvestEvent(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-contexto`,
      locationId: plotAId,
      organizationId,
      projectId,
      harvestedAt: new Date(),
      cherryWeightKg: 80,
      provenanceClass: "measured_fact",
    });

    const contexto = await getHarvestSourceContext(
      authorizedUserAccountId,
      harvestEvent.harvestEvent.id,
    );
    const ofrecidos = contexto.plotLocations.map((p) => p.id);

    // otherPlotId queda fuera del alcance de este operador. Que la escritura
    // lo rechace no basta: el desplegable no debe nombrarlo siquiera.
    expect(ofrecidos).not.toContain(otherPlotId);
    expect(ofrecidos).toContain(plotAId);
  });

  it("no devuelve aportes de bloques que el operador no administra", async () => {
    // El hueco que encontró la revisión independiente: la escritura exigía
    // acceso al bloque principal Y a cada contribuyente, pero esta lectura sólo
    // exigía el principal, así que devolvía nombre, cultivar, peso y notas de
    // bloques ajenos.
    const harvestEvent = await recordHarvestEvent(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-fuga`,
      locationId: plotAId,
      organizationId,
      projectId,
      harvestedAt: new Date(),
      cherryWeightKg: 100,
      provenanceClass: "measured_fact",
    });
    // Se escriben los dos aportes con un usuario que sí alcanza los dos.
    await recordHarvestSources(authorizedUserAccountId, {
      harvestEventId: harvestEvent.harvestEvent.id,
      sources: [
        { locationId: plotAId, cherryWeightKg: 60 },
        { locationId: plotBId, cherryWeightKg: 40 },
      ],
    });

    const paraTodos = await getHarvestSourceContext(
      authorizedUserAccountId,
      harvestEvent.harvestEvent.id,
    );
    expect(paraTodos.existing).toHaveLength(2);
    expect(paraTodos.hiddenContributions).toBe(0);

    // Quien alcanza el bloque principal A pero NO el B ve un aporte, no dos, y
    // en ninguna parte el nombre de B. Sin este caso el test anterior pasaba
    // igual con el filtro quitado — comprobado por flip-test.
    const soloA = await getHarvestSourceContext(
      soloPlotAUserAccountId,
      harvestEvent.harvestEvent.id,
    );
    expect(soloA.existing).toHaveLength(1);
    expect(soloA.hiddenContributions).toBe(1);
    expect(JSON.stringify(soloA.existing)).not.toContain("Plot B");
    expect(soloA.plotLocations.map((p) => p.id)).not.toContain(plotBId);
  });

  it("informa el peso declarado y deja los aportes sin pesar como desconocido", async () => {
    const harvestEvent = await recordHarvestEvent(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-sin-pesar`,
      locationId: plotAId,
      organizationId,
      projectId,
      harvestedAt: new Date(),
      cherryWeightKg: 60,
      provenanceClass: "measured_fact",
    });
    await recordHarvestSources(authorizedUserAccountId, {
      harvestEventId: harvestEvent.harvestEvent.id,
      sources: [{ locationId: plotAId }],
    });

    const contexto = await getHarvestSourceContext(
      authorizedUserAccountId,
      harvestEvent.harvestEvent.id,
    );
    expect(contexto.declaredTotalKg).toBe(60);
    // Ningún aporte pesado: desconocido, no cero (ADR-080).
    expect(contexto.alreadyRecordedKg).toBeNull();
  });
});

describe("la escritura y su auditoría se confirman juntas", () => {
  it("si la auditoría no puede escribirse, la cohorte tampoco queda", async () => {
    // Se fuerza el fallo del audit violando su clave foránea: `actor` apunta a
    // `UserAccount`, así que un actor inexistente revienta el INSERT DENTRO de
    // la transacción. Ese es el punto: antes la cohorte ya estaba confirmada
    // cuando el audit fallaba.
    const antes = await prisma.plantingCohort.count({ where: { locationId: plotCId } });

    await expect(
      prisma.$transaction(async (tx) => {
        await tx.plantingCohort.create({
          data: {
            locationId: plotCId,
            plantCount: 7,
            provenanceClass: "direct_observation",
            createdBy: authorizedUserAccountId,
          },
        });
        await recordAuditEvent(
          {
            actorUserAccountId: "00000000-0000-0000-0000-000000000000",
            operation: "prueba.atomicidad",
            entityType: "planting_cohort",
            entityId: "00000000-0000-0000-0000-000000000000",
            sourceInterface: "test",
          },
          tx,
        );
      }),
    ).rejects.toThrow();

    // La cohorte NO sobrevivió al fallo del audit: eso es la atomicidad.
    const despues = await prisma.plantingCohort.count({ where: { locationId: plotCId } });
    expect(despues).toBe(antes);
  });

  it("una creación normal deja cohorte Y auditoría", async () => {
    const cohort = await createPlantingCohort(authorizedUserAccountId, {
      locationId: plotCId,
      plantCount: 11,
      provenanceClass: "direct_observation",
    });
    const audits = await prisma.auditEvent.count({
      where: { entityId: cohort.id, operation: "planting_cohort.create" },
    });
    expect(audits).toBe(1);
  });
});

describe("la densidad es derivada y no se guarda", () => {
  it("ignora un densityPerHectare que llegue en la creación", async () => {
    // El input lo aceptaba y lo persistía, así que un 400 sobrevivía a que se
    // corrigieran sus dos insumos. Sin este test, quitar el campo o volver a
    // aceptarlo daba lo mismo — comprobado por flip-test.
    const cohort = await createPlantingCohort(authorizedUserAccountId, {
      locationId: plotAId,
      plantCount: 100,
      provenanceClass: "direct_observation",
      // @ts-expect-error el campo ya no existe en el input; el test comprueba
      // que tampoco llega a la columna si alguien lo manda igual.
      densityPerHectare: 400,
    });
    const guardada = await prisma.plantingCohort.findUniqueOrThrow({ where: { id: cohort.id } });
    expect(guardada.densityPerHectare).toBeNull();
  });
});

describe("corregir una cohorte sin decir que el bloque cambió", () => {
  it("cambia el conteo y guarda el motivo, dejando el estado en active", async () => {
    const cohort = await createPlantingCohort(authorizedUserAccountId, {
      locationId: plotAId,
      cultivarValueId: caturraValueId,
      plantCount: 833,
      provenanceClass: "direct_observation",
      dataQuality: "provisional",
    });

    const corregida = await updatePlantingCohort(authorizedUserAccountId, {
      cohortId: cohort.id,
      plantCount: 812,
      reason: "Conteo real del bloque; el 833 era el total repartido entre tres.",
    });

    expect(corregida.plantCount).toBe(812);
    // Lo que NO debe pasar: renovar habría cerrado la cohorte y afirmado que
    // esos árboles salieron del suelo.
    expect(corregida.status).toBe("active");
    expect(corregida.removedAt).toBeNull();

    const audit = await prisma.auditEvent.findFirst({
      where: { entityId: cohort.id, operation: "planting_cohort.update" },
      orderBy: { occurredAt: "desc" },
    });
    expect(audit?.reason).toContain("Conteo real");
    // El valor anterior queda en el registro append-only, no se pierde.
    expect((audit?.before as { plantCount: number }).plantCount).toBe(833);
  });

  it("exige un motivo: sin él no se distingue «conté mal» de «se murieron»", async () => {
    const cohort = await createPlantingCohort(authorizedUserAccountId, {
      locationId: plotAId,
      cultivarValueId: caturraValueId,
      plantCount: 100,
      provenanceClass: "direct_observation",
    });
    await expect(
      updatePlantingCohort(authorizedUserAccountId, {
        cohortId: cohort.id,
        plantCount: 90,
        reason: "   ",
      }),
    ).rejects.toThrow(PlantingCohortValidationError);
  });

  it("vaciar el conteo lo deja sin registrar, no en cero", async () => {
    const cohort = await createPlantingCohort(authorizedUserAccountId, {
      locationId: plotAId,
      cultivarValueId: caturraValueId,
      plantCount: 500,
      provenanceClass: "direct_observation",
    });
    const corregida = await updatePlantingCohort(authorizedUserAccountId, {
      cohortId: cohort.id,
      plantCount: null,
      reason: "Nadie contó nunca este bloque; el 500 era una suposición.",
    });
    // ADR-080: sin registrar y cero son hechos distintos.
    expect(corregida.plantCount).toBeNull();
  });

  it("rechaza un conteo negativo", async () => {
    const cohort = await createPlantingCohort(authorizedUserAccountId, {
      locationId: plotAId,
      plantCount: 10,
      provenanceClass: "direct_observation",
    });
    await expect(
      updatePlantingCohort(authorizedUserAccountId, {
        cohortId: cohort.id,
        plantCount: -1,
        reason: "prueba",
      }),
    ).rejects.toThrow(PlantingCohortValidationError);
  });

  it("no deja poner fecha sin precisión", async () => {
    const cohort = await createPlantingCohort(authorizedUserAccountId, {
      locationId: plotAId,
      plantCount: 10,
      provenanceClass: "direct_observation",
    });
    await expect(
      updatePlantingCohort(authorizedUserAccountId, {
        cohortId: cohort.id,
        plantedAt: new Date("2022-01-01"),
        reason: "prueba",
      }),
    ).rejects.toThrow(PlantingCohortValidationError);
  });

  it("no deja corregir una cohorte de un lote fuera de alcance", async () => {
    const cohort = await createPlantingCohort(authorizedUserAccountId, {
      locationId: plotAId,
      plantCount: 10,
      provenanceClass: "direct_observation",
    });
    await expect(
      updatePlantingCohort(wrongLocationUserAccountId, {
        cohortId: cohort.id,
        plantCount: 11,
        reason: "prueba",
      }),
    ).rejects.toThrow(LocationAccessError);
  });
});

describe("pre-existing land records stay valid", () => {
  it("leaves PlantingEvent.plantingCohortId nullable — the one real row predates cohorts", async () => {
    const orphans = await prisma.plantingEvent.count({ where: { plantingCohortId: null } });
    // Never backfilled with a guess; a NULL here is correct history.
    expect(orphans).toBeGreaterThanOrEqual(1);
  });
});
