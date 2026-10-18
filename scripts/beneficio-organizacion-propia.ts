/**
 * Pone la organización propia a los beneficios que no la tienen (ADR-198, PR 1).
 *
 * **Lo medido contra producción el 2026-10-06:** `Las Nubes` (beneficio) tiene `organization_id`
 * NULO, mientras su padre `Finca Rosina` sí tiene uno. `crearBeneficio` copia la organización del
 * padre al crear, así que esa fila nació por otra vía. Quien sube por los padres
 * (`resolveOrganizationForLocation`) no lo nota, porque encuentra la de la finca; **lo notan los
 * filtros `organizationId: { not: null }`** de equipos, modelos, catálogos e inventario, y lo
 * notaría cualquier beneficio que algún día no tenga padre (PR 2 del diseño).
 *
 * ## Lo que hace
 *
 * Para CADA beneficio con `organization_id` nulo (no sólo `Las Nubes`: el guion no sabe nombres),
 * toma la organización del ancestro más cercano que la tenga y se la escribe. Si ningún ancestro
 * la tiene, **no adivina**: lo lista y sale con error, porque elegir dueño es de Daniel.
 *
 * Es idempotente: sin beneficios nulos no hace nada y sale 0.
 *
 * ## Es una escritura en producción, y el ensayo es obligatorio
 *
 * Por defecto SIMULA. Imprime cada beneficio, de qué ancestro toma la organización y cuál es su
 * NOMBRE — hay que leerlo antes de aplicar. Nada se escribe sin `--apply`. Al aplicar, relee y
 * sale con 1 si algún beneficio sigue nulo o quedó con una organización distinta de la prometida.
 *
 * Usage:
 *   NN_ACTOR_EMAIL=... npm run data:beneficio-organizacion
 *   NN_ACTOR_EMAIL=... npm run data:beneficio-organizacion -- --apply
 */
import "dotenv/config";
import { prisma } from "../lib/db";
import { recordAuditEvent } from "../lib/audit";

const RAZON =
  "ADR-198 (PR 1): un beneficio lleva su propia organización. Se toma la del ancestro más cercano " +
  "que la tiene; el beneficio la tenía nula.";
const FUENTE = "scripts/beneficio-organizacion-propia.ts";

class PreconditionError extends Error {}

const linea = (s: string) => console.log(`  ${s}`);

type Propuesta = {
  beneficioId: string;
  beneficio: string;
  /** El ancestro del que sale la organización, o null si no hay ninguno que la tenga. */
  ancestro: { id: string; name: string; locationType: string } | null;
  organizacion: { id: string; name: string } | null;
};

/** Sube por `parentLocationId` hasta el primero con organización. Un ciclo no cuelga el bucle. */
async function proponer(beneficio: { id: string; name: string; parentLocationId: string | null }): Promise<Propuesta> {
  const vistos = new Set<string>([beneficio.id]);
  let siguiente = beneficio.parentLocationId;
  while (siguiente && !vistos.has(siguiente)) {
    vistos.add(siguiente);
    const fila = await prisma.location.findUnique({
      where: { id: siguiente },
      select: { id: true, name: true, locationType: true, parentLocationId: true, organization: { select: { id: true, name: true } } },
    });
    if (!fila) break;
    if (fila.organization) {
      return {
        beneficioId: beneficio.id,
        beneficio: beneficio.name,
        ancestro: { id: fila.id, name: fila.name, locationType: fila.locationType },
        organizacion: fila.organization,
      };
    }
    siguiente = fila.parentLocationId;
  }
  return { beneficioId: beneficio.id, beneficio: beneficio.name, ancestro: null, organizacion: null };
}

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
  linea(`Actor: ${actor.person.displayName} (${actorEmail})`);

  // Fila patrón: a QUÉ base se conectó y cuántos beneficios hay en total. Un "0 nulos" sobre una
  // base sin beneficios (o la equivocada) se lee igual que "todo en orden".
  const filas = await prisma.$queryRaw<{ db: string }[]>`select current_database() as db`;
  const db = filas[0]?.db ?? "(desconocida)";
  const totales = await prisma.location.count({ where: { locationType: "beneficio" } });
  linea(`Base: ${db} · beneficios en total: ${totales}`);
  if (totales === 0) throw new PreconditionError("No hay ningún beneficio en esta base: no se midió nada. ¿Es la base correcta?");

  const nulos = await prisma.location.findMany({
    where: { locationType: "beneficio", organizationId: null },
    select: { id: true, name: true, parentLocationId: true },
    orderBy: { name: "asc" },
  });
  linea(`Beneficios con organización nula: ${nulos.length}`);
  if (nulos.length === 0) {
    console.log("\nNada que hacer.");
    return;
  }

  const propuestas: Propuesta[] = [];
  for (const b of nulos) propuestas.push(await proponer(b));
  for (const p of propuestas) {
    if (p.organizacion && p.ancestro) {
      linea(`«${p.beneficio}» (${p.beneficioId}) ← organización «${p.organizacion.name}» (${p.organizacion.id}), tomada de «${p.ancestro.name}» (${p.ancestro.locationType})`);
    } else {
      linea(`«${p.beneficio}» (${p.beneficioId}) ← NINGÚN ancestro tiene organización: no se adivina`);
    }
  }

  const sinDueno = propuestas.filter((p) => !p.organizacion);
  if (sinDueno.length) {
    throw new PreconditionError(
      `${sinDueno.length} beneficio(s) sin ningún ancestro con organización. Elegir su dueño es de Daniel; ` +
        `ponerlo a mano y volver a correr.`,
    );
  }

  if (!apply) {
    console.log("\nSimulación: no se escribió nada. Leé las organizaciones de arriba antes de aplicar.");
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const p of propuestas) {
      const antes = await tx.location.findUniqueOrThrow({ where: { id: p.beneficioId } });
      // La condición va en el UPDATE y no sólo en la lectura de arriba: si otra sesión le puso
      // organización entre el ensayo y el apply, no se pisa.
      const r = await tx.location.updateMany({ where: { id: p.beneficioId, organizationId: null }, data: { organizationId: p.organizacion!.id } });
      if (r.count !== 1) throw new PreconditionError(`«${p.beneficio}» dejó de tener organización nula entre la lectura y la escritura. Parar y mirar.`);
      const despues = await tx.location.findUniqueOrThrow({ where: { id: p.beneficioId } });
      await recordAuditEvent(
        {
          actorUserAccountId: actor.id,
          operation: "location.set_organization",
          entityType: "location",
          entityId: p.beneficioId,
          before: antes,
          after: despues,
          reason: RAZON,
          sourceInterface: FUENTE,
        },
        tx,
      );
    }
  });

  // Relectura independiente de la escritura.
  let mal = 0;
  for (const p of propuestas) {
    const fila = await prisma.location.findUnique({ where: { id: p.beneficioId }, select: { organizationId: true } });
    const ok = fila?.organizationId === p.organizacion!.id;
    linea(`${ok ? "✓" : "✗"} «${p.beneficio}» → ${fila?.organizationId ?? "NULA"} (esperada ${p.organizacion!.id})`);
    if (!ok) mal++;
  }
  const quedan = await prisma.location.count({ where: { locationType: "beneficio", organizationId: null } });
  linea(`Beneficios que siguen con organización nula: ${quedan}`);
  if (mal || quedan) {
    process.exitCode = 1;
    return;
  }
  console.log("\nHecho y verificado.");
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
