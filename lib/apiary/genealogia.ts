/**
 * La genealogía de la colonia: de cuál sale una división y con cuál se une una colonia.
 *
 * Spec: docs/superpowers/specs/2026-09-18-faenas-division-y-reinas-design.md §3. Daniel: «también
 * están divisiones de colmenas». Los nombres son de los manuales: «multiplicación por división /
 * por núcleo» (DICTA, Honduras 2019), «división artificial de una colmena» y «unión de colonias»
 * (SAGARPA, México).
 *
 * - **Dividir** crea la colonia hija en OTRA caja, con su madre declarada. La madre sigue.
 * - **Unir** cierra la colonia débil como `combined` apuntando a la que la recibe; la receptora no
 *   cambia de identidad.
 * - **No se adivina el pasado**: las divisiones y uniones registradas antes de esto se quedan sin
 *   pareja (ADR-080), y la base lo permite sólo para ellas (CHECK NOT VALID).
 *
 * Permiso: `apiary:manage` sobre la caja de cada colonia implicada — dividir hacia una caja de otro
 * apiario exige poder en los dos.
 */
import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { ApiaryAccessError, registrarFinDeColonia, requireApiaryAccess, type RegistrarFinDeColoniaInput } from "./hives";

export class GenealogiaInvalida extends Error {}

async function coloniaConCaja(colonyId: string) {
  const c = await prisma.colony.findUnique({
    where: { id: colonyId },
    include: { hive: { select: { id: true, projectId: true, locationId: true } } },
  });
  if (!c) throw new ApiaryAccessError("colony_not_found");
  return c;
}

export interface DividirColoniaInput {
  readonly madreColonyId: string;
  /** La caja donde queda la colonia hija. Tiene que estar sin colonia activa. */
  readonly destinoHiveId: string;
  readonly occurredAt: Date;
  readonly nota?: string | null;
}

export async function dividirColonia(userAccountId: string, input: DividirColoniaInput) {
  const madre = await coloniaConCaja(input.madreColonyId);
  const destino = await prisma.hive.findUnique({ where: { id: input.destinoHiveId }, select: { id: true, projectId: true, locationId: true } });
  if (!destino) throw new ApiaryAccessError("hive_not_found");
  await requireApiaryAccess(userAccountId, "manage", [madre.hive]);
  await requireApiaryAccess(userAccountId, "manage", [destino]);

  if (Number.isNaN(input.occurredAt.getTime())) throw new GenealogiaInvalida("fecha_invalida");
  if (madre.status !== "active") throw new GenealogiaInvalida("madre_no_activa");
  if (input.occurredAt < madre.startedAt) throw new GenealogiaInvalida("division_antes_de_la_madre");
  if (destino.id === madre.hive.id) throw new GenealogiaInvalida("caja_ocupada");

  return prisma.$transaction(async (tx) => {
    // Dentro de la transacción: dos divisiones a la vez hacia la misma caja no deben pasar las dos.
    if (await tx.colony.count({ where: { hiveId: destino.id, status: "active" } })) {
      throw new GenealogiaInvalida("caja_ocupada");
    }
    const hija = await tx.colony.create({
      data: {
        hiveId: destino.id,
        startedAt: input.occurredAt,
        status: "active",
        originType: "split",
        parentColonyId: madre.id,
        originNote: input.nota?.trim() || null,
        provenanceClass: "direct_observation",
        createdBy: userAccountId,
      },
    });
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "colony.split",
        entityType: "colony",
        entityId: hija.id,
        before: madre,
        after: hija,
        sourceInterface: "apiary.service",
      },
      tx,
    );
    return hija;
  });
}

export interface UnirColoniasInput {
  /** La que se cierra. */
  readonly debilColonyId: string;
  /** La que recibe, y sigue. */
  readonly receptoraColonyId: string;
  readonly occurredAt: Date;
  /**
   * Por qué se unió, del catálogo de causas de pérdida — p. ej. «problema de reina irresoluble»:
   * el estándar internacional cuenta la unión como pérdida con su causa.
   */
  readonly causas?: RegistrarFinDeColoniaInput["causas"];
  readonly reason?: string | null;
}

/**
 * Unir = terminar la colonia débil como `combined`, apuntando a la receptora. **Un solo escritor**:
 * delega en `registrarFinDeColonia`, que valida la unión (misma ubicación, receptora activa,
 * fechas) y escribe fin, causas, receptora y AuditEvent en una transacción.
 */
export async function unirColonias(userAccountId: string, input: UnirColoniasInput) {
  return registrarFinDeColonia(userAccountId, {
    colonyId: input.debilColonyId,
    status: "combined",
    endedAt: input.occurredAt,
    combinedIntoColonyId: input.receptoraColonyId,
    causas: input.causas,
    reason: input.reason,
  });
}

/** La madre de una colonia (si se declaró) y sus hijas, con la caja de cada una. */
export async function lineaDeColonia(userAccountId: string, colonyId: string) {
  const c = await coloniaConCaja(colonyId);
  await requireApiaryAccess(userAccountId, "view", [c.hive]);
  const conCaja = { include: { hive: { select: { id: true, identifier: true, locationId: true } } } } as const;
  const [madre, hijas] = await Promise.all([
    c.parentColonyId ? prisma.colony.findUnique({ where: { id: c.parentColonyId }, ...conCaja }) : Promise.resolve(null),
    prisma.colony.findMany({ where: { parentColonyId: c.id }, orderBy: { startedAt: "asc" }, ...conCaja }),
  ]);
  return { madre, hijas };
}
