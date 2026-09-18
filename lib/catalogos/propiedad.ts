/**
 * Quién ve y quién edita un catálogo de referencia (spec §2.5). UNA función para
 * todas las clases, como `un-solo-predicado-de-sitio` para los sitios.
 *
 * `ScopeType` no tiene `organization`, así que la pertenencia de una entrada
 * propia se juzga en un SITIO de esa organización — el precedente exacto de
 * `crearMaterial` y `registrarEquipo`. La organización se DERIVA del sitio; no se
 * acepta del formulario.
 */
import { prisma } from "../db";
import { can } from "../rbac/service";

export class CatalogoError extends Error {}

export type Dueno = { tipo: "compartido" } | { tipo: "propio"; locationId: string };

export interface PermisoDeCatalogo {
  resourceType: string;
  action: string;
}

const PLATAFORMA = { scopeType: "platform", scopeRefId: null } as const;

/** Crear: devuelve la organización dueña (`null` = compartida) o lanza. */
export async function requireCatalogoAccess(
  userAccountId: string,
  dueno: Dueno,
  permiso: PermisoDeCatalogo,
): Promise<string | null> {
  if (dueno.tipo === "compartido") {
    if (!(await can(userAccountId, permiso.action, permiso.resourceType, PLATAFORMA, "internal"))) {
      throw new CatalogoError("forbidden");
    }
    return null;
  }
  const sitio = await prisma.location.findUnique({ where: { id: dueno.locationId }, select: { organizationId: true } });
  if (!sitio?.organizationId) throw new CatalogoError("sitio_sin_organizacion");
  const objetivo = { scopeType: "location", scopeRefId: dueno.locationId } as const;
  if (!(await can(userAccountId, permiso.action, permiso.resourceType, objetivo, "internal"))) {
    throw new CatalogoError("forbidden");
  }
  return sitio.organizationId;
}

/** Editar o retirar una entrada que ya existe. */
export async function requireEntradaDeCatalogoAccess(
  userAccountId: string,
  entrada: { organizationId: string | null },
  permiso: PermisoDeCatalogo,
): Promise<void> {
  if (entrada.organizationId === null) {
    if (!(await can(userAccountId, permiso.action, permiso.resourceType, PLATAFORMA, "internal"))) {
      throw new CatalogoError("forbidden");
    }
    return;
  }
  const sitios = await prisma.location.findMany({ where: { organizationId: entrada.organizationId }, select: { id: true } });
  for (const s of sitios) {
    if (await can(userAccountId, permiso.action, permiso.resourceType, { scopeType: "location", scopeRefId: s.id }, "internal")) return;
  }
  throw new CatalogoError("forbidden");
}

/** Las organizaciones con al menos un sitio donde el usuario tiene el permiso. */
export async function organizacionesVisibles(userAccountId: string, permiso: PermisoDeCatalogo): Promise<string[]> {
  const sitios = await prisma.location.findMany({
    where: { organizationId: { not: null } },
    select: { id: true, organizationId: true },
  });
  const orgs = new Set<string>();
  for (const s of sitios) {
    if (orgs.has(s.organizationId!)) continue;
    if (await can(userAccountId, permiso.action, permiso.resourceType, { scopeType: "location", scopeRefId: s.id }, "internal")) {
      orgs.add(s.organizationId!);
    }
  }
  return [...orgs];
}

/** Lo compartido, más lo de estas organizaciones. */
export function filtroVisible(organizaciones: readonly string[]) {
  return { OR: [{ organizationId: null }, { organizationId: { in: [...organizaciones] } }] as [
    { organizationId: null },
    { organizationId: { in: string[] } },
  ] };
}
