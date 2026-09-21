import { Prisma } from "../../generated/prisma/client";
import type { DataQuality, ProvenanceClass, TrapCaptureLevel } from "../../generated/prisma/client";
import { prisma } from "../db";
import { can } from "../rbac/service";
import { recordAuditEvent } from "../audit";
import type { ScopeTarget } from "../rbac/types";
import { diaDeHoy } from "../time/diaDeHoy";
import { resolveFarmSiteId } from "./fincas";

export class TrapAccessError extends Error {}
export class TrapValidationError extends Error {}

/**
 * F2 §4 — misma compuerta que `specimens.ts`: `specimen:manage`, no la de la
 * parcela (`location:manage_attributes`), porque dar de alta una trampa es
 * gestionar un Specimen, no configurar la parcela.
 *
 * **Exportada desde F5 fix-final**: `landMedia.ts` la reutiliza para exigir
 * el mismo permiso al colgar la foto de una revisión — antes esa vía sólo
 * exigía `location:manage_attributes`, y alguien con la parcela pero sin
 * `specimen:manage` podía adjuntar evidencia a una revisión que no podía leer.
 */
export async function requireTrapAccess(userAccountId: string, locationId: string) {
  const location = await prisma.location.findUnique({
    where: { id: locationId },
    select: { classification: true, timezone: true },
  });
  if (!location) throw new TrapAccessError("location_not_found");

  const target: ScopeTarget = { scopeType: "location", scopeRefId: locationId };
  if (!(await can(userAccountId, "manage", "specimen", target, location.classification))) {
    throw new TrapAccessError("no_specimen_access");
  }
  return location;
}

/**
 * F9 fix-final — un campo de DÍA vale por su fecha, no por si su medianoche
 * UTC ya pasó. A las 20:00 en Panamá (UTC−5) son ya las 01:00 UTC del día
 * siguiente: comparar instantes (`.getTime() > Date.now()`) dejaba pasar como
 * "hoy" una fecha que en la finca todavía es mañana.
 *
 * **Sin zona, `"UTC"`, y NO el respaldo propio de `diaDeHoy` (UTC−12).** Ese
 * respaldo es a propósito el día MÁS TEMPRANO que existe en el planeta —
 * correcto para un aviso de vencimiento, que no debe afirmar antes de tiempo—
 * pero aquí la comprobación va al revés: rechazar de más (un `installedAt` de
 * HOY leído como "mañana") es el error caro, no al contrario. Con el respaldo
 * de `diaDeHoy` esto rechazaba `new Date()` mismo cada vez que corría en las
 * primeras ~12 horas del día UTC — lo vio `traps.test.ts`, "sigue la
 * numeración de la finca aunque la parcela sea otra", sin ninguna fecha
 * escrita a mano. `"UTC"` es además la misma zona en la que ya se guardan
 * estos campos de día (medianoche UTC), así que es el respaldo neutral, no
 * uno inventado.
 */
function diaEnElFuturo(dia: Date, timezone: string | null, ahora: Date): boolean {
  return dia.toISOString().slice(0, 10) > diaDeHoy(ahora, timezone ?? "UTC");
}

export interface CreateTrapInput {
  locationId: string;
  plotBlockId?: string | null;
  installedAt: Date;
  notes?: string | null;
  provenanceClass: ProvenanceClass;
  dataQuality?: DataQuality | null;
}

/**
 * F2 §4 — alta de una trampa, una por una. El número lo pone el sistema,
 * correlativo por finca, y el operador lo rotula en la botella.
 *
 * La finca es el SITIO antepasado (`resolveFarmSiteId`, `fincas.ts`), no la
 * organización ni el padre inmediato: los lotes reales de Finca Rosina tienen
 * `organization_id` NULL (medido en la Tarea 2), y una trampa en una
 * microparcela (spec fincas y parcelas §3.3, `createMicrolot`) tiene por
 * padre inmediato la PARCELA, no la finca — `location.parentLocationId ??
 * input.locationId` numeraba esas trampas por parcela en vez de por finca, y
 * las dejaba sin la regla de la finca (`TrapRule` se busca por
 * `farmLocationId`). Ver el docstring de `resolveFarmSiteId`.
 *
 * `createSpecimen` no se reutiliza: necesita el número correlativo y la
 * finca, que esa función no conoce.
 *
 * `ahora` (F9 fix-final) es inyectable, mismo patrón que
 * `recordEnteredProduction` (plantingEvents.ts): sin eso, probar el
 * guardia de futuro contra una zona horaria concreta dependería de en qué
 * hora UTC corra la prueba.
 */
export async function createTrap(userAccountId: string, input: CreateTrapInput, ahora: Date = new Date()) {
  if (Number.isNaN(input.installedAt.getTime())) throw new TrapValidationError("installed_at_invalid");

  const location = await requireTrapAccess(userAccountId, input.locationId);
  // F9 — necesita la zona de la Location, así que va después de leerla.
  if (diaEnElFuturo(input.installedAt, location.timezone, ahora)) {
    throw new TrapValidationError("installed_at_in_future");
  }
  const farmLocationId = await resolveFarmSiteId(input.locationId);

  if (input.plotBlockId) {
    const bloque = await prisma.plotBlock.findUnique({
      where: { id: input.plotBlockId },
      select: { locationId: true },
    });
    if (!bloque || bloque.locationId !== input.locationId) {
      throw new TrapValidationError("block_not_in_plot");
    }
  }

  // Dos altas a la vez chocan contra @@unique([farmLocationId, trapNumber]):
  // se vuelve a leer el máximo y se reintenta. El unique es la verdad, no la
  // lectura que la precede.
  for (let intento = 0; intento < 5; intento++) {
    const ultimo = await prisma.specimen.aggregate({
      where: { farmLocationId, specimenType: "trap" },
      _max: { trapNumber: true },
    });
    const numero = (ultimo._max.trapNumber ?? 0) + 1;
    try {
      return await prisma.$transaction(async (tx) => {
        const trampa = await tx.specimen.create({
          data: {
            locationId: input.locationId,
            specimenType: "trap",
            commonName: `Trampa ${numero}`,
            plotBlockId: input.plotBlockId ?? null,
            farmLocationId,
            trapNumber: numero,
            notes: input.notes ?? null,
            provenanceClass: input.provenanceClass,
            dataQuality: input.dataQuality ?? null,
            createdBy: userAccountId,
          },
        });
        const instalacion = await tx.specimenObservation.create({
          data: {
            specimenId: trampa.id,
            observationType: "installed",
            observedAt: input.installedAt,
            provenanceClass: input.provenanceClass,
            dataQuality: input.dataQuality ?? null,
            createdBy: userAccountId,
          },
        });
        await recordAuditEvent(
          {
            actorUserAccountId: userAccountId,
            operation: "specimen.create_trap",
            entityType: "specimen",
            entityId: trampa.id,
            after: { trampa, instalacion },
            sourceInterface: "traceability.service",
          },
          tx,
        );
        return trampa;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue;
      throw error;
    }
  }
  throw new TrapValidationError("trap_number_race");
}

export interface RecordTrapCheckInput {
  specimenId: string;
  observedAt: Date;
  brocaLevel: TrapCaptureLevel;
  captureCount?: number | null;
  otherInsects?: boolean | null;
  otherInsectsNote?: string | null;
  // F1 fix-final (ADR-080) — tri-estado, como `otherInsects`: `undefined`/`null`
  // es "no se preguntó", nunca "no se hizo".
  cleaned?: boolean | null;
  liquidChanged?: boolean | null;
  lureRecharged?: boolean | null;
  // F3 fix-final (spec §4.6) — quién estuvo en el campo, no necesariamente
  // quien tecleó el formulario (`createdBy`). Mismo patrón que
  // `StartFieldSessionInput.operatorPersonId` (fieldSessions.ts).
  observerPersonId?: string | null;
  notes?: string | null;
  provenanceClass: ProvenanceClass;
  dataQuality?: DataQuality | null;
  // Tarea 11 — la ronda viaja sin señal, y esta es su clave de idempotencia: un
  // reintento con el mismo valor devuelve la fila ya creada en vez de duplicarla.
  // `undefined`/`null`/ausente (el camino con señal de siempre) no la comprueba.
  clientDraftId?: string | null;
}

const NIVELES: readonly TrapCaptureLevel[] = ["ninguno", "pocos", "algunos", "muchos"];

/**
 * F2 §4 — una visita, un registro: lectura + otros insectos + mantenimiento.
 *
 * `ahora` (F9 fix-final) es inyectable — ver el docstring de `createTrap`.
 */
export async function recordTrapCheck(
  userAccountId: string,
  input: RecordTrapCheckInput,
  ahora: Date = new Date(),
) {
  if (!input.brocaLevel || !NIVELES.includes(input.brocaLevel)) {
    throw new TrapValidationError("broca_level_required");
  }
  if (Number.isNaN(input.observedAt.getTime())) throw new TrapValidationError("observed_at_invalid");
  if (input.captureCount != null && (!Number.isInteger(input.captureCount) || input.captureCount < 0)) {
    throw new TrapValidationError("capture_count_invalid");
  }

  const trampa = await prisma.specimen.findUnique({
    where: { id: input.specimenId },
    select: { id: true, locationId: true, specimenType: true, status: true },
  });
  if (!trampa) throw new TrapAccessError("trap_not_found");
  if (trampa.specimenType !== "trap") throw new TrapValidationError("not_a_trap");
  // F4 fix-final — una trampa retirada no se revisa. Antes sólo lo impedía la
  // pantalla (el `<details>` del formulario se oculta si `status !== "active"`);
  // sin este guardia, un POST directo con el `specimenId` de una trampa
  // `removed` pasaba igual — el patrón exacto que CLAUDE.md §56 prohíbe para
  // autorización, aquí aplicado a una regla de negocio.
  if (trampa.status !== "active") throw new TrapValidationError("trap_retired");

  const location = await requireTrapAccess(userAccountId, trampa.locationId);

  // A9 fix-final (M2), ruling del controlador — el lookup por `clientDraftId`
  // va DESPUÉS del control de acceso, y sólo cuenta como duplicado si la fila
  // encontrada es de la MISMA trampa. Antes corría primero, sin comprobar ni
  // acceso ni `specimenId`: un `clientDraftId` colisionado con OTRA trampa se
  // leía como «ya se aplicó, con éxito», y un envío que en realidad nunca se
  // guardó bajo ese id se perdía en silencio.
  if (input.clientDraftId) {
    const yaExiste = await prisma.specimenObservation.findUnique({ where: { clientDraftId: input.clientDraftId } });
    if (yaExiste) {
      if (yaExiste.specimenId !== trampa.id) {
        throw new TrapValidationError("client_draft_id_used_by_other_specimen");
      }
      return yaExiste;
    }
  }

  // F9 — necesita la zona de la Location, así que va después de leerla.
  if (diaEnElFuturo(input.observedAt, location.timezone, ahora)) {
    throw new TrapValidationError("observed_at_in_future");
  }

  // F3 — igual que `startFieldSession` (fieldSessions.ts): un id que no
  // corresponde a ninguna Person no se guarda en silencio como si observara.
  if (input.observerPersonId) {
    const observador = await prisma.person.findUnique({ where: { id: input.observerPersonId } });
    if (!observador) throw new TrapValidationError("observer_not_found");
  }

  return prisma.$transaction(async (tx) => {
    const revision = await tx.specimenObservation.create({
      data: {
        specimenId: trampa.id,
        observationType: "trap_check",
        observedAt: input.observedAt,
        observerPersonId: input.observerPersonId ?? null,
        brocaLevel: input.brocaLevel,
        captureCount: input.captureCount ?? null,
        otherInsects: input.otherInsects ?? null,
        otherInsectsNote: input.otherInsectsNote ?? null,
        cleaned: input.cleaned ?? null,
        liquidChanged: input.liquidChanged ?? null,
        lureRecharged: input.lureRecharged ?? null,
        notes: input.notes ?? null,
        clientDraftId: input.clientDraftId ?? null,
        provenanceClass: input.provenanceClass,
        dataQuality: input.dataQuality ?? null,
        createdBy: userAccountId,
      },
    });
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "specimen_observation.trap_check",
        entityType: "specimen_observation",
        entityId: revision.id,
        after: revision,
        sourceInterface: "traceability.service",
      },
      tx,
    );
    return revision;
  });
}
