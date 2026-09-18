/**
 * Plan 3, «El servicio de concesiones» (docs/superpowers/plans/2026-09-18-conceder-editar-beneficio.md).
 *
 * Una **delegación estrecha** sobre `AssignmentPermissionOverride`: quien ya
 * tiene `location:edit_beneficio` SOBRE ESE BENEFICIO puede conceder o quitar
 * ESE MISMO permiso a una asignación cuyo ámbito lo alcanza — nunca otro
 * permiso, y nunca una puerta a `platform:manage_permissions`
 * (`lib/rbac/admin.ts`, que exige ser Platform Admin).
 *
 * Los tres rulings del controlador (Global Constraints del plan, cambiables
 * por Daniel): (1) un `deny` de administración manda, el Farm Manager no lo
 * sobrescribe; (2) quitar sólo borra una concesión (`grant`), nunca el
 * permiso de serie del perfil; (3) la concesión vale para todo el ámbito de
 * la asignación (no hay un alcance más fino que la propia `Scope`).
 */
import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { exigeEditarBeneficioEn } from "./locations";
import type { Prisma } from "../../generated/prisma/client";

export class ConcesionError extends Error {}

export type EstadoDeConcesion = "de_serie" | "concedido" | "quitado_por_administracion" | "sin_permiso";

export type PersonaDelBeneficio = {
  assignmentId: string;
  persona: string;
  perfil: string;
  ambito: string;
  estado: EstadoDeConcesion;
  razon: string | null;
};

type AsignacionConPermisos = Prisma.AssignmentGetPayload<{
  include: {
    scope: true;
    roleProfile: { include: { permissions: { include: { permission: true } } } };
    overrides: { include: { permission: true } };
  };
}>;

const ASIGNACION_CON_PERMISOS = {
  scope: true,
  roleProfile: { include: { permissions: { include: { permission: true } } } },
  overrides: { include: { permission: true } },
} satisfies Prisma.AssignmentInclude;

/** Las tres funciones del servicio empiezan igual: exigir la guardia del
 * servidor sobre el propio beneficio, y comprobar que de verdad es uno —
 * conceder o quitar sobre un sitio o una parcela no tendría sentido, aunque
 * quien concede tenga el permiso ahí (de serie, para un Farm Manager). */
async function exigeBeneficioEditable(actorId: string, beneficioId: string) {
  await exigeEditarBeneficioEn(actorId, beneficioId);
  const location = await prisma.location.findUnique({ where: { id: beneficioId }, select: { locationType: true } });
  if (!location || location.locationType !== "beneficio") throw new ConcesionError("no_es_beneficio");
}

/** La cadena beneficio → padre → abuelo…, con un `Set` de vistos contra un
 * ciclo en la jerarquía (no debería haberlos, pero comprobarlo cuesta un
 * `Set`). Incluye al propio beneficio: una asignación puede estar ahí mismo. */
async function cadenaDeAncestros(locationId: string): Promise<string[]> {
  const cadena: string[] = [locationId];
  const vistos = new Set<string>([locationId]);
  let actual: string | null = locationId;
  while (actual) {
    const fila: { parentLocationId: string | null } | null = await prisma.location.findUnique({
      where: { id: actual },
      select: { parentLocationId: true },
    });
    const padre: string | null = fila?.parentLocationId ?? null;
    if (!padre || vistos.has(padre)) break;
    vistos.add(padre);
    cadena.push(padre);
    actual = padre;
  }
  return cadena;
}

/** Activa, ámbito `location`, y ese ámbito en la cadena de ancestros del
 * beneficio. Cualquier otra cosa (no existe, revocada, ámbito de otro tipo,
 * ámbito de otra rama) es `asignacion_fuera_de_ambito` — el mensaje no
 * distingue el motivo porque para quien concede da igual cuál sea. */
async function asignacionQueAlcanza(beneficioId: string, assignmentId: string): Promise<AsignacionConPermisos> {
  const asignacion = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    include: ASIGNACION_CON_PERMISOS,
  });
  if (!asignacion) throw new ConcesionError("asignacion_fuera_de_ambito");
  if (asignacion.status !== "active") throw new ConcesionError("asignacion_fuera_de_ambito");
  if (asignacion.scope.scopeType !== "location" || !asignacion.scope.scopeRefId) {
    throw new ConcesionError("asignacion_fuera_de_ambito");
  }
  const cadena = await cadenaDeAncestros(beneficioId);
  if (!cadena.includes(asignacion.scope.scopeRefId)) throw new ConcesionError("asignacion_fuera_de_ambito");
  return asignacion;
}

function overrideDeEdicion(asignacion: AsignacionConPermisos, effect: "grant" | "deny") {
  return asignacion.overrides.find(
    (o) => o.effect === effect && o.permission.resourceType === "location" && o.permission.action === "edit_beneficio",
  );
}

function estadoDeAsignacion(asignacion: AsignacionConPermisos): { estado: EstadoDeConcesion; razon: string | null } {
  if (overrideDeEdicion(asignacion, "deny")) return { estado: "quitado_por_administracion", razon: null };
  const grant = overrideDeEdicion(asignacion, "grant");
  if (grant) return { estado: "concedido", razon: grant.reason };
  const deSerie = asignacion.roleProfile.permissions.some(
    (p) => p.permission.resourceType === "location" && p.permission.action === "edit_beneficio",
  );
  if (deSerie) return { estado: "de_serie", razon: null };
  return { estado: "sin_permiso", razon: null };
}

async function permisoEditarBeneficio() {
  return prisma.permission.findFirstOrThrow({ where: { resourceType: "location", action: "edit_beneficio" } });
}

export interface ConcederEditarBeneficioInput {
  beneficioId: string;
  assignmentId: string;
  reason: string;
}

/**
 * Concede. Rechaza sobre un perfil que ya lo tiene de serie
 * (`ya_lo_tiene`) o sobre un `deny` de administración (`quitado_por_administracion`,
 * ruling 1 — no se sobrescribe). Sobre una concesión ya existente, actualiza
 * la razón. `upsert` + `AuditEvent` en la misma transacción.
 */
export async function concederEditarBeneficio(actorId: string, input: ConcederEditarBeneficioInput) {
  await exigeBeneficioEditable(actorId, input.beneficioId);

  const razon = input.reason.trim();
  if (!razon) throw new ConcesionError("razon_obligatoria");

  const asignacion = await asignacionQueAlcanza(input.beneficioId, input.assignmentId);
  const { estado } = estadoDeAsignacion(asignacion);
  if (estado === "de_serie") throw new ConcesionError("ya_lo_tiene");
  if (estado === "quitado_por_administracion") throw new ConcesionError("quitado_por_administracion");

  const permiso = await permisoEditarBeneficio();

  return prisma.$transaction(async (tx) => {
    const fila = await tx.assignmentPermissionOverride.upsert({
      where: { assignmentId_permissionId: { assignmentId: input.assignmentId, permissionId: permiso.id } },
      create: { assignmentId: input.assignmentId, permissionId: permiso.id, effect: "grant", reason: razon, createdBy: actorId },
      update: { effect: "grant", reason: razon, createdBy: actorId },
    });
    await recordAuditEvent(
      {
        actorUserAccountId: actorId,
        operation: "beneficio.conceder_edicion",
        entityType: "assignment_permission_override",
        entityId: fila.id,
        after: fila,
        reason: razon,
        sourceInterface: "traceability.service",
      },
      tx,
    );
    return fila;
  });
}

export interface QuitarEditarBeneficioInput {
  beneficioId: string;
  assignmentId: string;
}

/** Quita. Sólo borra un `grant` de este permiso en esta asignación (ruling 2
 * — nunca toca el permiso de serie del perfil ni un `deny`); si no hay
 * ninguno, `sin_concesion`. */
export async function quitarEditarBeneficio(actorId: string, input: QuitarEditarBeneficioInput) {
  await exigeBeneficioEditable(actorId, input.beneficioId);

  const asignacion = await asignacionQueAlcanza(input.beneficioId, input.assignmentId);
  const grant = overrideDeEdicion(asignacion, "grant");
  if (!grant) throw new ConcesionError("sin_concesion");

  return prisma.$transaction(async (tx) => {
    await tx.assignmentPermissionOverride.delete({ where: { id: grant.id } });
    await recordAuditEvent(
      {
        actorUserAccountId: actorId,
        operation: "beneficio.quitar_edicion",
        entityType: "assignment_permission_override",
        entityId: grant.id,
        before: grant,
        sourceInterface: "traceability.service",
      },
      tx,
    );
    return grant;
  });
}

/**
 * Todas las asignaciones activas cuyo ámbito alcanza el beneficio (la misma
 * cadena de ancestros que `asignacionQueAlcanza` recorre), con su estado. Sólo
 * quien ya tiene `location:edit_beneficio` sobre ese beneficio puede leerla —
 * es la misma guardia que conceder y quitar, no una lectura pública de quién
 * tiene qué.
 */
export async function personasDelBeneficio(actorId: string, beneficioId: string): Promise<PersonaDelBeneficio[]> {
  await exigeBeneficioEditable(actorId, beneficioId);

  const cadena = await cadenaDeAncestros(beneficioId);
  const asignaciones = await prisma.assignment.findMany({
    where: { status: "active", scope: { scopeType: "location", scopeRefId: { in: cadena } } },
    include: { ...ASIGNACION_CON_PERMISOS, userAccount: { include: { person: true } } },
  });

  const locationIds = [...new Set(asignaciones.map((a) => a.scope.scopeRefId).filter((id): id is string => id != null))];
  const lugares = await prisma.location.findMany({ where: { id: { in: locationIds } }, select: { id: true, name: true } });
  const nombreDelLugar = new Map(lugares.map((l) => [l.id, l.name]));

  const filas: PersonaDelBeneficio[] = asignaciones.map((a) => {
    const { estado, razon } = estadoDeAsignacion(a);
    return {
      assignmentId: a.id,
      persona: a.userAccount.person?.displayName ?? "—",
      perfil: a.roleProfile.name,
      ambito: (a.scope.scopeRefId && nombreDelLugar.get(a.scope.scopeRefId)) ?? "—",
      estado,
      razon,
    };
  });

  filas.sort((a, b) => a.persona.localeCompare(b.persona) || a.assignmentId.localeCompare(b.assignmentId));
  return filas;
}
