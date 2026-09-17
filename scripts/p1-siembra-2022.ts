/**
 * La siembra de 2022 en Finca Rosina, contada por Bob Huerbsch (2026-09-16).
 *
 * **Es la siembra real de la finca y no estaba en el sistema.** Medido antes de
 * escribir esto: había DOS `PlantingEvent` en toda la base. Las 2.500 chapolas
 * que hoy son el cafetal se plantaron en 2022 y nadie las registró.
 *
 * LA CADENA, tal como la contó Bob, y cada eslabón importa:
 *
 *   30 plantas originales, seleccionadas siete años después
 *   → cerezas cosechadas en NOVIEMBRE 2021
 *   → secadas y puestas en arena en el semillero desde ENERO 2022
 *   → 25 DE FEBRERO 2022: las chapolas salen de la arena a bolsas con tierra
 *   → ABRIL a AGOSTO 2022: se plantan en Finca Rosina, 2.500 en total
 *
 * **Procedencia: `direct_observation` + `missing_source_record`.** Bob estuvo
 * ahí, así que no es una interpretación: es lo que vio. Pero el registro de
 * 2022 **no existe** —se cuenta de memoria cuatro años después—, y ese valor
 * significa exactamente eso. Marcarlo como `measured_fact` sería fingir un
 * cuaderno que nadie llevó.
 *
 * **Por qué se parte el Lote 2 en 2A y 2B.** Decisión de Daniel, 2026-09-16.
 * El 2A es el cerro de la antena: se sembró en junio 2022 igual que el 2B, y
 * **casi no produjo**. No se va a trabajar, y se registra precisamente por eso
 * — una parcela que falló es un dato, y borrarla del mapa hace que el sistema
 * no pueda explicar por qué el rendimiento de la finca no cuadra. Con parcela
 * propia, el 2A tiene su ficha y su rendimiento; dentro del Lote 2 quedaría
 * escondido detrás del promedio.
 *
 * Usage:
 *   npm run data:siembra-2022             (simulación)
 *   npm run data:siembra-2022 -- --apply
 */
import "dotenv/config";
import { prisma } from "../lib/db";
import { recordAuditEvent } from "../lib/audit";

const FINCA = "Finca Rosina";
const CULTIVAR = "Catuaí";
const TOTAL_CHAPOLAS = 2500;

/**
 * **PENDIENTE DE DANIEL: el reparto por lote.** Él dijo 2.500 en total y que
 * daría las cuatro cifras. Mientras sean `null`, el guion registra la cohorte
 * con su fecha y su lote y deja `plantCount` nulo, con el total en la nota.
 * Repartir 625 a cada uno sería inventar: el cerro de la antena no tiene por
 * qué llevar las mismas que el Lote 1.
 */
const PLANTAS_POR_LOTE: Record<string, number | null> = {
  "Lote 1": null,
  "Lote 2A": null,
  "Lote 2B": null,
  "Lote 3": null,
};

interface Siembra {
  readonly lote: string;
  readonly fecha: Date;
  /** `date` cuando Daniel dio el día exacto; `month` cuando sólo dio el mes. */
  readonly precision: "date" | "month";
  readonly nota: string;
}

const SIEMBRAS: readonly Siembra[] = [
  {
    lote: "Lote 1",
    fecha: new Date("2022-04-29T00:00:00Z"),
    precision: "date",
    nota: "Primera siembra de la cohorte 2022.",
  },
  {
    lote: "Lote 2A",
    fecha: new Date("2022-06-01T00:00:00Z"),
    precision: "month",
    nota:
      "CERRO DE LA ANTENA. Las plantas no prendieron bien y la producción fue casi nula. " +
      "No se va a trabajar, y se registra justamente por eso: una parcela que falló explica " +
      "parte del rendimiento de la finca, y borrarla del mapa deja ese hueco sin causa.",
  },
  {
    lote: "Lote 2B",
    fecha: new Date("2022-06-01T00:00:00Z"),
    precision: "month",
    nota: "Segunda siembra de junio 2022, la parte que sí prendió.",
  },
  {
    lote: "Lote 3",
    fecha: new Date("2022-08-01T00:00:00Z"),
    precision: "month",
    nota: "Última siembra de la cohorte 2022.",
  },
];

const ORIGEN =
  "CADENA DEL SEMILLERO, contada por Bob Huerbsch el 2026-09-16 y sin registro de la época: " +
  "30 plantas originales seleccionadas siete años después; cerezas cosechadas en noviembre de " +
  "2021; secadas y puestas en arena en el semillero desde enero de 2022; el 25 de febrero de " +
  "2022 las chapolas salen de la arena a bolsas plásticas con tierra; de abril a agosto de 2022 " +
  `se plantan en Finca Rosina, ${TOTAL_CHAPOLAS} chapolas en total repartidas entre estos lotes.`;

class PreconditionError extends Error {}

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(apply ? "MODO: aplicar\n" : "MODO: simulación (usá --apply para escribir)\n");

  const actorEmail = process.env.NN_ACTOR_EMAIL;
  if (!actorEmail) throw new PreconditionError("Falta NN_ACTOR_EMAIL.");
  const actor = await prisma.userAccount.findFirst({
    where: { person: { email: actorEmail } },
    select: { id: true, person: { select: { displayName: true } } },
  });
  if (!actor) throw new PreconditionError(`No hay UserAccount para ${actorEmail}.`);

  const finca = await prisma.location.findFirst({
    where: { name: FINCA, locationType: "site" },
    select: { id: true, organizationId: true, classification: true },
  });
  if (!finca) throw new PreconditionError(`No existe el sitio "${FINCA}".`);

  const cultivar = await prisma.variableCatalogValue.findFirst({
    where: { value: CULTIVAR, catalog: { key: "cultivar" } },
    select: { id: true, value: true },
  });
  if (!cultivar) throw new PreconditionError(`No existe el cultivar "${CULTIVAR}" en el catálogo.`);

  // Bob es quien lo cuenta, y se guarda como operario del evento para que la
  // atribución viaje con el dato en vez de vivir sólo en una nota.
  const bob = await prisma.person.findFirst({
    where: { givenName: "Bob", familyName: "Huerbsch" },
    select: { id: true, displayName: true },
  });
  if (!bob) throw new PreconditionError('No existe la persona "Bob Huerbsch".');

  console.log(`actor:    ${actor.person?.displayName ?? actorEmail}`);
  console.log(`relata:   ${bob.displayName}`);
  console.log(`cultivar: ${cultivar.value}`);
  console.log(`total:    ${TOTAL_CHAPOLAS} chapolas, reparto por lote ${Object.values(PLANTAS_POR_LOTE).every((v) => v === null) ? "SIN DAR (queda nulo)" : "declarado"}`);
  console.log("");

  const resultados: { lote: string; accion: string }[] = [];

  for (const siembra of SIEMBRAS) {
    const nombre = `${siembra.lote} — ${FINCA}`;
    let loc = await prisma.location.findFirst({ where: { name: nombre }, select: { id: true } });
    const nace = !loc;

    if (!loc && !apply) {
      resultados.push({ lote: siembra.lote, accion: "crear parcela + cohorte + evento" });
      continue;
    }
    if (!loc) {
      loc = await prisma.location.create({
        data: {
          name: nombre,
          locationType: "plot",
          parentLocationId: finca.id,
          organizationId: finca.organizationId,
          classification: finca.classification,
          description: siembra.nota,
        },
        select: { id: true },
      });
      await recordAuditEvent({
        actorUserAccountId: actor.id,
        operation: "location.create",
        sourceInterface: "traceability.service",
        entityType: "location",
        entityId: loc.id,
        after: { name: nombre },
      });
    }

    const yaCohorte = await prisma.plantingCohort.findFirst({
      where: { locationId: loc.id, plantedAt: siembra.fecha },
      select: { id: true },
    });
    if (yaCohorte) {
      resultados.push({ lote: siembra.lote, accion: `ya tiene cohorte (${yaCohorte.id}) — nada que hacer` });
      continue;
    }

    if (!apply) {
      resultados.push({ lote: siembra.lote, accion: `${nace ? "crear parcela, " : ""}crear cohorte + evento` });
      continue;
    }

    const cohorte = await prisma.plantingCohort.create({
      data: {
        locationId: loc.id,
        cultivarValueId: cultivar.id,
        plantedAt: siembra.fecha,
        plantedPrecision: siembra.precision,
        plantCount: PLANTAS_POR_LOTE[siembra.lote] ?? null,
        status: "active",
        notes: `${siembra.nota} ${ORIGEN}`,
        provenanceClass: "direct_observation",
        dataQuality: "missing_source_record",
      },
    });

    await prisma.plantingEvent.create({
      data: {
        locationId: loc.id,
        eventType: "planted",
        varietal: cultivar.value,
        quantity: PLANTAS_POR_LOTE[siembra.lote] ?? null,
        plantingCohortId: cohorte.id,
        occurredAt: siembra.fecha,
        operatorPersonId: bob.id,
        notes: siembra.nota,
        provenanceClass: "direct_observation",
        dataQuality: "missing_source_record",
        createdBy: actor.id,
      },
    });

    resultados.push({ lote: siembra.lote, accion: `cohorte ${cohorte.id} + evento` });
  }

  for (const r of resultados) console.log(`  ${r.lote.padEnd(9)} ${r.accion}`);
  if (!apply) console.log("\nSimulación: no se escribió nada.");
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
