/**
 * Phase 1, ticket T8 (docs/implementation/PHASE_1_TECHNICAL_EXECUTION_PLAN.md
 * §17, §34). Simpler than T6/T7: storage doesn't change a Lot's identity,
 * so there's no bracketing stage_change LotTransformation pair — just a
 * direct lotId FK on StorageAssignment.
 *
 * Location history is preserved by never updating endedAt retroactively
 * past the truth: moving a lot's storage location closes the prior open
 * assignment (endedAt set once, at the actual move time) and creates a
 * *new* StorageAssignment row, rather than mutating locationId in place.
 */
import { prisma } from "../db";
import { unaVezPorEnvio } from "../envios/unaVezPorEnvio";
import { requireLotAccess, TraceabilityAccessError } from "./lots";
import { exigeSecadoTerminado } from "./lotProcess";
import { bloquearLinaje } from "./procesoDelLinaje";

export interface MoveLotToStorageInput {
  lotId: string;
  locationId: string;
  containerNote?: string | null;
  startedAt: Date;

  // Clave de idempotencia del formulario web. Opcional: sin ella el servicio se
  // comporta como antes — la cola offline tiene la suya por `clientDraftId`, y
  // las llamadas internas no deben necesitar un token para escribir.
  claveDeEnvio?: string | null;}

export async function moveLotToStorage(userAccountId: string, input: MoveLotToStorageInput) {
  const lot = await prisma.lot.findUnique({ where: { id: input.lotId } });
  if (!lot) throw new TraceabilityAccessError("lot_not_found");
  await requireLotAccess(userAccountId, "manage", [{ projectId: lot.projectId, locationId: lot.locationId, classification: lot.classification }]);

  // El ayudante abre la transacción: cerrar la asignación anterior, abrir la
  // nueva y anotar la clave tienen que ir juntas o no ir.
  return unaVezPorEnvio(userAccountId, input.claveDeEnvio, {
    tipo: "StorageAssignment",
    recuperar: (id) => prisma.storageAssignment.findUniqueOrThrow({ where: { id } }),
    crear: async (tx) => {
    // Parte 1, R2 (ronda de arreglo 1, 2026-10-02): el linaje se bloquea PRIMERO y en TODA llamada, también
    // en una reubicación. El diseño lo dice sin excepción —«toda transacción que lea o cambie la cobertura
    // empieza por `bloquearLinaje` … almacenar»— y de ello depende lo que sigue: si la asignación abierta se
    // leyera antes del bloqueo, o sólo se bloqueara al entrar, una reubicación concurrente a una operación
    // que termina la asignación de bodega y deja un proceso abierto (`devolverASecado`, tarea 8) leería la
    // asignación vieja, iría por la rama de reubicación —sin compuerta— y volvería a meter el lote en bodega
    // con el proceso abierto. Es lo PRIMERO de la transacción: ninguna fila de `lot` se toca antes, así que
    // el orden global de bloqueo por id (R2) se conserva.
    await bloquearLinaje(tx, input.lotId);
    const openAssignment = await tx.storageAssignment.findFirst({
      where: { lotId: input.lotId, endedAt: null },
    });
    // «No debe salir de secado antes bajo ninguna circunstancia» (Daniel, 2026-09-07), y desde la
    // Parte 1 (R7) mirando el proceso que CUBRE al lote, dentro de esta transacción y con el linaje
    // bloqueado. Sólo al ENTRAR a bodega: reubicar un lote que ya está dentro no vuelve a juzgar el
    // secado (pero sí espera en fila, por el bloqueo de arriba). Un reenvío idempotente
    // (`recuperarDeOtroEnvio`) no pasa por `crear`, así que tampoco por aquí: devuelve la fila que ya
    // pasó la compuerta. Lanza en vez de avisar; para deshacerlo está `devolverASecado`.
    if (!openAssignment) {
      await exigeSecadoTerminado(tx, input.lotId);
    }
    if (openAssignment) {
      await tx.storageAssignment.update({
        where: { id: openAssignment.id },
        data: { endedAt: input.startedAt },
      });
    }

    return tx.storageAssignment.create({
      data: {
        lotId: input.lotId,
        locationId: input.locationId,
        containerNote: input.containerNote ?? null,
        startedAt: input.startedAt,
        createdBy: userAccountId,
      },
    });
    },
  });
}

export async function getCurrentStorageAssignment(userAccountId: string, lotId: string) {
  const lot = await prisma.lot.findUnique({ where: { id: lotId } });
  if (!lot) throw new TraceabilityAccessError("lot_not_found");
  await requireLotAccess(userAccountId, "view", [{ projectId: lot.projectId, locationId: lot.locationId, classification: lot.classification }]);

  return prisma.storageAssignment.findFirst({ where: { lotId, endedAt: null } });
}
