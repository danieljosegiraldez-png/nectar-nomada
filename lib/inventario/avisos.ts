/**
 * El aviso del botiquín: vencido o por vencer — botiquín, Tarea 8.
 *
 * Daniel, 2026-09-17: el aviso va «al usuario en el mismo dashboard de un encargado
 * de apiario y/o apicultor vinculado». Lo ve quien tiene `lot:manage` sobre donde
 * ESTÁ el frasco: su custodia vigente, y si no tiene, donde se recibió. El aviso
 * sigue al frasco, no a la factura.
 *
 * Qué avisa, y qué no:
 * - sólo medicamentos veterinarios: un saco de cal con fecha no es del botiquín;
 * - sólo lo que puede quedar: un frasco contado en cero o menos no tiene nada que
 *   hacer; uno NUNCA contado sí avisa, porque nunca contado no es cero (ADR-080);
 * - «por vencer» sólo si el producto declara con cuánto aviso; «vencido», siempre.
 *
 * El día se cuenta en la zona del sitio donde está el frasco (`diaDeHoy`), salvo
 * que quien llama lo fije.
 *
 * Spec: docs/superpowers/specs/2026-09-17-faena-de-colmena-y-botiquin-design.md §B.4
 */
import { prisma } from "../db";
import { can } from "../rbac/service";
import { diaDeHoy } from "../time/diaDeHoy";
import { saldoDeEventos } from "./existencias";
import { estadoDeVencimiento } from "./vencimiento";

export interface AvisoDeBotiquin {
  readonly consumableLotId: string;
  readonly producto: string;
  readonly batchLabel: string;
  readonly estado: "VENCIDO" | "POR_VENCER";
  /** Días que lleva vencido, o que faltan para vencer. */
  readonly dias: number;
  /** Dónde está: su custodia vigente, o donde se recibió. */
  readonly sitio: string | null;
}

export async function avisosDeBotiquin(
  userAccountId: string,
  opciones: { readonly hoy?: string; readonly ahora?: Date } = {},
): Promise<AvisoDeBotiquin[]> {
  const lotes = await prisma.consumableLot.findMany({
    where: { material: { isVeterinaryMedicine: true }, expiresAt: { not: null } },
    select: {
      id: true,
      batchLabel: true,
      expiresAt: true,
      location: { select: { id: true, name: true, timezone: true } },
      material: { select: { name: true, avisarDiasAntes: true } },
      events: { select: { eventType: true, quantity: true, unit: true } },
      custodies: {
        where: { hasta: null },
        select: { location: { select: { id: true, name: true, timezone: true } } },
      },
    },
  });

  const avisos: AvisoDeBotiquin[] = [];
  for (const l of lotes) {
    const donde = l.custodies[0]?.location ?? l.location;
    const hoy = opciones.hoy ?? diaDeHoy(opciones.ahora ?? new Date(), donde?.timezone ?? null);
    const estado = estadoDeVencimiento({ expiresAt: l.expiresAt, avisarDiasAntes: l.material.avisarDiasAntes, hoy });
    if (estado.estado !== "VENCIDO" && estado.estado !== "POR_VENCER") continue;

    const saldo = saldoDeEventos(l.events);
    if (saldo.recorded && saldo.quantity.lessThanOrEqualTo(0)) continue;

    const objetivo = donde
      ? ({ scopeType: "location", scopeRefId: donde.id } as const)
      : ({ scopeType: "platform", scopeRefId: null } as const);
    if (!(await can(userAccountId, "manage", "lot", objetivo, "internal"))) continue;

    avisos.push({
      consumableLotId: l.id,
      producto: l.material.name,
      batchLabel: l.batchLabel,
      estado: estado.estado,
      dias: estado.dias,
      sitio: donde?.name ?? null,
    });
  }

  // Lo vencido primero, y dentro de cada grupo lo más urgente.
  return avisos.sort((a, b) =>
    a.estado !== b.estado ? (a.estado === "VENCIDO" ? -1 : 1) : a.estado === "VENCIDO" ? b.dias - a.dias : a.dias - b.dias,
  );
}
