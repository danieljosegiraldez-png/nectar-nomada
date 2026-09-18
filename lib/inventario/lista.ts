/**
 * La lista del inventario, filtrada por quien mira.
 *
 * Filtra CADA LOTE por su propio ámbito —su ubicación—, igual que la pantalla
 * de equipos filtra cada equipo. Un lote sin ubicación cae al ámbito de
 * plataforma: lo desconocido se cierra en vez de abrirse.
 *
 * Y ordena por lo que hay que ATENDER, no por fecha: lo negativo primero, lo
 * nunca contado después. Una lista ordenada por fecha esconde el descuadre en la
 * página tres.
 */
import { prisma } from "../db";
import { can } from "../rbac/service";
import { saldoDeEventos } from "./existencias";
import { estadoDeVencimiento, type EstadoDeVencimiento } from "./vencimiento";
import { diaDeHoy } from "../time/diaDeHoy";

export interface LoteEnLista {
  readonly id: string;
  readonly batchLabel: string;
  readonly receivedAt: Date;
  readonly quantity: number;
  readonly unit: string | null;
  readonly recorded: boolean;
  readonly requiereReconciliacion: boolean;
  /** Botiquín, Tarea 9: el vencimiento, contado en el día del sitio donde está. */
  readonly vencimiento: EstadoDeVencimiento;
  /** Dónde está y quién responde: su custodia vigente. Nulo si nunca se movió. */
  readonly custodia: { readonly sitio: string; readonly responsable: string | null } | null;
}

export interface MaterialEnLista {
  readonly id: string;
  readonly name: string;
  readonly defaultUnit: string;
  readonly lotes: LoteEnLista[];
}

/** Menor = más arriba. Lo que hay que atender primero. */
function urgencia(l: LoteEnLista): number {
  if (l.requiereReconciliacion) return 0;
  if (!l.recorded) return 1;
  return 2;
}

export async function listarInventario(userAccountId: string): Promise<MaterialEnLista[]> {
  const lotes = await prisma.consumableLot.findMany({
    select: {
      id: true,
      batchLabel: true,
      receivedAt: true,
      locationId: true,
      expiresAt: true,
      location: { select: { timezone: true } },
      material: { select: { id: true, name: true, defaultUnit: true, avisarDiasAntes: true } },
      events: { select: { eventType: true, quantity: true, unit: true } },
      custodies: {
        where: { hasta: null },
        select: {
          location: { select: { name: true, timezone: true } },
          responsiblePerson: { select: { displayName: true } },
        },
      },
    },
  });

  const porMaterial = new Map<string, { id: string; name: string; defaultUnit: string; lotes: LoteEnLista[] }>();

  for (const lote of lotes) {
    const objetivo = lote.locationId
      ? ({ scopeType: "location", scopeRefId: lote.locationId } as const)
      : ({ scopeType: "platform", scopeRefId: null } as const);
    if (!(await can(userAccountId, "view", "lot", objetivo, "internal"))) continue;

    const saldo = saldoDeEventos(lote.events);
    const { avisarDiasAntes, ...material } = lote.material;
    const entrada = porMaterial.get(material.id) ?? { ...material, lotes: [] };
    const vigente = lote.custodies[0] ?? null;
    const zona = vigente?.location.timezone ?? lote.location?.timezone ?? null;
    entrada.lotes.push({
      id: lote.id,
      batchLabel: lote.batchLabel,
      receivedAt: lote.receivedAt,
      quantity: saldo.quantity.toNumber(),
      unit: saldo.unit,
      recorded: saldo.recorded,
      requiereReconciliacion: saldo.requiereReconciliacion,
      vencimiento: estadoDeVencimiento({ expiresAt: lote.expiresAt, avisarDiasAntes, hoy: diaDeHoy(new Date(), zona) }),
      custodia: vigente
        ? { sitio: vigente.location.name, responsable: vigente.responsiblePerson?.displayName ?? null }
        : null,
    });
    porMaterial.set(lote.material.id, entrada);
  }

  return [...porMaterial.values()]
    .map((m) => ({ ...m, lotes: [...m.lotes].sort((a, b) => urgencia(a) - urgencia(b)) }))
    .sort((a, b) => Math.min(...a.lotes.map(urgencia)) - Math.min(...b.lotes.map(urgencia)));
}
