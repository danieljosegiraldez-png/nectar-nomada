import { prisma } from "../db";
import { can } from "../rbac/service";
import { recordAuditEvent } from "../audit";
import { LocationAccessError, exigeEditarBeneficioEn, puedeGestionarAtributosDeUbicacion, requireLocationAttributeAccess } from "./locations";
import { AMBIENTES_DE_SECADO, SecadoFormError } from "./secadoForm";
import type { DryingEnvironment } from "../../generated/prisma/enums";

/** La negativa es un fallo explícito, nunca una lista vacía que aparente ausencia de instalaciones. */
export async function sitiosParaInstalaciones(userAccountId: string) {
  const sitios = await prisma.location.findMany({ where: { locationType: "site" }, orderBy: { name: "asc" } });
  const permitidos = [];
  for (const sitio of sitios) {
    if (await can(userAccountId, "manage_attributes", "location", { scopeType: "location", scopeRefId: sitio.id }, sitio.classification)) {
      permitidos.push({ id: sitio.id, name: sitio.name });
    }
  }
  if (!permitidos.length) throw new LocationAccessError("no_location_attribute_access");
  return permitidos;
}

export async function listarInstalaciones(userAccountId: string) {
  const rows = await prisma.location.findMany({ where: { locationType: "drying_facility" }, orderBy: { name: "asc" } });
  const permitidas = [];
  for (const row of rows) {
    if (await can(userAccountId, "manage_attributes", "location", { scopeType: "location", scopeRefId: row.id }, row.classification)) {
      permitidas.push(await detalleInstalacion(userAccountId, row.id));
    }
  }
  if (!permitidas.length) await sitiosParaInstalaciones(userAccountId);
  return permitidas;
}

export async function detalleInstalacion(userAccountId: string, id: string) {
  await requireLocationAttributeAccess(userAccountId, id);
  const row = await prisma.location.findUniqueOrThrow({ where: { id } });
  if (row.locationType !== "drying_facility") throw new SecadoFormError("tipo_invalido");
  // El permiso de un hijo no concede acceso al nombre de un padre ni a hermanos.
  const parent = row.parentLocationId && await puedeGestionarAtributosDeUbicacion(userAccountId, row.parentLocationId) ? await prisma.location.findUnique({ where: { id: row.parentLocationId } }) : null;
  const beds = await prisma.location.findMany({ where: { parentLocationId: id, locationType: "drying_bed" }, orderBy: [{ rackLevel: "asc" }, { name: "asc" }] });
  const camas = [];
  for (const bed of beds) {
    if (await can(userAccountId, "manage_attributes", "location", { scopeType: "location", scopeRefId: bed.id }, bed.classification)) {
      camas.push({ id: bed.id, name: bed.name, rackLevel: bed.rackLevel });
    }
  }
  return { id: row.id, name: row.name, dryingEnvironment: row.dryingEnvironment, sitio: parent ? { id: parent.id, name: parent.name } : null, camas };
}

type Datos = { name: string; dryingEnvironment?: DryingEnvironment | null; rackLevel?: number | null };
function validar(input: Datos, tipo: "drying_facility" | "drying_bed") {
  if (!input.name.trim() || input.name.trim().length > 120) throw new SecadoFormError("datos_invalidos");
  if (tipo === "drying_facility") {
    if (input.dryingEnvironment != null && !AMBIENTES_DE_SECADO.includes(input.dryingEnvironment)) throw new SecadoFormError("datos_invalidos");
    if (input.rackLevel != null) throw new SecadoFormError("tipo_invalido");
  } else {
    if (input.dryingEnvironment != null) throw new SecadoFormError("tipo_invalido");
    if (input.rackLevel != null && (!Number.isInteger(input.rackLevel) || input.rackLevel < 1 || input.rackLevel > 2147483647)) throw new SecadoFormError("rack_invalido");
  }
}

export async function crearUbicacionDeSecado(userAccountId: string, input: Datos & {
  parentLocationId: string; locationType: "drying_facility" | "drying_bed";
}) {
  await requireLocationAttributeAccess(userAccountId, input.parentLocationId);
  // Configurar el secado es configurar el beneficio (spec #370 §4.3).
  await exigeEditarBeneficioEn(userAccountId, input.parentLocationId);
  const parent = await prisma.location.findUniqueOrThrow({ where: { id: input.parentLocationId } });
  if (!((input.locationType === "drying_facility" && parent.locationType === "site") ||
    (input.locationType === "drying_bed" && parent.locationType === "drying_facility"))) throw new SecadoFormError("tipo_invalido");
  validar(input, input.locationType);
  return prisma.$transaction(async (tx) => {
    const after = await tx.location.create({ data: {
      name: input.name.trim(), locationType: input.locationType, parentLocationId: parent.id,
      organizationId: parent.organizationId, classification: parent.classification, timezone: parent.timezone,
      dryingEnvironment: input.dryingEnvironment ?? null, rackLevel: input.rackLevel ?? null, createdBy: userAccountId,
    } });
    await recordAuditEvent({ actorUserAccountId: userAccountId, operation: "location.create_drying", entityType: "location", entityId: after.id, after, sourceInterface: "traceability.service" }, tx);
    return after;
  });
}

export async function actualizarUbicacionDeSecado(userAccountId: string, input: Datos & { locationId: string }) {
  await requireLocationAttributeAccess(userAccountId, input.locationId);
  await exigeEditarBeneficioEn(userAccountId, input.locationId);
  const before = await prisma.location.findUniqueOrThrow({ where: { id: input.locationId } });
  if (before.locationType !== "drying_facility" && before.locationType !== "drying_bed") throw new SecadoFormError("tipo_invalido");
  validar(input, before.locationType);
  return prisma.$transaction(async (tx) => {
    const after = await tx.location.update({ where: { id: before.id }, data: {
      name: input.name.trim(), dryingEnvironment: input.dryingEnvironment ?? null, rackLevel: input.rackLevel ?? null,
    } });
    await recordAuditEvent({ actorUserAccountId: userAccountId, operation: "location.update_drying", entityType: "location", entityId: after.id, before, after, sourceInterface: "traceability.service" }, tx);
    return after;
  });
}
