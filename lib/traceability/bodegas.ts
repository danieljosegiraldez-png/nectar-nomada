/**
 * La bodega (spec 2026-09-19 §4.1). Archivo propio y no `instalaciones.ts`, que
 * la rama `secado-2a` está reescribiendo: el choque queda en cero líneas.
 *
 * Crearla es configurar el beneficio: `location:edit_beneficio` sobre el padre,
 * igual que una instalación de secado. El padre lo comprueba también la base
 * (disparador `location_bodega_padre`).
 */
import { can } from "../rbac/service";
import { recordAuditEvent } from "../audit";
import { prisma } from "../db";
import { exigeEditarBeneficioEn, requireLocationAttributeAccess } from "./locations";

export { ordenarParaAlmacenar } from "./ordenarParaAlmacenar";

export class BodegaError extends Error {}

const PADRES = ["site", "beneficio"] as const;

/**
 * `can()` directo, no `puedeEditarBeneficioEn` — misma comprobación
 * (`edit_beneficio` sobre el candidato, que `can()` resuelve subiendo por sus
 * ancestros), pero el envoltorio sólo llama a `exigeEditarBeneficioEn` dentro
 * de un try/catch: su cuerpo no invoca `can` de forma literal, así que
 * `scripts/inventario-de-acceso.mjs` no lo reconoce como guardia y esta
 * función quedaba «sin guardia visible» pese a estar autorizada.
 */
export async function padresParaBodega(userAccountId: string) {
  const candidatos = await prisma.location.findMany({
    where: { locationType: { in: [...PADRES] } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, locationType: true, classification: true },
  });
  const salida: { id: string; name: string; tipo: "site" | "beneficio" }[] = [];
  for (const c of candidatos) {
    if (await can(userAccountId, "edit_beneficio", "location", { scopeType: "location", scopeRefId: c.id }, c.classification)) {
      salida.push({ id: c.id, name: c.name, tipo: c.locationType as "site" | "beneficio" });
    }
  }
  return salida;
}

/**
 * `exigeEditarBeneficioEn` PRIMERO, antes de leer el padre — no al revés.
 *
 * Hallazgo de la revisión de la Ronda 1: leer el padre antes de comprobar el
 * permiso dejaba distinguir, desde fuera, «este id no existe» (`BodegaError`)
 * de «existe, pero no tienes permiso» (`LocationAccessError`) — un oráculo de
 * existencia entre organizaciones para cualquier llamador, tenga o no
 * `edit_beneficio` en algún lado. `exigeEditarBeneficioEn` ya funde las dos
 * negativas en `LocationAccessError` (`location_not_found` y
 * `no_beneficio_edit_access`, ambas del mismo tipo), así que comprobar el
 * permiso antes de mirar el padre no revela nada. Mismo orden que
 * `exigePoderCrearBajo` en beneficios.ts y `crearUbicacionDeSecado`.
 */
export async function crearBodega(userAccountId: string, input: { parentLocationId: string; name: string }) {
  const nombre = input.name.trim();
  if (!nombre || nombre.length > 120) throw new BodegaError("datos_invalidos");
  await exigeEditarBeneficioEn(userAccountId, input.parentLocationId);
  const padre = await prisma.location.findUniqueOrThrow({ where: { id: input.parentLocationId } });
  if (!(PADRES as readonly string[]).includes(padre.locationType)) throw new BodegaError("padre_invalido");
  return prisma.$transaction(async (tx) => {
    const hermanas = await tx.location.findMany({ where: { parentLocationId: padre.id }, select: { name: true } });
    const clave = (s: string) => s.trim().toLowerCase();
    if (hermanas.some((h) => clave(h.name) === clave(nombre))) throw new BodegaError("nombre_repetido");
    const after = await tx.location.create({
      data: {
        name: nombre,
        locationType: "storage_facility",
        parentLocationId: padre.id,
        organizationId: padre.organizationId,
        classification: padre.classification,
        timezone: padre.timezone,
        createdBy: userAccountId,
      },
    });
    await recordAuditEvent(
      { actorUserAccountId: userAccountId, operation: "location.create_storage", entityType: "location", entityId: after.id, after, sourceInterface: "traceability.service" },
      tx,
    );
    return { id: after.id };
  });
}

async function padreVisible(userAccountId: string, parentLocationId: string | null) {
  if (!parentLocationId) return null;
  const p = await prisma.location.findUnique({ where: { id: parentLocationId }, select: { id: true, name: true, classification: true } });
  if (!p) return null;
  const ok = await can(userAccountId, "manage_attributes", "location", { scopeType: "location", scopeRefId: p.id }, p.classification);
  return ok ? { id: p.id, name: p.name } : null;
}

export async function listarBodegas(userAccountId: string) {
  const filas = await prisma.location.findMany({ where: { locationType: "storage_facility" }, orderBy: { name: "asc" } });
  const salida = [];
  for (const b of filas) {
    if (await can(userAccountId, "manage_attributes", "location", { scopeType: "location", scopeRefId: b.id }, b.classification)) {
      salida.push({ id: b.id, name: b.name, padre: await padreVisible(userAccountId, b.parentLocationId) });
    }
  }
  return salida;
}

export async function detalleBodega(userAccountId: string, id: string) {
  await requireLocationAttributeAccess(userAccountId, id);
  const b = await prisma.location.findUniqueOrThrow({ where: { id } });
  if (b.locationType !== "storage_facility") throw new BodegaError("no_es_bodega");
  return { id: b.id, name: b.name, timezone: b.timezone, padre: await padreVisible(userAccountId, b.parentLocationId) };
}
