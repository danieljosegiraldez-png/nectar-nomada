/**
 * Registrar la limpieza de una CAJA — el hardware —, no de una colonia (ADR-159).
 *
 * **Decisión del dueño, 2026-09-17: «1, sobre la caja».** Hasta hoy todo evento del apiario
 * colgaba de `Colony`. La limpieza no puede: una caja vacía se desinfecta **antes** de recibir
 * otra colonia, y en ese momento no hay colonia de la que colgarla.
 *
 * ## La regla que no puede ser un `CHECK`
 *
 * Los actos destructivos —raspar, flamear, hervir en sosa— exigen la caja **vacía**. Eso cruza a
 * otra tabla, y un `CHECK` sólo ve su propia fila, así que vive aquí. Y se comprueba **en la
 * fecha de la limpieza**, no hoy: quien registra una limpieza de hace dos semanas tiene que
 * poder hacerlo aunque la caja tenga colonia nueva desde ayer.
 *
 * **La ocupación sale del intervalo `[startedAt, endedAt)` de la colonia, no de su `status`.**
 * El `status` es el de AHORA: una colonia que hoy está muerta pudo estar viva en la fecha que se
 * pregunta. Esto se apoya en que una colonia que deja de estar activa lleva `endedAt`.
 * **Medido el 2026-09-17 sobre la base: 34 colonias, las 16 fugadas con `endedAt`, las 18
 * activas sin él, CERO colonias no activas sin fecha de fin.** Si ese caso apareciera, la caja
 * se leería ocupada para siempre y la limpieza tras una muerte —la más común— quedaría
 * bloqueada: la prueba «una limpieza DESPUÉS de la muerte se acepta» es la que lo vigila.
 */
import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { requireApiaryAccess } from "./hives";
import { exigeLimpieza, exigeCajaVacia, LimpiezaInvalida } from "./vocabularioDeLimpieza";
import type { DataQuality, ProvenanceClass } from "../../generated/prisma/client";

export { LimpiezaInvalida } from "./vocabularioDeLimpieza";

export interface LimpiezaDeCajaInput {
  hiveId: string;
  occurredAt: Date;
  acts: readonly string[];
  actOtherNote?: string | null;
  reason?: string | null;
  reasonOtherNote?: string | null;
  notes?: string | null;
  operatorPersonId?: string | null;
  provenanceClass: ProvenanceClass;
  dataQuality?: DataQuality | null;
}

export async function registrarLimpiezaDeCaja(userAccountId: string, input: LimpiezaDeCajaInput) {
  // La forma primero, sin base: un acto inventado no debería consultar ni el permiso.
  const { acts, reason } = exigeLimpieza(input);

  const caja = await prisma.hive.findUnique({
    where: { id: input.hiveId },
    select: { id: true, locationId: true, projectId: true },
  });
  if (!caja) throw new LimpiezaInvalida("caja_no_encontrada");

  await requireApiaryAccess(userAccountId, "manage", [{ projectId: caja.projectId, locationId: caja.locationId }]);

  // **La limpieza es un DÍA, no un instante** —medianoche UTC, la convención de la casa para los
  // campos de día—, así que se normaliza aquí: una hora que se colara por otra vía no debe
  // cambiar la respuesta.
  const d = input.occurredAt;
  const inicioDelDia = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const finDelDia = new Date(inicioDelDia.getTime() + 86_400_000);

  return prisma.$transaction(async (tx) => {
    if (exigeCajaVacia(acts)) {
      // **Sólo se rechaza si una colonia ocupó la caja EL DÍA ENTERO.** Con granularidad de día,
      // dos transiciones del mismo día son lo normal y las dos tienen que pasar: la colonia
      // MUERE el día 10 y la caja se limpia ese día; la caja se limpia el día 10 y ese mismo día
      // se instala una colonia nueva. Una regla por instante las rechazaría según la hora.
      //
      // Intervalo semiabierto de la colonia, [startedAt, endedAt): ocupa el día entero si ya
      // estaba al empezar el día y seguía al terminarlo. Dentro de la transacción, para que no
      // se cuele una colonia entre la comprobación y la escritura.
      const ocupante = await tx.colony.findFirst({
        where: {
          hiveId: caja.id,
          startedAt: { lte: inicioDelDia },
          OR: [{ endedAt: null }, { endedAt: { gte: finDelDia } }],
        },
        select: { id: true },
      });
      if (ocupante) throw new LimpiezaInvalida("caja_con_colonia_en_esa_fecha");
    }

    const fila = await tx.hiveCleaning.create({
      data: {
        hiveId: caja.id,
        occurredAt: inicioDelDia,
        acts,
        actOtherNote: acts.includes("otro") ? (input.actOtherNote ?? "").trim() : null,
        reason,
        reasonOtherNote: reason === "otro" ? (input.reasonOtherNote ?? "").trim() : null,
        notes: input.notes?.trim() || null,
        operatorPersonId: input.operatorPersonId ?? null,
        provenanceClass: input.provenanceClass,
        dataQuality: input.dataQuality ?? null,
        createdBy: userAccountId,
      },
    });

    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "hive_cleaning.create",
        entityType: "hive_cleaning",
        entityId: fila.id,
        after: fila,
        sourceInterface: "web",
      },
      tx,
    );
    return fila;
  });
}

/**
 * Las limpiezas de una caja, más recientes primero. **No autoriza y no pide principal**, misma
 * disciplina que `vitalesDeSitios`: se llama desde una lectura que ya concedió la caja.
 */
export async function limpiezasDeCaja(hiveId: string) {
  return prisma.hiveCleaning.findMany({
    where: { hiveId },
    orderBy: { occurredAt: "desc" },
    select: { id: true, occurredAt: true, acts: true, actOtherNote: true, reason: true, reasonOtherNote: true, notes: true },
  });
}
