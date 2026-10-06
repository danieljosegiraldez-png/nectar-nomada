/**
 * Kenis Rodríguez como registrador de eventos de apiario (dueño, 2026-09-16).
 *
 * Asiste la apicultura de Cerro Azul: **toma datos, no cambia configuraciones**.
 * Por eso lleva `Apiary Colony Event Recorder` y no `Farm Operator`. El perfil
 * excluye `apiary:manage` a propósito, así que Kenis registra alimentaciones,
 * tratamientos y observaciones, y ve el detalle de colmena — pero **no puede
 * crear una Inspección formal ni una colmena**. Es literalmente el caso que el
 * propio perfil documenta: quien registra rutina y hace inspecciones sólo
 * cuando se le ha acompañado lo suficiente.
 *
 * **La persona YA EXISTE**, y su nombre en la base es `Kenis Abdiel Rodríguez
 * Núñez` — no «Kenis Rodríguez». Buscar por el nombre corto no la encuentra.
 * Lo que le falta es correo y cuenta, y eso lo hace `npm run people:set-email`.
 * No hace falta contraseña: desde ADR-083 basta la dirección verificada.
 *
 * **DOS asignaciones, una por apiario, y no una sobre la finca.** Bajo Finca
 * Rosina cuelgan `Apiario 1 — Finca Rosina` y `Apiario 2 — Finca Rosina`
 * (medido en producción el 2026-10-06; antes esta línea decía «Apiario Finca
 * Rosina» y «Apiario Las Nubes», que son nombres que nunca existieron). Desde ADR-144 un
 * ámbito de ubicación alcanza a sus descendientes, así que asignarle la FINCA
 * le daría también las parcelas, el beneficio y los lotes de café — mucho más
 * de lo que su perfil necesita. Dos filas estrechas en vez de una ancha.
 * Decisión de Daniel, 2026-09-16.
 *
 * Usage:
 *   npm run data:kenis-apicultor             (simulación)
 *   npm run data:kenis-apicultor -- --apply
 */
import "dotenv/config";
import { prisma } from "../lib/db";
import { grantRole } from "../lib/rbac/admin";

const PERSONA = "Kenis Abdiel Rodríguez Núñez";
const CORREO = "rodriguezkenis907@gmail.com";
const PERFIL = "Apiary Colony Event Recorder";
// **Los nombres son los que la base tiene HOY, no los que el dueño dijo el 2026-09-14.**
// Medido el 2026-10-06 contra producción: los dos apiarios que cuelgan de Finca Rosina se
// llaman `Apiario 1 — Finca Rosina` (e8ca9b29) y `Apiario 2 — Finca Rosina` (51bf788e). La
// raya es larga, U+2014 — `e2 80 94`, leído con `od` sobre el valor de la columna, no
// supuesto: un guion corto `-` no casaría y el `findFirst` devolvería null.
//
// Antes esta constante pedía `Apiario Finca Rosina` y `Apiario Las Nubes`, que son los
// nombres a los que `scripts/apiario-las-nubes.ts` los LLEVARÍA. Ese renombrado nunca se
// aplicó, así que este guion abortaba con «No existe el apiario "Apiario Finca Rosina"
// como apiary_site» — pidiendo el nombre de después de un cambio que no ocurrió.
//
// **Queda una contradicción en pie, nombrada a propósito en vez de escondida:** si algún día
// se corre `npm run data:apiario-las-nubes -- --apply`, renombrará los dos apiarios y estas
// dos constantes dejarán de casar; entonces hay que devolverlas a los nombres del párrafo
// anterior. No se arregla aquí porque ese guion hace mucho más que renombrar —borra las
// colonias de Rosina, y hoy la de `Apiario 1` está ACTIVA, capturada el 2026-08-23— así que
// correrlo es una decisión del dueño y no un paso de este guion.
//
// Decisión de Daniel, 2026-10-06: cambiar el guion y dejar los nombres de la base como están.
const APIARIOS = ["Apiario 1 — Finca Rosina", "Apiario 2 — Finca Rosina"] as const;

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
  if (!perfil) throw new PreconditionError(`No existe el perfil "${PERFIL}". Sembralo primero:  npm run db:seed`);

  console.log(`actor:   ${actor.person?.displayName ?? actorEmail}`);
  console.log(`persona: ${persona.displayName} <${persona.email}> · cuenta ${persona.userAccount.status}`);
  console.log(`perfil:  ${PERFIL} — registra eventos, NO crea inspecciones ni colmenas`);

  for (const nombre of APIARIOS) {
    const apiario = await prisma.location.findFirst({
      where: { name: nombre, locationType: "apiary_site" },
      select: { id: true, name: true, parentLocation: { select: { name: true } } },
    });
    // Precondición por apiario y no al principio: si el segundo no existe, el
    // primero ya se concedió y hay que saber cuál quedó hecho.
    if (!apiario) throw new PreconditionError(`No existe el apiario "${nombre}" como apiary_site.`);

    const ya = await prisma.assignment.findFirst({
      where: {
        userAccountId: persona.userAccount.id,
        roleProfileId: perfil.id,
        status: "active",
        scope: { scopeType: "location", scopeRefId: apiario.id },
      },
      select: { id: true },
    });
    if (ya) {
      console.log(`  ya asignado en «${apiario.name}» (${ya.id}) — nada que hacer`);
      continue;
    }

    console.log(`  ámbito: apiario «${apiario.name}» (dentro de ${apiario.parentLocation?.name ?? "—"})`);
    if (!apply) continue;

    const asignacion = await grantRole(actor.id, {
      userAccountId: persona.userAccount.id,
      roleProfileId: perfil.id,
      scopeType: "location",
      scopeRefId: apiario.id,
    });
    console.log(`  concedido: ${asignacion.id}`);
  }

  if (!apply) {
    console.log("\nSimulación: no se escribió nada.");
    return;
  }

  const rele = await prisma.assignment.findMany({
    where: { userAccountId: persona.userAccount.id, status: "active" },
    select: { roleProfile: { select: { name: true } }, scope: { select: { scopeType: true, scopeRefId: true } } },
  });
  console.log("\nAsignaciones activas de Kenis ahora:");
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
