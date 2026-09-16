/**
 * Bob Huerbsch como Farm Manager de Finca Rosina (dueño, 2026-09-16).
 *
 * Gerente de la finca de café Finca Rosina y **copropietario del beneficio Las
 * Nubes**. Por eso lleva `Farm Manager` y no `Farm Operator`: el comentario del
 * propio Farm Operator dice que registrar y retirar equipo es «del jefe de
 * beneficio, no del operario», y Bob es esa persona.
 *
 * **La persona YA EXISTE.** No se crea: `Bob Huerbsch` está en la base junto a
 * Sherry y Chris. Lo que le falta es correo y cuenta, y eso NO lo hace este script
 * — lo hace `npm run people:set-email`, que ya existe y sabe hacerlo bien.
 *
 * **Y no hace falta contraseña.** Desde ADR-083 basta la dirección: Bob entra con
 * Google, su correo verificado casa con su Person y la cuenta se activa. Ninguna
 * sesión maneja nunca una contraseña de nadie.
 *
 * **Por qué el ámbito es la UBICACIÓN y no los proyectos.** «Acceso a todo lo
 * relacionado con Finca Rosina» son hoy dos proyectos —Café y Apiario— y serían dos
 * asignaciones. Desde ADR-144 un ámbito de ubicación alcanza a sus descendientes,
 * así que UNA asignación sobre `Finca Rosina` cubre sus parcelas, sus instalaciones
 * de secado y sus camas. Menos filas y, sobre todo, nada que recordar añadir cuando
 * mañana haya un proyecto más.
 *
 * Usage:
 *   npm run data:bob-farm-manager             (simulación)
 *   npm run data:bob-farm-manager -- --apply
 */
import "dotenv/config";
import { prisma } from "../lib/db";
import { grantRole } from "../lib/rbac/admin";

const PERSONA = "Bob Huerbsch";
const CORREO = "rjhuerbsch@gmail.com";
const PERFIL = "Farm Manager";
const SITIO = "Finca Rosina";

class PreconditionError extends Error {}

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(apply ? "MODO: aplicar\n" : "MODO: simulación (usá --apply para escribir)\n");

  const actorEmail = process.env.NN_ACTOR_EMAIL;
  if (!actorEmail) throw new PreconditionError("Falta NN_ACTOR_EMAIL: conceder un rol exige un actor real.");
  const actor = await prisma.userAccount.findFirst({
    where: { person: { email: actorEmail } },
    select: { id: true, person: { select: { displayName: true } } },
  });
  if (!actor) throw new PreconditionError(`No hay UserAccount para ${actorEmail}.`);

  const persona = await prisma.person.findFirst({
    where: { displayName: PERSONA },
    select: { id: true, displayName: true, email: true, userAccount: { select: { id: true, status: true } } },
  });
  if (!persona) throw new PreconditionError(`No existe la persona "${PERSONA}". Este script no la crea.`);

  if (!persona.email) {
    throw new PreconditionError(
      `"${PERSONA}" no tiene correo. Ponlo primero, que es lo que crea la cuenta:\n` +
        `    npm run people:set-email -- "${PERSONA}" ${CORREO}\n` +
        `  Desde ADR-083 la dirección basta: entra con Google y la cuenta se activa. ` +
        `No hace falta contraseña, y este script no la maneja.`,
    );
  }
  if (persona.email !== CORREO) {
    throw new PreconditionError(`"${PERSONA}" tiene el correo ${persona.email} y se esperaba ${CORREO}. Parar y mirar.`);
  }
  if (!persona.userAccount) throw new PreconditionError(`"${PERSONA}" tiene correo pero no cuenta. Corré people:set-email.`);

  const perfil = await prisma.roleProfile.findUnique({ where: { name: PERFIL }, select: { id: true } });
  if (!perfil) {
    throw new PreconditionError(`No existe el perfil "${PERFIL}". Sembralo primero:  npm run db:seed`);
  }

  const sitio = await prisma.location.findFirst({
    where: { name: SITIO, locationType: "site" },
    select: { id: true, name: true },
  });
  if (!sitio) throw new PreconditionError(`No existe el sitio "${SITIO}".`);

  const ya = await prisma.assignment.findFirst({
    where: {
      userAccountId: persona.userAccount.id,
      roleProfileId: perfil.id,
      status: "active",
      scope: { scopeType: "location", scopeRefId: sitio.id },
    },
    select: { id: true },
  });
  if (ya) {
    console.log(`  ${PERSONA} ya es ${PERFIL} en ${SITIO} (asignación ${ya.id}). Nada que hacer.`);
    return;
  }

  console.log(`actor:   ${actor.person?.displayName ?? actorEmail}`);
  console.log(`persona: ${persona.displayName} <${persona.email}> · cuenta ${persona.userAccount.status}`);
  console.log(`perfil:  ${PERFIL}`);
  console.log(`ámbito:  ubicación «${sitio.name}» — y desde ADR-144 alcanza a todo lo que cuelga de ella`);

  if (!apply) {
    console.log("\nSimulación: no se escribió nada.");
    return;
  }

  const asignacion = await grantRole(actor.id, {
    userAccountId: persona.userAccount.id,
    roleProfileId: perfil.id,
    scopeType: "location",
    scopeRefId: sitio.id,
  });
  console.log(`\nConcedido: asignación ${asignacion.id}`);

  const rele = await prisma.assignment.findMany({
    where: { userAccountId: persona.userAccount.id, status: "active" },
    select: { roleProfile: { select: { name: true } }, scope: { select: { scopeType: true, scopeRefId: true } } },
  });
  console.log("Asignaciones activas de Bob ahora:");
  for (const a of rele) console.log(`  ${a.roleProfile.name} · ${a.scope.scopeType} ${a.scope.scopeRefId ?? ""}`);
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
