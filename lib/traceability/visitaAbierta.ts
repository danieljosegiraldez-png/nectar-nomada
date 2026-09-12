import type { Prisma, ProvenanceClass } from "../../generated/prisma/client";

/**
 * A9.2 — enganchar lo que se registra en el campo a la visita que está abierta.
 *
 * **El hecho que motiva esto** (`48_A9_CAPTURA_DE_CAMPO_PROMPT.md` §1): la
 * visita del 2 de septiembre a Toabré produjo un hallazgo, una decisión de
 * campo, dos sets fotográficos y un costo de viaje. **El sistema guardó la
 * instalación de las colonias.** Una ida donde se revisan tres colonias son hoy
 * tres `Inspection` y ningún registro del viaje.
 *
 * **Por qué el enganche es implícito y no un campo del formulario.** La regla
 * de corte del dueño es «si se puede escribir en el carro, no va en el campo»,
 * y su formulario de inspección es de **un toque**. Pedir «¿a qué visita
 * pertenece esto?» frente a la caja, con guantes, es exactamente el toque que
 * hace que el formulario no se llene.
 *
 * **La regla, acotada a propósito.** Se engancha sólo si hay una visita que
 * cumple las cuatro: en **ese** sitio, **sin cerrar**, en estado `draft`, y
 * abierta por **quien está registrando**. Con cualquiera de las cuatro sin
 * cumplir no se engancha nada y el registro queda como hoy — suelto, que es lo
 * que ya funciona. El modo de fallo que esto evita es enganchar el trabajo de
 * una persona a la visita de otra, o a una visita vieja del mismo sitio.
 *
 * **Lo que NO decide esto:** el `eventKind`. Se usa `observacion`, que ya
 * existe, porque la FK del `FieldEvent` —`inspectionId`, `colonyEventId`,
 * `apiaryHarvestEventId`— ya dice **qué** es el registro; el catálogo de
 * `event_kind` no tiene hoy ningún valor de apiario y sus doce valores son de
 * café. Si el dueño quiere vocabulario propio, es un valor de catálogo más y
 * una actualización de filas, no un rediseño.
 */
export async function visitaAbiertaEn(
  tx: Prisma.TransactionClient,
  userAccountId: string,
  locationId: string,
): Promise<string | null> {
  const visita = await tx.fieldSession.findFirst({
    where: { locationId, createdBy: userAccountId, endedAt: null, status: "draft" },
    // Desempate por `createdAt`, y hace falta: `startedAt` lo DECLARA quien abre
    // la visita, así que dos visitas del mismo sitio pueden traer la misma hora
    // —lo produjo una prueba, y en campo lo produciría alguien reabriendo tras
    // un cierre en falso—. Sin desempate, «la visita abierta» era la que la base
    // devolviera primero, que no es una respuesta.
    orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }],
    select: { id: true },
  });
  return visita?.id ?? null;
}

/** El `event_kind` con el que entra un registro de apiario. Ver la cabecera. */
export const CLASE_DE_EVENTO_DE_APIARIO = "observacion";

/**
 * Crea el `FieldEvent` que ata un registro a la visita abierta, si la hay.
 * Devuelve su id, o `null` cuando no había visita — que es el caso normal
 * mientras nadie haya abierto una.
 */
export async function ligarAVisitaAbierta(
  tx: Prisma.TransactionClient,
  input: {
    userAccountId: string;
    locationId: string;
    occurredAt: Date;
    provenanceClass: ProvenanceClass;
    sujeto:
      | { inspectionId: string }
      | { colonyEventId: string }
      | { apiaryHarvestEventId: string }
      | { varroaCountId: string };
  },
): Promise<string | null> {
  const fieldSessionId = await visitaAbiertaEn(tx, input.userAccountId, input.locationId);
  if (!fieldSessionId) return null;

  const clase = await tx.variableCatalogValue.findFirst({
    where: { value: CLASE_DE_EVENTO_DE_APIARIO, catalog: { key: "event_kind" } },
    select: { id: true },
  });
  // Sin el catálogo sembrado no se engancha, pero tampoco se rompe el registro:
  // perder el vínculo es peor que perder la inspección, y muy peor al revés.
  if (!clase) return null;

  const evento = await tx.fieldEvent.create({
    data: {
      fieldSessionId,
      eventKindValueId: clase.id,
      occurredAt: input.occurredAt,
      provenanceClass: input.provenanceClass,
      createdBy: input.userAccountId,
      ...input.sujeto,
    },
    select: { id: true },
  });
  return evento.id;
}
