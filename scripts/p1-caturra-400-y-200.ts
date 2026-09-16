/**
 * Los Caturra son 400 en el Lote 4 y 200 en el Lote 5 (dueño, 2026-09-16).
 *
 * **Qué estaba mal y por qué se puede saber.** El registro tiene UNA cohorte de
 * 200 Caturra en el Lote 4 — la que `p1-mover-cohorte-lote4.ts` movió desde el
 * Lote 3 el 2026-08-29 corrigiendo un error de transcripción. El dueño confirma
 * ahora que son **dos siembras distintas**: ~400 junto al Catuaí (Lote 4, al norte
 * del Lote 2) y ~200 junto al beneficio (Lote 5, a su lado oeste).
 *
 * Y el esquema lo corrobora sin que nadie tenga que fiarse de la memoria:
 * `PlantingEventType.received` documenta **600 plantones de Caturra llegados de
 * Cafelino el 2026-08-08**. 400 + 200 = 600. Las dos cohortes salen de la misma
 * llegada, así que lo que falla es el reparto, no el origen.
 *
 * **Por qué se EDITA el conteo en vez de superseder.** `PlantingCohort` no tiene
 * `correctsId`, y esa asimetría es deliberada —la razón está escrita en
 * `p1-mover-cohorte-lote4.ts`—: la lectura de una medición fue observada y se
 * queda observada, mientras que el conteo de una cohorte se escribió mal. ADR-102:
 * un nombre se edita, un objetivo sólo se supersede. El antes y el después quedan
 * en `AuditEvent`, que es de sólo añadir.
 *
 * **Lo que este script NO afirma.** No toca `plantedAt` —sigue siendo agosto de
 * 2026, y nadie replantó nada— ni inventa un origen para el Lote 5: hereda el de la
 * llegada de Cafelino, que es un hecho registrado, no una deducción.
 *
 * Usage:
 *   npm run data:caturra-400-200             (simulación; sólo imprime)
 *   npm run data:caturra-400-200 -- --apply
 */
import "dotenv/config";
import { prisma } from "../lib/db";
import { recordAuditEvent } from "../lib/audit";
import { createPlantingCohort } from "../lib/traceability/plantingCohorts";

const CULTIVAR = "Caturra";
const LOTE_4 = "Lote 4 — Finca Rosina";
const LOTE_5 = "Lote 5 — Finca Rosina";
const CONTEO_ACTUAL_ESPERADO = 200;
const CONTEO_LOTE_4 = 400;
const CONTEO_LOTE_5 = 200;

const RAZON =
  "Corrección del dueño 2026-09-16: los Caturra de la llegada de Cafelino " +
  "(600 plantones, 2026-08-08) se repartieron en DOS lotes — ~400 en el Lote 4, " +
  "junto al Catuaí, y ~200 en el Lote 5, junto al beneficio. El registro tenía los " +
  "200 enteros en el Lote 4: el conteo se transcribió mal, la siembra no cambió.";

const NOTAS_LOTE_5 =
  "~200 Caturra junto al beneficio, a su lado oeste y al suroeste del Lote 1 " +
  "(dueño, 2026-09-16). Marco 1,8 × 1,8. Misma llegada de Cafelino que los ~400 del " +
  "Lote 4: 400 + 200 = los 600 plantones recibidos el 2026-08-08. `plantedAt` se " +
  "hereda del reparto, no se inventa: si no se conoce el día exacto de esta mitad, " +
  "queda nulo antes que elegir uno.";

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

  const cultivar = await prisma.variableCatalogValue.findFirst({
    where: { value: CULTIVAR, catalog: { name: "Cultivar" } },
    select: { id: true, aliasOfId: true },
  });
  if (!cultivar) throw new PreconditionError(`No existe el cultivar "${CULTIVAR}".`);
  if (cultivar.aliasOfId) throw new PreconditionError(`"${CULTIVAR}" es un alias; se esperaba el canónico.`);

  const lote4 = await prisma.location.findFirst({ where: { name: LOTE_4 }, select: { id: true, name: true } });
  const lote5 = await prisma.location.findFirst({ where: { name: LOTE_5 }, select: { id: true, name: true } });
  if (!lote4) throw new PreconditionError(`No existe "${LOTE_4}".`);
  if (!lote5) throw new PreconditionError(`No existe "${LOTE_5}". Hay que crear la parcela antes.`);

  // La cohorte se busca por lote + cultivar + el conteo que se espera CORREGIR.
  // Si en producción hay otra cosa, esto para y se mira: el script se escribió
  // contra un estado concreto, no contra «lo que haya».
  const enLote4 = await prisma.plantingCohort.findMany({
    where: { locationId: lote4.id, cultivarValueId: cultivar.id },
    select: { id: true, plantCount: true, plantedAt: true, notes: true },
  });
  if (enLote4.length !== 1) {
    throw new PreconditionError(`Se esperaba UNA cohorte de ${CULTIVAR} en ${LOTE_4}; hay ${enLote4.length}.`);
  }
  const cohorte = enLote4[0]!;
  if (cohorte.plantCount !== CONTEO_ACTUAL_ESPERADO) {
    throw new PreconditionError(
      `La cohorte de ${LOTE_4} tiene ${cohorte.plantCount} plantas y se esperaban ${CONTEO_ACTUAL_ESPERADO}. ` +
        `Alguien ya la tocó: revisar a mano antes de seguir.`,
    );
  }

  const yaEnLote5 = await prisma.plantingCohort.count({ where: { locationId: lote5.id, cultivarValueId: cultivar.id } });
  if (yaEnLote5 > 0) {
    throw new PreconditionError(`${LOTE_5} ya tiene ${yaEnLote5} cohorte(s) de ${CULTIVAR}: este script ya corrió.`);
  }

  console.log(`actor: ${actor.person?.displayName ?? actorEmail}`);
  console.log(`  ${LOTE_4}: cohorte ${cohorte.id} · ${cohorte.plantCount} -> ${CONTEO_LOTE_4} plantas`);
  console.log(`  ${LOTE_5}: cohorte NUEVA de ${CONTEO_LOTE_5} plantas, marco 1,8 × 1,8`);
  console.log(`  plantedAt del Lote 4: ${cohorte.plantedAt ?? "NULL"} (NO se toca)`);
  console.log(`  400 + 200 = 600, los plantones recibidos de Cafelino el 2026-08-08`);

  if (!apply) {
    console.log("\nSimulación: no se escribió nada.");
    return;
  }

  // La edición y su AuditEvent, en la MISMA transacción: un conteo corregido cuyo
  // registro de auditoría se perdiera dejaría el cambio sin explicación.
  await prisma.$transaction(async (tx) => {
    const despues = await tx.plantingCohort.update({
      where: { id: cohorte.id },
      data: { plantCount: CONTEO_LOTE_4, notes: [cohorte.notes, RAZON].filter(Boolean).join(" · ") },
    });
    await recordAuditEvent(
      {
        actorUserAccountId: actor.id,
        operation: "planting_cohort.correct_count",
        entityType: "planting_cohort",
        entityId: cohorte.id,
        before: cohorte,
        after: despues,
        reason: RAZON,
        sourceInterface: "script.p1-caturra-400-y-200",
      },
      tx,
    );
  });
  console.log(`  ${LOTE_4}: corregida a ${CONTEO_LOTE_4}`);

  const nueva = await createPlantingCohort(actor.id, {
    locationId: lote5.id,
    cultivarValueId: cultivar.id,
    plantCount: CONTEO_LOTE_5,
    rowSpacingMeters: 1.8,
    plantSpacingMeters: 1.8,
    plantedAt: cohorte.plantedAt,
    plantedPrecision: cohorte.plantedAt ? "month" : null,
    provenanceClass: "direct_observation",
    dataQuality: "provisional",
    notes: NOTAS_LOTE_5,
  });
  console.log(`  ${LOTE_5}: creada ${nueva.id}`);

  console.log("\nAplicado. Releyendo desde la base:");
  for (const loc of [lote4, lote5]) {
    const cs = await prisma.plantingCohort.findMany({
      where: { locationId: loc.id },
      select: { plantCount: true, plantedAt: true, cultivarValue: { select: { value: true } } },
    });
    for (const c of cs) {
      console.log(`  ${loc.name}: ${c.plantCount} ${c.cultivarValue?.value ?? "?"}, plantedAt ${c.plantedAt ?? "NULL"}`);
    }
  }
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
