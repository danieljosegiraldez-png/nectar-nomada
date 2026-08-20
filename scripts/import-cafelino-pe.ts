/**
 * I1 (docs/implementation/40_I1_IMPORTADOR_PE_CAFELINO.md). CLI entry
 * point for the Cafelino PE import. Reads the two real CSV files from the
 * operator's own machine (never committed to this repo — real client
 * experimental data) and either prints a dry-run report (default) or
 * writes for real (--apply).
 *
 * Usage:
 *   tsx scripts/import-cafelino-pe.ts \
 *     --pe "/Users/danielsan/Downloads/Procesos Especiales Cafelino-CraftBrewingSupply Panama 25-26 - PE Data-Table 2025-26.csv" \
 *     --cerezas "/Users/danielsan/Downloads/Procesos Especiales Cafelino-CraftBrewingSupply Panama 25-26 - Estudio cerezas.csv" \
 *     --actor <userAccountId> \
 *     [--apply]
 *
 * Idempotent by PE code: a row whose PE code already has a TreatmentBatch
 * (batchLabel) is skipped on re-run, never duplicated (§7).
 */
import { prisma } from "../lib/db";
import {
  readCafelinoPeCsvFile,
  isBlankTemplateRow,
  parseLineageParent,
  resolveLotCode,
  mapGradoProceso,
  mapOxygenManagement,
  mapManejoTemperatura,
  mapFuenteDeAgua,
  extractOwnStageYeast,
  mapLevaduraCultivo,
  mapMetodoInoculacion,
  mapEquipo,
  mapFuenteMicrobiana,
  type PeRow,
} from "../lib/research/cafelinoPeImport";
import { createProtocol, createProtocolVersion, activateProtocolVersion } from "../lib/research/protocols";
import { createTreatmentBatch, addProcessingStage, recordProcessSensoryObservation, recordProcessingStageObservation } from "../lib/research/treatments";
import { recordHarvestEvent } from "../lib/traceability/harvest";
import { recordTransformation } from "../lib/traceability/lots";
import { recordMeasurement } from "../lib/traceability/measurements";

const CAFELINO_ORG_ID = "20dcb041-7cb4-4cc2-a951-92e25e67386f";
const CAFELINO_PROJECT_ID = "ac83fa76-f297-4874-970a-f7145682ddd5";
const CAFELINO_SITE_LOCATION_ID = "b026633d-8a0d-4e34-89bd-92a66db63248";
const SOURCE_REFERENCE = "Procesos Especiales Cafelino-CraftBrewingSupply Panama 25-26 - PE Data-Table 2025-26.csv";

interface Report {
  totalRows: number;
  blankRows: number;
  processed: number;
  skippedAlreadyImported: number;
  resumedOrphanLots: number;
  rootLots: number;
  chainedLots: number;
  unparseableLineage: Array<{ peCode: string; raw: string }>;
  duplicatePeCodes: string[];
  unmappedGradoProceso: string[];
  unmappedSelection: string[];
  unmappedFloating: string[];
  unmappedYeast: string[];
  missingH: number;
  missingExitDate: number;
  deducedLotCodes: number;
  wetGuachoRows: string[];
}

function newReport(): Report {
  return {
    totalRows: 0, blankRows: 0, processed: 0, skippedAlreadyImported: 0,
    rootLots: 0, chainedLots: 0, unparseableLineage: [], duplicatePeCodes: [],
    unmappedGradoProceso: [], unmappedSelection: [], unmappedFloating: [],
    unmappedYeast: [], missingH: 0, missingExitDate: 0, deducedLotCodes: 0, resumedOrphanLots: 0,
    wetGuachoRows: [],
  };
}

async function ensureLocations() {
  let dryingRoom = await prisma.location.findFirst({ where: { name: "Invernadero solar", organizationId: CAFELINO_ORG_ID } });
  if (!dryingRoom) {
    dryingRoom = await prisma.location.create({
      data: {
        locationType: "site",
        name: "Invernadero solar",
        organizationId: CAFELINO_ORG_ID,
        parentLocationId: CAFELINO_SITE_LOCATION_ID,
        status: "approved",
        classification: "partner",
        // "El cuarto solar tiene 3 niveles con luz" (RO1.2's own reference
        // to this exact room) — the CSV's own "Nivel cama (1-Abajo,2-
        // Medio,3-Arriba)" column confirms a 3-level scale.
        dryingRoomLightExposure: "with_light",
        dryingRoomBedLevelCount: 3,
        description: "Cama africana — bed type used throughout the PE dataset's own 'Cuarto secado' column.",
      },
    });
  }

  const plots: Record<string, string> = {};
  for (const [code, name] of [["9", "Lote 9 — Cafelino"], ["10", "Lote 10 — Cafelino"]] as const) {
    let plot = await prisma.location.findFirst({ where: { name, organizationId: CAFELINO_ORG_ID } });
    if (!plot) {
      plot = await prisma.location.create({
        data: {
          locationType: "plot",
          name,
          organizationId: CAFELINO_ORG_ID,
          parentLocationId: CAFELINO_SITE_LOCATION_ID,
          status: "approved",
          classification: "partner",
        },
      });
    }
    plots[code] = plot.id;
  }
  return { dryingRoomId: dryingRoom.id, plotByLotCode: plots };
}

async function ensureProtocolVersion(actorUserAccountId: string) {
  let protocol = await prisma.protocol.findFirst({ where: { name: "PE Cafelino 25-26" } });
  let version = protocol ? await prisma.protocolVersion.findFirst({ where: { protocolId: protocol.id }, include: { variables: true } }) : null;
  if (protocol && version) return { protocolId: protocol.id, version };

  if (!protocol) {
    const experiment = await ensureExperiment(actorUserAccountId);
    protocol = await createProtocol(actorUserAccountId, {
      experimentId: experiment.id,
      name: "PE Cafelino 25-26",
      externalIdentifier: null,
      identifierConvention: "PE-<secuencia>, sin significado más allá de la secuencia (confirmado por el product owner)",
    });
  }

  const catalogs = await prisma.variableCatalog.findMany({
    where: { key: { in: ["grado_proceso", "condicion_oxigeno", "manejo_temperatura", "fuente_microbiana", "levadura_cultivo", "metodo_inoculacion", "recipiente", "sustrato_anadido", "estado_cereza"] } },
  });
  const catalogId = (key: string) => catalogs.find((c) => c.key === key)!.id;

  version = await createProtocolVersion(actorUserAccountId, {
    protocolId: protocol.id,
    notes: "Importado desde PE Data-Table 2025-26.csv — I1",
    variables: [
      { name: "Flujo de proceso", valueType: "catalog", catalogId: catalogId("grado_proceso") },
      { name: "Condición de oxígeno", valueType: "catalog", catalogId: catalogId("condicion_oxigeno") },
      { name: "Manejo de temperatura", valueType: "catalog", catalogId: catalogId("manejo_temperatura") },
      { name: "Fuente microbiana", valueType: "catalog", catalogId: catalogId("fuente_microbiana") },
      { name: "Levadura / cultivo", valueType: "catalog", catalogId: catalogId("levadura_cultivo") },
      { name: "Método de inoculación", valueType: "catalog", catalogId: catalogId("metodo_inoculacion") },
      { name: "Recipiente", valueType: "catalog", catalogId: catalogId("recipiente") },
      { name: "Sustrato añadido", valueType: "catalog", catalogId: catalogId("sustrato_anadido") },
      { name: "Estado de la cereza", valueType: "catalog", catalogId: catalogId("estado_cereza") },
      { name: "Fuente de agua", valueType: "closed_enum", enumValues: ["río", "quebrada", "pozo", "red"] },
      { name: "Nivel de cama", valueType: "numeric", unit: "nivel" },
    ],
    requiredMeasurements: [],
  }) as unknown as typeof version;
  await activateProtocolVersion(actorUserAccountId, version!.id);
  return { protocolId: protocol.id, version: version! };
}

async function ensureExperiment(actorUserAccountId: string) {
  let program = await prisma.researchProgram.findFirst({ where: { name: "PE Cafelino — post-cosecha 25-26" } });
  if (!program) {
    const { createResearchProgram, createResearchQuestion, createHypothesis, createExperiment } = await import("../lib/research/programs");
    program = await createResearchProgram(actorUserAccountId, { name: "PE Cafelino — post-cosecha 25-26" });
    const question = await createResearchQuestion(actorUserAccountId, program.id, "¿Cómo interactúan flujo de proceso, condición de oxígeno, manejo de temperatura y fuente microbiana en el perfil resultante?");
    const hypothesis = await createHypothesis(actorUserAccountId, question.id, "Las dimensiones son independientes y su combinación explica variación en el perfil más que cualquiera por separado.");
    return createExperiment(actorUserAccountId, {
      researchProgramId: program.id,
      hypothesisId: hypothesis.id,
      projectId: CAFELINO_PROJECT_ID,
      name: "PE Cafelino 25-26",
    });
  }
  const experiment = await prisma.experiment.findFirst({ where: { researchProgramId: program.id, projectId: CAFELINO_PROJECT_ID } });
  if (experiment) return experiment;
  throw new Error("PE Cafelino research program exists but its Experiment is missing — investigate before continuing.");
}

function phMeasurements(row: PeRow) {
  const out: Array<{ label: string; value: number }> = [];
  if (row.phWater != null) out.push({ label: "water", value: row.phWater });
  if (row.phMostoInicial != null) out.push({ label: "mosto inicial", value: row.phMostoInicial });
  if (row.ph24hr != null) out.push({ label: "24hr", value: row.ph24hr });
  if (row.phMostoFinal != null) out.push({ label: "mosto final", value: row.phMostoFinal });
  return out;
}
function tempMeasurements(row: PeRow) {
  const out: Array<{ label: string; value: number }> = [];
  if (row.tempDay1 != null) out.push({ label: "day 1", value: row.tempDay1 });
  if (row.tempDay2 != null) out.push({ label: "day 2", value: row.tempDay2 });
  if (row.tempDay3 != null) out.push({ label: "day 3", value: row.tempDay3 });
  return out;
}

export async function runImport(opts: { peCsvPath: string; cerezasCsvPath: string; actorUserAccountId: string; apply: boolean }) {
  const report = newReport();
  const allRows = readCafelinoPeCsvFile(opts.peCsvPath);
  report.totalRows = allRows.length;
  const rows = allRows.filter((r) => {
    if (isBlankTemplateRow(r)) {
      report.blankRows++;
      return false;
    }
    return true;
  });

  // Detect duplicate PE codes (real anomaly found while scanning the file:
  // PE-91 and PE-93 each appear at two different S/N rows with different
  // data) — reported, and only the FIRST occurrence (by S/N) is imported;
  // the rest are flagged, never silently merged or overwritten.
  const seen = new Set<string>();
  const dedupedRows: PeRow[] = [];
  for (const r of rows.sort((a, b) => a.sn - b.sn)) {
    if (seen.has(r.peCode)) {
      report.duplicatePeCodes.push(r.peCode);
      continue;
    }
    seen.add(r.peCode);
    dedupedRows.push(r);
  }

  const { dryingRoomId, plotByLotCode } = opts.apply ? await ensureLocations() : { dryingRoomId: null, plotByLotCode: {} as Record<string, string> };
  const setup = opts.apply ? await ensureProtocolVersion(opts.actorUserAccountId) : null;
  const catalogs = await prisma.variableCatalog.findMany({
    where: { key: { in: ["grado_proceso", "condicion_oxigeno", "manejo_temperatura", "fuente_microbiana", "levadura_cultivo", "metodo_inoculacion", "recipiente", "sustrato_anadido", "estado_cereza", "cereza_seleccion", "cereza_flotado"] } },
  });
  const catalogValueId = async (catalogKey: string, value: string) => {
    const catalog = catalogs.find((c) => c.key === catalogKey);
    if (!catalog) return null;
    const row = await prisma.variableCatalogValue.findFirst({ where: { catalogId: catalog.id, value } });
    return row?.id ?? null;
  };

  const byPeCode = new Map(dedupedRows.map((r) => [r.peCode, r]));

  // Product owner decision: PE-90 and PE-98 are referenced as parents
  // (PE-90=>PE-90-A/B, PE-98=>PE-98A/B/C) but never appear as their own
  // row — the real branching point (post cold-hold split into washed/
  // semi-wash variants) genuinely happened, the file just never recorded
  // the pre-split state as its own line. Synthesized here from whichever
  // child carries the fullest shared data (children of one split share
  // their pre-split yeast/method/equipment/weight), explicitly marked
  // `interpretation` (not `original_record` — nothing was read from a
  // file row for this one) with a note naming exactly which children it
  // was deduced from.
  const deducedParentPeCodes: string[] = [];
  for (const row of dedupedRows) {
    const lineage = parseLineageParent(row);
    if (lineage && !("unparseable" in lineage) && !byPeCode.has(lineage.parentPeCode)) {
      const parentCode = lineage.parentPeCode;
      if (byPeCode.has(parentCode)) continue; // already synthesized from an earlier sibling
      const siblings = dedupedRows
        .filter((r) => {
          const l = parseLineageParent(r);
          return l && !("unparseable" in l) && l.parentPeCode === parentCode;
        })
        .sort((a, b) => a.sn - b.sn);
      const template = siblings[0]!;
      byPeCode.set(parentCode, {
        ...template,
        sn: template.sn - 0.5, // sorts immediately before its first child
        peCode: parentCode,
        lineageAnnotation: null, // it's the root of this chain, not itself a child
        observaciones: `[DEDUCIDO] Registro no presente en el archivo real — inferido de sus hijos (${siblings.map((s) => s.peCode).join(", ")}), que comparten el mismo tratamiento pre-bifurcación. Decisión del product owner: preserva la bifurcación real desde ${parentCode}.`,
      });
      deducedParentPeCodes.push(parentCode);
    }
  }
  const allPeCodes = [...byPeCode.keys()];

  // Resolve lineage order: root rows first (including now-synthesized
  // deduced parents), then children whose parent has already been
  // resolved, iterating until no more progress. Anything genuinely
  // unparseable is reported and imported independently (§3's own explicit
  // fallback), never guessed.
  const resolvedLotId = new Map<string, string>(); // peCode -> lotId
  const resolvedTreatmentBatchId = new Map<string, string>();
  const pending = new Set(allPeCodes);
  const ordered: PeRow[] = [];
  let progressed = true;
  while (pending.size > 0 && progressed) {
    progressed = false;
    for (const peCode of [...pending]) {
      const row = byPeCode.get(peCode)!;
      const lineage = parseLineageParent(row);
      if (!lineage) {
        ordered.push(row);
        pending.delete(peCode);
        progressed = true;
      } else if ("unparseable" in lineage) {
        report.unparseableLineage.push({ peCode, raw: lineage.raw });
        ordered.push(row); // treated as independent, per §3
        pending.delete(peCode);
        progressed = true;
      } else if (resolvedLotId.has(lineage.parentPeCode) || !byPeCode.has(lineage.parentPeCode)) {
        if (!byPeCode.has(lineage.parentPeCode)) {
          report.unparseableLineage.push({ peCode, raw: `parent ${lineage.parentPeCode} not found in file` });
        }
        ordered.push(row);
        pending.delete(peCode);
        progressed = true;
      }
    }
  }
  for (const leftover of pending) ordered.push(byPeCode.get(leftover)!); // circular refs, shouldn't happen; safety net

  for (const row of ordered) {
    report.processed++;

    const existingBatch = await prisma.treatmentBatch.findFirst({ where: { batchLabel: row.peCode } });
    if (existingBatch) {
      report.skippedAlreadyImported++;
      resolvedTreatmentBatchId.set(row.peCode, existingBatch.id);
      if (existingBatch.lotId) resolvedLotId.set(row.peCode, existingBatch.lotId);
      continue;
    }

    const lineage = parseLineageParent(row);
    const parentPeCode = lineage && !("unparseable" in lineage) ? lineage.parentPeCode : null;
    const parentLotId = parentPeCode ? resolvedLotId.get(parentPeCode) ?? null : null;

    const lotCode = resolveLotCode(row);
    if (lotCode?.deduced) report.deducedLotCodes++;
    if (row.parchmentBeanHPercent == null && row.cafeVerdeHPercent == null) report.missingH++;
    if (!row.storageDate) report.missingExitDate++;

    const grado = mapGradoProceso(row.dryingProcessRaw);
    if (row.dryingProcessRaw && !grado) report.unmappedGradoProceso.push(`${row.peCode}: "${row.dryingProcessRaw}"`);
    // "Ripe Cherry" / "Floating: Yes" are real catalog values now (aliased
    // to uniforme_alta / sin_flotadores, per the product owner — English
    // versions of existing Spanish vocabulary, not unknown terms). Any
    // OTHER Selection/Floating text would still be genuinely unmapped and
    // reported here — none observed in this file (both are uniform across
    // every row).
    if (row.selectionRaw && row.selectionRaw !== "Ripe Cherry") report.unmappedSelection.push(`${row.peCode}: "${row.selectionRaw}"`);
    if (row.floatingRaw && row.floatingRaw !== "Yes") report.unmappedFloating.push(`${row.peCode}: "${row.floatingRaw}"`);

    const ownYeastRaw = extractOwnStageYeast(row.yeastRaw, row.microbeTypeRaw);
    const yeastMapped = mapLevaduraCultivo(ownYeastRaw);
    const isGuacho = row.yeastRaw ? /guacho/i.test(row.yeastRaw) : false;
    if (isGuacho) report.wetGuachoRows.push(row.peCode);
    if (ownYeastRaw && !yeastMapped) report.unmappedYeast.push(`${row.peCode}: "${ownYeastRaw}"`);

    if (!opts.apply) continue; // dry-run: report-only, no writes below this point

    const isDeducedParent = deducedParentPeCodes.includes(row.peCode);

    // Resumability. The Lot is written here, well before the TreatmentBatch
    // at the bottom of this loop — and the TreatmentBatch is what
    // skippedAlreadyImported keys on. A run that dies between the two (as
    // the dataQuality bug did at PE-81) therefore leaves an orphan Lot that
    // no idempotency check can see: the retry skips nothing, recreates the
    // same lotCode, and aborts on lot_code uniqueness. That left the import
    // unresumable without restoring the database — survivable locally,
    // considerably worse against real Neon. Adopt the orphan instead.
    const existingLot = await prisma.lot.findUnique({ where: { lotCode: row.peCode } });

    let lotId: string;
    if (existingLot) {
      lotId = existingLot.id;
      report.resumedOrphanLots++;
    } else if (!parentLotId) {
      const plotId = lotCode ? plotByLotCode[lotCode.value] : undefined;
      if (!plotId || !row.harvestDate) continue; // can't create without a real plot/date — reported separately below
      const { lot } = await recordHarvestEvent(opts.actorUserAccountId, {
        lotCode: row.peCode,
        locationId: plotId,
        organizationId: CAFELINO_ORG_ID,
        projectId: CAFELINO_PROJECT_ID,
        harvestedAt: row.harvestDate,
        cherryWeightKg: row.pesoFrutaKg,
        condition: row.selectionRaw ?? undefined,
        notes: [row.descripcionTratamiento, lotCode?.deduced ? "Lote deducido del varietal (celda vacía en el archivo real)." : null, isDeducedParent ? row.observaciones : null]
          .filter(Boolean)
          .join(" — ") || undefined,
        // Product owner decision: a deduced parent (PE-90, PE-98) was
        // never read from a file row — it's inferred from its children's
        // shared pre-split attributes, so it's `interpretation`, not
        // `original_record`. Every real row stays `original_record`.
        provenanceClass: isDeducedParent ? "interpretation" : "original_record",
        sourceReference: isDeducedParent
          ? `Deducido — ver ${SOURCE_REFERENCE}, filas de ${row.peCode}-A/B/C`
          : SOURCE_REFERENCE,
      });
      lotId = lot.id;
      report.rootLots++;
    } else {
      const { outputLots } = await recordTransformation(opts.actorUserAccountId, {
        transformationType: "stage_change",
        occurredAt: row.startDate ?? row.harvestDate ?? new Date(),
        provenanceClass: "original_record",
        sourceReference: SOURCE_REFERENCE,
        notes: `Linaje real, columna "Anotacion codigo revision": ${lineage && !("unparseable" in lineage) ? lineage.raw : ""}`,
        inputs: [{ lotId: parentLotId, quantity: row.pesoFrutaKg ?? undefined, unit: row.pesoFrutaKg != null ? "kg" : undefined }],
        outputs: [{ lotCode: row.peCode, lotType: "processing", quantity: row.pesoFrutaKg ?? undefined, unit: row.pesoFrutaKg != null ? "kg" : undefined }],
      });
      lotId = outputLots[0]!.id;
      report.chainedLots++;
    }
    resolvedLotId.set(row.peCode, lotId);

    const variableValues: Array<{ protocolVariableId: string; catalogValueId?: string | null; textValue?: string | null; numericValue?: number | null }> = [];
    const variables = setup!.version.variables as Array<{ id: string; name: string }>;
    const varId = (name: string) => variables.find((v) => v.name === name)!.id;

    if (grado) {
      const id = await catalogValueId("grado_proceso", grado);
      if (id) variableValues.push({ protocolVariableId: varId("Flujo de proceso"), catalogValueId: id });
    }
    const oxygen = mapOxygenManagement(row.oxygenManagementRaw);
    if (oxygen) {
      const id = await catalogValueId("condicion_oxigeno", oxygen);
      if (id) variableValues.push({ protocolVariableId: varId("Condición de oxígeno"), catalogValueId: id });
    }
    const manejo = mapManejoTemperatura(row.stage, row.areaRaw);
    if (manejo) {
      const id = await catalogValueId("manejo_temperatura", manejo);
      if (id) variableValues.push({ protocolVariableId: varId("Manejo de temperatura"), catalogValueId: id });
    }
    if (!isGuacho && yeastMapped) {
      const fuente = mapFuenteMicrobiana(ownYeastRaw);
      if (fuente) {
        const id = await catalogValueId("fuente_microbiana", fuente);
        if (id) variableValues.push({ protocolVariableId: varId("Fuente microbiana"), catalogValueId: id });
      }
      const id = await catalogValueId("levadura_cultivo", yeastMapped.catalogValue);
      // ADR-053 / RO1.2: picking a catalogValue whose impliesUnknownIdentity is
      // set makes dataQuality REQUIRED — createTreatmentBatch throws
      // unknown_identity_value_requires_data_quality rather than defaulting it,
      // deliberately. "Spontaneous Wild" is the only such value, and four rows
      // here use it (PE-81, PE-82, PE-84, PE-86).
      //
      // not_tested, confirmed with the product owner: no microbial
      // identification was ever performed on these ferments. That states an
      // absence of testing, which is what happened — rather than `unconfirmed`,
      // which would imply an identity was claimed and not verified.
      if (id) {
        variableValues.push({
          protocolVariableId: varId("Levadura / cultivo"),
          catalogValueId: id,
          ...(yeastMapped.unknownIdentity ? { dataQuality: "not_tested" as const } : {}),
        });
      }
      const metodo = mapMetodoInoculacion(row.metodoInoculacionRaw, yeastMapped);
      if (metodo) {
        const mId = await catalogValueId("metodo_inoculacion", metodo);
        if (mId) variableValues.push({ protocolVariableId: varId("Método de inoculación"), catalogValueId: mId });
      }
    }
    const equipo = mapEquipo(row.equipoRaw);
    if (equipo) {
      const id = await catalogValueId("recipiente", equipo);
      if (id) variableValues.push({ protocolVariableId: varId("Recipiente"), catalogValueId: id });
    }
    const sustrato = isGuacho ? "doble_mosto" : "ninguno";
    {
      const id = await catalogValueId("sustrato_anadido", sustrato);
      if (id) variableValues.push({ protocolVariableId: varId("Sustrato añadido"), catalogValueId: id });
    }
    if (row.processType === "Whole Cherries") {
      const id = await catalogValueId("estado_cereza", "entera");
      if (id) variableValues.push({ protocolVariableId: varId("Estado de la cereza"), catalogValueId: id });
    }
    const agua = mapFuenteDeAgua(row.areaRaw);
    if (agua) variableValues.push({ protocolVariableId: varId("Fuente de agua"), textValue: agua });
    if (row.nivelCama != null) variableValues.push({ protocolVariableId: varId("Nivel de cama"), numericValue: row.nivelCama });

    const batch = await createTreatmentBatch(opts.actorUserAccountId, {
      protocolVersionId: setup!.version.id,
      lotId,
      projectId: CAFELINO_PROJECT_ID,
      batchLabel: row.peCode,
      startedAt: row.startDate ?? row.harvestDate ?? new Date(),
      notes: isDeducedParent ? row.observaciones ?? undefined : row.descripcionTratamiento ?? undefined,
      provenanceClass: isDeducedParent ? "interpretation" : "original_record",
      sourceReference: isDeducedParent
        ? `Deducido — ver ${SOURCE_REFERENCE}, filas de ${row.peCode}-A/B/C`
        : SOURCE_REFERENCE,
      variableValues,
    });
    resolvedTreatmentBatchId.set(row.peCode, batch.id);

    const stageName = row.stage === "Prefermentive" ? "prefermentativo" : "fermentacion";
    const stage = await addProcessingStage(opts.actorUserAccountId, {
      treatmentBatchId: batch.id,
      name: stageName,
      sequenceOrder: 1,
      startedAt: row.startDate ?? row.harvestDate ?? new Date(),
    });

    for (const { label, value } of phMeasurements(row)) {
      await recordMeasurement(opts.actorUserAccountId, {
        variable: "ph", value, unit: "pH", occurredAt: stage.startedAt,
        lotId, treatmentBatchId: batch.id, processingStageId: stage.id,
        notes: label, provenanceClass: "measured_fact", sourceReference: SOURCE_REFERENCE,
      });
    }
    for (const { label, value } of tempMeasurements(row)) {
      await recordMeasurement(opts.actorUserAccountId, {
        variable: "temperature", value, unit: "C", occurredAt: stage.startedAt,
        lotId, treatmentBatchId: batch.id, processingStageId: stage.id,
        notes: label, provenanceClass: "measured_fact", sourceReference: SOURCE_REFERENCE,
      });
    }
    if (row.parchmentBeanHPercent != null) {
      await recordMeasurement(opts.actorUserAccountId, {
        variable: "moisture", value: row.parchmentBeanHPercent, unit: "%", occurredAt: row.storageDate ?? stage.startedAt,
        lotId, treatmentBatchId: batch.id, notes: "Parchment Bean H%",
        provenanceClass: "measured_fact", sourceReference: SOURCE_REFERENCE,
      });
    }
    if (row.cafeVerdeHPercent != null) {
      await recordMeasurement(opts.actorUserAccountId, {
        variable: "moisture", value: row.cafeVerdeHPercent, unit: "%", occurredAt: row.storageDate ?? stage.startedAt,
        lotId, treatmentBatchId: batch.id, notes: "Cafe verde H%",
        provenanceClass: "measured_fact", sourceReference: SOURCE_REFERENCE,
      });
    }

    // Deduced-parent rows carry a synthesized "[DEDUCIDO]" note in
    // `observaciones` (a methodology note about the record itself) — never
    // written as a ProcessSensoryObservation, which represents a real
    // field observation about the coffee that a deduced row never had.
    if (row.observaciones && !isDeducedParent) {
      await recordProcessSensoryObservation(opts.actorUserAccountId, {
        processingStageId: stage.id,
        observedAt: stage.startedAt,
        medium: "cereza",
        freeTextDescriptor: row.observaciones,
        provenanceClass: "direct_observation",
        sourceReference: SOURCE_REFERENCE,
      });
    }

    // §3b — Selection/Floating are OBSERVED cherry-quality attributes, not
    // declared experimental variables, so they go through RO1's own
    // ProcessingStageObservation mechanism, not TreatmentBatchVariableValue.
    // "Ripe Cherry"/"Yes" are real catalog values now (aliased to
    // uniforme_alta/sin_flotadores per the product owner) — recorded even
    // for a deduced parent, since its children genuinely share this same
    // reading.
    if (row.selectionRaw === "Ripe Cherry") {
      const id = await catalogValueId("cereza_seleccion", "Ripe Cherry");
      if (id) {
        await recordProcessingStageObservation(opts.actorUserAccountId, {
          processingStageId: stage.id,
          catalogValueId: id,
          occurredAt: stage.startedAt,
          provenanceClass: isDeducedParent ? "interpretation" : "direct_observation",
          sourceReference: SOURCE_REFERENCE,
        });
      }
    }
    if (row.floatingRaw === "Yes") {
      const id = await catalogValueId("cereza_flotado", "Yes");
      if (id) {
        await recordProcessingStageObservation(opts.actorUserAccountId, {
          processingStageId: stage.id,
          catalogValueId: id,
          occurredAt: stage.startedAt,
          provenanceClass: isDeducedParent ? "interpretation" : "direct_observation",
          sourceReference: SOURCE_REFERENCE,
        });
      }
    }

    if (row.nivelCama != null && dryingRoomId) {
      await addProcessingStage(opts.actorUserAccountId, {
        treatmentBatchId: batch.id,
        name: "secado",
        sequenceOrder: 2,
        startedAt: row.initialDryingDate ?? stage.startedAt,
        locationId: dryingRoomId,
      });
    }
  }

  return { report, dedupedCount: dedupedRows.length };
}

async function main() {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const peCsvPath = get("--pe");
  const cerezasCsvPath = get("--cerezas");
  const actorUserAccountId = get("--actor");
  const apply = args.includes("--apply");

  if (!peCsvPath || !actorUserAccountId) {
    console.error("Usage: tsx scripts/import-cafelino-pe.ts --pe <path> --cerezas <path> --actor <userAccountId> [--apply]");
    process.exit(1);
  }

  const { report, dedupedCount } = await runImport({ peCsvPath, cerezasCsvPath: cerezasCsvPath ?? "", actorUserAccountId, apply });
  console.log(`\n=== Cafelino PE import — ${apply ? "APPLIED" : "DRY RUN"} ===\n`);
  console.log(JSON.stringify({ ...report, uniquePeCodesAfterDedup: dedupedCount }, null, 2));
}

const isMainModule = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main().finally(() => prisma.$disconnect());
}
