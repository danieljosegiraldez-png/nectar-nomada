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
 * asignaciones activas de Farm Operator (Sherry y Bob). El bueno no tiene ninguno. Retirar sin mover
 * los permisos les quitaría el beneficio a las dos personas que trabajan en él.
 *
 * Los cuatro pasos, en este orden y por eso:
 *   1. Conceder Farm Operator sobre «Las Nubes» a quien lo tenía sobre el duplicado.
 *   2. Colgar «Las Nubes» de Finca Rosina —hoy cuelga del cuarto de secado, al revés—.
 *   3. Colgar el cuarto de secado del beneficio, y darle su tipo `drying_facility`.
 *   4. Archivar el duplicado. **No se borra:** un registro canónico se retira (CLAUDE.md §35).
 *
 * El paso 1 va primero a propósito: si algo falla después, nadie se queda sin permiso.
 *
 * Uso:
 *   npm run data:unificar-las-nubes              (simulación: sólo imprime)
 *   npm run data:unificar-las-nubes -- --apply
 */
import "dotenv/config";
import { prisma } from "../lib/db";
import { recordAuditEvent } from "../lib/audit";
import { grantRole } from "../lib/rbac/admin";

const RAZON =
  "Daniel, 2026-09-26: «Beneficio Las Nubes» y «Las Nubes» eran el mismo beneficio duplicado; se queda " +
  "«Las Nubes», el cuarto de secado pasa a colgar de él, y el duplicado se archiva con sus permisos movidos.";
const DUPLICADO = "Beneficio Las Nubes";
const BUENO = "Las Nubes";
const CUARTO = "Cuarto de secado — Beneficio Las Nubes";
const FINCA = "Finca Rosina";

async function main() {
  const aplicar = process.argv.includes("--apply");
  console.log(aplicar ? "APLICANDO\n" : "SIMULACIÓN — no se escribe nada\n");

  const dup = await prisma.location.findFirst({ where: { name: DUPLICADO }, select: { id: true, locationType: true, status: true } });
  const bueno = await prisma.location.findFirst({ where: { name: BUENO, locationType: "beneficio" }, select: { id: true, parentLocationId: true } });
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

  const scopes = await prisma.scope.findMany({
    where: { scopeType: "location", scopeRefId: dup.id },
    select: { assignments: { where: { status: "active" }, select: { userAccountId: true, roleProfileId: true, roleProfile: { select: { name: true } }, userAccount: { select: { person: { select: { displayName: true } } } } } } },
  });
  const aMover = scopes.flatMap((s) => s.assignments);
  console.log(`\n1. permisos que se conceden sobre «${BUENO}»: ${aMover.length}`);
  for (const a of aMover) console.log(`   ${a.userAccount.person.displayName} · ${a.roleProfile.name}`);
  console.log(`2. «${BUENO}» pasa a colgar de «${FINCA}» (hoy: ${bueno.parentLocationId === cuarto.id ? "del cuarto de secado" : bueno.parentLocationId ?? "de nada"})`);
  console.log(`3. «${CUARTO}» pasa a colgar de «${BUENO}» y a tipo drying_facility (hoy: ${cuarto.locationType})`);
  console.log(`4. «${DUPLICADO}» se archiva (hoy: ${dup.status}, tipo ${dup.locationType})`);

  if (!aplicar) {
    console.log("\nNada escrito. Para aplicar: npm run data:unificar-las-nubes -- --apply");
    return;
  }

  const actor = await prisma.userAccount.findFirstOrThrow({
    where: { person: { email: "danieljosegiraldez@gmail.com" } },
    select: { id: true },
  });

  for (const a of aMover) {
    await grantRole(actor.id, { userAccountId: a.userAccountId, roleProfileId: a.roleProfileId, scopeType: "location", scopeRefId: bueno.id });
    console.log(`   ✓ ${a.userAccount.person.displayName} ahora tiene ${a.roleProfile.name} sobre «${BUENO}»`);
  }

  await prisma.$transaction(async (tx) => {
    const antesBueno = await tx.location.findUniqueOrThrow({ where: { id: bueno.id } });
    const despuesBueno = await tx.location.update({ where: { id: bueno.id }, data: { parentLocationId: finca.id } });
    await recordAuditEvent({ actorUserAccountId: null, operation: "location.reparent", entityType: "location", entityId: bueno.id, before: antesBueno, after: despuesBueno, reason: RAZON, sourceInterface: "script:unificar-beneficio-las-nubes" }, tx);

    const antesCuarto = await tx.location.findUniqueOrThrow({ where: { id: cuarto.id } });
    const despuesCuarto = await tx.location.update({ where: { id: cuarto.id }, data: { parentLocationId: bueno.id, locationType: "drying_facility" } });
    await recordAuditEvent({ actorUserAccountId: null, operation: "location.reparent_retype", entityType: "location", entityId: cuarto.id, before: antesCuarto, after: despuesCuarto, reason: RAZON, sourceInterface: "script:unificar-beneficio-las-nubes" }, tx);

    const antesDup = await tx.location.findUniqueOrThrow({ where: { id: dup.id } });
    const despuesDup = await tx.location.update({ where: { id: dup.id }, data: { status: "archived" } });
    await recordAuditEvent({ actorUserAccountId: null, operation: "location.archive", entityType: "location", entityId: dup.id, before: antesDup, after: despuesDup, reason: RAZON, sourceInterface: "script:unificar-beneficio-las-nubes" }, tx);
  });
  console.log("\n✓ aplicado: permisos movidos, jerarquía corregida y duplicado archivado.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
