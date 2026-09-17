import { prisma } from "../db";
import { can } from "../rbac/service";
import { recordAuditEvent } from "../audit";
import { LocationAccessError, puedeGestionarAtributosDeUbicacion, requireLocationAttributeAccess } from "./locations";

export class BeneficioError extends Error {}

/**
 * Crear un lugar nuevo no es editar uno existente, así que exige los DOS
 * permisos sobre el sitio padre: `manage_attributes` —que ya gobierna el árbol
 * de ubicaciones— y `location:create_site`, que es el que el capataz no tiene.
 *
 * Se comprueba sobre el PADRE a propósito, pero cada línea rechaza algo
 * distinto — medido con flip-test el 2026-09-17, no supuesto: `create_site`,
 * resuelto contra el ámbito del `Assignment` del actor, es lo que rechaza al
 * capataz y al Farm Manager de OTRA finca; `requireLocationAttributeAccess`
 * es lo que rechaza un `parentLocationId` que no existe (en vez de dejar que
 * `findUniqueOrThrow` lo convierta en un error de Prisma sin traducir) y lo
 * que aplica la compuerta de clasificación del padre.
 */
async function exigePoderCrearBajo(userAccountId: string, parentLocationId: string) {
  await requireLocationAttributeAccess(userAccountId, parentLocationId);
  const padre = await prisma.location.findUniqueOrThrow({
    where: { id: parentLocationId },
    select: { id: true, name: true, locationType: true, organizationId: true, classification: true, timezone: true },
  });
  const target = { scopeType: "location" as const, scopeRefId: padre.id };
  if (!(await can(userAccountId, "create_site", "location", target, padre.classification))) {
    throw new LocationAccessError("no_location_create_access");
  }
  return padre;
}

function exigeNombre(name: string) {
  const limpio = name.trim();
  if (!limpio || limpio.length > 120) throw new BeneficioError("datos_invalidos");
  return limpio;
}

/** Los sitios donde quien mira puede crear un beneficio. La negativa es un fallo explícito, no una lista vacía. */
export async function sitiosParaBeneficio(userAccountId: string) {
  const sitios = await prisma.location.findMany({ where: { locationType: "site" }, orderBy: { name: "asc" } });
  const permitidos: { id: string; name: string }[] = [];
  for (const s of sitios) {
    const target = { scopeType: "location" as const, scopeRefId: s.id };
    if (await can(userAccountId, "manage_attributes", "location", target, s.classification)
      && await can(userAccountId, "create_site", "location", target, s.classification)) {
      permitidos.push({ id: s.id, name: s.name });
    }
  }
  if (!permitidos.length) throw new LocationAccessError("no_location_attribute_access");
  return permitidos;
}

export async function listarBeneficios(userAccountId: string) {
  const rows = await prisma.location.findMany({ where: { locationType: "beneficio" }, orderBy: { name: "asc" } });
  const salida: { id: string; name: string; sitio: { id: string; name: string } | null }[] = [];
  for (const row of rows) {
    const target = { scopeType: "location" as const, scopeRefId: row.id };
    if (!(await can(userAccountId, "manage_attributes", "location", target, row.classification))) continue;
    // El permiso sobre el hijo no concede el nombre del padre — misma regla y el
    // mismo ayudante que `detalleInstalacion`, que resuelve la clasificación DEL
    // PADRE en vez de reusar la del hijo (reusarla juzgaría con la etiqueta
    // equivocada en cuanto las dos difieran).
    const padre = row.parentLocationId
      && await puedeGestionarAtributosDeUbicacion(userAccountId, row.parentLocationId)
      ? await prisma.location.findUnique({ where: { id: row.parentLocationId }, select: { id: true, name: true } })
      : null;
    salida.push({ id: row.id, name: row.name, sitio: padre });
  }
  return salida;
}

export async function crearBeneficio(userAccountId: string, input: { name: string; parentLocationId: string }) {
  const padre = await exigePoderCrearBajo(userAccountId, input.parentLocationId);
  if (padre.locationType !== "site") throw new BeneficioError("padre_invalido");
  const name = exigeNombre(input.name);
  return prisma.$transaction(async (tx) => {
    const after = await tx.location.create({ data: {
      name, locationType: "beneficio", parentLocationId: padre.id,
      organizationId: padre.organizationId, classification: padre.classification,
      timezone: padre.timezone, createdBy: userAccountId,
    } });
    await recordAuditEvent({
      actorUserAccountId: userAccountId, operation: "location.create_beneficio",
      entityType: "location", entityId: after.id, after, sourceInterface: "traceability.service",
    }, tx);
    return after;
  });
}

export async function actualizarBeneficio(userAccountId: string, input: { locationId: string; name: string }) {
  await requireLocationAttributeAccess(userAccountId, input.locationId);
  const before = await prisma.location.findUniqueOrThrow({ where: { id: input.locationId } });
  if (before.locationType !== "beneficio") throw new BeneficioError("tipo_invalido");
  const name = exigeNombre(input.name);
  return prisma.$transaction(async (tx) => {
    const after = await tx.location.update({ where: { id: before.id }, data: { name } });
    await recordAuditEvent({
      actorUserAccountId: userAccountId, operation: "location.update_beneficio",
      entityType: "location", entityId: after.id, before, after, sourceInterface: "traceability.service",
    }, tx);
    return after;
  });
}
