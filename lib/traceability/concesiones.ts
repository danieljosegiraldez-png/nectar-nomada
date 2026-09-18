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
 * sobrescribe; (2) quitar puede borrar CUALQUIER `grant` de este permiso
 * dentro del ámbito de autoridad del actor — incluso uno que puso la
 * administración —, nunca el permiso de serie del perfil ni un `deny`
 * (corregido el 2026-09-18, revisión independiente de Codex: la versión
 * anterior de esta nota decía «puesto por esta delegación», y no hay columnas
 * de procedencia que distingan quién concedió cada `grant`); (3) la concesión
 * vale para todo el ámbito de la asignación (no hay un alcance más fino que
 * la propia `Scope`).
 *
 * **Además de exigir autoridad sobre el beneficio, cada operación exige
 * autoridad sobre el ÁMBITO DE LA ASIGNACIÓN RECEPTORA** (hallazgo 1,
 * revisión independiente de Codex, 2026-09-18): esa asignación puede tener un
 * ámbito más ancho que el beneficio (p. ej. el sitio entero), y sin esta
 * segunda guardia un Farm Manager con autoridad SÓLO sobre el beneficio podía
 * conceder o quitar sobre una asignación de todo el sitio — más autoridad de
 * la que él mismo tiene.
 *
 * **Ronda 2 de la revisión (2026-09-18), dos correcciones más:**
 * (A) el `catch` de `P2002` DENTRO de la transacción no podía funcionar
 * —Postgres aborta la transacción entera al primer error de restricción, así
 * que la relectura de «quién ganó» corría sobre una transacción ya muerta—, y
 * un conflicto de serialización (`P2034`) no se reintentaba nunca. Ver
 * `reintentarUnaVezAnteConflicto`. (B) `personasDelBeneficio` listaba
 * asignaciones de ámbito ANCESTRO sin comprobar si el actor tiene autoridad
 * sobre ESE ámbito — la pantalla podía ofrecer conceder/quitar sobre una fila
 * que el servidor iba a rechazar por el hallazgo 1. Ver `puedeGestionar`.
 */
import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { exigeEditarBeneficioEn, puedeEditarBeneficioEn } from "./locations";
import { esAsignacionActiva, activeAssignmentWhere } from "../rbac/service";
import { Prisma } from "../../generated/prisma/client";

export class ConcesionError extends Error {}

export type EstadoDeConcesion = "de_serie" | "concedido" | "quitado_por_administracion" | "sin_permiso";

export type PersonaDelBeneficio = {
  assignmentId: string;
  persona: string;
  perfil: string;
  ambito: string;
  estado: EstadoDeConcesion;
  razon: string | null;
  /** Hallazgo B (ronda 2): si el ACTOR que pidió la lista tiene autoridad
   * sobre el ámbito de ESTA asignación — no sobre el beneficio, que ya se
   * comprobó para poder llamar a `personasDelBeneficio` en absoluto. Falso
   * cuando el ámbito es un ancestro más ancho (el sitio) que el actor no
   * gestiona; la pantalla usa esto para no ofrecer un formulario que el
   * servidor va a rechazar. */
  puedeGestionar: boolean;
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

/** Activa —status Y ventana de validez, el mismo criterio que el resolutor
 * (`lib/rbac/service.ts`, hallazgo 6)—, ámbito `location`, y ese ámbito en la
 * cadena de ancestros del beneficio. Cualquier otra cosa (no existe, revocada,
 * vencida, todavía no vigente, ámbito de otro tipo, ámbito de otra rama) es
 * `asignacion_fuera_de_ambito` — el mensaje no distingue el motivo porque para
 * quien concede da igual cuál sea. */
async function asignacionQueAlcanza(beneficioId: string, assignmentId: string): Promise<AsignacionConPermisos> {
  const asignacion = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    include: ASIGNACION_CON_PERMISOS,
  });
  if (!asignacion) throw new ConcesionError("asignacion_fuera_de_ambito");
  if (!esAsignacionActiva(asignacion)) throw new ConcesionError("asignacion_fuera_de_ambito");
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

/**
 * Hallazgo 1: además de tener `edit_beneficio` sobre el beneficio, el actor
 * necesita tenerlo TAMBIÉN sobre el ámbito de la asignación receptora — que
 * puede ser un ancestro más ancho (p. ej. el sitio entero). `exigeEditarBeneficioEn`
 * sube por ancestros (`lib/rbac/service.ts`, `conAncestros`), así que un Farm
 * Manager asignado en el sitio pasa igual sobre una asignación del propio
 * beneficio — pero no al revés: un Farm Manager asignado SÓLO en el beneficio
 * no tiene autoridad sobre una asignación del sitio, porque el beneficio no es
 * ancestro del sitio, es su hijo.
 */
async function exigeAutoridadSobreAmbitoReceptor(actorId: string, asignacion: AsignacionConPermisos) {
  // `asignacionQueAlcanza` ya validó `scope.scopeType === "location" &&
  // scope.scopeRefId != null` antes de devolver esta fila.
  await exigeEditarBeneficioEn(actorId, asignacion.scope.scopeRefId as string);
}

/**
 * Hallazgo 2 (ronda 1) + hallazgo A (ronda 2): la escritura del `grant` es
 * CONDICIONAL, nunca un `upsert` incondicional. Si ya hay una fila, el
 * `UPDATE` exige `effect: "grant"` en su `WHERE` — así que un `deny` puesto
 * entre la lectura de estado y esta escritura no se pisa nunca, porque la
 * condición no casa y el `count` sale 0. Si no hay ninguna fila, el `INSERT`
 * puede chocar con el índice único `(assignmentId, permissionId)` si otra
 * transacción concurrente escribió primero (`P2002`).
 *
 * **Ronda 2: ya NO hay `catch` aquí dentro.** La primera versión atrapaba el
 * `P2002` y releía «quién ganó» en la MISMA transacción — pero Postgres
 * aborta la transacción entera al primer error de restricción; cualquier
 * consulta posterior en esa misma transacción también falla (no hay
 * `SAVEPOINT`), así que esa relectura no podía funcionar nunca. El error se
 * deja subir sin atrapar: `reintentarUnaVezAnteConflicto`, en el llamador,
 * lo atrapa FUERA de la transacción muerta y reintenta la operación entera en
 * una transacción nueva, releyendo el estado desde cero.
 *
 * Ruling 3: re-conceder sobre un `grant` existente actualiza sólo `reason` —
 * `createdBy` no se toca, así que el grantor original queda intacto.
 */
async function escribirGrant(
  tx: Prisma.TransactionClient,
  assignmentId: string,
  permissionId: string,
  actorId: string,
  razon: string,
) {
  const actualizados = await tx.assignmentPermissionOverride.updateMany({
    where: { assignmentId, permissionId, effect: "grant" },
    data: { reason: razon },
  });
  if (actualizados.count > 0) {
    return tx.assignmentPermissionOverride.findUniqueOrThrow({
      where: { assignmentId_permissionId: { assignmentId, permissionId } },
    });
  }
  // Sin `try/catch`: un `P2002` aquí sube tal cual, a través de
  // `prisma.$transaction` (que hace rollback y relanza el mismo error), hasta
  // `reintentarUnaVezAnteConflicto`.
  return tx.assignmentPermissionOverride.create({
    data: { assignmentId, permissionId, effect: "grant", reason: razon, createdBy: actorId },
  });
}

/** `P2002` (choque de índice único) o `P2034` (conflicto de serialización de
 * `isolationLevel: "Serializable"`) — los dos códigos con los que Postgres
 * dice «esta transacción no pudo completarse por otra que corrió al mismo
 * tiempo», nunca «la operación en sí está mal». */
function esConflictoDeConcurrencia(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2002" || error.code === "P2034");
}

/**
 * Hallazgo A (ronda 2, revisión independiente de Codex, 2026-09-18).
 *
 * Reintenta la OPERACIÓN ENTERA —no sólo la escritura— una vez, ante un
 * conflicto de concurrencia. Esto importa: la operación vuelve a LEER el
 * estado desde cero, así que si el primer intento chocó porque llegó un
 * `deny` de administración mientras tanto, el reintento lo VE y responde con
 * el motivo de negocio correcto (`quitado_por_administracion`), no con un
 * error de bajo nivel de Postgres que el usuario no puede interpretar. Si el
 * conflicto era un `grant` idéntico de otro actor, el reintento lo encuentra
 * como fila existente y actualiza la razón.
 *
 * Si el SEGUNDO intento también choca, es un conflicto genuino y sostenido —
 * no uno que una relectura pueda resolver — y se rechaza con
 * `ConcesionError("conflicto_concurrente")` en vez de dejar subir el error
 * crudo de Prisma.
 *
 * Genérica y exportada a propósito: es lo que permite probarla con una
 * operación de mentira, sin base de datos, en vez de fabricar una carrera
 * real contra Postgres (ver el informe final — la carrera real está
 * argumentada, no reproducida de forma determinista).
 */
export async function reintentarUnaVezAnteConflicto<T>(operacion: () => Promise<T>): Promise<T> {
  try {
    return await operacion();
  } catch (primerError) {
    if (!esConflictoDeConcurrencia(primerError)) throw primerError;
    try {
      return await operacion();
    } catch (segundoError) {
      if (!esConflictoDeConcurrencia(segundoError)) throw segundoError;
      throw new ConcesionError("conflicto_concurrente");
    }
  }
}

export interface ConcederEditarBeneficioInput {
  beneficioId: string;
  assignmentId: string;
  reason: string;
}

/**
 * Concede. Rechaza sobre un perfil que ya lo tiene de serie
 * (`ya_lo_tiene`) o sobre un `deny` de administración
 * (`quitado_por_administracion`, ruling 1 — no se sobrescribe). Sobre una
 * concesión ya existente, actualiza la razón sin tocar el `createdBy`
 * original (ruling 3). `AuditEvent` en la misma transacción, con el contexto
 * de autorización (hallazgo 4): el beneficio desde el que se concedió y el
 * ámbito de la asignación receptora.
 *
 * La comprobación de autoridad sobre el beneficio y sobre el ámbito receptor
 * (hallazgo 1) se hace UNA vez, antes del reintento: ninguna de las dos
 * cambia entre intentos (el ámbito de una asignación es fijo). Lo que SÍ se
 * relee en cada intento (hallazgo A, ronda 2) es el ESTADO de la concesión
 * —`asignacionQueAlcanza` de nuevo, con sus `overrides` frescos—, porque eso
 * es justo lo que puede haber cambiado por la carrera que
 * `reintentarUnaVezAnteConflicto` está resolviendo.
 */
export async function concederEditarBeneficio(actorId: string, input: ConcederEditarBeneficioInput) {
  await exigeBeneficioEditable(actorId, input.beneficioId);

  const razon = input.reason.trim();
  if (!razon) throw new ConcesionError("razon_obligatoria");

  const primeraLectura = await asignacionQueAlcanza(input.beneficioId, input.assignmentId);
  await exigeAutoridadSobreAmbitoReceptor(actorId, primeraLectura);

  const permiso = await permisoEditarBeneficio();

  return reintentarUnaVezAnteConflicto(async () => {
    const asignacion = await asignacionQueAlcanza(input.beneficioId, input.assignmentId);
    const { estado } = estadoDeAsignacion(asignacion);
    if (estado === "de_serie") throw new ConcesionError("ya_lo_tiene");
    if (estado === "quitado_por_administracion") throw new ConcesionError("quitado_por_administracion");
    const ambitoLocationId = asignacion.scope.scopeRefId;

    return prisma.$transaction(
      async (tx) => {
        const fila = await escribirGrant(tx, input.assignmentId, permiso.id, actorId, razon);
        await recordAuditEvent(
          {
            actorUserAccountId: actorId,
            operation: "beneficio.conceder_edicion",
            entityType: "assignment_permission_override",
            entityId: fila.id,
            after: { ...fila, contexto: { beneficioId: input.beneficioId, ambitoLocationId } },
            reason: razon,
            sourceInterface: "traceability.service",
          },
          tx,
        );
        return fila;
      },
      { isolationLevel: "Serializable" },
    );
  });
}

export interface QuitarEditarBeneficioInput {
  beneficioId: string;
  assignmentId: string;
}

/**
 * Quita. Puede borrar CUALQUIER `grant` de este permiso en esta asignación
 * (ruling 3 — incluso uno puesto por la administración, nunca el permiso de
 * serie del perfil ni un `deny`); si no hay ninguno, `sin_concesion`. El
 * `DELETE` es condicional (hallazgo 2, `effect: "grant"` en su `WHERE`): si la
 * fila cambió entre la lectura y esta escritura (p. ej. la administración la
 * convirtió en `deny`), el `count` sale 0 y se rechaza en vez de borrar la
 * fila equivocada. Reintenta la operación entera una vez ante un conflicto de
 * concurrencia (hallazgo A, ronda 2), releyendo el estado en cada intento —
 * mismo mecanismo que `concederEditarBeneficio`.
 */
export async function quitarEditarBeneficio(actorId: string, input: QuitarEditarBeneficioInput) {
  await exigeBeneficioEditable(actorId, input.beneficioId);

  const primeraLectura = await asignacionQueAlcanza(input.beneficioId, input.assignmentId);
  await exigeAutoridadSobreAmbitoReceptor(actorId, primeraLectura);

  return reintentarUnaVezAnteConflicto(async () => {
    const asignacion = await asignacionQueAlcanza(input.beneficioId, input.assignmentId);
    const grant = overrideDeEdicion(asignacion, "grant");
    if (!grant) throw new ConcesionError("sin_concesion");
    const ambitoLocationId = asignacion.scope.scopeRefId;

    return prisma.$transaction(
      async (tx) => {
        const borrados = await tx.assignmentPermissionOverride.deleteMany({
          where: { id: grant.id, assignmentId: input.assignmentId, permissionId: grant.permissionId, effect: "grant" },
        });
        if (borrados.count === 0) throw new ConcesionError("sin_concesion");
        await recordAuditEvent(
          {
            actorUserAccountId: actorId,
            operation: "beneficio.quitar_edicion",
            entityType: "assignment_permission_override",
            entityId: grant.id,
            before: { ...grant, contexto: { beneficioId: input.beneficioId, ambitoLocationId } },
            sourceInterface: "traceability.service",
          },
          tx,
        );
        return grant;
      },
      { isolationLevel: "Serializable" },
    );
  });
}

/**
 * Todas las asignaciones activas cuyo ámbito alcanza el beneficio (la misma
 * cadena de ancestros que `asignacionQueAlcanza` recorre), con su estado. Sólo
 * quien ya tiene `location:edit_beneficio` sobre ese beneficio puede leerla —
 * es la misma guardia que conceder y quitar, no una lectura pública de quién
 * tiene qué.
 *
 * **Hallazgo B (ronda 2).** Listar por ámbito ALCANZA más asignaciones de las
 * que el actor puede GESTIONAR: una fila puede tener ámbito en un ancestro
 * más ancho (el sitio) que el actor —con autoridad sólo sobre el beneficio—
 * no gestiona (hallazgo 1). Antes, la pantalla ofrecía conceder/quitar sobre
 * esa fila igual, y `concederEditarBeneficio`/`quitarEditarBeneficio` la
 * rechazaban. `puedeGestionar` es exactamente la misma guardia
 * (`puedeEditarBeneficioEn` sobre `a.scope.scopeRefId`), para que la pantalla
 * no ofrezca lo que el servidor va a rechazar.
 */
export async function personasDelBeneficio(actorId: string, beneficioId: string): Promise<PersonaDelBeneficio[]> {
  await exigeBeneficioEditable(actorId, beneficioId);

  const cadena = await cadenaDeAncestros(beneficioId);
  const asignaciones = await prisma.assignment.findMany({
    where: { ...activeAssignmentWhere(), scope: { scopeType: "location", scopeRefId: { in: cadena } } },
    include: { ...ASIGNACION_CON_PERMISOS, userAccount: { include: { person: true } } },
  });

  const locationIds = [...new Set(asignaciones.map((a) => a.scope.scopeRefId).filter((id): id is string => id != null))];
  const lugares = await prisma.location.findMany({ where: { id: { in: locationIds } }, select: { id: true, name: true } });
  const nombreDelLugar = new Map(lugares.map((l) => [l.id, l.name]));

  const filas: PersonaDelBeneficio[] = await Promise.all(
    asignaciones.map(async (a) => {
      const { estado, razon } = estadoDeAsignacion(a);
      // La consulta ya filtró `scope.scopeType === "location"` y
      // `scopeRefId: { in: cadena }` (una lista de strings), así que
      // `scopeRefId` no puede ser nulo aquí.
      const puedeGestionar = await puedeEditarBeneficioEn(actorId, a.scope.scopeRefId as string);
      return {
        assignmentId: a.id,
        persona: a.userAccount.person?.displayName ?? "—",
        perfil: a.roleProfile.name,
        ambito: (a.scope.scopeRefId && nombreDelLugar.get(a.scope.scopeRefId)) ?? "—",
        estado,
        razon,
        puedeGestionar,
      };
    }),
  );

  filas.sort((a, b) => a.persona.localeCompare(b.persona) || a.assignmentId.localeCompare(b.assignmentId));
  return filas;
}
