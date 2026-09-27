/**
 * Unifica los dos «Las Nubes» del beneficio, y pone el cuarto de secado dentro del beneficio.
 *
 * **Lo que había, medido en producción el 2026-09-26.** Bajo Finca Rosina vivían dos cosas que son la
 * misma: «Beneficio Las Nubes», de tipo `site`, y «Las Nubes», de tipo `beneficio`, éste colgado del
 * cuarto de secado. Daniel: «son el mismo, «Las Nubes» se queda», y «que el cuarto de secado cuelgue
 * del beneficio».
 *
 * **Y por qué no basta con retirar el duplicado.** El duplicado no tiene lotes, ni hijos, ni jornadas,
 * ni recepciones, ni pedidos, ni muestras — pero sí tiene **los permisos**: un ámbito con dos
 * asignaciones activas de Farm Operator (Sherry y Bob). El bueno no tenía ninguno. Retirar sin mover
 * los permisos les quitaría el beneficio a las dos personas que trabajan en él.
 *
 * Los cinco pasos, en este orden y por eso:
 *   1. Conceder Farm Operator sobre «Las Nubes» a quien lo tenga sobre el duplicado.
 *   2. Revocar los del duplicado — **sólo los que ya estén concedidos en el bueno**, releyendo la base
 *      entre los dos pasos. Nadie pierde acceso ni por un instante.
 *   3. Colgar «Las Nubes» de Finca Rosina —colgaba del cuarto de secado, al revés—.
 *   4. Colgar el cuarto de secado del beneficio, y darle su tipo `drying_facility`.
 *   5. Archivar el duplicado y dejar «Las Nubes» en el estado que tenía el duplicado, `approved`.
 *      **No se borra nada:** un registro canónico se retira (CLAUDE.md §35).
 *
 * **Idempotente a propósito.** La primera corrida del 2026-09-26 reventó al repetirse, con
 * `already_granted`, y eso se lee como un fallo cuando en realidad estaba hecho. Cada paso comprueba
 * el estado actual y dice «ya estaba hecho» en vez de escribir otra vez o abortar.
 *
 * **Lo que la primera versión dijo mal.** Imprimía «permisos movidos» cuando sólo los concedía: los
 * dos del duplicado siguieron activos sobre un lugar archivado hasta que una lectura de la base lo
 * enseñó. De ahí el paso 2, que antes no existía.
 *
 * Uso:
 *   npm run data:unificar-las-nubes              (simulación: sólo imprime)
 *   npm run data:unificar-las-nubes -- --apply
 */
import "dotenv/config";
import { prisma } from "../lib/db";
import { recordAuditEvent } from "../lib/audit";
import { grantRole, revokeRole } from "../lib/rbac/admin";

const RAZON =
  "Daniel, 2026-09-26: «Beneficio Las Nubes» y «Las Nubes» eran el mismo beneficio duplicado; se queda " +
  "«Las Nubes», el cuarto de secado pasa a colgar de él, y el duplicado se archiva con sus permisos " +
  "concedidos en el bueno y revocados aquí.";
const DUPLICADO = "Beneficio Las Nubes";
const BUENO = "Las Nubes";
const CUARTO = "Cuarto de secado — Beneficio Las Nubes";
const FINCA = "Finca Rosina";
const FUENTE = "script:unificar-beneficio-las-nubes";

const clave = (userAccountId: string, roleProfileId: string) => `${userAccountId}:${roleProfileId}`;

async function activasEn(locationId: string) {
  return prisma.assignment.findMany({
    where: { status: "active", scope: { scopeType: "location", scopeRefId: locationId } },
    select: { id: true, userAccountId: true, roleProfileId: true, roleProfile: { select: { name: true } }, userAccount: { select: { person: { select: { displayName: true } } } } },
  });
}

async function main() {
  const aplicar = process.argv.includes("--apply");
  console.log(aplicar ? "APLICANDO\n" : "SIMULACIÓN — no se escribe nada\n");

  const dup = await prisma.location.findFirst({ where: { name: DUPLICADO }, select: { id: true, locationType: true, status: true } });
  const bueno = await prisma.location.findFirst({ where: { name: BUENO, locationType: "beneficio" }, select: { id: true, parentLocationId: true, status: true } });
  const cuarto = await prisma.location.findFirst({ where: { name: CUARTO }, select: { id: true, locationType: true, parentLocationId: true } });
  const finca = await prisma.location.findFirst({ where: { name: FINCA, locationType: "site" }, select: { id: true } });
  if (!dup || !bueno || !cuarto || !finca) {
    console.log(`! falta algo: duplicado ${!!dup} · bueno ${!!bueno} · cuarto ${!!cuarto} · finca ${!!finca}. No se toca nada.`);
    process.exitCode = 1;
    return;
  }

  // Lo que el disparador de la base rechazaría: cambiar tipo o padre de un lugar con lecturas de
  // ambiente. Se cuenta ANTES para que la simulación lo diga en vez de fallar al aplicar.
  const lecturas = await prisma.dryingAmbientReading.count({ where: { OR: [{ facilityLocationId: { in: [cuarto.id, bueno.id] } }, { rackLocationId: { in: [cuarto.id, bueno.id] } }] } }).catch(() => 0);
  console.log(`lecturas de ambiente en el cuarto o el beneficio: ${lecturas}${lecturas ? " — el disparador rechazaría mover o retipar" : ""}`);

  const enDup = await activasEn(dup.id);
  const enBueno = await activasEn(bueno.id);
  const yaEnBueno = new Set(enBueno.map((a) => clave(a.userAccountId, a.roleProfileId)));
  const porConceder = enDup.filter((a) => !yaEnBueno.has(clave(a.userAccountId, a.roleProfileId)));

  console.log(`\n1. permisos activos en el duplicado: ${enDup.length} · ya concedidos en «${BUENO}»: ${enDup.length - porConceder.length} · por conceder: ${porConceder.length}`);
  for (const a of enDup) {
    const ya = yaEnBueno.has(clave(a.userAccountId, a.roleProfileId));
    console.log(`   ${a.userAccount.person.displayName} · ${a.roleProfile.name}${ya ? " — ya lo tiene en el bueno" : ""}`);
  }
  console.log(`2. se revocan del duplicado los que queden concedidos en «${BUENO}»: hoy serían ${enDup.length}`);
  console.log(`3. «${BUENO}» cuelga de «${FINCA}»: ${bueno.parentLocationId === finca.id ? "ya estaba hecho" : bueno.parentLocationId === cuarto.id ? "hoy cuelga del cuarto de secado" : `hoy cuelga de ${bueno.parentLocationId ?? "nada"}`}`);
  console.log(`4. «${CUARTO}» cuelga de «${BUENO}» y es drying_facility: ${cuarto.parentLocationId === bueno.id && cuarto.locationType === "drying_facility" ? "ya estaba hecho" : `hoy tipo ${cuarto.locationType}, padre ${cuarto.parentLocationId === bueno.id ? "correcto" : "otro"}`}`);
  console.log(`5. «${DUPLICADO}» archivado: ${dup.status === "archived" ? "ya estaba hecho" : `hoy ${dup.status}`} · «${BUENO}» approved: ${bueno.status === "approved" ? "ya estaba hecho" : `hoy ${bueno.status}`}`);

  if (!aplicar) {
    console.log("\nNada escrito. Para aplicar: npm run data:unificar-las-nubes -- --apply");
    return;
  }

  const actor = await prisma.userAccount.findFirstOrThrow({
    where: { person: { email: "danieljosegiraldez@gmail.com" } },
    select: { id: true },
  });

  for (const a of porConceder) {
    await grantRole(actor.id, { userAccountId: a.userAccountId, roleProfileId: a.roleProfileId, scopeType: "location", scopeRefId: bueno.id });
    console.log(`   ✓ ${a.userAccount.person.displayName} ahora tiene ${a.roleProfile.name} sobre «${BUENO}»`);
  }

  // La invariante: se relee el bueno DESPUÉS de conceder, y sólo se revoca del duplicado lo que esté
  // demostrablemente concedido allí. Si una concesión falló, su permiso del duplicado se queda.
  const despuesEnBueno = new Set((await activasEn(bueno.id)).map((a) => clave(a.userAccountId, a.roleProfileId)));
  let revocados = 0;
  for (const a of enDup) {
    if (!despuesEnBueno.has(clave(a.userAccountId, a.roleProfileId))) {
      console.log(`   ! NO se revoca ${a.userAccount.person.displayName} · ${a.roleProfile.name}: no está concedido en «${BUENO}»`);
      continue;
    }
    await revokeRole(actor.id, a.id, RAZON);
    revocados += 1;
    console.log(`   ✓ revocado del duplicado: ${a.userAccount.person.displayName} · ${a.roleProfile.name}`);
  }

  await prisma.$transaction(async (tx) => {
    if (bueno.parentLocationId !== finca.id) {
      const antes = await tx.location.findUniqueOrThrow({ where: { id: bueno.id } });
      const despues = await tx.location.update({ where: { id: bueno.id }, data: { parentLocationId: finca.id } });
      await recordAuditEvent({ actorUserAccountId: null, operation: "location.reparent", entityType: "location", entityId: bueno.id, before: antes, after: despues, reason: RAZON, sourceInterface: FUENTE }, tx);
    }

    if (cuarto.parentLocationId !== bueno.id || cuarto.locationType !== "drying_facility") {
      const antes = await tx.location.findUniqueOrThrow({ where: { id: cuarto.id } });
      const despues = await tx.location.update({ where: { id: cuarto.id }, data: { parentLocationId: bueno.id, locationType: "drying_facility" } });
      await recordAuditEvent({ actorUserAccountId: null, operation: "location.reparent_retype", entityType: "location", entityId: cuarto.id, before: antes, after: despues, reason: RAZON, sourceInterface: FUENTE }, tx);
    }

    if (dup.status !== "archived") {
      const antes = await tx.location.findUniqueOrThrow({ where: { id: dup.id } });
      const despues = await tx.location.update({ where: { id: dup.id }, data: { status: "archived" } });
      await recordAuditEvent({ actorUserAccountId: null, operation: "location.archive", entityType: "location", entityId: dup.id, before: antes, after: despues, reason: RAZON, sourceInterface: FUENTE }, tx);
    }

    // El duplicado estaba `approved` y el bueno nació `draft`: el que sobrevive hereda el estado del
    // que se retira, o la unificación deja el beneficio en un estado que el duplicado no tenía.
    if (bueno.status !== "approved") {
      const antes = await tx.location.findUniqueOrThrow({ where: { id: bueno.id } });
      const despues = await tx.location.update({ where: { id: bueno.id }, data: { status: "approved" } });
      await recordAuditEvent({ actorUserAccountId: null, operation: "location.approve", entityType: "location", entityId: bueno.id, before: antes, after: despues, reason: RAZON, sourceInterface: FUENTE }, tx);
    }
  });
  console.log(`\n✓ aplicado: ${porConceder.length} concedidos, ${revocados} revocados del duplicado, jerarquía y estados al día.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
