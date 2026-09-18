/**
 * La custodia de un frasco: dónde está y quién responde — botiquín, Tarea 5.
 *
 * Dos preguntas distintas, y las dos son de Daniel: «¿dónde está el Apivar?» y
 * «¿quién lo tiene?». Es un intervalo: mover a custodia CIERRA la vigente y abre
 * la nueva, en la misma transacción y en el mismo instante — ni hueco (un rato
 * en ninguna parte) ni solape (dos sitios a la vez).
 *
 * Spec: docs/superpowers/specs/2026-09-17-faena-de-colmena-y-botiquin-design.md §B.3
 */
import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { can } from "../rbac/service";

export class CustodiaError extends Error {}

export interface MoverACustodiaInput {
  readonly consumableLotId: string;
  /** Adónde va. Requerido: una custodia sin sitio no contesta nada. */
  readonly locationId: string;
  /** Quién responde. Una PERSONA, no una cuenta; opcional — el sitio basta. */
  readonly responsiblePersonId?: string | null;
  readonly desde: Date;
  readonly notes?: string | null;
}

export async function moverACustodia(userAccountId: string, input: MoverACustodiaInput) {
  if (Number.isNaN(input.desde.getTime())) throw new CustodiaError("fecha inválida");

  // El permiso se juzga en el sitio de DESTINO: es donde el frasco va a estar y
  // donde alguien va a responder por él. `lot:manage`, lo que el operario de
  // campo tiene — llevar un frasco al apiario es faena, no gestión.
  if (!(await can(userAccountId, "manage", "lot", { scopeType: "location", scopeRefId: input.locationId }, "internal"))) {
    throw new CustodiaError("forbidden");
  }

  return prisma.$transaction(async (tx) => {
    const vigente = await tx.consumableCustody.findFirst({
      where: { consumableLotId: input.consumableLotId, hasta: null },
    });

    // Una custodia nueva ANTERIOR a la vigente dejaría dos intervalos que se
    // pisan: si el frasco está en el apiario desde el martes, no pudo pasar a la
    // bodega el lunes. Se rechaza en vez de reordenar la historia en silencio.
    if (vigente && input.desde < vigente.desde) {
      throw new CustodiaError(
        `la nueva custodia empieza antes que la vigente (${vigente.desde.toISOString().slice(0, 10)})`,
      );
    }

    if (vigente) {
      await tx.consumableCustody.update({ where: { id: vigente.id }, data: { hasta: input.desde } });
    }

    const nueva = await tx.consumableCustody.create({
      data: {
        consumableLotId: input.consumableLotId,
        locationId: input.locationId,
        responsiblePersonId: input.responsiblePersonId ?? null,
        desde: input.desde,
        notes: input.notes ?? null,
        createdBy: userAccountId,
      },
    });

    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "consumable_custody.move",
        sourceInterface: "traceability.service",
        entityType: "consumable_custody",
        entityId: nueva.id,
        before: vigente,
        after: nueva,
      },
      tx,
    );

    return nueva;
  });
}

/**
 * La custodia VIGENTE, o nulo. **No** se rellena con la ubicación de
 * recepción: la custodia dice lo que se DECLARÓ, y rellenarla sería inventar un
 * movimiento que nadie registró. Quien necesite un respaldo lo hace a la vista.
 */
export async function custodiaVigente(userAccountId: string, consumableLotId: string) {
  const v = await prisma.consumableCustody.findFirst({ where: { consumableLotId, hasta: null } });
  if (!v) return null;
  if (!(await can(userAccountId, "view", "lot", { scopeType: "location", scopeRefId: v.locationId }, "internal"))) {
    throw new CustodiaError("forbidden");
  }
  return v;
}
