/**
 * El biochar de julio 2023 en Finca Rosina — observación de Bob Huerbsch
 * (rjhuerbsch@gmail.com), fechada el 21 de julio de 2023.
 *
 * LO QUE PASÓ, tal como lo contó: un año después de la siembra de 2022 se hizo
 * **un hoyo extra entre cada hilera, en todos los lotes**, con una carga extra
 * de **biochar activado con noria** — incluido el 2A, el cerro de la antena,
 * que aun así no prendió bien.
 *
 * **POR QUÉ NO VA POR `applyAmendment()`, y es la decisión de diseño de este
 * guion.** Esa función existe y aplica un lote de biochar a una ubicación —
 * pero exige un `protocolVersionId`: es la maquinaria de INVESTIGACIÓN, con sus
 * tratamientos T0–T4 del marco. Lo de 2023 no fue un ensayo, fue una faena de
 * la finca. Meterlo por ahí inventaría un protocolo y dejaría una práctica
 * agrícola registrada como ciencia que nadie diseñó.
 *
 * **Y ahí está el hueco real, medido el 2026-09-16:** aplicar un lote de
 * biochar a una parcela FUERA de un protocolo de investigación no tiene modelo.
 * Se usa `MaterialConsumptionEntry`, que sí es de faena —ubicación, material,
 * cantidad, operario— y se enlaza al lote de biochar **por su código**, en
 * `batchLabel`, porque la clave foránea entre los dos no existe. Se dice aquí
 * en vez de fingir que el enlace es fuerte.
 *
 * Usage:
 *   npm run data:biochar-2023             (simulación)
 *   npm run data:biochar-2023 -- --apply
 */
import "dotenv/config";
import { prisma } from "../lib/db";
import { recordAuditEvent } from "../lib/audit";

const FINCA = "Finca Rosina";
const CODIGO_LOTE = "FR-BC-2023-001";
const FECHA = new Date("2023-07-21T00:00:00Z");

/**
 * **PENDIENTE DE DANIEL.** Dónde se produjo el biochar y cuánto se aplicó por
 * parcela. `BiocharBatch.producedAtLocationId` es OBLIGATORIO —es el ancla de
 * RBAC, sin ámbito no hay autorización que comprobar— así que sin este dato el
 * guion se niega en vez de suponer que se hizo en la finca.
 */
const PRODUCIDO_EN: string | null = null;
const KG_POR_PARCELA: number | null = null;

const MATERIA_PRIMA =
  "Sin declarar. Bob contó la activación —con noria— pero no de qué se hizo el biochar.";

const OBSERVACION =
  "Un año después de la siembra de 2022 se abrió UN HOYO EXTRA ENTRE CADA HILERA en todos " +
  "los lotes y se aplicó una carga extra de biochar activado con noria. Incluyó el Lote 2A, " +
  "el cerro de la antena, que aun así no prendió bien: la enmienda no revirtió el fallo de " +
  "esa parcela. Observación de Bob Huerbsch (rjhuerbsch@gmail.com), 21 de julio de 2023, " +
  "contada el 2026-09-16 y sin registro de la época.";

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
    select: { id: true, organizationId: true },
  });
  if (!finca) throw new PreconditionError(`No existe el sitio "${FINCA}".`);
  // `Location.organizationId` es anulable y `BiocharBatch.organizationId` no.
  // Se comprueba en vez de forzarlo: un lote de biochar sin organización no
  // tiene contra qué resolver el RBAC.
  if (!finca.organizationId) throw new PreconditionError(`"${FINCA}" no tiene organización.`);

  const bob = await prisma.person.findFirst({
    where: { givenName: "Bob", familyName: "Huerbsch" },
    select: { id: true, displayName: true },
  });
  if (!bob) throw new PreconditionError('No existe la persona "Bob Huerbsch".');

  const parcelas = await prisma.location.findMany({
    where: { parentLocationId: finca.id, locationType: "plot" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  if (parcelas.length === 0) throw new PreconditionError(`"${FINCA}" no tiene parcelas.`);

  console.log(`actor:    ${actor.person?.displayName ?? actorEmail}`);
  console.log(`observa:  ${bob.displayName} · ${FECHA.toISOString().slice(0, 10)}`);
  console.log(`parcelas: ${parcelas.length} — ${parcelas.map((p) => p.name.replace(` — ${FINCA}`, "")).join(", ")}`);
  console.log(`lote:     ${CODIGO_LOTE} · activado con noria`);

  if (!PRODUCIDO_EN) {
    throw new PreconditionError(
      "Falta dónde se PRODUJO el biochar. `BiocharBatch.producedAtLocationId` es obligatorio " +
        "—es el ancla de RBAC— y este guion no lo supone. Poné `PRODUCIDO_EN` con el nombre de " +
        "la ubicación y volvé a correrlo.",
    );
  }

  const produccion = await prisma.location.findFirst({
    where: { name: PRODUCIDO_EN },
    select: { id: true, name: true },
  });
  if (!produccion) throw new PreconditionError(`No existe la ubicación "${PRODUCIDO_EN}".`);
  console.log(`producido en: ${produccion.name}`);
  console.log(`dosis:    ${KG_POR_PARCELA === null ? "SIN DAR (queda nula)" : `${KG_POR_PARCELA} kg por parcela`}`);

  const ya = await prisma.biocharBatch.findFirst({ where: { batchCode: CODIGO_LOTE }, select: { id: true } });
  if (ya) throw new PreconditionError(`El lote "${CODIGO_LOTE}" ya existe (${ya.id}): este guion ya corrió.`);

  if (!apply) {
    console.log(`\n  crearía: 1 lote de biochar + ${parcelas.length} aplicaciones (una por parcela)`);
    console.log("\nSimulación: no se escribió nada.");
    return;
  }

  // El lote y su auditoría, en la misma transacción: un lote de biochar sin su
  // AuditEvent no dice quién lo declaró.
  const lote = await prisma.$transaction(async (tx) => {
    const creado = await tx.biocharBatch.create({
      data: {
        batchCode: CODIGO_LOTE,
        organizationId: finca.organizationId!,
        producedAtLocationId: produccion.id,
        producedAt: null,
        feedstock: MATERIA_PRIMA,
        provenanceClass: "direct_observation",
      },
    });
    await recordAuditEvent(
      {
        actorUserAccountId: actor.id,
        operation: "biochar_batch.create",
        sourceInterface: "traceability.service",
        entityType: "biochar_batch",
        entityId: creado.id,
        after: { batchCode: CODIGO_LOTE },
      },
      tx,
    );
    return creado;
  });

  for (const parcela of parcelas) {
    await prisma.materialConsumptionEntry.create({
      data: {
        locationId: parcela.id,
        materialName: "Biochar activado con noria",
        // El enlace al lote es POR CÓDIGO: la clave foránea entre
        // `MaterialConsumptionEntry` y `BiocharBatch` no existe.
        batchLabel: CODIGO_LOTE,
        quantity: KG_POR_PARCELA,
        unit: KG_POR_PARCELA === null ? null : "kg",
        occurredAt: FECHA,
        operatorPersonId: bob.id,
        notes: OBSERVACION,
        provenanceClass: "direct_observation",
        dataQuality: "missing_source_record",
      },
    });
    console.log(`  aplicado en ${parcela.name}`);
  }
  console.log(`\nLote ${CODIGO_LOTE} creado (${lote.id}) con ${parcelas.length} aplicaciones.`);
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
