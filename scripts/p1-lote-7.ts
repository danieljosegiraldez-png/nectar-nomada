/**
 * Crear el Lote 7 de Finca Rosina (dueño, 2026-09-16).
 *
 * **Existe en el mundo antes que en la base, y por eso se crea ahora.** Hay
 * trabajadores socoleando, sacando árboles podridos o caídos y preparando el
 * espacio; la Pink Bourbon llega de Boquete en dos semanas. Una parcela que ya
 * tiene jornales encima no debería esperar a la siembra para existir.
 *
 * **Lo que este script NO hace, y es deliberado:**
 *
 * - **No crea la cohorte de Pink Bourbon.** Esa va en
 *   `p1-geisha-pinkbourbon-y-marcos.ts`, con `status: planned` para que no cuente
 *   como plantado, y ese script ya estaba escrito antes que esta parcela.
 * - **No registra la preparación del terreno.** Socolear y sacar árboles caídos es
 *   trabajo real con jornales, y **no tiene dónde guardarse**: `Intervention` no
 *   existe en el esquema (medido el 2026-09-16 en el análisis de brechas). Se dice
 *   aquí en vez de fingir que cabe en otro sitio.
 * - **No inventa área.** `CLAUDE.md` §54 la nombra entre lo que no se fabrica, y
 *   sigue nula hasta que alguien mida las esquinas.
 * - **El punto SÍ va, el polígono NO.** El 2026-09-16 Daniel mandó seis capturas
 *   de la brújula del iPhone. Sirven para ubicar la parcela y no para dibujarla,
 *   y la razón está medida: la brújula redondea al segundo de arco, que a esta
 *   latitud son **31 m**, así que cada lectura es una caja de 31 x 31 m. La
 *   prueba más clara la dio él mismo sin querer: la casa principal y una de las
 *   seis lecturas del lote —separadas 60-70 m en el suelo— devuelven la MISMA
 *   coordenada, 9°11'17\" N 79°24'59\" O. Por eso aquí va el centroide con su
 *   error declarado y no un polígono que no se puede sostener.
 *
 * Usage:
 *   npm run data:lote-7             (simulación)
 *   npm run data:lote-7 -- --apply
 */
import "dotenv/config";
import { prisma } from "../lib/db";
import { recordAuditEvent } from "../lib/audit";

const NOMBRE = "Lote 7 — Finca Rosina";
const FINCA = "Finca Rosina";

/**
 * Centroide de las seis lecturas del 2026-09-16, con ±15 m de error por el
 * redondeo al segundo de arco. Ubica la parcela; no la delimita.
 */
const LATITUD = 9.18796;
const LONGITUD = -79.41731;

/** Rango medido en las mismas capturas: 710 arriba, junto a la casa; 700 en el extremo sur. */
const ALTITUD_MIN_M = 700;
const ALTITUD_MAX_M = 710;

const NOTAS =
  "Parcela en preparación al 2026-09-16: socoleo, retiro de árboles podridos o " +
  "caídos y acondicionamiento del espacio. Destinada a ~600 Pink Bourbon con " +
  "llegada prevista de Boquete en dos semanas. PROCEDENCIA DE ESOS PLANTONES, y " +
  "son DOS hechos distintos: la SEMILLA salió de Café Don Benjie; los PLANTONES los " +
  "crió el semillero propio de Crispiliano, ingeniero agrónomo que trabaja para Don " +
  "Benjie, Lamastus y otras fincas, pero cuyo semillero es aparte. Se escribe aquí " +
  "porque `PlantingEvent.sourceOrganizationId` guarda UN solo origen y no puede " +
  "sostener la cadena entera — ver Q11B del paquete de descubrimiento. "  +
  "UBICACIÓN: el punto guardado es el centroide de seis lecturas de brújula del " +
  "2026-09-16, con ±15 m de error; el polígono y el área siguen sin medir. " +
  "Siembra prevista: ~600 plantas a 1,8 x 2,5 m = unos 2.700 m².";

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

  const finca = await prisma.location.findFirst({
    where: { name: FINCA, locationType: "site" },
    select: { id: true, name: true, organizationId: true, classification: true },
  });
  if (!finca) throw new PreconditionError(`No existe el sitio "${FINCA}".`);

  const ya = await prisma.location.findFirst({ where: { name: NOMBRE }, select: { id: true } });
  if (ya) throw new PreconditionError(`"${NOMBRE}" ya existe (${ya.id}): este script ya corrió.`);

  // Los seis hermanos, para que la parcela nueva nazca igual que ellos y no con
  // una clasificación o una organización distintas por descuido.
  const hermanos = await prisma.location.findMany({
    where: { parentLocationId: finca.id, locationType: "plot" },
    select: { name: true, classification: true, organizationId: true },
    orderBy: { name: "asc" },
  });
  console.log(`actor: ${actor.person?.displayName ?? actorEmail}`);
  console.log(`  padre: ${finca.name}`);
  console.log(`  hermanas existentes: ${hermanos.map((h) => h.name.replace(" — Finca Rosina", "")).join(", ")}`);
  console.log(`  a crear: ${NOMBRE} · plot · clasificación ${finca.classification}`);
  console.log(`  punto:   ${LATITUD}, ${LONGITUD}  (±15 m — centroide de 6 lecturas al segundo de arco)`);
  console.log(`  altitud: ${ALTITUD_MIN_M}–${ALTITUD_MAX_M} m`);
  console.log(`  área y polígono: NULOS — hacen falta las cuatro esquinas con decimales`);

  if (!apply) {
    console.log("\nSimulación: no se escribió nada.");
    return;
  }

  const creada = await prisma.$transaction(async (tx) => {
    const loc = await tx.location.create({
      data: {
        name: NOMBRE,
        locationType: "plot",
        parentLocationId: finca.id,
        organizationId: finca.organizationId,
        classification: finca.classification,
        description: NOTAS,
        latitude: LATITUD,
        longitude: LONGITUD,
        altitudeMinM: ALTITUD_MIN_M,
        altitudeMaxM: ALTITUD_MAX_M,
      },
    });
    await recordAuditEvent(
      {
        actorUserAccountId: actor.id,
        operation: "location.create",
        entityType: "location",
        entityId: loc.id,
        after: loc,
        reason: "Parcela en preparación para la siembra de Pink Bourbon (dueño, 2026-09-16).",
        sourceInterface: "script.p1-lote-7",
      },
      tx,
    );
    return loc;
  });

  console.log(`\nCreada: ${creada.id}`);
  const rele = await prisma.location.findUniqueOrThrow({
    where: { id: creada.id },
    select: { name: true, locationType: true, parentLocation: { select: { name: true } } },
  });
  console.log(`  ${rele.name} · ${rele.locationType} · bajo ${rele.parentLocation?.name}`);
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
