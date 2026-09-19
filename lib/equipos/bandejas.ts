/**
 * Tipos de bandeja y bandejas numeradas por finca (spec §4.2; Daniel, 2026-09-18).
 * La bandeja es un Equipment de kind vessel con `trayTypeId` y `trayNumber`; su
 * alta es un primer traslado al sitio, como en `registrarEquipo`.
 */
import type { Prisma } from "../../generated/prisma/client";
import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { can } from "../rbac/service";
import { exigeEditarBeneficioEnOrganizacion, lugaresDeOrganizacion, puedeEditarBeneficioEnOrganizacion, resolveOrganizationForLocation } from "../traceability/locations";
import { puedeConfigurarEn } from "./equipos";

export class BandejaConfigError extends Error {}
export const PIE_EN_CM = 30.48;
/** Límite físico del formulario, no un umbral de dominio. El plan de secado suma 321 en dos fases. */
export const MAX_TANDA = 400;

export function numeroDeBandeja(n: number) {
  return `B-${String(n).padStart(3, "0")}`;
}
export function areaM2(tipo: { widthCm: number | Prisma.Decimal; lengthCm: number | Prisma.Decimal }) {
  return (Number(tipo.widthCm) * Number(tipo.lengthCm)) / 10_000;
}
const aCm = (v: number, unidad: "ft" | "cm") => Math.round((unidad === "ft" ? v * PIE_EN_CM : v) * 10) / 10;

export async function crearTipoDeBandeja(userAccountId: string, input: { organizationId: string; nombre: string; ancho: number; largo: number; unidad: "ft" | "cm" }) {
  await exigeEditarBeneficioEnOrganizacion(userAccountId, input.organizationId);
  const nombre = input.nombre.trim();
  const ok = (v: number) => Number.isFinite(v) && v > 0;
  if (!nombre || nombre.length > 60 || !ok(input.ancho) || !ok(input.largo) || !["ft", "cm"].includes(input.unidad)) {
    throw new BandejaConfigError("datos_invalidos");
  }
  if (await prisma.dryingTrayType.findFirst({ where: { organizationId: input.organizationId, name: nombre } })) {
    throw new BandejaConfigError("nombre_repetido");
  }
  return prisma.$transaction(async (tx) => {
    const tipo = await tx.dryingTrayType.create({ data: {
      organizationId: input.organizationId, name: nombre, entryUnit: input.unidad,
      widthCm: aCm(input.ancho, input.unidad), lengthCm: aCm(input.largo, input.unidad), createdBy: userAccountId,
    } });
    await recordAuditEvent({ actorUserAccountId: userAccountId, operation: "drying_tray_type.create", entityType: "drying_tray_type",
      entityId: tipo.id, after: tipo, sourceInterface: "lib/equipos/bandejas.ts" }, tx);
    return { id: tipo.id };
  });
}

/**
 * Leer tipos y capacidades no es configurar: basta con `equipment:view` en ALGÚN
 * lugar de la organización. Un operario de campo tiene que poder ver cuánto cabe
 * en una bandeja antes de cargarla, aunque todavía no haya ninguna registrada.
 */
async function puedeVerEquiposEnOrganizacion(userAccountId: string, organizationId: string) {
  if (await puedeEditarBeneficioEnOrganizacion(userAccountId, organizationId)) return true;
  // Las propias y las descendientes que HEREDAN la organización: la misma bajada
  // que ya hace `exigeEditarBeneficioEnOrganizacion`, extraída a una función
  // (revisión de Codex del plan 2a: sin ella, un operario asignado en un hijo con
  // organizationId nulo no veía nada).
  const lugares = await lugaresDeOrganizacion(organizationId);
  for (const l of lugares) {
    if (await can(userAccountId, "view", "equipment", { scopeType: "location", scopeRefId: l.id }, l.classification)) return true;
  }
  return false;
}

export async function tiposDeBandeja(userAccountId: string, organizationId: string) {
  if (!(await puedeVerEquiposEnOrganizacion(userAccountId, organizationId))) return [];
  const filas = await prisma.dryingTrayType.findMany({ where: { organizationId }, orderBy: { name: "asc" } });
  return filas.map((t) => ({ id: t.id, nombre: t.name, widthCm: Number(t.widthCm), lengthCm: Number(t.lengthCm), entryUnit: t.entryUnit, areaM2: areaM2(t) }));
}

export async function registrarBandejas(userAccountId: string, input: { siteId: string; trayTypeId: string; cantidad: number }) {
  if (!Number.isInteger(input.cantidad) || input.cantidad < 1 || input.cantidad > MAX_TANDA) throw new BandejaConfigError("datos_invalidos");
  if (!(await puedeConfigurarEn(userAccountId, input.siteId))) throw new BandejaConfigError("sin_acceso");
  const sitio = await prisma.location.findUniqueOrThrow({ where: { id: input.siteId } });
  // A4 (revisión final del plan 2a): una bandeja se registra "al sitio" o "en
  // el beneficio" (spec §4.2) — nunca directamente en una posición de estante,
  // que no es un lugar donde algo se REGISTRA sino donde algo cargado se COLOCA.
  if (sitio.locationType !== "site" && sitio.locationType !== "beneficio") throw new BandejaConfigError("datos_invalidos");
  const tipo = await prisma.dryingTrayType.findUniqueOrThrow({ where: { id: input.trayTypeId } });
  // Resuelta subiendo por el árbol: un sitio puede heredar su organización.
  const org = await resolveOrganizationForLocation(sitio.id);
  if (!org || tipo.organizationId !== org) throw new BandejaConfigError("tipo_de_otra_organizacion");

  return prisma.$transaction(async (tx) => {
    // El número se decide con la organización bloqueada: dos tandas a la vez esperan
    // su turno en vez de leer el mismo máximo. El índice único es la red.
    await tx.$queryRaw`SELECT 1 FROM "core"."organization" WHERE "id" = ${org}::uuid FOR UPDATE`;
    const { _max } = await tx.equipment.aggregate({ where: { organizationId: org }, _max: { trayNumber: true } });
    const primero = (_max.trayNumber ?? 0) + 1;
    const numeros: string[] = [];
    const ahora = new Date();
    for (let i = 0; i < input.cantidad; i++) {
      const n = primero + i;
      const e = await tx.equipment.create({ data: {
        name: numeroDeBandeja(n), kind: "vessel", organizationId: org, trayTypeId: tipo.id, trayNumber: n,
        classification: sitio.classification, provenanceClass: "original_record", createdBy: userAccountId,
      } });
      await tx.equipmentTransfer.create({ data: { equipmentId: e.id, fromLocationId: null, toLocationId: sitio.id, occurredAt: ahora, createdBy: userAccountId } });
      await recordAuditEvent({ actorUserAccountId: userAccountId, entityType: "equipment", entityId: e.id, operation: "create",
        sourceInterface: "lib/equipos/bandejas.ts", after: { name: e.name, trayTypeId: tipo.id, trayNumber: n, locationId: sitio.id } }, tx);
      numeros.push(numeroDeBandeja(n));
    }
    return { numeros };
  }, { timeout: 60_000 });
}

/**
 * A3 (revisión final del plan 2a): el ÚNICO traslado resuelto aquí —mismo
 * desempate `[occurredAt desc, createdAt desc]` que usa la pantalla— sirve
 * para autorizar la bandeja Y para nombrar su lugar. Antes, la autorización
 * pasaba por `puedeVerEquipo`, que resuelve el último traslado con una
 * consulta PROPIA y un desempate distinto (sólo `occurredAt desc`): con dos
 * traslados en el mismo instante, autorización y pantalla podían mirar dos
 * filas distintas.
 */
async function objetivoDelTraslado(e: { projectId: string | null }, ultimo: { toLocationId: string } | null) {
  if (ultimo) return { scopeType: "location", scopeRefId: ultimo.toLocationId } as const;
  if (e.projectId) return { scopeType: "project", scopeRefId: e.projectId } as const;
  return { scopeType: "platform", scopeRefId: null } as const;
}

async function bandejasVisibles(userAccountId: string, organizationId: string) {
  const filas = await prisma.equipment.findMany({
    where: { organizationId, trayNumber: { not: null } },
    orderBy: { trayNumber: "asc" },
    include: { trayType: true, transfers: { orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }], take: 1, include: { toLocation: true } } },
  });
  const visibles = [];
  for (const e of filas) {
    const ultimo = e.transfers[0] ?? null;
    const objetivo = await objetivoDelTraslado(e, ultimo);
    if (await can(userAccountId, "view", "equipment", objetivo, e.classification)) visibles.push({ ...e, ultimoTraslado: ultimo });
  }
  return visibles;
}

export async function bandejasDeLaFinca(userAccountId: string, organizationId: string) {
  const filas = await bandejasVisibles(userAccountId, organizationId);
  const resultado = [];
  for (const e of filas) {
    const t = e.ultimoTraslado;
    let donde: string | null = null;
    let dondeOculto = false;
    if (t) {
      // El nombre del lugar lo autoriza EL LUGAR, no el permiso del equipo
      // (hallazgo de Codex: una bandeja `internal` en un lugar `confidential`
      // pasaba la guardia del equipo y publicaba igual el nombre confidencial).
      // Mismo permiso que usan las demás listas de lugares (`manage_attributes`
      // — `location` no tiene una acción `view` propia en el catálogo).
      const puedeVerLugar = await can(userAccountId, "manage_attributes", "location", { scopeType: "location", scopeRefId: t.toLocationId }, t.toLocation.classification);
      if (puedeVerLugar) donde = t.toLocation.name;
      else dondeOculto = true;
    }
    resultado.push({ id: e.id, numero: numeroDeBandeja(e.trayNumber!), tipo: e.trayType!.name, dondeId: t?.toLocationId ?? null, donde, dondeOculto });
  }
  return resultado;
}
