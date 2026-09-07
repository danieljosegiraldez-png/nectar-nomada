/**
 * Move the first PlantingCohort from Lote 3 to Lote 4 (product owner, 2026-08-29).
 *
 * **The record was never true.** The 200 Caturra plantones from Cafelino went
 * into Lote 4; they were recorded against Lote 3 because the owner's statement
 * ("200 en lote 3") was transcribed without checking it against
 * `docs/implementation/27_A7_PROYECTOS_ASSIGNMENTS_DATOS_REALES.md` §5, which
 * puts ~2.500 Catuaí of three to four years in Lotes 1–3 and the new ~200-plant
 * blocks in Lotes 4, 5 and 6. The owner confirmed Lote 4 when the discrepancy
 * was raised. So this is a correction of a transcription error, not a change in
 * the world — nothing was replanted, and `plantedAt` is untouched.
 *
 * Both rows move: the cohort and the `planted` PlantingEvent linked to it. A
 * cohort in Lote 4 whose own event still says Lote 3 would be worse than the
 * error being fixed, because the two would disagree.
 *
 * **Not a supersede.** `PlantingCohort` has no `correctsId` and `PlantingEvent`
 * has none either, unlike `Measurement.correctsId` and
 * `Assessment.supersedesAssessmentId`. That asymmetry is deliberate in the
 * schema: a measurement's old value was observed and stays observed, whereas a
 * cohort's location is an identity attribute that was simply written down
 * wrong. ADR-102's rule applies — a name may be edited, a target may only be
 * superseded — and a plot is the former here. The before/after lands in
 * `AuditEvent`, which is append-only and is the record of what changed.
 *
 * Matching is by **exact cohort id**, never by location or by count. Every
 * precondition is asserted before anything is written, and a mismatch aborts
 * rather than guessing: this touches production rows for a farm that has
 * exactly one cohort, and getting it wrong twice would be worse than the
 * original error.
 *
 * Idempotent: run it again after `--apply` and it reports nothing to do.
 *
 * Usage:
 *   npm run data:mover-cohorte-lote4             (dry run; prints only)
 *   npm run data:mover-cohorte-lote4 -- --apply
 */
import "dotenv/config";
import { prisma } from "../lib/db";
import { recordAuditEvent } from "../lib/audit";

const REASON =
  "Corrección del dueño 2026-08-29: los 200 plantones de Caturra de Cafelino se " +
  "sembraron en el Lote 4, no en el Lote 3. El registro original transcribió mal " +
  "el lote; la siembra en sí no cambió.";

/** The one cohort this script may touch. */
const COHORT_ID = "e914e731-4fe2-40f0-be0b-b0be16f64db0";
const FROM_LOCATION_NAME = "Lote 3 — Finca Rosina";
const TO_LOCATION_NAME = "Lote 4 — Finca Rosina";

/**
 * Facts that must hold before anything is written. If the cohort in production
 * is not the one this script was written against, that is a reason to stop and
 * look, not to proceed against whatever is there.
 */
const EXPECTED_PLANT_COUNT = 200;
const EXPECTED_CULTIVAR = "Caturra";

class PreconditionError extends Error {}

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(apply ? "MODO: aplicar\n" : "MODO: simulación (usá --apply para escribir)\n");

  const actorEmail = process.env.NN_ACTOR_EMAIL;
  if (!actorEmail) throw new PreconditionError("Falta NN_ACTOR_EMAIL: el audit necesita un actor real.");
  const actor = await prisma.userAccount.findFirst({
    where: { person: { email: actorEmail } },
    select: { id: true, person: { select: { displayName: true } } },
  });
  if (!actor) throw new PreconditionError(`No hay UserAccount para ${actorEmail}.`);

  const cohort = await prisma.plantingCohort.findUnique({
    where: { id: COHORT_ID },
    include: {
      location: { select: { id: true, name: true } },
      cultivarValue: { select: { value: true } },
      plantingEvents: { select: { id: true, eventType: true, quantity: true, locationId: true } },
    },
  });
  if (!cohort) throw new PreconditionError(`No existe la cohorte ${COHORT_ID}.`);

  const destino = await prisma.location.findFirst({
    where: { name: TO_LOCATION_NAME },
    select: { id: true, name: true, locationType: true },
  });
  if (!destino) throw new PreconditionError(`No existe la ubicación "${TO_LOCATION_NAME}".`);
  if (destino.locationType !== "plot") {
    throw new PreconditionError(`"${TO_LOCATION_NAME}" es ${destino.locationType}, no un plot.`);
  }

  // Idempotencia antes que preconditions de origen: una segunda corrida no es
  // un error, es una no-operación.
  if (cohort.location.id === destino.id) {
    console.log(`La cohorte ya está en ${destino.name}. Nada que hacer.`);
    return;
  }

  if (cohort.location.name !== FROM_LOCATION_NAME) {
    throw new PreconditionError(
      `La cohorte está en "${cohort.location.name}", no en "${FROM_LOCATION_NAME}". Abortando.`,
    );
  }
  if (cohort.plantCount !== EXPECTED_PLANT_COUNT) {
    throw new PreconditionError(`plantCount es ${cohort.plantCount}, se esperaba ${EXPECTED_PLANT_COUNT}.`);
  }
  if (cohort.cultivarValue?.value !== EXPECTED_CULTIVAR) {
    throw new PreconditionError(`cultivar es ${cohort.cultivarValue?.value}, se esperaba ${EXPECTED_CULTIVAR}.`);
  }

  const eventosAMover = cohort.plantingEvents.filter((e) => e.locationId === cohort.location.id);

  console.log(`actor: ${actor.person?.displayName ?? actorEmail}`);
  console.log(`cohorte ${cohort.id}`);
  console.log(`  ${cohort.location.name}  ->  ${destino.name}`);
  console.log(`  ${cohort.plantCount} plantas de ${cohort.cultivarValue?.value}`);
  for (const e of eventosAMover) {
    console.log(`  evento ${e.id} (${e.eventType}, ${e.quantity})  ->  ${destino.name}`);
  }
  const quedanFuera = cohort.plantingEvents.length - eventosAMover.length;
  if (quedanFuera > 0) {
    console.log(`  ${quedanFuera} evento(s) ligado(s) en otra ubicación: NO se tocan.`);
  }

  if (!apply) {
    console.log("\nSimulación: no se escribió nada.");
    return;
  }

  const antesCohorte = await prisma.plantingCohort.findUniqueOrThrow({ where: { id: cohort.id } });
  const antesEventos = await prisma.plantingEvent.findMany({
    where: { id: { in: eventosAMover.map((e) => e.id) } },
  });

  // Las dos filas se mueven juntas o no se mueve ninguna: una cohorte en el
  // Lote 4 cuyo propio evento sigue diciendo Lote 3 es peor que el error que
  // se está corrigiendo.
  //
  // El audit va DENTRO, desde el 2026-09-06. Este comentario decía lo contrario
  // y su premisa era falsa: afirmaba que `recordAuditEvent` «usa el cliente
  // global, sin aceptar un handle de transacción». Lo acepta desde el
  // 2026-08-31 —un segundo argumento opcional— así que la ventana que el
  // comentario daba por inevitable llevaba semanas siendo evitable. La
  // justificación caducó y el código se quedó con ella.
  //
  // Las filas y sus AuditEvent se mueven juntos o no se mueve nada: una cohorte
  // en el Lote 4 cuyo propio evento sigue diciendo Lote 3 es peor que el error
  // que se está corrigiendo, y una corrección sin su fila de auditoría es
  // exactamente lo que un registro de auditoría existe para impedir.
  const { despuesCohorte, despuesEventos } = await prisma.$transaction(async (tx) => {
    const dc = await tx.plantingCohort.update({
      where: { id: cohort.id },
      data: { locationId: destino.id },
    });
    const de = [];
    for (const e of eventosAMover) {
      de.push(await tx.plantingEvent.update({ where: { id: e.id }, data: { locationId: destino.id } }));
    }

    await recordAuditEvent(
      {
        actorUserAccountId: actor.id,
        operation: "planting_cohort.correct_location",
        entityType: "planting_cohort",
        entityId: cohort.id,
        before: antesCohorte,
        after: dc,
        reason: REASON,
        sourceInterface: "scripts/p1-mover-cohorte-lote4.ts",
      },
      tx,
    );

    for (const despues of de) {
      const antes = antesEventos.find((a) => a.id === despues.id);
      await recordAuditEvent(
        {
          actorUserAccountId: actor.id,
          operation: "planting_event.correct_location",
          entityType: "planting_event",
          entityId: despues.id,
          before: antes,
          after: despues,
          reason: REASON,
          sourceInterface: "scripts/p1-mover-cohorte-lote4.ts",
        },
        tx,
      );
    }

    return { despuesCohorte: dc, despuesEventos: de };
  });

  console.log("\nAplicado. Releyendo desde la base:");
  const releido = await prisma.plantingCohort.findUniqueOrThrow({
    where: { id: cohort.id },
    include: { location: { select: { name: true } }, plantingEvents: { select: { id: true, location: { select: { name: true } } } } },
  });
  console.log(`  cohorte -> ${releido.location.name}`);
  for (const e of releido.plantingEvents) console.log(`  evento ${e.id} -> ${e.location.name}`);
}

main()
  .catch((err) => {
    if (err instanceof PreconditionError) {
      console.error(`\nPRECONDICIÓN FALLIDA: ${err.message}`);
      process.exitCode = 2;
      return;
    }
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
