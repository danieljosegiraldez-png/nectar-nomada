/**
 * Los artefactos de una colmena: qué lleva puesto y DESDE CUÁNDO.
 *
 * Spec: docs/superpowers/specs/2026-09-17-artefactos-de-colmena-design.md §A. Daniel, el
 * 2026-09-17: «reductor de piquera instalada en cámara de cría es un artefacto, es como también
 * decir que uno va a poner excluidor de reina o un smart hive console». Y pidió historial con
 * fechas, que un booleano en `Hive` no puede dar.
 *
 * **El intervalo es la verdad.** Qué llevaba puesto esta colmena el 3 de mayo sólo lo contesta
 * un intervalo. Cerrado a la izquierda, abierto a la derecha: retirado el día 10, el día 10 ya
 * no estaba.
 *
 * **Un solo escritor** (§3 del spec). Los intervalos se abren y se cierran SÓLO con
 * `abrirIntervaloEn` / `cerrarIntervaloEn`, dentro de la transacción de quien llama: la pantalla
 * de artefactos, la inspección que declara el cambio y el formulario de la caja pasan todos por
 * aquí. Y la foto de hoy en `Hive` —`queenExcluder`, `entranceReducer`, `screenedBottomBoard`—
 * la escribe sólo `refrescarFotoEn`, a partir de los intervalos: el día que discrepe manda el
 * intervalo, porque la foto no tiene otra fuente.
 *
 * Permiso: `apiary:manage`, como el resto del trabajo de la colmena (decisión §7.1 del spec).
 * El nodo de sensores, que reasigna datos al moverse, tendrá su propio permiso (Tarea 4).
 */
import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { ApiaryAccessError, requireApiaryAccess } from "./hives";
import type { HiveFitting, HiveFittingKind, Prisma, ProvenanceClass } from "../../generated/prisma/client";
import { TIPOS_DE_ARTEFACTO as TIPOS, type TipoDeArtefacto } from "./tiposDeArtefacto";

export class ArtefactoInvalido extends Error {}

type Tx = Prisma.TransactionClient;

// El vocabulario vive en un módulo puro para que el formulario (cliente) lo lea sin base.
// Guardia en las DOS direcciones: si el enum gana un tipo que la lista no tiene, o al revés,
// esta línea no compila.
type Iguales<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const vocabularioCasaConElEnum: Iguales<HiveFittingKind, TipoDeArtefacto> = true;
void vocabularioCasaConElEnum;
export const TIPOS_DE_ARTEFACTO: readonly HiveFittingKind[] = TIPOS;

/**
 * Qué artefacto tiene foto en `Hive`, y en qué campo. Sólo los que son un sí/no: el alimentador
 * tiene un MÉTODO (`feederType`) y las alzas una CUENTA (`supers`), y un intervalo no contesta
 * ninguna de las dos cosas — siguen en el formulario de la caja.
 */
const FOTO: Partial<Record<HiveFittingKind, "queenExcluder" | "entranceReducer" | "screenedBottomBoard">> = {
  excluidor: "queenExcluder",
  reductor_de_piquera: "entranceReducer",
  piso_ventilado: "screenedBottomBoard",
};

export function exigeTipoDeArtefacto(kind: string): HiveFittingKind {
  if (!(TIPOS_DE_ARTEFACTO as readonly string[]).includes(kind)) throw new ArtefactoInvalido("artefacto_desconocido");
  return kind as HiveFittingKind;
}

/** Lo que llega como cadena se valida aquí, una vez: el tipo, la cuenta de las alzas, la nota de «otro». */
export function validarArtefacto(entrada: { kind: string; count?: number | null; notes?: string | null }) {
  const kind = exigeTipoDeArtefacto(entrada.kind);
  const count = entrada.count ?? null;
  if (kind === "alza") {
    if (count === null || !Number.isInteger(count) || count <= 0) throw new ArtefactoInvalido("cuenta_de_alzas_requerida");
  } else if (count !== null) {
    throw new ArtefactoInvalido("cuenta_sólo_para_alzas");
  }
  const notes = entrada.notes?.trim() || null;
  if (kind === "otro" && !notes) throw new ArtefactoInvalido("otro_sin_nota");
  return { kind, count, notes };
}

async function colmena(hiveId: string) {
  const hive = await prisma.hive.findUnique({ where: { id: hiveId }, select: { locationId: true, projectId: true } });
  if (!hive) throw new ApiaryAccessError("hive_not_found");
  return hive;
}

/** Lo puesto EN un momento: la misma condición para la consulta y para la foto. */
const puestoEn = (momento: Date) => ({
  installedAt: { lte: momento },
  OR: [{ removedAt: null }, { removedAt: { gt: momento } }],
});

/**
 * La foto de hoy de UN artefacto en `Hive`, sacada de los intervalos. Sólo toca el campo de ese
 * artefacto: instalar un alimentador no afirma nada del excluidor, y un nulo sigue siendo «nadie
 * miró» (ADR-080). Cada cambio queda auditado con su antes.
 */
const refrescarFotoEn = (userAccountId: string, hiveId: string, kind: HiveFittingKind) => async (tx: Tx) => {
  const campo = FOTO[kind];
  if (!campo) return;
  const puesto = (await tx.hiveFitting.count({ where: { hiveId, kind, ...puestoEn(new Date()) } })) > 0;
  const antes = await tx.hive.findUniqueOrThrow({ where: { id: hiveId } });
  if (antes[campo] === puesto) return;
  const despues = await tx.hive.update({ where: { id: hiveId }, data: { [campo]: puesto } });
  await recordAuditEvent(
    {
      actorUserAccountId: userAccountId,
      operation: "hive.fittings_snapshot",
      entityType: "hive",
      entityId: hiveId,
      before: antes,
      after: despues,
      sourceInterface: "apiary.service",
    },
    tx,
  );
};

export interface AbrirIntervalo {
  readonly hiveId: string;
  readonly kind: HiveFittingKind;
  readonly count: number | null;
  readonly notes: string | null;
  readonly installedAt: Date;
  readonly provenanceClass: ProvenanceClass;
  readonly installedInspectionId?: string | null;
}

/**
 * Abre un intervalo. Sin permiso propio: quien llama ya autorizó y ya validó (`validarArtefacto`).
 *
 * Los tres ayudantes devuelven un cierre `async (tx) => …` en vez de recibir `tx` junto a los
 * datos: es la forma que `tests/arquitectura/audit-atomico.test.ts` reconoce como «dentro de una
 * transacción», y se usa así — `await abrirIntervaloEn(actor, datos)(tx)`.
 */
export const abrirIntervaloEn = (userAccountId: string, d: AbrirIntervalo) => async (tx: Tx) => {
  if (Number.isNaN(d.installedAt.getTime())) throw new ArtefactoInvalido("fecha_de_instalacion_invalida");
  const fitting = await tx.hiveFitting.create({
    data: {
      hiveId: d.hiveId,
      kind: d.kind,
      count: d.count,
      notes: d.notes,
      installedAt: d.installedAt,
      provenanceClass: d.provenanceClass,
      installedInspectionId: d.installedInspectionId ?? null,
      createdBy: userAccountId,
    },
  });
  await recordAuditEvent(
    {
      actorUserAccountId: userAccountId,
      operation: "hive_fitting.install",
      entityType: "hive_fitting",
      entityId: fitting.id,
      after: fitting,
      sourceInterface: "apiary.service",
    },
    tx,
  );
  await refrescarFotoEn(userAccountId, d.hiveId, d.kind)(tx);
  return fitting;
};

/** Cierra UN intervalo abierto. */
export const cerrarIntervaloEn =
  (userAccountId: string, antes: HiveFitting, removedAt: Date, removedInspectionId: string | null = null) =>
  async (tx: Tx) => {
  if (Number.isNaN(removedAt.getTime())) throw new ArtefactoInvalido("fecha_de_retiro_invalida");
  // Lo retirado ya tiene su fecha: cambiarla es CORREGIR el intervalo, otra operación.
  if (antes.removedAt) throw new ArtefactoInvalido("ya_retirado");
  if (removedAt <= antes.installedAt) throw new ArtefactoInvalido("retiro_anterior_a_instalacion");
  const despues = await tx.hiveFitting.update({ where: { id: antes.id }, data: { removedAt, removedInspectionId } });
  await recordAuditEvent(
    {
      actorUserAccountId: userAccountId,
      operation: "hive_fitting.remove",
      entityType: "hive_fitting",
      entityId: despues.id,
      before: antes,
      after: despues,
      sourceInterface: "apiary.service",
    },
    tx,
  );
  await refrescarFotoEn(userAccountId, antes.hiveId, antes.kind)(tx);
  return despues;
};

/**
 * «Se quitó el excluidor», dicho sin señalar CUÁL intervalo: cierra los abiertos de ese tipo. Si
 * no hay ninguno —una colmena declarada con el booleano antes de que existieran los intervalos—
 * no se inventa una instalación con fecha desconocida: sólo se apaga la foto, auditada.
 */
export const cerrarAbiertosEn =
  (userAccountId: string, hiveId: string, kind: HiveFittingKind, removedAt: Date, removedInspectionId: string | null = null) =>
  async (tx: Tx) => {
    const abiertos = await tx.hiveFitting.findMany({ where: { hiveId, kind, removedAt: null } });
    for (const a of abiertos) await cerrarIntervaloEn(userAccountId, a, removedAt, removedInspectionId)(tx);
    if (abiertos.length === 0) await refrescarFotoEn(userAccountId, hiveId, kind)(tx);
    return abiertos.length;
  };

export interface InstalarArtefactoInput {
  readonly hiveId: string;
  readonly kind: HiveFittingKind;
  readonly installedAt: Date;
  /** Sólo `alza`, y obligatoria ahí. */
  readonly count?: number | null;
  readonly notes?: string | null;
  /** Lo que se vio al poner el artefacto. Se puede declarar otra (p. ej. `original_record` al pasar un cuaderno). */
  readonly provenanceClass?: ProvenanceClass;
}

export async function instalarArtefacto(userAccountId: string, input: InstalarArtefactoInput) {
  await requireApiaryAccess(userAccountId, "manage", [await colmena(input.hiveId)]);
  const v = validarArtefacto(input);
  return prisma.$transaction(
    abrirIntervaloEn(userAccountId, {
      hiveId: input.hiveId,
      ...v,
      installedAt: input.installedAt,
      provenanceClass: input.provenanceClass ?? "direct_observation",
    }),
  );
}

export async function retirarArtefacto(userAccountId: string, input: { readonly fittingId: string; readonly removedAt: Date }) {
  const antes = await prisma.hiveFitting.findUnique({ where: { id: input.fittingId } });
  if (!antes) throw new ArtefactoInvalido("artefacto_no_encontrado");
  await requireApiaryAccess(userAccountId, "manage", [await colmena(antes.hiveId)]);
  return prisma.$transaction(cerrarIntervaloEn(userAccountId, antes, input.removedAt));
}

/** Lo que la colmena llevaba puesto EN un momento. `en` ausente es AHORA, no «todos». */
export async function artefactosDeColmena(userAccountId: string, hiveId: string, en?: Date) {
  await requireApiaryAccess(userAccountId, "view", [await colmena(hiveId)]);
  return prisma.hiveFitting.findMany({
    where: { hiveId, ...puestoEn(en ?? new Date()) },
    orderBy: { installedAt: "asc" },
  });
}
