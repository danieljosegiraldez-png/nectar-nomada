/**
 * El reporte que ata la intervención en el lote con el puntaje de taza.
 *
 * **Lo que este archivo prueba de verdad, y que ninguna otra cosa puede probar
 * hoy: que la cadena SE PUEDE UNIR.** Medido el 2026-09-07 contra la copia de
 * producción: 45 lotes, 6 muestras, y **cero** tuestes, cero valoraciones, cero
 * mapeos ciegos y cero procesos de lote. Así que el reporte contra datos reales
 * saldría vacío, y un vacío no distingue «la unión es correcta y no hay datos»
 * de «la unión está mal». El fixture de abajo construye la cadena entera —
 * cosecha → cohorte → cultivar, proceso, tueste, muestra, cata ciega, puntaje —
 * y por eso su verde significa algo.
 *
 * **La otra mitad, y es igual de importante:** un lote SIN nada colgando tiene
 * que salir con sus listas vacías y su promedio en `null`, no en 0. Un 0 es un
 * puntaje; la ausencia no.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { reporteDeProceso } from "../../lib/traceability/reporteDeProceso";
import { abrirProceso, cerrarProceso } from "../../lib/traceability/lotProcess";
import { SIN_RECETA } from "../../lib/traceability/lotProcess";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN = `rep-${Date.now()}`;
let orgId: string, plotId: string, scopeId: string, plataformaScopeId: string;
let gestor: string;
let loteCompleto: string, loteDesnudo: string;
let recetaId: string, recetaVersionId: string;
let recetaTuesteId: string, recetaTuesteVersionId: string;
let cohorteId: string, cultivarCatalogoId: string, cultivarValorId: string;
let sesionSensorialId: string, protocoloId: string, protocoloVersionId: string;

beforeAll(async () => {
  const persona = await prisma.person.create({
    data: { givenName: "TEST", familyName: "Gestor", displayName: `TEST Gestor (${RUN})`, locale: "es" },
  });
  gestor = (
    await prisma.userAccount.create({ data: { personId: persona.id, authProvider: "credentials", status: "active" } })
  ).id;

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

  scopeId = (await prisma.scope.create({ data: { scopeType: "location", scopeRefId: plotId } })).id;
  const farm = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  await prisma.assignment.create({ data: { userAccountId: gestor, roleProfileId: farm.id, scopeId } });
  const admin = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Platform Admin" } });
  const plataforma =
    (await prisma.scope.findFirst({ where: { scopeType: "platform" } })) ??
    (await prisma.scope.create({ data: { scopeType: "platform", scopeRefId: null } }));
  plataformaScopeId = plataforma.id;
  await prisma.assignment.create({ data: { userAccountId: gestor, roleProfileId: admin.id, scopeId: plataforma.id } });

  const lote = async (codigo: string, tipo: "cherry" | "green") =>
    (
      await prisma.lot.create({
        data: {
          lotCode: `${codigo}-${RUN}`,
          lotType: tipo,
          organizationId: orgId,
          locationId: plotId,
          status: "approved",
          classification: "internal",
          createdBy: gestor,
        },
      })
    ).id;
  loteCompleto = await lote("COMPLETO", "cherry");
  loteDesnudo = await lote("DESNUDO", "cherry");

  // ── varietal: cosecha → fuente → cohorte → cultivar ───────────────────────
  const catalogo = await prisma.variableCatalog.upsert({
    where: { key: "cultivar" },
    update: {},
    create: { key: "cultivar", name: "Cultivar" },
  });
  cultivarCatalogoId = catalogo.id;
  cultivarValorId = (
    await prisma.variableCatalogValue.create({ data: { catalogId: catalogo.id, value: `TEST Geisha ${RUN}` } })
  ).id;
  cohorteId = (
    await prisma.plantingCohort.create({
      data: { locationId: plotId, cultivarValueId: cultivarValorId, provenanceClass: "original_record", createdBy: gestor },
    })
  ).id;
  const cosecha = await prisma.harvestEvent.create({
    data: {
      // La FK se llama `resultingLotId`: la cosecha PRODUCE el lote, no cuelga
      // de él. El nombre lo dice y el tipo lo obliga.
      resultingLotId: loteCompleto,
      locationId: plotId,
      organizationId: orgId,
      harvestedAt: new Date("2026-03-01T12:00:00Z"),
      provenanceClass: "original_record",
      createdBy: gestor,
    },
  });
  await prisma.harvestEventSource.create({
    data: { harvestEventId: cosecha.id, locationId: plotId, plantingCohortId: cohorteId },
  });

  // ── receta de proceso y de tueste ─────────────────────────────────────────
  const receta = await prisma.processRecipe.create({
    data: { name: `TEST Honey 48h ${RUN}`, organizationId: orgId, status: "approved", createdBy: gestor },
  });
  recetaId = receta.id;
  recetaVersionId = (
    await prisma.processRecipeVersion.create({
      data: { recipeId: receta.id, version: 1, status: "approved", createdBy: gestor },
    })
  ).id;

  const recetaTueste = await prisma.processRecipe.create({
    data: { name: `TEST Perfil filtro ${RUN}`, organizationId: orgId, status: "approved", createdBy: gestor },
  });
  recetaTuesteId = recetaTueste.id;
  recetaTuesteVersionId = (
    await prisma.processRecipeVersion.create({
      data: { recipeId: recetaTueste.id, version: 2, status: "approved", createdBy: gestor },
    })
  ).id;

  // ── tueste: este lote es ENTRADA de una transformación con roastSession ───
  const tueste = await prisma.roastSession.create({
    data: {
      startedAt: new Date("2026-04-01T12:00:00Z"),
      purpose: "sample",
      recipeVersionId: recetaTuesteVersionId,
      createdBy: gestor,
    },
  });
  const transformacion = await prisma.lotTransformation.create({
    data: {
      transformationType: "stage_change",
      occurredAt: new Date("2026-04-01T12:00:00Z"),
      provenanceClass: "original_record",
      roastSessionId: tueste.id,
      createdBy: gestor,
    },
  });
  await prisma.lotTransformationInput.create({ data: { transformationId: transformacion.id, lotId: loteCompleto } });

  // ── muestra → cata ciega → puntaje ────────────────────────────────────────
  const protocolo = await prisma.sensoryProtocol.create({
    data: { domain: "coffee", name: `TEST protocolo ${RUN}`, status: "active", standardLicenseStatus: "adapted_original" },
  });
  protocoloId = protocolo.id;
  const version = await prisma.sensoryProtocolVersion.create({
    data: { protocolId: protocolo.id, version: 1, scoreMin: 0, scoreMax: 100, status: "active" },
  });
  protocoloVersionId = version.id;
  const sesion = await prisma.sensorySession.create({
    data: {
      name: `TEST cata ${RUN}`,
      protocolVersionId: version.id,
      status: "completed",
      classification: "internal",
      createdBy: gestor,
    },
  });
  sesionSensorialId = sesion.id;
  const vuelo = await prisma.sensoryFlight.create({
    data: { sessionId: sesion.id, name: "V1", sequenceOrder: 0 },
  });

  for (const [i, puntaje] of [86, 88].entries()) {
    const muestra = await prisma.sample.create({
      data: {
        sampleCode: `M${i}-${RUN}`,
        sampleType: "green",
        organizationId: orgId,
        locationId: plotId,
        sourceLotId: loteCompleto,
        status: "approved",
        classification: "internal",
        createdBy: gestor,
      },
    });
    const ciega = await prisma.sensoryBlindSample.create({
      data: { flightId: vuelo.id, blindCode: String.fromCharCode(65 + i) },
    });
    await prisma.sensoryBlindMapping.create({ data: { blindSampleId: ciega.id, sampleId: muestra.id } });
    await prisma.assessment.create({
      data: { blindSampleId: ciega.id, evaluatorUserAccountId: gestor, overallScore: puntaje, status: "submitted" },
    });
  }

  // ── el proceso, cerrado con su humedad ────────────────────────────────────
  const proceso = await abrirProceso(gestor, {
    lotId: loteCompleto,
    intent: "40 kg cereza entera, honey 48 h",
    targetMoisturePct: 10.5,
    processRecipeVersionId: recetaVersionId,
    startedAt: new Date("2026-03-02T12:00:00Z"),
    provenanceClass: "original_record",
  });
  const medicion = await prisma.measurement.create({
    data: {
      variable: "moisture",
      value: 10.2,
      unit: "%",
      occurredAt: new Date("2026-03-25T12:00:00Z"),
      lotId: loteCompleto,
      provenanceClass: "measured_fact",
      createdBy: gestor,
    },
  });
  await cerrarProceso(gestor, {
    lotProcessId: proceso.id,
    endedAt: new Date("2026-03-25T12:00:00Z"),
    closingMoistureMeasurementId: medicion.id,
  });

  // El desnudo: un proceso SIN receta y sin nada más colgando.
  await abrirProceso(gestor, {
    lotId: loteDesnudo,
    intent: "sin más datos por ahora",
    targetMoisturePct: 11,
    startedAt: new Date("2026-03-02T12:00:00Z"),
    provenanceClass: "original_record",
  });
});

afterAll(async () => {
  const lotes = [loteCompleto, loteDesnudo];
  await prisma.assessment.deleteMany({
    where: assertDefinedWhere({ blindSample: { flight: { sessionId: sesionSensorialId } } }),
  });
  await prisma.sensoryBlindMapping.deleteMany({
    where: assertDefinedWhere({ blindSample: { flight: { sessionId: sesionSensorialId } } }),
  });
  await prisma.sensorySession.deleteMany({ where: assertDefinedWhere({ id: sesionSensorialId }) });
  await prisma.sensoryProtocolVersion.deleteMany({ where: assertDefinedWhere({ id: protocoloVersionId }) });
  await prisma.sensoryProtocol.deleteMany({ where: assertDefinedWhere({ id: protocoloId }) });
  await prisma.sample.deleteMany({ where: assertDefinedWhere({ sourceLotId: { in: lotes } }) });
  await prisma.lotProcessIntervention.deleteMany({
    where: assertDefinedWhere({ lotProcess: { lotId: { in: lotes } } }),
  });
  await prisma.lotProcess.deleteMany({ where: assertDefinedWhere({ lotId: { in: lotes } }) });
  await prisma.lotTransformationInput.deleteMany({ where: assertDefinedWhere({ lotId: { in: lotes } }) });
  await prisma.lotTransformation.deleteMany({ where: assertDefinedWhere({ createdBy: gestor }) });
  await prisma.roastSession.deleteMany({ where: assertDefinedWhere({ createdBy: gestor }) });
  await prisma.measurement.deleteMany({ where: assertDefinedWhere({ lotId: { in: lotes } }) });
  await prisma.harvestEventSource.deleteMany({ where: assertDefinedWhere({ plantingCohortId: cohorteId }) });
  await prisma.harvestEvent.deleteMany({ where: assertDefinedWhere({ resultingLotId: { in: lotes } }) });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: lotes } }) });
  await prisma.plantingCohort.deleteMany({ where: assertDefinedWhere({ id: cohorteId }) });
  await prisma.variableCatalogValue.deleteMany({ where: assertDefinedWhere({ id: cultivarValorId }) });
  await prisma.processRecipeVersion.deleteMany({
    where: assertDefinedWhere({ recipeId: { in: [recetaId, recetaTuesteId] } }),
  });
  await prisma.processRecipe.deleteMany({ where: assertDefinedWhere({ id: { in: [recetaId, recetaTuesteId] } }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: gestor }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: scopeId }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: gestor }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: plotId }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: orgId }) });
  void cultivarCatalogoId;
  void plataformaScopeId;
});

describe("la cadena entera se puede unir", () => {
  it("una fila lleva su proceso, su varietal, su perfil de tueste y sus puntajes", async () => {
    const r = await reporteDeProceso(gestor);
    const fila = r.filas.find((f) => f.lotCode.startsWith("COMPLETO"));
    expect(fila, "el lote con la cadena completa no salió en el reporte").toBeDefined();

    expect(fila!.etiqueta).toContain("Honey 48h");
    expect(fila!.intent).toContain("cereza entera");
    expect(fila!.targetMoisturePct).toBe(10.5);
    expect(fila!.humedadDeCierre).toBe(10.2);
    expect(fila!.diferenciaContraObjetivo).toBeCloseTo(-0.3, 5);
    // Los tres saltos que nadie había atado antes:
    expect(fila!.varietales.some((v) => v.includes("Geisha")), "varietal: cosecha → cohorte → cultivar").toBe(true);
    expect(fila!.perfilesDeTueste.some((p) => p.includes("Perfil filtro")), "tueste: entrada de la transformación").toBe(
      true,
    );
    expect(fila!.puntajes.sort(), "puntajes: muestra → ciego → valoración").toEqual([86, 88]);
    expect(fila!.puntajePromedio).toBe(87);
  });

  /**
   * La otra mitad. Un lote sin nada colgando no puede inventarse un cero: un 0
   * es un puntaje y la ausencia no lo es.
   */
  it("un proceso sin nada colgando sale con listas vacías y promedio null, no 0", async () => {
    const r = await reporteDeProceso(gestor);
    const fila = r.filas.find((f) => f.lotCode.startsWith("DESNUDO"));
    expect(fila).toBeDefined();
    expect(fila!.etiqueta).toBe(SIN_RECETA);
    expect(fila!.varietales).toEqual([]);
    expect(fila!.perfilesDeTueste).toEqual([]);
    expect(fila!.puntajes).toEqual([]);
    expect(fila!.puntajePromedio).toBeNull();
    expect(fila!.humedadDeCierre).toBeNull();
    expect(fila!.diferenciaContraObjetivo).toBeNull();
  });

  it("agrupa por proceso, que es por lo que se comparan dos cafés", async () => {
    const r = await reporteDeProceso(gestor);
    const honey = r.porProceso.find((g) => g.etiqueta.includes("Honey 48h"));
    const sin = r.porProceso.find((g) => g.etiqueta === SIN_RECETA);
    expect(honey?.puntajePromedio).toBe(87);
    // «Sin receta» aparece como grupo propio, no se esconde ni se mezcla.
    expect(sin, "«Sin receta» debe ser un grupo, no un hueco").toBeDefined();
    expect(sin!.puntajePromedio).toBeNull();
  });

  /**
   * El recuento que convierte «0 filas» en algo accionable. Sin él, un reporte
   * vacío se lee como «no hay nada que ver» en vez de «falta registrar».
   */
  it("dice qué eslabón falta, no sólo cuántas filas hay", async () => {
    const r = await reporteDeProceso(gestor);
    expect(r.faltan.lotesVisibles).toBeGreaterThanOrEqual(2);
    expect(r.faltan.lotesConProceso).toBeGreaterThanOrEqual(2);
    // De los dos procesos, uno está cerrado, uno tiene tueste, uno tiene puntaje.
    expect(r.faltan.procesosCerrados).toBe(1);
    expect(r.faltan.procesosConTueste).toBe(1);
    expect(r.faltan.procesosConPuntaje).toBe(1);
  });
});
