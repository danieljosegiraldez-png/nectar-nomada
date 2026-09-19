/**
 * Qué lugar admite rutinas, a dónde vuelve su pantalla y quién puede qué
 * (spec 2026-09-19 §4.2). Gestión = `location:edit_beneficio` en el lugar;
 * faena = `equipment:report_condition` en el lugar —el mismo permiso con que ya
 * se apunta la rutina de un equipo—; ver = `location:manage_attributes`.
 */
import type { ClassificationLevel, LocationType } from "../../generated/prisma/client";
import { prisma } from "../db";
import { can } from "../rbac/service";
import { RutinaError } from "./error";

export type LugarConRutina = {
  id: string;
  locationType: LocationType;
  parentLocationId: string | null;
  organizationId: string | null;
  classification: ClassificationLevel;
  timezone: string | null;
  createdAt: Date;
};

const CON_RUTINA = new Set<LocationType>(["beneficio", "drying_facility", "storage_facility", "drying_bed"]);

export async function lugarParaRutina(locationId: string): Promise<LugarConRutina> {
  const l = await prisma.location.findUnique({
    where: { id: locationId },
    select: { id: true, locationType: true, parentLocationId: true, organizationId: true, classification: true, timezone: true, createdAt: true },
  });
  if (!l) throw new RutinaError("lugar_no_encontrado");
  if (!CON_RUTINA.has(l.locationType)) throw new RutinaError("lugar_sin_rutinas");
  if (l.locationType === "drying_bed" && l.parentLocationId) {
    const padre = await prisma.location.findUnique({ where: { id: l.parentLocationId }, select: { locationType: true } });
    // Parte 2: cuando exista `drying_rack`, una posición dentro de un estante
    // comparte la rutina del estante. Hoy toda cama cuelga de una instalación.
    if (padre && padre.locationType !== "drying_facility") throw new RutinaError("rutina_en_el_estante");
  }
  return l;
}

export function rutaDeLugar(l: { id: string; locationType: LocationType; parentLocationId: string | null }): string {
  switch (l.locationType) {
    case "storage_facility":
      return `/bodegas/${l.id}`;
    case "drying_facility":
      return `/instalaciones/${l.id}`;
    case "drying_bed":
      return `/instalaciones/${l.parentLocationId}`;
    case "beneficio":
      return "/beneficio";
    default:
      return "/instalaciones";
  }
}

export async function puedeSobreLugar(userAccountId: string, locationId: string, accion: "view" | "manage" | "report_condition"): Promise<boolean> {
  const l = await prisma.location.findUnique({ where: { id: locationId }, select: { classification: true } });
  if (!l) return false;
  const objetivo = { scopeType: "location", scopeRefId: locationId } as const;
  if (accion === "manage") return can(userAccountId, "edit_beneficio", "location", objetivo, l.classification);
  if (accion === "report_condition") return can(userAccountId, "report_condition", "equipment", objetivo, l.classification);
  return can(userAccountId, "manage_attributes", "location", objetivo, l.classification);
}

/** Los lotes de insumo de la organización del lugar, para las filas de producto. */
export async function insumosDeLugar(userAccountId: string, locationId: string) {
  if (!(await puedeSobreLugar(userAccountId, locationId, "report_condition"))) return [];
  const l = await prisma.location.findUnique({ where: { id: locationId }, select: { organizationId: true } });
  if (!l?.organizationId) return [];
  const lotes = await prisma.consumableLot.findMany({
    where: { material: { organizationId: l.organizationId } },
    orderBy: [{ material: { name: "asc" } }, { receivedAt: "desc" }],
    select: { id: true, batchLabel: true, material: { select: { name: true } } },
  });
  return lotes.map((x) => ({ id: x.id, etiqueta: `${x.material.name} · ${x.batchLabel}`, materialName: x.material.name, batchLabel: x.batchLabel }));
}

/** Los equipos cuyo ÚLTIMO traslado va a este lugar (spec §4.4). */
export async function equiposAqui(userAccountId: string, locationId: string) {
  if (!(await puedeSobreLugar(userAccountId, locationId, "view"))) return [];
  const candidatos = await prisma.equipment.findMany({
    where: { transfers: { some: { toLocationId: locationId } } },
    select: { id: true, name: true, transfers: { orderBy: { occurredAt: "desc" }, take: 1, select: { toLocationId: true } } },
    orderBy: { name: "asc" },
  });
  return candidatos.filter((e) => e.transfers[0]?.toLocationId === locationId).map((e) => ({ id: e.id, name: e.name }));
}
