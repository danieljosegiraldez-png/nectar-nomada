/**
 * Lo NUEVO de la finca que no choca con nada: la Geisha, la Pink Bourbon
 * planificada, la cohorte original de 2017 y los marcos de siembra.
 *
 * **Por qué este script no toca los conteos de Catuaí.** El 2026-08-29 el dueño
 * declaró *"son 2500 catuaí repartidos parejo en lotes 1, 2 y 3"* y
 * `p1-cohortes-catuai.ts` los registró como 833 por bloque, con `plantedAt` nulo
 * a propósito porque A7 dice "3–4 años" y eso es 2022 *o* 2023. El 2026-09-15
 * llegó otra relación, con ~800 / ~800 / ~600 y una fecha exacta de 2022-04-28.
 * **Los dos no pueden ser ciertos**, y la diferencia se resuelve contando, no
 * eligiendo: decisión de Daniel ese día, «añade lo nuevo, no toques los conteos».
 * Así que aquí no se corrige ningún `plantCount` ni se rellena ningún
 * `plantedAt` de los existentes.
 *
 * Lo que SÍ entra es lo que no está en discusión con nada:
 *
 *   1. **Geisha**, ~115 plantas, marco 3,0 × 3,0. No estaba en la base.
 *   2. **Pink Bourbon**, 600, `status: planned` — decidida y NO plantada, con
 *      objetivo en octubre de 2026. Entra como planificada justamente para que
 *      no sume a los totales de plantado.
 *   3. **La cohorte original de 2017**: 30 Catuaí traídos de Café Ruiz (Boquete)
 *      por Sherry Huerbsch. Es una siembra DISTINTA de los 2.500 y por eso se
 *      añade en vez de modificar nada. De ella sobreviven entre 10 y 30 — un
 *      rango, que `plantCount` no puede guardar, así que el campo lleva las **30
 *      sembradas** (un hecho) y el rango de supervivientes va en notas hasta que
 *      el censo lo cuente.
 *   4. **Los marcos** de las cohortes que ya existen, donde el dueño los dio.
 *
 * Lo que NO entra, y hay que decirlo en voz alta:
 *
 *   - **Los ~200 Caturra del Lote 5.** La base ya tiene 200 Caturra sembrados en
 *     agosto de 2026, movidos al Lote 4 por `p1-mover-cohorte-lote4.ts`. Cargar
 *     otros 200 en el Lote 5 podría duplicar los mismos árboles, y no hay forma
 *     de saberlo desde aquí.
 *   - **Los ~400 Caturra del Lote 4**, por lo mismo: contra los 200 registrados.
 *   - **Las adyacencias** ("el 4 al norte del 2", "el 5 al oeste del beneficio").
 *     No hay columna, y la migración de adyacencia no se aprobó.
 *   - **El marco del Lote 3**, que el dueño da como desconocido.
 *
 * Usage:
 *   npm run data:geisha-y-marcos             (simulación; sólo imprime)
 *   npm run data:geisha-y-marcos -- --apply
 */
import "dotenv/config";
import { prisma } from "../lib/db";
import { createPlantingCohort } from "../lib/traceability/plantingCohorts";

class PreconditionError extends Error {}

/** Cohortes nuevas. `plantedAt` sólo donde se conoce de verdad. */
const NUEVAS = [
  {
    parcela: "Lote 6 — Finca Rosina",
    cultivar: "Geisha",
    plantCount: 115,
    rowSpacingMeters: 3.0,
    plantSpacingMeters: 3.0,
    plantedAt: null as Date | null,
    status: null as "planned" | null,
    notes:
      "~115 plantas, marco 3,0 × 3,0 (dueño, 2026-09-15). Fecha de siembra desconocida: " +
      "no se registra ningún año porque elegir uno sería inventar la precisión que falta. " +
      "Conteo estimado, pendiente de censo.",
  },
  {
    parcela: "Lote 7 — Finca Rosina",
    cultivar: "Pink Bourbon",
    plantCount: 600,
    rowSpacingMeters: 1.8,
    plantSpacingMeters: 2.5,
    plantedAt: null as Date | null,
    status: "planned" as const,
    notes:
      "PLANIFICADA, no sembrada (dueño, 2026-09-15): 600 plantas con objetivo de siembra en " +
      "octubre de 2026, marco 1,8 × 2,5. Entra como `planned` para que NO cuente en los " +
      "totales de plantado de la finca. El marco 1,8 × 2,5 es el motivo por el que existen " +
      "las columnas de calle y distancia entre plantas: un solo número obligaba a inventar uno.",
  },
  {
    parcela: "Lote 1 — Finca Rosina",
    cultivar: "Catuaí",
    plantCount: 30,
    rowSpacingMeters: 2.0,
    plantSpacingMeters: 2.0,
    plantedAt: new Date(Date.UTC(2017, 0, 1)),
    status: null as "planned" | null,
    notes:
      "Las 30 ORIGINALES de 2017 (dueño, 2026-09-15). Traídas de Café Ruiz, Boquete: María " +
      "Ruiz se las vendió a Sherry Huerbsch, que las transportó y las sembró en Cerro Azul. " +
      "Es una siembra distinta de los ~2.500 Catuaí de 2022/2023 y por eso es una cohorte " +
      "aparte. plantCount = 30 SEMBRADAS, que es el hecho; de ellas sobreviven entre 10 y 30, " +
      "y ese rango no cabe en un entero — lo cuenta el censo. plantedAt lleva precisión de " +
      "año porque el año se conoce y el día no.",
  },
] as const;

/** Marcos para cohortes que ya existen. No toca conteos ni fechas. */
const MARCOS = [
  { parcela: "Lote 2 — Finca Rosina", cultivar: "Catuaí", row: 2.0, plant: 2.0 },
] as const;

async function resolverCultivar(nombre: string) {
  const v = await prisma.variableCatalogValue.findFirst({
    where: { value: nombre, catalog: { name: "Cultivar" } },
    select: { id: true, aliasOfId: true },
  });
  if (!v) throw new PreconditionError(`No existe el cultivar "${nombre}" en el catálogo Cultivar.`);
  if (v.aliasOfId) throw new PreconditionError(`"${nombre}" es un alias; se esperaba el valor canónico.`);
  return v.id;
}

async function resolverParcela(nombre: string) {
  const loc = await prisma.location.findFirst({
    where: { name: nombre },
    select: { id: true, name: true, locationType: true },
  });
  if (!loc) {
    throw new PreconditionError(
      `No existe la ubicación "${nombre}". Hay que crear la parcela antes de darle una cohorte; ` +
        `este script no inventa parcelas.`,
    );
  }
  if (loc.locationType !== "plot") {
    throw new PreconditionError(`"${nombre}" es ${loc.locationType}, no un plot.`);
  }
  return loc;
}

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
  console.log(`actor: ${actor.person?.displayName ?? actorEmail}\n`);

  console.log("COHORTES NUEVAS");
  const planeadas = [];
  for (const n of NUEVAS) {
    const loc = await resolverParcela(n.parcela);
    const cultivarValueId = await resolverCultivar(n.cultivar);

    // Una cohorte nueva no debe pisar una igual de una corrida anterior. Se
    // compara por parcela + cultivar + conteo: los tres juntos identifican
    // estas tres sin ambigüedad, y las 30 de 2017 NO chocan con los 833 del
    // mismo lote y cultivar porque el conteo difiere.
    const yaEsta = await prisma.plantingCohort.findFirst({
      where: { locationId: loc.id, cultivarValueId, plantCount: n.plantCount },
      select: { id: true },
    });
    if (yaEsta) {
      console.log(`  ${n.parcela}: ${n.plantCount} ${n.cultivar} YA EXISTE (${yaEsta.id}) — se salta`);
      continue;
    }
    console.log(
      `  ${n.parcela}: ${n.plantCount} ${n.cultivar}, marco ${n.rowSpacingMeters} × ${n.plantSpacingMeters}` +
        `, ${n.status ?? "active"}, plantedAt ${n.plantedAt ? n.plantedAt.toISOString().slice(0, 10) + " (año)" : "NULL"}`,
    );
    planeadas.push({ ...n, locationId: loc.id, cultivarValueId });
  }

  console.log("\nMARCOS SOBRE COHORTES EXISTENTES (no toca conteos ni fechas)");
  const marcos = [];
  for (const m of MARCOS) {
    const loc = await resolverParcela(m.parcela);
    const cultivarValueId = await resolverCultivar(m.cultivar);
    const cs = await prisma.plantingCohort.findMany({
      where: { locationId: loc.id, cultivarValueId, rowSpacingMeters: null },
      select: { id: true, plantCount: true },
    });
    if (cs.length === 0) {
      console.log(`  ${m.parcela}: ninguna cohorte de ${m.cultivar} sin marco — nada que hacer`);
      continue;
    }
    if (cs.length > 1) {
      throw new PreconditionError(
        `${m.parcela} tiene ${cs.length} cohortes de ${m.cultivar} sin marco. ` +
          `Cuál lleva el 2,0 × 2,0 es una decisión de campo, no de este script.`,
      );
    }
    console.log(`  ${m.parcela}: cohorte ${cs[0]!.id} (${cs[0]!.plantCount} plantas) -> ${m.row} × ${m.plant}`);
    marcos.push({ id: cs[0]!.id, row: m.row, plant: m.plant });
  }

  if (!apply) {
    console.log("\nSimulación: no se escribió nada.");
    return;
  }

  for (const p of planeadas) {
    const c = await createPlantingCohort(actor.id, {
      locationId: p.locationId,
      cultivarValueId: p.cultivarValueId,
      plantCount: p.plantCount,
      plantedAt: p.plantedAt,
      plantedPrecision: p.plantedAt ? "year" : null,
      rowSpacingMeters: p.rowSpacingMeters,
      plantSpacingMeters: p.plantSpacingMeters,
      status: p.status,
      // Reconstruido de lo que el dueño recuerda y declara, no transcrito de un
      // registro de siembra. ADR-038: decir cuál de los dos es no es un matiz.
      provenanceClass: "direct_observation",
      dataQuality: "provisional",
      notes: p.notes,
    });
    console.log(`  creada ${c.id} en ${p.parcela}`);
  }

  for (const m of marcos) {
    await prisma.plantingCohort.update({
      where: { id: m.id },
      data: { rowSpacingMeters: m.row, plantSpacingMeters: m.plant },
    });
    console.log(`  marco puesto en ${m.id}`);
  }

  console.log("\nAplicado. Releyendo desde la base:");
  const todas = await prisma.plantingCohort.findMany({
    where: { location: { name: { contains: "Finca Rosina" } } },
    select: {
      plantCount: true, status: true, plantedAt: true,
      rowSpacingMeters: true, plantSpacingMeters: true,
      location: { select: { name: true } },
      cultivarValue: { select: { value: true } },
    },
    orderBy: [{ location: { name: "asc" } }, { plantCount: "asc" }],
  });
  for (const c of todas) {
    console.log(
      `  ${c.location.name}: ${c.plantCount} ${c.cultivarValue?.value ?? "?"} [${c.status}] ` +
        `marco ${c.rowSpacingMeters ?? "?"} × ${c.plantSpacingMeters ?? "?"} ` +
        `plantedAt ${c.plantedAt ? c.plantedAt.toISOString().slice(0, 10) : "NULL"}`,
    );
  }
  const plantados = todas.filter((c) => c.status !== "planned").reduce((s, c) => s + (c.plantCount ?? 0), 0);
  const planificados = todas.filter((c) => c.status === "planned").reduce((s, c) => s + (c.plantCount ?? 0), 0);
  console.log(`\n  total PLANTADO: ${plantados}    total PLANIFICADO: ${planificados}`);
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
