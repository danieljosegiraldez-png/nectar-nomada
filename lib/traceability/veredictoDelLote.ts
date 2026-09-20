/**
 * El veredicto de calidad de un lote armado desde recepciones: ¿la cereza cumplió lo que se pidió?
 *
 * Spec: docs/superpowers/specs/2026-09-19-de-la-recepcion-a-los-lotes-design.md §3.4.
 *
 * - **Sólo de lotes de nivel 1.** Si el lote no tiene `LoteDesdeRecepcion`, no hay pedido contra el
 *   que juzgar y esta función no hace nada. El lote *aceptado* que sale de una selección es uno de
 *   esos: juzgarlo otra vez contaría dos veces la misma cereza.
 * - **Sobre TODAS sus selecciones, no sobre la última.** Seleccionar un kilo limpio y después
 *   noventa y nueve malos tiene que dar el mismo veredicto que seleccionar los cien de una vez.
 * - **Corre dentro de la transacción de la selección** (por `enLaMismaTransaccion`), así que una
 *   selección no puede guardarse sin su veredicto ni el veredicto sin su selección.
 */
import { evaluarCalidad, type CondicionDePesaje } from "../beneficio/veredictoDeCalidad";
import type { Prisma } from "../../generated/prisma/client";

/** Las categorías de rechazo que el veredicto mira por nombre. El resto suma como rechazo sin más. */
const VERDE = "cereza_verde";
const FLOTES = "flotadores";
const METODO_QUE_MOJA = "flotacion";

export async function recalcularVeredicto(tx: Prisma.TransactionClient, lotId: string): Promise<void> {
  const vinculos = await tx.loteDesdeRecepcion.findMany({ where: { lotId }, select: { recepcionId: true } });
  if (vinculos.length === 0) return;

  const selecciones = await tx.lotTransformation.findMany({
    where: { transformationType: "selection", inputs: { some: { lotId } } },
    select: {
      id: true,
      condicionDePesaje: true,
      selectionMethodValue: { select: { value: true } },
      inputs: { where: { lotId }, select: { quantity: true } },
      outputs: { select: { quantity: true, lot: { select: { rejectionCategoryValue: { select: { value: true } } } } } },
      deviations: { where: { severity: "mass_balance" }, select: { id: true } },
    },
  });
  if (selecciones.length === 0) return;

  let insumoKg = 0;
  let aceptadoKg = 0;
  let verdeKg = 0;
  let flotesKg = 0;
  let balanceDescuadrado = false;
  let huboFlotacion = false;
  const condiciones: Array<CondicionDePesaje | null> = [];

  for (const s of selecciones) {
    for (const i of s.inputs) insumoKg += Number(i.quantity ?? 0);
    for (const o of s.outputs) {
      const categoria = o.lot.rejectionCategoryValue?.value ?? null;
      const kg = Number(o.quantity ?? 0);
      if (categoria == null) aceptadoKg += kg;
      else if (categoria === VERDE) verdeKg += kg;
      else if (categoria === FLOTES) flotesKg += kg;
    }
    if (s.deviations.length > 0) balanceDescuadrado = true;
    if (s.selectionMethodValue?.value === METODO_QUE_MOJA) huboFlotacion = true;
    condiciones.push(s.condicionDePesaje);
  }

  // El pedido del lote sale de sus recepciones: si todas apuntan al mismo, ése; si no, ninguno —un
  // pedido podría estar tapando el incumplimiento del otro.
  const recepciones = await tx.recepcionDeCereza.findMany({
    where: { id: { in: vinculos.map((v) => v.recepcionId) } },
    select: { pedidoId: true },
  });
  const pedidos = new Set(recepciones.map((r) => r.pedidoId));
  const pedidoId = pedidos.size === 1 ? [...pedidos][0] ?? null : null;
  const pedido = pedidoId
    ? await tx.pedidoDeCereza.findUnique({ where: { id: pedidoId }, select: { minMaduroPct: true, maxVerdePct: true, maxFlotesPct: true } })
    : null;

  const veredicto = evaluarCalidad({
    masas: { insumoKg, aceptadoKg, verdeKg, flotesKg, selecciones: selecciones.length },
    limites: pedido
      ? {
          minMaduroPct: pedido.minMaduroPct == null ? null : Number(pedido.minMaduroPct),
          maxVerdePct: pedido.maxVerdePct == null ? null : Number(pedido.maxVerdePct),
          maxFlotesPct: pedido.maxFlotesPct == null ? null : Number(pedido.maxFlotesPct),
        }
      : null,
    condiciones,
    huboFlotacion,
    balanceDescuadrado,
  });

  const fila = {
    pedidoId,
    selecciones: selecciones.length,
    insumoKg,
    aceptadoKg,
    verdeKg,
    flotesKg,
    juicio: veredicto.juicio,
    motivo: veredicto.motivo,
    actualizadoAt: new Date(),
  };
  await tx.veredictoDeCalidadDePedido.upsert({ where: { lotId }, create: { lotId, ...fila }, update: fila });
}
