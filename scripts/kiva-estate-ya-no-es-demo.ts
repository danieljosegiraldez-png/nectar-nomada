/**
 * Quitar de la organización «Kiva Estate» la descripción que la marca como DEMO.
 *
 * **Decisión de Daniel, 2026-09-30:** Kiva Estate es real, con dos fincas propias. Su fila arrastra
 * `"[DEMO placeholder organization — no verified details populated yet.]"`, que el seed le puso
 * cuando era contenido ficticio, y eso pasa a ser falso en cuanto le cuelguen terrenos reales.
 *
 * **Por qué un guion y no una pantalla:** no hay ninguna. Medido el 2026-09-30 — cero
 * `organization.update` en `lib/` y en `app/`. La aplicación crea organizaciones (`crearFinca`)
 * pero no las edita, así que este dato no tiene camino por interfaz.
 *
 * **Lo que NO hace:** no inventa una descripción nueva. La deja **nula**, que es lo que el modelo
 * pide para un dato que nadie ha dado — `CLAUDE.md` §3: lo que falta se queda faltando. Si Daniel
 * quiere una descripción, la escribe él.
 *
 * **Y por qué exige que el texto sea EXACTAMENTE el de la plantilla:** si alguien ya escribió algo
 * suyo ahí, pisarlo sería perder trabajo. El guion aborta en vez de sobrescribir.
 *
 * Simula por defecto. Escribe sólo con `--apply`.
 *
 * Uso:
 *   NN_ACTOR_EMAIL=... npx tsx scripts/kiva-estate-ya-no-es-demo.ts
 *   NN_ACTOR_EMAIL=... npx tsx scripts/kiva-estate-ya-no-es-demo.ts --apply
 */
// Debe ir primero: lib/db lee DATABASE_URL al importarse.
import "dotenv/config";
import { prisma } from "../lib/db";
import { recordAuditEvent } from "../lib/audit";

const NOMBRE = "Kiva Estate";
const PLANTILLA = "[DEMO placeholder organization — no verified details populated yet.]";
const FUENTE = "script:kiva-estate-ya-no-es-demo";
const RAZON =
  "Decisión de Daniel 2026-09-30: Kiva Estate es una finca real con dos terrenos propios, " +
  "así que la descripción que la marcaba como DEMO pasó a ser falsa. Se deja nula en vez de " +
  "inventar una: lo que falta se queda faltando.";

class PreconditionError extends Error {}

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(apply ? "\nMODO: aplicar\n" : "\nMODO: simulación (usá --apply para escribir)\n");

  const actorEmail = process.env.NN_ACTOR_EMAIL;
  if (!actorEmail) throw new PreconditionError("Falta NN_ACTOR_EMAIL: escribir un dato exige un actor real.");
  const actor = await prisma.userAccount.findFirst({
    where: { person: { email: actorEmail } },
    select: { id: true, person: { select: { displayName: true } } },
  });
  if (!actor) throw new PreconditionError(`No hay UserAccount para ${actorEmail}.`);
  console.log(`  Actor: ${actor.person.displayName} (${actorEmail})`);

  const orgs = await prisma.organization.findMany({
    where: { name: NOMBRE },
    select: { id: true, name: true, organizationType: true, description: true, _count: { select: { locations: true } } },
  });
  if (orgs.length === 0) throw new PreconditionError(`No existe ninguna organización llamada "${NOMBRE}".`);
  if (orgs.length > 1) throw new PreconditionError(`Hay ${orgs.length} organizaciones llamadas "${NOMBRE}". Parar y mirar cuál es.`);
  const org = orgs[0]!;

  console.log(`  «${org.name}» (${org.organizationType}, ${org.id})`);
  console.log(`  terrenos que le cuelgan: ${org._count.locations}`);
  if (org._count.locations === 0) {
    console.log("  AVISO: todavía no tiene ninguna finca. Quitar la marca no rompe nada, pero el");
    console.log("         motivo del cambio era que le iban a colgar terrenos reales.");
  }

  if (org.description === null) {
    console.log("\n  Su descripción ya es nula. Nada que hacer.\n");
    return;
  }
  if (org.description !== PLANTILLA) {
    throw new PreconditionError(
      "Su descripción NO es la plantilla DEMO, así que alguien escribió algo ahí.\n" +
        "  No se pisa. Mirala y decidí a mano:\n" +
        `    ${org.description}`,
    );
  }

  if (!apply) {
    console.log("\n  quitaría la descripción DEMO y la dejaría nula\n");
    return;
  }

  const despues = await prisma.$transaction(async (tx) => {
    const fila = await tx.organization.update({
      where: { id: org.id },
      data: { description: null },
      select: { id: true, name: true, description: true },
    });
    await recordAuditEvent(
      {
        actorUserAccountId: actor.id,
        operation: "organization.clear_demo_description",
        entityType: "organization",
        entityId: org.id,
        before: { description: org.description },
        after: { description: fila.description },
        reason: RAZON,
        sourceInterface: FUENTE,
      },
      tx,
    );
    return fila;
  });

  console.log(`\n  hecho: descripción de «${despues.name}» -> ${despues.description === null ? "nula" : "OJO, no quedó nula"}\n`);
}

main()
  .catch((error) => {
    if (error instanceof PreconditionError) {
      console.error(`\n  ${error.message}\n`);
      process.exit(1);
    }
    throw error;
  })
  .finally(() => prisma.$disconnect());
