/**
 * S1 (docs/implementation/45_S1_SUELO_AMBIENTE_TAZA.md §2, semanas 6–10). La
 * muestra de suelo y la muestra foliar — el Paso 6 del plan de acción.
 *
 * **La muestra y el resultado son dos cosas distintas y no se funden.** Aquí
 * vive la muestra: de dónde salió, de qué profundidad, de cuántas submuestras
 * se compuso, a qué laboratorio fue, con qué extractante. Los resultados de la
 * Tabla 3 y del panel foliar son `Measurement` colgados de estas filas, con
 * `soilSampleId` / `foliarSampleId` como sujeto.
 *
 * **RBAC reusa `location:manage_attributes`**, como todo lo demás de la tierra.
 *
 * **Corrección por edición.** Una muestra es un registro de lo que se recogió,
 * no una lectura observada: si alguien tecleó mal el número de submuestras, el
 * suelo no cambió. El `AuditEvent` guarda el antes. Lo que sí es una fila nueva
 * es una ronda nueva — §14.1 pide volver al mismo punto etiquetado, no editar
 * la muestra del año pasado.
 */
import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { requireLocationAttributeAccess, LocationAccessError } from "./locations";
import type { CanopyPosition, DataQuality, ProvenanceClass } from "../../generated/prisma/client";

export class SampleValidationError extends Error {}

export interface CreateSoilSampleInput {
  locationId: string;
  sampleCode: string;
  sampledAt: Date;
  provenanceClass: ProvenanceClass;
  treatmentPlotLabel?: string | null;
  samplingPointLabel?: string | null;
  depthTopCm?: number | null;
  depthBottomCm?: number | null;
  subSampleCount?: number | null;
  laboratory?: string | null;
  extractionMethod?: string | null;
  notes?: string | null;
  sourceReference?: string | null;
  dataQuality?: DataQuality | null;
  clientDraftId?: string | null;
}

export interface CreateFoliarSampleInput {
  locationId: string;
  sampleCode: string;
  sampledAt: Date;
  provenanceClass: ProvenanceClass;
  treatmentPlotLabel?: string | null;
  leafPairPosition?: number | null;
  canopyPosition?: CanopyPosition | null;
  treeAgeYears?: number | null;
  cultivar?: string | null;
  phenologicalStage?: string | null;
  branchBearingFruit?: boolean | null;
  laboratory?: string | null;
  notes?: string | null;
  sourceReference?: string | null;
  dataQuality?: DataQuality | null;
  clientDraftId?: string | null;
}

function exigirCodigo(codigo: string): string {
  const limpio = codigo.trim();
  // Sin código no hay a qué atribuir un resultado, que es el punto de tener una
  // fila de muestra separada del resultado.
  if (!limpio) throw new SampleValidationError("sample_code_required");
  return limpio;
}

function validarProfundidad(top: number | null | undefined, bottom: number | null | undefined) {
  for (const [nombre, v] of [["top", top], ["bottom", bottom]] as const) {
    if (v != null && v < 0) throw new SampleValidationError(`negative_depth_${nombre}`);
  }
  // Una banda que empieza más abajo de donde acaba está al revés. El error es
  // fácil describiendo desde el fondo.
  if (top != null && bottom != null && top >= bottom) {
    throw new SampleValidationError("depth_top_not_above_bottom");
  }
}

export async function createSoilSample(userAccountId: string, input: CreateSoilSampleInput) {
  const sampleCode = exigirCodigo(input.sampleCode);
  await requireLocationAttributeAccess(userAccountId, input.locationId);
  validarProfundidad(input.depthTopCm, input.depthBottomCm);

  // §14.1 pide 10–15 submuestras. No se exige ese rango —un compuesto de 8 es
  // un compuesto peor, no un dato falso— pero cero submuestras no es un
  // compuesto, es un error de tecleo.
  if (input.subSampleCount != null && input.subSampleCount < 1) {
    throw new SampleValidationError("sub_sample_count_below_one");
  }

  return prisma.$transaction(async (tx) => {
    const muestra = await tx.soilSample.create({
      data: {
        locationId: input.locationId,
        sampleCode,
        sampledAt: input.sampledAt,
        provenanceClass: input.provenanceClass,
        treatmentPlotLabel: input.treatmentPlotLabel ?? null,
        samplingPointLabel: input.samplingPointLabel ?? null,
        depthTopCm: input.depthTopCm ?? null,
        depthBottomCm: input.depthBottomCm ?? null,
        subSampleCount: input.subSampleCount ?? null,
        laboratory: input.laboratory ?? null,
        extractionMethod: input.extractionMethod ?? null,
        notes: input.notes ?? null,
        sourceReference: input.sourceReference ?? null,
        dataQuality: input.dataQuality ?? null,
        clientDraftId: input.clientDraftId ?? null,
        createdBy: userAccountId,
      },
    });

    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "soil_sample.create",
        entityType: "soil_sample",
        entityId: muestra.id,
        after: muestra,
        sourceInterface: "traceability.service",
      },
      tx,
    );
    return muestra;
  });
}

export async function createFoliarSample(userAccountId: string, input: CreateFoliarSampleInput) {
  const sampleCode = exigirCodigo(input.sampleCode);
  await requireLocationAttributeAccess(userAccountId, input.locationId);

  // §7.1: «normalmente el tercero o cuarto contando desde la punta». No se fija
  // el número —el marco dice explícitamente que es un acuerdo con el
  // laboratorio— pero un par cero o negativo no existe.
  if (input.leafPairPosition != null && input.leafPairPosition < 1) {
    throw new SampleValidationError("leaf_pair_position_below_one");
  }
  if (input.treeAgeYears != null && input.treeAgeYears < 0) {
    throw new SampleValidationError("negative_tree_age");
  }

  return prisma.$transaction(async (tx) => {
    const muestra = await tx.foliarSample.create({
      data: {
        locationId: input.locationId,
        sampleCode,
        sampledAt: input.sampledAt,
        provenanceClass: input.provenanceClass,
        treatmentPlotLabel: input.treatmentPlotLabel ?? null,
        leafPairPosition: input.leafPairPosition ?? null,
        canopyPosition: input.canopyPosition ?? null,
        treeAgeYears: input.treeAgeYears ?? null,
        cultivar: input.cultivar ?? null,
        phenologicalStage: input.phenologicalStage ?? null,
        branchBearingFruit: input.branchBearingFruit ?? null,
        laboratory: input.laboratory ?? null,
        notes: input.notes ?? null,
        sourceReference: input.sourceReference ?? null,
        dataQuality: input.dataQuality ?? null,
        clientDraftId: input.clientDraftId ?? null,
        createdBy: userAccountId,
      },
    });

    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "foliar_sample.create",
        entityType: "foliar_sample",
        entityId: muestra.id,
        after: muestra,
        sourceInterface: "traceability.service",
      },
      tx,
    );
    return muestra;
  });
}

/**
 * Las muestras de un bloque, con sus resultados.
 *
 * Se traen TODAS las mediciones, incluidas las corregidas: esconder la original
 * dejaría la ficha diciendo un número sin rastro de que antes decía otro, que
 * es lo contrario de por qué `Measurement` corrige por sucesión.
 */
export async function listSamplesForLocation(userAccountId: string, locationId: string) {
  await requireLocationAttributeAccess(userAccountId, locationId);
  const conMediciones = { measurements: { orderBy: [{ occurredAt: "desc" as const }, { createdAt: "desc" as const }] } };
  const [soil, foliar] = await Promise.all([
    prisma.soilSample.findMany({ where: { locationId }, include: conMediciones, orderBy: { sampledAt: "desc" } }),
    prisma.foliarSample.findMany({ where: { locationId }, include: conMediciones, orderBy: { sampledAt: "desc" } }),
  ]);
  return { soil, foliar };
}

/**
 * ¿Se puede comparar esta muestra foliar con otra?
 *
 * Derivado al leer. §7.1 es tajante: «si el muestreo no está estandarizado, la
 * comparación entre años no significa nada y las diferencias entre tratamientos
 * quedan ahogadas por el ruido». Los cuatro campos que fijan el protocolo son
 * el par de hojas, la posición en el dosel, el estado fenológico y si la rama
 * llevaba fruto.
 *
 * Devuelve qué falta, no un booleano: «incomparable» sin decir por qué obliga a
 * abrir la ficha y adivinar. Un dato foliar sin protocolo no es un dato peor —
 * es incomparable, que es peor que no tenerlo porque parece que sirve.
 */
export function camposDeProtocoloQueFaltan(muestra: {
  leafPairPosition: number | null;
  canopyPosition: CanopyPosition | null;
  phenologicalStage: string | null;
  branchBearingFruit: boolean | null;
}): string[] {
  const faltan: string[] = [];
  if (muestra.leafPairPosition == null) faltan.push("leafPairPosition");
  if (muestra.canopyPosition == null) faltan.push("canopyPosition");
  if (!muestra.phenologicalStage) faltan.push("phenologicalStage");
  if (muestra.branchBearingFruit == null) faltan.push("branchBearingFruit");
  return faltan;
}

export { LocationAccessError };
