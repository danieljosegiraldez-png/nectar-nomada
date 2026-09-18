/**
 * Los frascos del botiquín que se pueden elegir al registrar un tratamiento —
 * botiquín, Tarea 7.
 *
 * Sólo medicamentos veterinarios, y sólo los que quien mira puede DESCONTAR:
 * `lot:manage` sobre el sitio del frasco, la misma compuerta que
 * `recordColonyEvent` exige para descontar. Quien no la tiene ve el formulario
 * de siempre, sin selector: el tratamiento se registra igual, sin frasco.
 *
 * Primero el que vence antes —lo que se usa primero—, y los sin fecha al final.
 * Lo que hay que ver se lleva el formulario: la carencia del producto para
 * precargarla A LA VISTA, y la fecha para avisar si está vencido.
 */
import { prisma } from "../db";
import { can } from "../rbac/service";

export interface FrascoParaTratar {
  readonly id: string;
  readonly producto: string;
  readonly batchLabel: string;
  /** La del libro del frasco; la del producto si aún no tiene movimientos. */
  readonly unidad: string;
  readonly carenciaDelProducto: number | null;
  /** YYYY-MM-DD, o nulo si el frasco no tiene fecha. */
  readonly vence: string | null;
}

export async function frascosParaTratar(userAccountId: string): Promise<FrascoParaTratar[]> {
  const lotes = await prisma.consumableLot.findMany({
    where: { material: { isVeterinaryMedicine: true } },
    select: {
      id: true,
      batchLabel: true,
      locationId: true,
      expiresAt: true,
      material: { select: { name: true, defaultUnit: true, defaultWithdrawalDays: true } },
      events: { select: { unit: true }, take: 1, orderBy: { occurredAt: "asc" } },
    },
    orderBy: [{ expiresAt: { sort: "asc", nulls: "last" } }, { receivedAt: "asc" }],
  });

  const visibles: FrascoParaTratar[] = [];
  for (const l of lotes) {
    const objetivo = l.locationId
      ? ({ scopeType: "location", scopeRefId: l.locationId } as const)
      : ({ scopeType: "platform", scopeRefId: null } as const);
    if (!(await can(userAccountId, "manage", "lot", objetivo, "internal"))) continue;
    visibles.push({
      id: l.id,
      producto: l.material.name,
      batchLabel: l.batchLabel,
      unidad: l.events[0]?.unit ?? l.material.defaultUnit,
      carenciaDelProducto: l.material.defaultWithdrawalDays,
      vence: l.expiresAt ? l.expiresAt.toISOString().slice(0, 10) : null,
    });
  }
  return visibles;
}
