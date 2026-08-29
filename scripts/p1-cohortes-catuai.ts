/**
 * Record the ~2.500 Catuaí of Finca Rosina as three PlantingCohorts, one per
 * block (product owner, 2026-08-29).
 *
 * This is the farm's actual production base and none of it was in the database:
 * before this script Finca Rosina had one cohort — the 200 Caturra planted in
 * Lote 4 in August 2026, which will not bear for years — and the trees that
 * will actually be harvested were invisible. Recorded now because February is
 * when that stops being a documentation gap and becomes an unmeasurable
 * harvest.
 *
 * The owner's statement: *"son 2500 catuaí repartidos parejo en lotes 1, 2 y
 * 3"*, consistent with `docs/implementation/27_A7_...md` §5 ("~2.500 plantas de
 * Catuaí de 3–4 años" in Lotes 1–3).
 *
 * Three decisions the owner made when asked, none of them inferred here:
 *
 * **`plantedAt` stays NULL.** A7 was written 2026-08-13 and says "3–4 años,"
 * which places planting in 2022 *or* 2023. The owner does not know which.
 * `HarvestWindowPrecision` has no coarser step than `year`, so recording a year
 * would mean choosing one of two — precision that does not exist, about the
 * exact field used later to interpret yield by tree age. It stays missing and
 * says so, per CLAUDE.md §3. The age range is in `notes`, as prose that claims
 * nothing.
 *
 * **833 per block, not 834/833/833.** 2500 does not divide by three, and
 * "parejo" is the owner's word. Handing the spare tree to one block would be a
 * decision made here rather than a fact from the farm; the resulting 2499 is
 * well inside a total that A7 itself writes with a tilde.
 *
 * **`direct_observation` + `provisional`.** The owner has seen these trees;
 * there is no planting record behind them, so `original_record` would overstate
 * it — the schema comment on `provenanceClass` draws exactly this line. The
 * count is approximate and the per-block figure is derived from a total rather
 * than counted in the block, which is what `provisional` says.
 *
 * Goes through `createPlantingCohort`, so RBAC and the audit record are the
 * service layer's, not this script's. Refuses any block that already has a
 * cohort rather than adding a second one — this is a one-time backfill, and a
 * duplicated 833 would be indistinguishable from a real second planting.
 *
 * Usage:
 *   npm run data:cohortes-catuai             (dry run; prints only)
 *   npm run data:cohortes-catuai -- --apply
 */
import "dotenv/config";
import { prisma } from "../lib/db";
import { createPlantingCohort } from "../lib/traceability/plantingCohorts";

const CULTIVAR = "Catuaí";
const PLANT_COUNT_PER_BLOCK = 833;
const TOTAL_DECLARADO = 2500;

const BLOQUES = ["Lote 1 — Finca Rosina", "Lote 2 — Finca Rosina", "Lote 3 — Finca Rosina"] as const;

const NOTES =
  `Parte de los ~${TOTAL_DECLARADO} Catuaí repartidos parejo entre los Lotes 1, 2 y 3 ` +
  `(dueño, 2026-08-29). El conteo por lote es derivado del total, no contado en el lote: ` +
  `${TOTAL_DECLARADO} entre tres no da entero y ningún lote se lleva la planta sobrante. ` +
  `Edad: 3–4 años al 2026-08-13 según A7, o sea sembrados en 2022 o 2023 — no se sabe ` +
  `cuál, así que plantedAt queda nulo en vez de elegir un año.`;

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

  // El valor canónico, no un alias: "Catuai" sin tilde existe como alias y
  // `createPlantingCohort` lo resolvería igual, pero pedir el canónico acá
  // hace que un catálogo re-sembrado distinto falle ruidosamente.
  const cultivar = await prisma.variableCatalogValue.findFirst({
    where: { value: CULTIVAR, catalog: { name: "Cultivar" } },
    select: { id: true, aliasOfId: true },
  });
  if (!cultivar) throw new PreconditionError(`No existe el cultivar "${CULTIVAR}" en el catálogo Cultivar.`);
  if (cultivar.aliasOfId) throw new PreconditionError(`"${CULTIVAR}" es un alias; se esperaba el valor canónico.`);

  const objetivos = [];
  for (const nombre of BLOQUES) {
    const loc = await prisma.location.findFirst({
      where: { name: nombre },
      select: { id: true, name: true, locationType: true, _count: { select: { plantingCohorts: true } } },
    });
    if (!loc) throw new PreconditionError(`No existe la ubicación "${nombre}".`);
    if (loc.locationType !== "plot") {
      throw new PreconditionError(`"${nombre}" es ${loc.locationType}, no un plot.`);
    }
    objetivos.push(loc);
  }

  const yaTienen = objetivos.filter((o) => o._count.plantingCohorts > 0);
  if (yaTienen.length === objetivos.length) {
    console.log("Los tres lotes ya tienen cohorte. Nada que hacer.");
    return;
  }
  if (yaTienen.length > 0) {
    throw new PreconditionError(
      `Estos lotes ya tienen cohorte: ${yaTienen.map((o) => o.name).join(", ")}. ` +
        `Una corrida parcial anterior dejó el registro a medias — revisalo a mano antes de seguir.`,
    );
  }

  console.log(`actor: ${actor.person?.displayName ?? actorEmail}`);
  console.log(`cultivar: ${CULTIVAR} (${cultivar.id})`);
  for (const o of objetivos) {
    console.log(`  ${o.name}  ->  ${PLANT_COUNT_PER_BLOCK} plantas, sin fecha de siembra`);
  }
  console.log(`  total registrado: ${PLANT_COUNT_PER_BLOCK * objetivos.length} de ~${TOTAL_DECLARADO} declarados`);
  console.log("  provenance: direct_observation | dataQuality: provisional");

  if (!apply) {
    console.log("\nSimulación: no se escribió nada.");
    return;
  }

  for (const o of objetivos) {
    const cohorte = await createPlantingCohort(actor.id, {
      locationId: o.id,
      cultivarValueId: cultivar.id,
      plantCount: PLANT_COUNT_PER_BLOCK,
      provenanceClass: "direct_observation",
      dataQuality: "provisional",
      notes: NOTES,
    });
    console.log(`  ${o.name}: cohorte ${cohorte.id}`);
  }

  console.log("\nAplicado. Releyendo desde la base:");
  for (const o of objetivos) {
    const cs = await prisma.plantingCohort.findMany({
      where: { locationId: o.id },
      select: { id: true, plantCount: true, plantedAt: true, dataQuality: true, cultivarValue: { select: { value: true } } },
    });
    for (const c of cs) {
      console.log(
        `  ${o.name}: ${c.plantCount} ${c.cultivarValue?.value}, ` +
          `plantedAt ${c.plantedAt ?? "NULL"}, dataQuality ${c.dataQuality}`,
      );
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
