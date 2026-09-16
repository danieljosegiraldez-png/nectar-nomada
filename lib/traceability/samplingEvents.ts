import { prisma } from "../db";
import { can } from "../rbac/service";
import { recordAuditEvent } from "../audit";
import { scopeTargetsFor, TraceabilityAccessError, DEFAULT_NEW_RECORD_CLASSIFICATION } from "./lots";
import type { ClassificationLevel } from "../rbac/types";
import type { MaterialState, SamplingEvent, SamplingRole, SamplingZone } from "../../generated/prisma/client";

export interface CreateSamplingEventInput {
  dryingBedLocationId?: string | null;
  dryingRunId?: string | null;
  occurredAt: Date;
  operatorPersonId?: string | null;
  notes?: string | null;
}

// El mismo permiso de createSampleFromLot, sin inventar un recurso RBAC.
async function requireSamplingAccess(userAccountId: string, context: {
  projectId?: string | null;
  locationId?: string | null;
  classification: ClassificationLevel;
}) {
  for (const target of scopeTargetsFor(context)) {
    if (await can(userAccountId, "manage", "sample", target, context.classification)) return;
  }
  throw new TraceabilityAccessError("no_sample_access");
}

/**
 * Autoriza CADA contexto que el evento va a declarar, no sólo uno.
 *
 * **Existe porque `registrarInspeccion` no lo hacía, y lo encontró una revisión
 * independiente (Codex, 2026-09-16, hallazgo I1).** Esa función resolvía el
 * permiso sobre el lote y después copiaba `dryingBedLocationId` y `dryingRunId`
 * tal cual: un operador con permiso sobre el lote A podía colgar la inspección de
 * una cama o una corrida de B. La clave ajena acepta que existan, y el disparador
 * sólo comprueba que la cama SEA una cama — ninguno de los dos mira de quién es.
 *
 * Se extrae aquí, en vez de repetir las comprobaciones, para que no puedan volver
 * a existir dos versiones que diverjan. Eso es exactamente lo que había pasado.
 */
async function autorizarContextos(
  userAccountId: string,
  input: CreateSamplingEventInput,
  opciones: { exigirAlgunContexto: boolean },
) {
  if (input.dryingRunId != null) {
    // DryingRun no tiene lotId: el origen vive en su transformación, como en drying.ts.
    const transformation = await prisma.lotTransformation.findFirst({
      where: { dryingRunId: input.dryingRunId },
      include: { inputs: { include: { lot: true } } },
      orderBy: { occurredAt: "asc" },
    });
    const lot = transformation?.inputs[0]?.lot;
    if (!lot) throw new TraceabilityAccessError("drying_run_not_found");
    await requireSamplingAccess(userAccountId, lot);
  }
  if (input.dryingBedLocationId != null) {
    const bed = await prisma.location.findUnique({ where: { id: input.dryingBedLocationId } });
    if (!bed) throw new TraceabilityAccessError("location_not_found");
    await requireSamplingAccess(userAccountId, { locationId: bed.id, classification: bed.classification });
  }
  if (opciones.exigirAlgunContexto && input.dryingRunId == null && input.dryingBedLocationId == null) {
    // Sin contexto sólo una asignación de plataforma puede autorizar el acto.
    await requireSamplingAccess(userAccountId, { classification: DEFAULT_NEW_RECORD_CLASSIFICATION });
  }
}

export async function createSamplingEvent(
  userAccountId: string,
  input: CreateSamplingEventInput,
): Promise<SamplingEvent> {
  await autorizarContextos(userAccountId, input, { exigirAlgunContexto: true });

  return prisma.$transaction(async (tx) => {
    const event = await tx.samplingEvent.create({
      data: {
        dryingBedLocationId: input.dryingBedLocationId ?? null,
        dryingRunId: input.dryingRunId ?? null,
        occurredAt: input.occurredAt,
        operatorPersonId: input.operatorPersonId ?? null,
        notes: input.notes ?? null,
        createdBy: userAccountId,
      },
    });
    await recordAuditEvent({
      actorUserAccountId: userAccountId,
      operation: "sampling_event.create",
      entityType: "sampling_event",
      entityId: event.id,
      after: event,
      sourceInterface: "traceability.service",
    }, tx);
    return event;
  });
}

export interface MuestraDeInspeccion {
  materialState: MaterialState;
  samplingRole: SamplingRole;
  samplingZone?: SamplingZone | null;
  samplingZoneNote?: string | null;
}

export interface RegistrarInspeccionInput extends CreateSamplingEventInput {
  lotId: string;
  muestras: readonly MuestraDeInspeccion[];
}

/**
 * Una inspección entera: el acto y las muestras que se sacaron en él, **en una
 * sola transacción**.
 *
 * **Por qué atómica, y no dos llamadas.** Una inspección con su evento guardado y
 * media muestra es peor que ninguna: el motor agrupa por `samplingEventId` para
 * calcular la dispersión entre zonas, así que un evento con una sola de sus dos
 * zonas produce un rango de cero — **una cama perfectamente uniforme que nadie
 * midió**. Un fallo a mitad tiene que no dejar rastro.
 *
 * **Y por eso el código de muestra se compone aquí y no lo trae el formulario.**
 * `Sample.sampleCode` es único por organización; dejar que el operario lo escriba
 * convierte una colisión en un error que no sabe leer, a mitad de la cama.
 */
export async function registrarInspeccion(userAccountId: string, input: RegistrarInspeccionInput) {
  if (input.muestras.length === 0) throw new TraceabilityAccessError("inputs_required");

  const lot = await prisma.lot.findUnique({ where: { id: input.lotId } });
  if (!lot) throw new TraceabilityAccessError("lot_not_found");
  await requireSamplingAccess(userAccountId, lot);
  // Y CADA contexto declarado, por separado. El permiso sobre el lote no autoriza
  // la cama ni la corrida: hallazgo I1 de la revisión independiente.
  await autorizarContextos(userAccountId, input, { exigirAlgunContexto: false });

  return prisma.$transaction(async (tx) => {
    const event = await tx.samplingEvent.create({
      data: {
        dryingBedLocationId: input.dryingBedLocationId ?? null,
        dryingRunId: input.dryingRunId ?? null,
        occurredAt: input.occurredAt,
        operatorPersonId: input.operatorPersonId ?? null,
        notes: input.notes ?? null,
        createdBy: userAccountId,
      },
    });
    await recordAuditEvent({
      actorUserAccountId: userAccountId,
      operation: "sampling_event.create",
      entityType: "sampling_event",
      entityId: event.id,
      after: event,
      sourceInterface: "traceability.service",
    }, tx);

    const muestras: Awaited<ReturnType<typeof tx.sample.create>>[] = [];
    let n = 0;
    for (const m of input.muestras) {
      n += 1;
      const muestra = await tx.sample.create({
        data: {
          sampleCode: `INSP-${event.id.slice(0, 8)}-${n}`,
          // Legado: se deja vacío a propósito. El vocabulario nuevo vive en
          // `sampleKind` y el viejo no se rellena con una traducción inventada.
          sampleType: "",
          sampleKind: "MOISTURE",
          sourceLotId: lot.id,
          projectId: lot.projectId,
          organizationId: lot.organizationId,
          locationId: lot.locationId,
          classification: lot.classification,
          samplingEventId: event.id,
          materialState: m.materialState,
          samplingRole: m.samplingRole,
          samplingZone: m.samplingZone ?? null,
          samplingZoneNote: m.samplingZoneNote ?? null,
          stageAtExtraction: "drying",
          createdBy: userAccountId,
        },
      });
      await recordAuditEvent({
        actorUserAccountId: userAccountId,
        operation: "sample.create",
        entityType: "sample",
        entityId: muestra.id,
        after: muestra,
        sourceInterface: "traceability.service",
      }, tx);
      muestras.push(muestra);
    }

    return { event, muestras };
  });
}
