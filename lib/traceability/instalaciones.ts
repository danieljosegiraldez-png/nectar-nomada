import { prisma } from "../db";
import { can } from "../rbac/service";
import { recordAuditEvent } from "../audit";
import { LocationAccessError, exigeEditarBeneficioEn, puedeEditarBeneficioEn, puedeGestionarAtributosDeUbicacion, requireLocationAttributeAccess } from "./locations";
import { AMBIENTES_DE_SECADO, GRADOS_DE_SOMBRA, SecadoFormError } from "./secadoForm";
import type { DryingEnvironment, ShadePercentageBracket } from "../../generated/prisma/enums";

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

/**
 * Los sitios donde crear una instalación de secado, para `/instalaciones/nueva`
 * (Task 3, plan 3). `manage_attributes` (`sitiosParaInstalaciones`) sólo deja
 * ver y administrar atributos genéricos; crear una instalación es configurar
 * el beneficio, así que además hace falta `location:edit_beneficio` sobre ese
 * mismo sitio. Lista vacía si ninguno pasa el segundo filtro — no lanza, para
 * que la pantalla la distinga de «no hay ningún sitio administrable», que sí
 * sigue siendo la negativa explícita de `sitiosParaInstalaciones`.
 */
export async function sitiosParaCrearInstalacion(userAccountId: string) {
  const sitios = await sitiosParaInstalaciones(userAccountId);
  const permitidos = [];
  for (const sitio of sitios) {
    if (await puedeEditarBeneficioEn(userAccountId, sitio.id)) permitidos.push(sitio);
  }
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
  // `camas` es sólo lo que cuelga DIRECTAMENTE de la instalación: las
  // posiciones de un estante cuelgan del estante, no de aquí, así que este
  // filtro por `parentLocationId: id` ya las deja fuera solas.
  const beds = await prisma.location.findMany({ where: { parentLocationId: id, locationType: "drying_bed" }, orderBy: [{ rackLevel: "asc" }, { name: "asc" }] });
  const camas = [];
  for (const bed of beds) {
    if (await can(userAccountId, "manage_attributes", "location", { scopeType: "location", scopeRefId: bed.id }, bed.classification)) {
      camas.push({ id: bed.id, name: bed.name, rackLevel: bed.rackLevel, shadePercentage: bed.shadePercentage, shadeDescription: bed.shadeDescription });
    }
  }
  const racks = await prisma.location.findMany({ where: { parentLocationId: id, locationType: "drying_rack" }, orderBy: { name: "asc" } });
  const estantes = [];
  for (const r of racks) {
    // Cada estante y cada posición pasan SU PROPIO permiso, como ya hacen las
    // camas unas líneas arriba: una clasificación más estrecha en un hijo no se
    // salta porque el padre sea visible (revisión de Codex del plan 2a).
    if (!(await can(userAccountId, "manage_attributes", "location", { scopeType: "location", scopeRefId: r.id }, r.classification))) continue;
    const todas = await prisma.location.findMany({
      where: { parentLocationId: r.id }, orderBy: [{ rackLevel: "asc" }, { rackSlot: "asc" }],
      select: { id: true, name: true, rackLevel: true, rackSlot: true, classification: true, shadePercentage: true, shadeDescription: true },
    });
    const posiciones = [];
    for (const p of todas) {
      if (await can(userAccountId, "manage_attributes", "location", { scopeType: "location", scopeRefId: p.id }, p.classification)) posiciones.push(p);
    }
    estantes.push({
      id: r.id, name: r.name,
      // Del estante entero, no sólo de lo visible: ampliar tiene que saber su tamaño real.
      niveles: Math.max(0, ...todas.map((p) => p.rackLevel ?? 0)),
      puestos: Math.max(0, ...todas.map((p) => p.rackSlot ?? 0)),
      shadePercentage: r.shadePercentage, shadeDescription: r.shadeDescription,
      posiciones: posiciones.map((p) => ({
        id: p.id, name: p.name, nivel: p.rackLevel!, puesto: p.rackSlot!,
        shadePercentage: p.shadePercentage, shadeDescription: p.shadeDescription,
      })),
    });
  }
  return { id: row.id, name: row.name, dryingEnvironment: row.dryingEnvironment, shadePercentage: row.shadePercentage, shadeDescription: row.shadeDescription, sitio: parent ? { id: parent.id, name: parent.name } : null, camas, estantes };
}

/** La instalación de una cama o posición: sube hasta el primer `drying_facility`. */
export async function instalacionDe(locationId: string): Promise<string> {
  let actual = await prisma.location.findUniqueOrThrow({ where: { id: locationId }, select: { id: true, locationType: true, parentLocationId: true } });
  // El `4` es el alto máximo del árbol (posición → estante → instalación →
  // sitio): no es un umbral de dominio, impide un bucle infinito si alguna vez
  // hubiera un ciclo.
  for (let i = 0; i < 4 && actual.locationType !== "drying_facility"; i++) {
    if (!actual.parentLocationId) break;
    actual = await prisma.location.findUniqueOrThrow({ where: { id: actual.parentLocationId }, select: { id: true, locationType: true, parentLocationId: true } });
  }
  if (actual.locationType !== "drying_facility") throw new SecadoFormError("tipo_invalido");
  return actual.id;
}

type Datos = { name: string; dryingEnvironment?: DryingEnvironment | null; rackLevel?: number | null; shadePercentage?: ShadePercentageBracket | null; shadeDescription?: string | null };
function validar(input: Datos, tipo: "drying_facility" | "drying_bed") {
  if (!input.name.trim() || input.name.trim().length > 120) throw new SecadoFormError("datos_invalidos");
  if (input.shadePercentage != null && !GRADOS_DE_SOMBRA.includes(input.shadePercentage)) throw new SecadoFormError("sombra_invalida");
  if (input.shadeDescription != null && input.shadeDescription.trim().length > 300) throw new SecadoFormError("sombra_invalida");
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
      shadePercentage: input.shadePercentage ?? null, shadeDescription: input.shadeDescription?.trim() || null,
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
  // Una posición de estante (spec §4.1) conserva su nivel y su puesto: el
  // formulario de sombra no los toca, pase lo que pase en el POST. `rackSlot`
  // ni siquiera entra en el `data` de abajo, así que Prisma no lo escribe;
  // `rackLevel` sí, y por eso hay que fijarlo al de ANTES en vez de al que
  // venga del formulario.
  const rackLevel = before.rackSlot != null ? before.rackLevel : (input.rackLevel ?? null);
  return prisma.$transaction(async (tx) => {
    const after = await tx.location.update({ where: { id: before.id }, data: {
      name: input.name.trim(), dryingEnvironment: input.dryingEnvironment ?? null, rackLevel,
      shadePercentage: input.shadePercentage ?? null, shadeDescription: input.shadeDescription?.trim() || null,
    } });
    await recordAuditEvent({ actorUserAccountId: userAccountId, operation: "location.update_drying", entityType: "location", entityId: after.id, before, after, sourceInterface: "traceability.service" }, tx);
    return after;
  });
}
