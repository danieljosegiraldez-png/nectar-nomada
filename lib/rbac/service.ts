/**
 * SECURITY.md §2 — the single server-side authorization choke point.
 * Every route/action that needs a permission check imports `can` (or
 * `canManageOwnProfile`) from here — nothing queries Assignment/Scope/
 * RoleProfile tables directly outside this file, so the "narrow, never
 * broaden" guarantee in resolve.ts stays enforced in one place.
 */

import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { can as resolveCan, resolvePermissions as resolvePermissionsPure } from "./resolve";
import { permissionKey } from "./types";
import { UUID } from "../validation/uuid";
export { CLASSIFICATION_GATE_DEFERRED, CLASSIFICATION_NOT_APPLICABLE } from "./resolve";
import type { ClassificationLevel, ResolvedAssignment, ScopeTarget, ScopeType } from "./types";

/**
 * El criterio de "asignación activa ahora mismo": `status: "active"` Y dentro
 * de su ventana `[validFrom, validTo)`. Único lugar donde vive, para que otro
 * servicio que necesite el mismo criterio (p. ej. `concesiones.ts`, hallazgo
 * 6 de la revisión independiente del 2026-09-18) lo importe en vez de
 * repetir sólo la mitad — `lib/traceability/concesiones.ts` trataba
 * `status === "active"` como si fuera el criterio completo, así que una
 * asignación ya vencida (`validTo` en el pasado) o todavía no vigente
 * (`validFrom` en el futuro) pasaba igual.
 */
export function activeAssignmentWhere(now: Date = new Date()) {
  return {
    status: "active" as const,
    validFrom: { lte: now },
    OR: [{ validTo: null }, { validTo: { gt: now } }],
  };
}

/** La misma comprobación, sobre una fila ya leída (no una query). */
export function esAsignacionActiva(
  a: { status: string; validFrom: Date; validTo: Date | null },
  now: Date = new Date(),
): boolean {
  return a.status === "active" && a.validFrom <= now && (a.validTo === null || a.validTo > now);
}

async function getResolvedAssignments(userAccountId: string): Promise<ResolvedAssignment[]> {
  const now = new Date();

  const rows = await prisma.assignment.findMany({
    where: {
      userAccountId,
      ...activeAssignmentWhere(now),
    },
    include: {
      scope: true,
      roleProfile: {
        include: { permissions: { include: { permission: true } } },
      },
      overrides: { include: { permission: true } },
    },
  });

  return rows.map((row): ResolvedAssignment => ({
    id: row.id,
    scope: {
      scopeType: row.scope.scopeType as ScopeType,
      scopeRefId: row.scope.scopeRefId,
    },
    permissions: permisosEfectivos(row),
  }));
}

/**
 * Los permisos del perfil, MÁS los añadidos y MENOS los quitados de esta
 * asignación. **Decisión de Daniel, 2026-09-16**: «en admin quitar o agregar
 * permisos como correspondan para personalizar».
 *
 * **Por qué vive aquí y no en `resolve.ts`.** Ese archivo es puro a propósito y su
 * cabecera explica por qué: la contención de ámbitos «fluye sólo hacia abajo», y
 * eso es lo que convierte «las asignaciones estrechan, nunca ensanchan» en una
 * propiedad impuesta en vez de una guía de revisión. Los ajustes son un hecho de
 * la base, así que se resuelven ANTES y el resolutor sigue recibiendo una lista ya
 * hecha. No cambia ni una línea suya.
 *
 * **El `deny` gana siempre**, sobre el perfil y sobre un `grant` de la misma
 * asignación. Es la única regla de precedencia que hay, a propósito: una tabla de
 * prioridades entre concesiones es donde estos sistemas dejan de poder auditarse.
 * Y la contradicción —conceder y quitar lo mismo— no llega a existir: un índice
 * único por asignación y permiso la impide en la base.
 *
 * **Asimetría deliberada:** un `deny` sólo puede estrechar, así que es libre. Un
 * `grant` concede lo que ningún perfil concedió, y por eso su migración le exige
 * razón escrita con un CHECK — no basta con que el servicio lo pida, porque un
 * importador o un SQL directo se saltan el servicio.
 */
function permisosEfectivos(row: {
  roleProfile: { permissions: { permission: { resourceType: string; action: string } }[] };
  overrides: { effect: string; permission: { resourceType: string; action: string } }[];
}): ReadonlyArray<readonly [string, string]> {
  const quitados = new Set(
    row.overrides.filter((o) => o.effect === "deny").map((o) => permissionKey(o.permission.resourceType, o.permission.action)),
  );

  const efectivos = new Map<string, readonly [string, string]>();
  for (const rp of row.roleProfile.permissions) {
    const clave = permissionKey(rp.permission.resourceType, rp.permission.action);
    if (quitados.has(clave)) continue;
    efectivos.set(clave, [rp.permission.resourceType, rp.permission.action] as const);
  }
  for (const o of row.overrides) {
    if (o.effect !== "grant") continue;
    const clave = permissionKey(o.permission.resourceType, o.permission.action);
    // Defensa en profundidad: el índice único ya impide que un permiso esté
    // concedido y quitado a la vez, pero si alguna vez lo estuviera, el `deny`
    // manda — igual que manda sobre el perfil.
    if (quitados.has(clave)) continue;
    efectivos.set(clave, [o.permission.resourceType, o.permission.action] as const);
  }
  return [...efectivos.values()];
}

/**
 * RBAC.md §4 — full chain resolution for one user against one target.
 * Returns `false` for an unauthenticated caller (`userAccountId == null`) —
 * there is no default-allow anywhere in this chain.
 */
export async function can(
  userAccountId: string | null,
  action: string,
  resourceType: string,
  target: ScopeTarget,
  // Required — see resolve.ts's note. Pass CLASSIFICATION_GATE_DEFERRED where
  // the gate is knowingly not applied yet, never a bare "public".
  resourceClassification: ClassificationLevel,
): Promise<boolean> {
  if (!userAccountId) return false;
  const assignments = await getResolvedAssignments(userAccountId);
  for (const objetivo of await conAncestros(target)) {
    if (resolveCan(assignments, action, resourceType, objetivo, resourceClassification)) return true;
  }
  return false;
}

/**
 * Un ámbito de ubicación alcanza a sus DESCENDIENTES. **Decisión de Daniel,
 * 2026-09-16.**
 *
 * **El caso que lo obligó, medido.** El árbol de secado es sitio → instalación →
 * cama. Un operario con ámbito sobre Finca Rosina podía crear el invernadero
 * —cuyo padre es el sitio, que sí está en su ámbito— y **no podía crear las camas
 * de dentro**, porque el guardia comprueba contra el padre directo y el
 * invernadero no estaba en ningún ámbito suyo. Comprobado antes de tocar nada:
 * ámbito en el sitio daba `true` sobre el sitio y `false` sobre su hija.
 *
 * Con el caso real de Cafelino —dos invernaderos y un cuarto oscuro— la
 * alternativa era una asignación a mano por cada instalación construida. Eso no
 * lo hace nadie, así que en la práctica las camas sólo las habría creado un
 * administrador de plataforma.
 *
 * **Por qué esto NO es «ampliar» en el sentido que resolve.ts prohíbe.** La regla
 * de la casa —las asignaciones contextuales estrechan, no ensanchan— habla de no
 * conceder por acumulación lo que ningún ámbito concede. Aquí no se concede nada
 * nuevo: se reconoce que una ubicación **está dentro de** otra. Quien manda en la
 * finca manda en lo que hay dentro de la finca; lo contrario es lo que sorprende.
 * Un HERMANO sigue fuera, y su prueba lo fija.
 *
 * **Por qué vive aquí y no en `resolve.ts`.** La jerarquía es un hecho de la base
 * y `resolve.ts` es puro a propósito. Esto resuelve la cadena y le entrega
 * objetivos concretos; el resolutor no cambia.
 *
 * El tope de profundidad no es decoración: un `parentLocationId` en ciclo
 * —posible, porque nada en el esquema lo impide— colgaría este bucle dentro del
 * punto de estrangulamiento de TODA la autorización.
 */
const PROFUNDIDAD_MAXIMA_DE_UBICACION = 12;

async function conAncestros(target: ScopeTarget): Promise<ScopeTarget[]> {
  if (target.scopeType !== "location" || !target.scopeRefId) return [target];
  // Un id sin forma de UUID no tiene padres que buscar, igual que uno que no existe: se devuelve
  // el objetivo solo, que es lo que el bucle devolvería para una ubicación ausente. Sin esto,
  // `findUnique` daba `P2007` y `can()` reventaba en vez de contestar (PENDING_IMPLEMENTATIONS/026).
  // No concede nada nuevo: `scope.scope_ref_id` es `uuid`, así que ningún ámbito de ubicación
  // puede casar con ese id, y el resolutor decide igual que para un UUID que no existe.
  if (!UUID.test(target.scopeRefId)) return [target];

  const cadena: ScopeTarget[] = [target];
  const vistos = new Set<string>([target.scopeRefId]);
  let actual: string | null = target.scopeRefId;

  for (let i = 0; i < PROFUNDIDAD_MAXIMA_DE_UBICACION && actual; i += 1) {
    const fila: { parentLocationId: string | null } | null = await prisma.location.findUnique({
      where: { id: actual },
      select: { parentLocationId: true },
    });
    const padre: string | null = fila?.parentLocationId ?? null;
    if (!padre || vistos.has(padre)) break;
    vistos.add(padre);
    cadena.push({ scopeType: "location", scopeRefId: padre });
    actual = padre;
  }
  return cadena;
}

/** Every permission key an authenticated user holds against one target — for building UI affordances, not for enforcement (enforcement is always a `can()` call server-side, per SECURITY.md §2). */
export async function resolvedPermissionKeys(userAccountId: string, target: ScopeTarget): Promise<Set<string>> {
  const assignments = await getResolvedAssignments(userAccountId);
  return resolvePermissionsPure(assignments, target);
}

/**
 * Every permission key the user holds under ANY active assignment, whatever
 * its scope.
 *
 * S2 §4 needs this and nothing else does: navigation asks "is there anywhere
 * this person could use this section?", which no single-target resolution can
 * answer — a farm operator's `lot:manage` lives on a project scope and is
 * invisible to a platform-scoped query, yet they plainly should see Lots.
 *
 * **Display only, and never an authorization decision.** It answers "offer
 * this link" and deliberately cannot answer "may they act on this row" —
 * that stays a `can()` call against the specific target, per SECURITY.md §2.
 * The union is strictly wider than any single scope, so using it to authorize
 * would broaden exactly what resolve.ts exists to keep narrow.
 */
export async function permissionKeysAnywhere(userAccountId: string): Promise<Set<string>> {
  const assignments = await getResolvedAssignments(userAccountId);
  const granted = new Set<string>();
  for (const assignment of assignments) {
    for (const [resourceType, action] of assignment.permissions) {
      granted.add(permissionKey(resourceType, action));
    }
  }
  return granted;
}

/**
 * RBAC.md §5 — every authenticated UserAccount can always view/edit their
 * own Person/UserAccount record. This is a baseline, not an Assignment
 * grant, and deliberately bypasses scope resolution — "is this my own
 * record" is a different authorization primitive than "does my Assignment
 * cover this scope."
 */
export function canManageOwnProfile(requestingUserAccountId: string | null, targetUserAccountId: string): boolean {
  return requestingUserAccountId !== null && requestingUserAccountId === targetUserAccountId;
}

export interface CreateAssignmentInput {
  userAccountId: string;
  roleProfileId: string;
  scopeId: string;
  validFrom?: Date;
  validTo?: Date | null;
}

/** RBAC.md §8 — Assignment creation is always audited. */
export async function createAssignment(input: CreateAssignmentInput, actorUserAccountId: string | null) {
  const assignment = await prisma.$transaction(async (tx) => {
    const assignment = await tx.assignment.create({
      data: {
        userAccountId: input.userAccountId,
        roleProfileId: input.roleProfileId,
        scopeId: input.scopeId,
        grantedBy: actorUserAccountId,
        validFrom: input.validFrom ?? new Date(),
        validTo: input.validTo ?? null,
      },
    });

    await recordAuditEvent(
      {
        actorUserAccountId,
        operation: "assignment.create",
        entityType: "assignment",
        entityId: assignment.id,
        after: assignment,
        sourceInterface: "rbac.service",
      },
      tx,
    );

    return assignment;
  });

  return assignment;
}

/** RBAC.md §8 — Assignment revocation is always audited. */
export async function revokeAssignment(assignmentId: string, actorUserAccountId: string | null, reason?: string) {
  const before = await prisma.assignment.findUniqueOrThrow({ where: { id: assignmentId } });

  const after = await prisma.$transaction(async (tx) => {
    const after = await tx.assignment.update({
      where: { id: assignmentId },
      data: { status: "revoked", validTo: new Date() },
    });

    await recordAuditEvent(
      {
        actorUserAccountId,
        operation: "assignment.revoke",
        entityType: "assignment",
        entityId: assignmentId,
        before,
        after,
        reason,
        sourceInterface: "rbac.service",
      },
      tx,
    );

    return after;
  });

  return after;
}
