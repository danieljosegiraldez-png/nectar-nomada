/**
 * Estantes de una instalación de secado y sus posiciones (spec §4.1, Daniel
 * 2026-09-18): «Cuarto oscuro I · Estante 2 · Nivel 4 · Puesto 3». Al crear un
 * estante se dan niveles × puestos y las posiciones se crean solas; ampliar crea
 * las que faltan; NUNCA se borra ni se reduce: una bandeja que estuvo en una
 * posición tiene que poder seguir diciendo dónde estuvo.
 */
import type { ClassificationLevel, Prisma } from "../../generated/prisma/client";
import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { exigeEditarBeneficioEn, resolveOrganizationForLocation } from "./locations";

export class EstanteError extends Error {}
/** Límites físicos del formulario —evitan crear un millón de filas por un error de tecleo—, no umbrales de dominio. */
export const MAX_NIVELES = 20;
export const MAX_PUESTOS = 50;

export function nombreDePosicion(nivel: number, puesto: number) {
  return `N${nivel} · P${puesto}`;
}

function validar(niveles: number, puestos: number) {
  const ok = (n: number, max: number) => Number.isInteger(n) && n >= 1 && n <= max;
  if (!ok(niveles, MAX_NIVELES) || !ok(puestos, MAX_PUESTOS)) throw new EstanteError("datos_invalidos");
}

async function crearPosiciones(
  tx: Prisma.TransactionClient,
  rack: { id: string; organizationId: string | null; classification: ClassificationLevel; timezone: string | null },
  niveles: number, puestos: number, userAccountId: string,
) {
  const existentes = await tx.location.findMany({ where: { parentLocationId: rack.id }, select: { rackLevel: true, rackSlot: true } });
  const hay = new Set(existentes.map((e) => `${e.rackLevel}:${e.rackSlot}`));
  const nuevas = [];
  for (let n = 1; n <= niveles; n++) for (let p = 1; p <= puestos; p++) {
    if (!hay.has(`${n}:${p}`)) nuevas.push({
      name: nombreDePosicion(n, p), locationType: "drying_bed" as const, parentLocationId: rack.id,
      organizationId: rack.organizationId, classification: rack.classification, timezone: rack.timezone,
      rackLevel: n, rackSlot: p, createdBy: userAccountId,
    });
  }
  if (nuevas.length) await tx.location.createMany({ data: nuevas });
  return nuevas.length;
}

export async function crearEstante(userAccountId: string, input: { facilityId: string; nombre: string; niveles: number; puestos: number }) {
  await exigeEditarBeneficioEn(userAccountId, input.facilityId);
  const nombre = input.nombre.trim();
  if (!nombre || nombre.length > 120) throw new EstanteError("datos_invalidos");
  validar(input.niveles, input.puestos);
  const cuarto = await prisma.location.findUniqueOrThrow({ where: { id: input.facilityId } });
  if (cuarto.locationType !== "drying_facility") throw new EstanteError("tipo_invalido");
  // La organización se RESUELVE subiendo por el árbol, no se copia de la columna:
  // una instalación puede heredarla (organizationId nulo). Si se copiara el nulo,
  // cada posición saldría «de otra organización» al compararla con la bandeja
  // (revisión de Codex del plan 2a).
  const organizationId = await resolveOrganizationForLocation(cuarto.id);
  return prisma.$transaction(async (tx) => {
    const rack = await tx.location.create({ data: {
      name: nombre, locationType: "drying_rack", parentLocationId: cuarto.id,
      organizationId, classification: cuarto.classification, timezone: cuarto.timezone, createdBy: userAccountId,
    } });
    const creadas = await crearPosiciones(tx, rack, input.niveles, input.puestos, userAccountId);
    await recordAuditEvent({ actorUserAccountId: userAccountId, operation: "location.create_drying_rack", entityType: "location",
      entityId: rack.id, after: { ...rack, niveles: input.niveles, puestos: input.puestos, posicionesCreadas: creadas }, sourceInterface: "traceability.service" }, tx);
    return { id: rack.id, creadas };
  });
}

export async function ampliarEstante(userAccountId: string, input: { rackId: string; niveles: number; puestos: number }) {
  await exigeEditarBeneficioEn(userAccountId, input.rackId);
  validar(input.niveles, input.puestos);
  const rack = await prisma.location.findUniqueOrThrow({ where: { id: input.rackId } });
  if (rack.locationType !== "drying_rack") throw new EstanteError("tipo_invalido");
  const actual = await prisma.location.aggregate({ where: { parentLocationId: rack.id }, _max: { rackLevel: true, rackSlot: true } });
  if (input.niveles < (actual._max.rackLevel ?? 0) || input.puestos < (actual._max.rackSlot ?? 0)) throw new EstanteError("estante_no_se_reduce");
  return prisma.$transaction(async (tx) => {
    const creadas = await crearPosiciones(tx, rack, input.niveles, input.puestos, userAccountId);
    await recordAuditEvent({ actorUserAccountId: userAccountId, operation: "location.expand_drying_rack", entityType: "location",
      entityId: rack.id, after: { niveles: input.niveles, puestos: input.puestos, posicionesCreadas: creadas }, sourceInterface: "traceability.service" }, tx);
    return { creadas };
  });
}
