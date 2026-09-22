import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import type { CanalDeAviso } from "../integrations/messaging/types";
import { can } from "../rbac/service";
import { CLASSIFICATION_NOT_APPLICABLE } from "../rbac/resolve";
import { lugaresDeOrganizacion, resolveOrganizationForLocation } from "../traceability/locations";

/**
 * A9.11 (D10a) — la preferencia de canal por persona.
 *
 * **Es el contrato, no la integración.** Aquí no se envía nada: no hay
 * proveedor, y D10 deja los cuatro adaptadores fuera de alcance. Lo que hay es
 * quién quiere qué, y —la parte que la medición obligó a añadir— **si eso se le
 * puede entregar**.
 *
 * ## Querer un canal no es poder recibirlo
 *
 * Medido el 2026-09-08 contra la copia de producción:
 *
 * | | |
 * |---|---|
 * | personas | 19 |
 * | con correo | 3 |
 * | **con teléfono** | **0** |
 * | con cuenta, o sea que ven la app | 16 |
 *
 * Con esos números, un lector que devolviera «prefiere WhatsApp» a secas sería
 * una mentira el primer día: no hay un solo teléfono en la base. Por eso
 * `canalesDe` devuelve cada canal con `entregable` y, cuando no lo es, **por
 * qué**. La diferencia entre «no quiere» y «no se puede» es justo la que hace
 * accionable el hueco.
 *
 * Y explica por qué `in_app` es la prioridad declarada de `CLAUDE.md` §34: hoy
 * es el único canal que alcanza a casi todos.
 *
 * ## Lo que este módulo NO decide
 *
 * A qué dirección concreta se manda. Eso ya vive en `Person.email` y
 * `Person.phone`, que son las columnas canónicas — duplicarlas aquí crearía dos
 * sitios donde corregir un teléfono, que es exactamente lo que `CLAUDE.md` §2
 * prohíbe.
 */

export class PreferenciaDeCanalError extends Error {}

/**
 * Qué hace falta para que un canal llegue. Declarado como tabla y no como
 * `if` disperso: el día que entre un canal nuevo, se ve de un vistazo qué
 * columna necesita.
 */
const LO_QUE_EXIGE_CADA_CANAL: Record<CanalDeAviso, { necesita: "cuenta" | "email" | "phone"; falta: string }> = {
  in_app: { necesita: "cuenta", falta: "la persona no tiene cuenta con la que entrar" },
  email: { necesita: "email", falta: "la persona no tiene correo" },
  whatsapp: { necesita: "phone", falta: "la persona no tiene teléfono" },
  // El calendario invita por correo: sin dirección no hay a quién invitar.
  calendar: { necesita: "email", falta: "la persona no tiene correo al que mandar la invitación" },
};

export interface CanalResuelto {
  canal: CanalDeAviso;
  priority: number;
  /** Lo declaró y no lo ha apagado. */
  querido: boolean;
  /** Existe el dato de contacto que ese canal necesita. */
  entregable: boolean;
  /** Por qué no es entregable. `null` cuando sí lo es. */
  porQueNo: string | null;
}

/**
 * Los canales de una persona, en su orden, cada uno con si de verdad se le
 * puede entregar.
 *
 * **No autoriza y no recibe `userAccountId`**, misma disciplina que
 * `leerEnmiendas`, `vitalesDeSitios` y `resumenDeVisita`: se llama desde quien
 * ya resolvió a quién está avisando, y un lector que exige principal parece una
 * compuerta y termina usándose como tal.
 *
 * Devuelve **todos** los canales declarados, incluidos los apagados y los no
 * entregables. Filtrar aquí escondería el hueco, y el hueco es el dato: hoy
 * ningún «prefiere WhatsApp» se puede cumplir.
 */
export async function canalesDe(personId: string): Promise<CanalResuelto[]> {
  const persona = await prisma.person.findUnique({
    where: { id: personId },
    select: {
      email: true,
      phone: true,
      userAccount: { select: { id: true } },
      notificationPreferences: { select: { channel: true, priority: true, enabled: true } },
    },
  });
  if (!persona) throw new PreferenciaDeCanalError("persona_no_encontrada");

  const tiene = {
    cuenta: persona.userAccount !== null,
    email: persona.email !== null && persona.email !== "",
    phone: persona.phone !== null && persona.phone !== "",
  } as const;

  return [...persona.notificationPreferences]
    .sort((a, b) => a.priority - b.priority || a.channel.localeCompare(b.channel))
    .map((p) => {
      const exigencia = LO_QUE_EXIGE_CADA_CANAL[p.channel];
      const entregable = tiene[exigencia.necesita];
      return {
        canal: p.channel,
        priority: p.priority,
        querido: p.enabled,
        entregable,
        porQueNo: entregable ? null : exigencia.falta,
      };
    });
}

/**
 * El primero que sirve: querido **y** entregable. `null` cuando no hay ninguno,
 * que hoy es el caso normal y no un error — por eso no lanza.
 */
export function primerCanalUtil(canales: readonly CanalResuelto[]): CanalResuelto | null {
  return canales.find((c) => c.querido && c.entregable) ?? null;
}

export interface DeclararCanalInput {
  personId: string;
  canal: CanalDeAviso;
  priority?: number;
  enabled?: boolean;
}

/**
 * Las organizaciones de las que una persona es «de la finca»: miembro activo, o
 * con una cuenta que tenga una asignación activa y vigente sobre un proyecto de
 * esa organización o sobre un lugar que cuelgue de ella. Es la misma regla que
 * la decisión P-G usa para «quién lo hizo».
 */
async function fincasDe(personId: string): Promise<Set<string>> {
  const ahora = new Date();
  const [membresias, cuenta] = await Promise.all([
    prisma.organizationMembership.findMany({ where: { personId, status: "active" }, select: { organizationId: true } }),
    prisma.userAccount.findUnique({
      where: { personId },
      select: {
        assignments: {
          where: { status: "active", validFrom: { lte: ahora }, OR: [{ validTo: null }, { validTo: { gt: ahora } }] },
          select: { scope: { select: { scopeType: true, scopeRefId: true } } },
        },
      },
    }),
  ]);
  const orgs = new Set(membresias.map((m) => m.organizationId));
  for (const { scope } of cuenta?.assignments ?? []) {
    if (!scope.scopeRefId) continue;
    if (scope.scopeType === "project") {
      const proyecto = await prisma.project.findUnique({ where: { id: scope.scopeRefId }, select: { organizationId: true } });
      if (proyecto?.organizationId) orgs.add(proyecto.organizationId);
    } else if (scope.scopeType === "location") {
      const org = await resolveOrganizationForLocation(scope.scopeRefId);
      if (org) orgs.add(org);
    }
  }
  return orgs;
}

/**
 * Quién puede declarar el canal de una persona. **Decisión de Daniel,
 * 2026-09-21 (ADR-184):** ella misma, un Platform Admin, o quien coordina su finca —
 * `person:manage_notifications` sobre un proyecto o un lugar de alguna
 * organización de la que esa persona es (`fincasDe`).
 *
 * Hasta entonces `declararCanal` sólo comprobaba que la persona existiera:
 * cualquier cuenta podía apagarle a otra sus avisos.
 */
async function exigirPuedeDeclararCanal(userAccountId: string, personId: string) {
  const cuenta = await prisma.userAccount.findUnique({ where: { id: userAccountId }, select: { personId: true } });
  if (cuenta?.personId === personId) return;

  const permiso = (scopeType: "platform" | "project" | "location", scopeRefId: string | null) =>
    can(userAccountId, "manage_notifications", "person", { scopeType, scopeRefId }, CLASSIFICATION_NOT_APPLICABLE);

  if (await permiso("platform", null)) return;
  for (const org of await fincasDe(personId)) {
    const proyectos = await prisma.project.findMany({ where: { organizationId: org }, select: { id: true } });
    for (const p of proyectos) if (await permiso("project", p.id)) return;
    for (const l of await lugaresDeOrganizacion(org)) if (await permiso("location", l.id)) return;
  }
  throw new PreferenciaDeCanalError("sin_permiso_sobre_la_persona");
}

/**
 * Declara —o corrige— la preferencia de una persona para un canal.
 *
 * **Escribe su `AuditEvent` en la misma transacción.** Una preferencia de canal
 * dice a quién se avisa y por dónde: si alguien la apaga y deja de recibir
 * alertas críticas, hay que poder decir quién la apagó y cuándo.
 */
export async function declararCanal(userAccountId: string, input: DeclararCanalInput) {
  if (input.priority != null && !Number.isInteger(input.priority)) {
    throw new PreferenciaDeCanalError("prioridad_no_entera");
  }
  const persona = await prisma.person.findUnique({ where: { id: input.personId }, select: { id: true } });
  if (!persona) throw new PreferenciaDeCanalError("persona_no_encontrada");
  await exigirPuedeDeclararCanal(userAccountId, input.personId);

  const antes = await prisma.personNotificationPreference.findUnique({
    where: { personId_channel: { personId: input.personId, channel: input.canal } },
  });

  return prisma.$transaction(async (tx) => {
    const fila = await tx.personNotificationPreference.upsert({
      where: { personId_channel: { personId: input.personId, channel: input.canal } },
      create: {
        personId: input.personId,
        channel: input.canal,
        priority: input.priority ?? 0,
        enabled: input.enabled ?? true,
        createdBy: userAccountId,
      },
      update: {
        ...(input.priority === undefined ? {} : { priority: input.priority }),
        ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
      },
    });

    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: antes ? "person_notification_preference.update" : "person_notification_preference.create",
        entityType: "person_notification_preference",
        entityId: fila.id,
        before: antes ?? undefined,
        after: fila,
        sourceInterface: "notifications.service",
      },
      tx,
    );

    return fila;
  });
}
