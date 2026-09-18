/**
 * Los lotes de material que entran, y el libro mayor de sus existencias.
 *
 * **El lote y su evento de entrada nacen juntos**, en la misma transacción: un
 * lote sin evento es un lote que nunca llegó.
 *
 * Spec: docs/superpowers/specs/2026-09-17-inventario-con-existencias-design.md
 */
import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { can } from "../rbac/service";

export class LoteValidationError extends Error {}
export class LoteAccessError extends Error {}

export interface RecibirLoteInput {
  readonly materialId: string;
  readonly batchLabel: string;
  /**
   * **Opcional a propósito: un lote puede llegar sin pesar.** Llega el camión y
   * nadie tiene la báscula a mano — el agua de la receta de biochar del dueño
   * es literalmente «sin calcular». Sin cantidad NO se crea evento de entrada, y
   * el saldo dirá «nunca contado» en vez de cero, que son dos afirmaciones
   * distintas sobre la finca (ADR-080).
   */
  readonly quantity?: number | null;
  readonly unit: string;
  readonly occurredAt?: Date;
  readonly supplier?: string | null;
  /**
   * **Lo del frasco** — botiquín, Tarea 2. Vencimiento nulo = «sin fecha», nunca
   * «vigente». Un frasco ya vencido al recibirlo se acepta: puede ser una compra
   * vieja registrada hoy.
   */
  readonly expiresAt?: Date | null;
  readonly supplierAddress?: string | null;
  readonly invoiceReference?: string | null;
  readonly presentation?: string | null;
  readonly notes?: string | null;
  /** Dónde se juzga el permiso; mismo criterio que `crearMaterial`. */
  readonly projectId?: string | null;
  readonly locationId?: string | null;
}

export async function recibirLote(userAccountId: string, input: RecibirLoteInput) {
  const batchLabel = input.batchLabel.trim();
  const unit = input.unit.trim();

  if (!batchLabel) throw new LoteValidationError("batch_label_required");
  if (!unit) throw new LoteValidationError("unit_required");
  // `new Date("patata")` es un Date para TypeScript y un Invalid Date en
  // ejecución. Guardarlo sería inventar una fecha: se rechaza.
  if (input.expiresAt != null && Number.isNaN(input.expiresAt.getTime())) {
    throw new LoteValidationError("fecha de vencimiento inválida");
  }

  // **Cero es un dato, negativo es un error.** Llegó el camión y el saco venía
  // vacío, o se recibe para dejar constancia y se pesa después: las dos cosas
  // hay que poder escribirlas. Un negativo no significa nada, y además el
  // SENTIDO lo pone el tipo de evento, no el signo — un «consumed» de -5 sumaría
  // existencias por la puerta de atrás. La base lo rechaza igual con su CHECK;
  // aquí sale con una frase legible.
  if (input.quantity != null && (!Number.isFinite(input.quantity) || input.quantity < 0)) {
    throw new LoteValidationError(`cantidad inválida: ${input.quantity}. Cero es válido; negativo no.`);
  }

  // **Recibir es FAENA, no gestión**, así que basta `lot:manage` —que el
  // `Farm Operator` tiene— y no `equipment:manage`. Quien descarga el camión
  // anota lo que entró; si esto exigiera al gerente, el inventario dependería
  // de que esté. Definir qué ES «gallinaza» sí es gestión: ver `crearMaterial`.
  const objetivo = input.locationId
    ? ({ scopeType: "location", scopeRefId: input.locationId } as const)
    : input.projectId
      ? ({ scopeType: "project", scopeRefId: input.projectId } as const)
      : ({ scopeType: "platform", scopeRefId: null } as const);
  if (!(await can(userAccountId, "manage", "lot", objetivo, "internal"))) {
    throw new LoteAccessError("forbidden");
  }

  const occurredAt = input.occurredAt ?? new Date();

  try {
    return await prisma.$transaction(async (tx) => {
      const lote = await tx.consumableLot.create({
        data: {
          materialId: input.materialId,
          batchLabel,
          receivedAt: occurredAt,
          // El ancla de RBAC. Sin ella la lista no sabría a quién enseñar el
          // lote; con `null` cae a plataforma, que es cerrarse, no abrirse.
          locationId: input.locationId ?? null,
          supplier: input.supplier ?? null,
          expiresAt: input.expiresAt ?? null,
          supplierAddress: input.supplierAddress?.trim() || null,
          invoiceReference: input.invoiceReference?.trim() || null,
          presentation: input.presentation?.trim() || null,
          notes: input.notes ?? null,
          createdBy: userAccountId,
        },
      });

      // El evento de entrada, en la MISMA transacción. Si esto fallara, el lote
      // no debe existir.
      //
      // **Sin cantidad no hay evento**, y es deliberado: un lote que llegó sin
      // pesar es un lote cuyo contenido nadie ha contado. Escribir un cero aquí
      // convertiría «no lo sé» en «no hay», que es la afirmación contraria.
      if (input.quantity != null) {
        await tx.consumableStockEvent.create({
          data: {
            consumableLotId: lote.id,
            eventType: "received",
            quantity: input.quantity,
            unit,
            occurredAt,
            provenanceClass: "direct_observation",
            createdBy: userAccountId,
          },
        });
      }

      await recordAuditEvent(
        {
          actorUserAccountId: userAccountId,
          operation: "consumable_lot.receive",
          sourceInterface: "traceability.service",
          entityType: "consumable_lot",
          entityId: lote.id,
          after: lote,
        },
        tx,
      );

      return lote;
    });
  } catch (err) {
    if (typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002") {
      throw new LoteValidationError(`ya_existe: el lote «${batchLabel}» para este material`);
    }
    throw err;
  }
}
