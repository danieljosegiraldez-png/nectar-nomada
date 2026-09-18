/**
 * El saldo de un lote de material: **derivado, nunca guardado**.
 *
 * Copia la forma de `computeLotBalance`, que lleva el café, incluido su
 * `recorded` — ADR-080: «nadie ha contado nunca» y «se contó y es cero» son dos
 * afirmaciones distintas sobre la finca, y confundirlas hace que el sistema diga
 * «no queda gallinaza» cuando lo que pasa es que nadie ha mirado el galpón.
 *
 * Spec: docs/superpowers/specs/2026-09-17-inventario-con-existencias-design.md
 */
import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { can } from "../rbac/service";

export class ExistenciasError extends Error {}

/** Los tipos que SUMAN. Los demás restan; el signo lo pone el tipo, no el dato. */
const SUMAN = new Set(["received", "adjustment_increase"]);

export interface Existencias {
  readonly quantity: Prisma.Decimal;
  readonly unit: string | null;
  /**
   * Si alguien ha contado esto alguna vez. **Se lee ANTES que el número.** Con
   * `false`, el cero de `quantity` no significa «no hay»: significa que nadie
   * lo ha mirado.
   */
  readonly recorded: boolean;
  /** Negativo: se gastó más de lo que el sistema creía que había. Avisa, no bloquea. */
  readonly requiereReconciliacion: boolean;
}

export interface AmbitoDeLectura {
  readonly projectId?: string | null;
  readonly locationId?: string | null;
}

export async function existencias(
  userAccountId: string,
  consumableLotId: string,
  ambito: AmbitoDeLectura = {},
): Promise<Existencias> {
  const lote = await prisma.consumableLot.findUnique({
    where: { id: consumableLotId },
    select: { id: true, material: { select: { organizationId: true } } },
  });
  if (!lote) throw new ExistenciasError("lote_no_encontrado");

  // **Esta comprobación faltaba, y el guardia de acceso la cazó.** La función
  // recibía `userAccountId` y no lo usaba para nada: cualquiera podía leer las
  // existencias de cualquier lote. Recibir un principal y no juzgarlo es peor
  // que no recibirlo, porque la firma promete una autorización que no ocurre.
  //
  // `lot:view` y no `lot:manage`: leer cuánto queda es lo que hace el operario
  // antes de salir al campo, y exigirle permiso de escritura para mirar
  // convertiría la consulta en un trámite.
  const objetivo = ambito.locationId
    ? ({ scopeType: "location", scopeRefId: ambito.locationId } as const)
    : ambito.projectId
      ? ({ scopeType: "project", scopeRefId: ambito.projectId } as const)
      : ({ scopeType: "platform", scopeRefId: null } as const);
  if (!(await can(userAccountId, "view", "lot", objetivo, "internal"))) {
    throw new ExistenciasError("forbidden");
  }

  const eventos = await prisma.consumableStockEvent.findMany({
    where: { consumableLotId },
    select: { eventType: true, quantity: true, unit: true },
  });

  return saldoDeEventos(eventos);
}

/**
 * **La ÚNICA derivación del saldo.** La usan `existencias()` y la lista del
 * inventario: dos derivaciones del mismo número acaban discrepando, y el día que
 * lo hacen nadie sabe cuál manda. Pura a propósito — sin base y sin permisos—
 * para que se pueda llamar con eventos ya leídos.
 */
export function saldoDeEventos(
  eventos: ReadonlyArray<{ eventType: string; quantity: Prisma.Decimal; unit: string }>,
): Existencias {
  // `recorded` antes que el número: sin eventos, «cero» sería afirmar algo que
  // nadie ha afirmado.
  if (eventos.length === 0) {
    return { quantity: new Prisma.Decimal(0), unit: null, recorded: false, requiereReconciliacion: false };
  }
  // No se convierte entre unidades: la finca compra en sacos y en quintales, y
  // una conversión inventada aquí sumaría cosas que no se pueden sumar.
  const unidades = new Set(eventos.map((e) => e.unit));
  if (unidades.size > 1) {
    throw new ExistenciasError(`unidades mezcladas en el lote: ${[...unidades].join(", ")}`);
  }
  const suma = eventos.reduce(
    (acc, e) => (SUMAN.has(e.eventType) ? acc.add(e.quantity) : acc.sub(e.quantity)),
    new Prisma.Decimal(0),
  );
  return { quantity: suma, unit: eventos[0]!.unit, recorded: true, requiereReconciliacion: suma.lessThan(0) };
}

interface MovimientoInput {
  readonly consumableLotId: string;
  readonly quantity: number;
  readonly unit: string;
  readonly occurredAt?: Date;
  readonly reason?: string | null;
  readonly projectId?: string | null;
  readonly locationId?: string | null;
}

async function registrarMovimiento(
  userAccountId: string,
  input: MovimientoInput,
  eventType: "consumed" | "waste" | "lost" | "adjustment_increase" | "adjustment_decrease",
) {
  const unit = input.unit.trim();
  if (!unit) throw new ExistenciasError("unit_required");
  if (!Number.isFinite(input.quantity) || input.quantity < 0) {
    throw new ExistenciasError(`cantidad inválida: ${input.quantity}. El sentido lo pone el tipo, no el signo.`);
  }

  const objetivo = input.locationId
    ? ({ scopeType: "location", scopeRefId: input.locationId } as const)
    : input.projectId
      ? ({ scopeType: "project", scopeRefId: input.projectId } as const)
      : ({ scopeType: "platform", scopeRefId: null } as const);
  if (!(await can(userAccountId, "manage", "lot", objetivo, "internal"))) {
    throw new ExistenciasError("forbidden");
  }

  // La unidad tiene que casar con la del lote ANTES de escribir: sumar sacos
  // con galones no da un número malo, da un número sin significado.
  const previos = await prisma.consumableStockEvent.findFirst({
    where: { consumableLotId: input.consumableLotId },
    select: { unit: true },
  });
  if (previos && previos.unit !== unit) {
    throw new ExistenciasError(`unidad distinta: el lote va en ${previos.unit} y esto viene en ${unit}`);
  }

  return prisma.$transaction(async (tx) => {
    const evento = await tx.consumableStockEvent.create({
      data: {
        consumableLotId: input.consumableLotId,
        eventType,
        quantity: input.quantity,
        unit,
        occurredAt: input.occurredAt ?? new Date(),
        reason: input.reason ?? null,
        provenanceClass: "direct_observation",
        createdBy: userAccountId,
      },
    });
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: `consumable_stock.${eventType}`,
        sourceInterface: "traceability.service",
        entityType: "consumable_stock_event",
        entityId: evento.id,
        after: evento,
      },
      tx,
    );
    return evento;
  });
}

/** Se gastó. */
export async function registrarConsumo(userAccountId: string, input: MovimientoInput) {
  return registrarMovimiento(userAccountId, input, "consumed");
}

/**
 * Se contó lo que había. Para el lote que llegó sin pesar: es un evento más, no
 * una edición del lote — lo anterior no se toca.
 */
export async function registrarConteo(userAccountId: string, input: MovimientoInput) {
  if (!input.reason?.trim()) throw new ExistenciasError("un conteo declara por qué se cuenta ahora");
  return registrarMovimiento(userAccountId, input, "adjustment_increase");
}

/**
 * Se botó: se sabe dónde terminó. **Exige motivo** —«vencido», «dañado»—, aquí
 * con una frase legible y en la base con `cse_baja_exige_motivo`. Un
 * medicamento que desaparece del saldo sin decir por qué no se puede auditar.
 */
export async function registrarMerma(userAccountId: string, input: MovimientoInput) {
  if (!input.reason?.trim()) throw new ExistenciasError("botar exige motivo: «vencido», «dañado»…");
  return registrarMovimiento(userAccountId, input, "waste");
}

/**
 * **Se perdió — y perder no es botar.** Un frasco perdido puede estar en alguna
 * parte, y con un medicamento eso es un asunto de seguridad. Exige motivo, igual
 * que botar. Resta del saldo; el sentido lo pone el tipo, no el signo.
 */
export async function registrarPerdida(userAccountId: string, input: MovimientoInput) {
  if (!input.reason?.trim()) throw new ExistenciasError("perder exige motivo: dónde se vio por última vez");
  return registrarMovimiento(userAccountId, input, "lost");
}

export interface ReconciliarInput extends MovimientoInput {
  readonly reason: string;
  /**
   * `alza` cuando en la bodega hay MÁS de lo que dice el papel —apareció un
   * bidón sin registrar—; `baja` cuando hay menos. Por defecto `alza`, que es el
   * caso que empuja a reconciliar: el saldo negativo.
   */
  readonly direccion?: "alza" | "baja";
}

/**
 * Cuadrar un descuadre. **Es un evento más, nunca una edición**: el negativo
 * sigue en la historia después de cuadrarlo, porque cómo se llegó al número es
 * tan interesante como el número.
 *
 * **La razón es obligatoria**, aquí y en la base con su CHECK. Cuadrar es una
 * afirmación sobre lo que pasó —«apareció un bidón», «se derramó»— y una
 * afirmación sin razón no se puede auditar. Se comprueba en los dos sitios a
 * propósito: aquí sale una frase legible, y el CHECK atrapa al guion que rodee
 * el servicio.
 */
export async function reconciliar(userAccountId: string, input: ReconciliarInput) {
  if (!input.reason.trim()) {
    throw new ExistenciasError("una reconciliación sin razón no se puede auditar");
  }
  return registrarMovimiento(
    userAccountId,
    input,
    input.direccion === "baja" ? "adjustment_decrease" : "adjustment_increase",
  );
}
