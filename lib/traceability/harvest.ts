/**
 * Phase 1, ticket T4 (docs/implementation/PHASE_1_TECHNICAL_EXECUTION_PLAN.md
 * §13, §34). First-mile capture — a Lot only ever comes into existence
 * through a HarvestEvent, a ReceivingEvent, or a LotTransformation output
 * (§30), never created standalone. Both functions here create their Lot
 * (lotType "cherry") and their event row atomically.
 *
 * When cherryWeightKg is given, a matching QuantityEvent ("received") is
 * created in the same transaction so §9's invariant — a lot's current
 * quantity is always SUM(QuantityEvent) — holds from the lot's very first
 * moment, not just from its first transformation onward. Skipped when
 * weight isn't recorded, matching CLAUDE.md §3's "missing must remain
 * missing" discipline rather than fabricating a zero-quantity event.
 */
import { prisma } from "../db";
import { requireLotAccess, DEFAULT_NEW_RECORD_CLASSIFICATION } from "./lots";
import { recordAuditEvent } from "../audit";
import type { ProvenanceClass } from "../../generated/prisma/client";

export class CerezaError extends Error {}

/**
 * Los tres catálogos de los que puede venir cada eje de la cereza.
 *
 * **Sin esto, un id de catálogo cualquiera entra donde no debe**: nada impediría
 * guardar «flotadores» en la columna de color, y la columna dejaría de
 * significar lo que su nombre dice. Es el mismo guardia que `lotProcess` pone
 * sobre el grado de proceso y el estado de la cereza, con el mismo idioma.
 *
 * **Vive en TypeScript y no en la base**, igual que allí, y se dice en vez de
 * llamarlo estructural: un importador o un SQL directo se lo salta. Lo que la
 * base sí garantiza es que el id exista y sea un valor de catálogo.
 */
const CATALOGO_DE_CEREZA = {
  cherryColorValueId: "cereza_color",
  cherryDefectsValueId: "cereza_defectos",
  cherryCleanlinessValueId: "cereza_limpieza",
} as const;

/** Comprueba que cada valor dado venga del catálogo que le toca. */
async function exigeCatalogosDeCereza(input: {
  cherryColorValueId?: string | null;
  cherryDefectsValueId?: string | null;
  cherryCleanlinessValueId?: string | null;
}): Promise<void> {
  for (const [campo, clave] of Object.entries(CATALOGO_DE_CEREZA) as [keyof typeof CATALOGO_DE_CEREZA, string][]) {
    const id = input[campo];
    if (!id) continue; // opcional: ausencia es «no se registró», no un error
    const valor = await prisma.variableCatalogValue.findUnique({ where: { id }, include: { catalog: true } });
    if (!valor) throw new CerezaError(`${campo}_not_found`);
    if (valor.catalog.key !== clave) throw new CerezaError(`${campo}_wrong_catalog`);
  }
}

export interface RecordHarvestEventInput {
  lotCode: string;
  locationId: string; // the plot
  organizationId: string; // the farm
  projectId?: string | null;
  harvestedAt: Date;
  cultivarNotes?: string | null;
  cherryWeightKg?: number | null;
  brix?: number | null;
  temperatureC?: number | null;
  /** Prosa heredada. Ya no se pide en pantalla; ver el esquema. */
  condition?: string | null;
  /**
   * La cereza como dato (Daniel, 2026-09-11). Tres valores de catálogo cerrado
   * —`cereza_color`, `cereza_defectos`, `cereza_limpieza`— que el vocabulario
   * ya tenía escritos y que no leía nadie. Opcionales: ausencia significa «no
   * se registró», nunca «sano y limpio».
   */
  cherryColorValueId?: string | null;
  cherryDefectsValueId?: string | null;
  cherryCleanlinessValueId?: string | null;
  operatorPersonId?: string | null;
  notes?: string | null;
  // T9.5: required, no fallback. app/actions/traceability.ts passes
  // "measured_fact" here — a harvest weight/brix/temperature reading is an
  // instrument value read off a scale/refractometer/thermometer at
  // receiving, per T9.5 §3(b)'s own worked example.
  provenanceClass: ProvenanceClass;
  sourceReference?: string | null;
}

export async function recordHarvestEvent(userAccountId: string, input: RecordHarvestEventInput) {
  await requireLotAccess(userAccountId, "manage", [{ projectId: input.projectId, locationId: input.locationId, classification: DEFAULT_NEW_RECORD_CLASSIFICATION }]);
  // Spec fincas y parcelas §3.4: la cereza se cosecha en una parcela o en una microparcela (las
  // dos son `plot`). Hasta el 2026-09-18 lo único que lo limitaba era la lista del formulario, así
  // que un guion o una petición directa podía cosechar sobre la finca entera o sobre un beneficio.
  const donde = await prisma.location.findUnique({ where: { id: input.locationId }, select: { locationType: true } });
  if (donde?.locationType !== "plot") throw new CerezaError("la_cosecha_va_sobre_una_parcela");
  await exigeCatalogosDeCereza(input);

  const provenanceClass = input.provenanceClass;

  const result = await prisma.$transaction(async (tx) => {
    const lot = await tx.lot.create({
      data: {
        lotCode: input.lotCode,
        lotType: "cherry",
        organizationId: input.organizationId,
        projectId: input.projectId ?? null,
        locationId: input.locationId,
        createdBy: userAccountId,
      },
    });

    const harvestEvent = await tx.harvestEvent.create({
      data: {
        locationId: input.locationId,
        organizationId: input.organizationId,
        projectId: input.projectId ?? null,
        harvestedAt: input.harvestedAt,
        cultivarNotes: input.cultivarNotes ?? null,
        cherryWeightKg: input.cherryWeightKg ?? null,
        brix: input.brix ?? null,
        temperatureC: input.temperatureC ?? null,
        condition: input.condition ?? null,
        cherryColorValueId: input.cherryColorValueId ?? null,
        cherryDefectsValueId: input.cherryDefectsValueId ?? null,
        cherryCleanlinessValueId: input.cherryCleanlinessValueId ?? null,
        operatorPersonId: input.operatorPersonId ?? null,
        notes: input.notes ?? null,
        resultingLotId: lot.id,
        createdBy: userAccountId,
        provenanceClass,
        sourceReference: input.sourceReference ?? null,
      },
    });

    if (input.cherryWeightKg != null) {
      await tx.quantityEvent.create({
        data: {
          lotId: lot.id,
          eventType: "received",
          quantity: input.cherryWeightKg,
          unit: "kg",
          occurredAt: input.harvestedAt,
          createdBy: userAccountId,
          provenanceClass,
          sourceReference: input.sourceReference ?? null,
        },
      });
    }

    // C1 §3: evidentiary write (carries provenanceClass).
    //
    // Dentro de la transacción y con `tx` desde el 2026-09-06. Iba fuera «same
    // reasoning as recordTransformation», y ese razonamiento decía que un audit
    // dentro de una transacción revertida tergiversaría lo ocurrido — falso: si
    // revierte, el audit revierte con ella. El fallo real es el contrario y lo
    // documenta `lib/audit.ts`.
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "harvest_event.create",
        entityType: "harvest_event",
        entityId: harvestEvent.id,
        after: harvestEvent,
        sourceInterface: "traceability.service",
      },
      tx,
    );

    return { harvestEvent, lot };
  });

  return result;
}

export interface RecordReceivingEventInput {
  lotCode: string;
  organizationId: string; // the supplier
  locationId?: string | null; // where received, if known
  projectId?: string | null;
  receivedAt: Date;
  deliveryNote?: string | null;
  cultivarNotes?: string | null;
  cherryWeightKg?: number | null;
  brix?: number | null;
  temperatureC?: number | null;
  condition?: string | null;
  operatorPersonId?: string | null;
  notes?: string | null;
  // T9.5: required — same reasoning as RecordHarvestEventInput above.
  provenanceClass: ProvenanceClass;
  sourceReference?: string | null;
}

export async function recordReceivingEvent(userAccountId: string, input: RecordReceivingEventInput) {
  await requireLotAccess(userAccountId, "manage", [{ projectId: input.projectId, locationId: input.locationId, classification: DEFAULT_NEW_RECORD_CLASSIFICATION }]);

  const provenanceClass = input.provenanceClass;

  const result = await prisma.$transaction(async (tx) => {
    const lot = await tx.lot.create({
      data: {
        lotCode: input.lotCode,
        lotType: "cherry",
        organizationId: input.organizationId,
        projectId: input.projectId ?? null,
        locationId: input.locationId ?? null,
        createdBy: userAccountId,
      },
    });

    const receivingEvent = await tx.receivingEvent.create({
      data: {
        organizationId: input.organizationId,
        locationId: input.locationId ?? null,
        projectId: input.projectId ?? null,
        receivedAt: input.receivedAt,
        deliveryNote: input.deliveryNote ?? null,
        cultivarNotes: input.cultivarNotes ?? null,
        cherryWeightKg: input.cherryWeightKg ?? null,
        brix: input.brix ?? null,
        temperatureC: input.temperatureC ?? null,
        condition: input.condition ?? null,
        operatorPersonId: input.operatorPersonId ?? null,
        notes: input.notes ?? null,
        resultingLotId: lot.id,
        createdBy: userAccountId,
        provenanceClass,
        sourceReference: input.sourceReference ?? null,
      },
    });

    if (input.cherryWeightKg != null) {
      await tx.quantityEvent.create({
        data: {
          lotId: lot.id,
          eventType: "received",
          quantity: input.cherryWeightKg,
          unit: "kg",
          occurredAt: input.receivedAt,
          createdBy: userAccountId,
          provenanceClass,
          sourceReference: input.sourceReference ?? null,
        },
      });
    }

    // C1 §3: evidentiary write (carries provenanceClass). Dentro de la
    // transacción y con `tx`; ver el mismo cambio arriba.
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "receiving_event.create",
        entityType: "receiving_event",
        entityId: receivingEvent.id,
        after: receivingEvent,
        sourceInterface: "traceability.service",
      },
      tx,
    );

    return { receivingEvent, lot };
  });

  return result;
}

/**
 * Los tres catálogos que la pantalla de cosecha ofrece, con sus valores.
 *
 * **Vocabulario, no datos de nadie**: son las listas de `research.variable_catalog`
 * que describen la cereza, las mismas que el guardia de arriba exige. Por eso no
 * lleva principal — igual que `getSelectionCatalogs`, que tampoco lo lleva.
 *
 * `aliasOfId: null` porque un alias es el mismo valor escrito de otra forma y
 * ofrecer los dos en un desplegable invita a que dos cosechas iguales se
 * registren distinto.
 */
export async function catalogosDeCereza() {
  const [color, defectos, limpieza] = await Promise.all(
    (["cereza_color", "cereza_defectos", "cereza_limpieza"] as const).map((key) =>
      prisma.variableCatalogValue.findMany({
        where: { catalog: { key }, aliasOfId: null },
        select: { id: true, value: true },
        orderBy: { displayOrder: "asc" },
      }),
    ),
  );
  return { color: color ?? [], defectos: defectos ?? [], limpieza: limpieza ?? [] };
}
