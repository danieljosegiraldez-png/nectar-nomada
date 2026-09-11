/**
 * Las parcelas se llaman «Parcela», no «Lote».
 *
 * **EL CHOQUE (medido el 2026-09-11).** En la base, las parcelas se llaman
 * `Lote 1 — Finca Rosina`. En la pantalla, un batch de café también se llama
 * «Lote». Misma palabra, dos cosas: el trozo de tierra y la cantidad de café que
 * salió de él. Daniel lo encontró intentando crear uno y preguntando «how do I
 * create lots»; no era un fallo del código, era cómo se nombraron las parcelas.
 *
 * **QUÉ HACE, y son dos cosas distintas que se cuentan por separado:**
 *   1. Renombra `Lote N — <finca>` a `Parcela N — <finca>` en ubicaciones de
 *      tipo `plot`. El número y la finca se conservan tal cual.
 *   2. Pone la organización a las parcelas que no la tienen. Seis de Finca
 *      Rosina cuelgan del sitio por el padre pero no dicen a qué finca son, y
 *      las de Cafelino sí. No es cosmético: un operador acotado por
 *      organización no alcanza una parcela que no la declara.
 *
 * **La coincidencia es por PATRÓN EXACTO de nombre, nunca por `contains`.** Es
 * la lección de `rename-finca-rosina.ts`: un `contains` renombró de más una vez
 * y renombrar la finca de otro en silencio es exactamente lo que esto evita.
 * Sólo casa `^Lote <número> — ` sobre ubicaciones `plot`; cualquier otro nombre
 * se lista como **NO tocado** para que se vea qué quedó fuera.
 *
 * **Seco por defecto.** Imprime la fila patrón —qué hay hoy— antes de nada.
 *
 *   npm run data:parcelas-no-son-lotes            (ensayo; sólo imprime)
 *   npm run data:parcelas-no-son-lotes -- --apply (escribe)
 */
import "dotenv/config";
import { prisma } from "../lib/db";
import { recordAuditEvent } from "../lib/audit";

const PATRON = /^Lote (\d+) — (.+)$/;

async function main() {
  const aplicar = process.argv.includes("--apply");

  const parcelas = await prisma.location.findMany({
    where: { locationType: "plot" },
    select: { id: true, name: true, organizationId: true, parentLocation: { select: { name: true, organizationId: true } } },
    orderBy: { name: "asc" },
  });

  // Fila patrón: qué hay HOY, antes de decidir nada.
  console.log(`\n  ${parcelas.length} parcela(s) en la base:\n`);
  const aRenombrar: { id: string; antes: string; despues: string }[] = [];
  const aVincular: { id: string; nombre: string; organizationId: string }[] = [];
  for (const p of parcelas) {
    const casa = PATRON.exec(p.name);
    const nuevo = casa ? `Parcela ${casa[1]} — ${casa[2]}` : null;
    const orgHeredada = p.organizationId ? null : p.parentLocation?.organizationId ?? null;
    const marcas = [nuevo ? "renombra" : "NO tocado", orgHeredada ? "+organización" : null].filter(Boolean);
    console.log(`    ${p.name.padEnd(34)} ${marcas.join(", ")}`);
    if (nuevo) aRenombrar.push({ id: p.id, antes: p.name, despues: nuevo });
    if (orgHeredada) aVincular.push({ id: p.id, nombre: p.name, organizationId: orgHeredada });
  }

  console.log(`\n  A renombrar: ${aRenombrar.length}   A vincular con su finca: ${aVincular.length}`);

  if (!aplicar) {
    console.log("\n  Ensayo. Para escribirlo:  npm run data:parcelas-no-son-lotes -- --apply\n");
    return;
  }

  const admin = await prisma.userAccount.findFirst({
    where: { assignments: { some: { roleProfile: { name: "Platform Admin" } } } },
    select: { id: true },
  });
  if (!admin) {
    console.error("\n  No hay ninguna cuenta con Platform Admin: el rastro quedaría sin actor.\n");
    process.exit(1);
  }

  for (const r of aRenombrar) {
    await prisma.$transaction(async (tx) => {
      await tx.location.update({ where: { id: r.id }, data: { name: r.despues } });
      await recordAuditEvent(
        {
          actorUserAccountId: admin.id,
          operation: "location.update",
          entityType: "location",
          entityId: r.id,
          before: { name: r.antes },
          after: { name: r.despues },
          reason: "una parcela no es un lote: la palabra queda libre para el batch (decisión de Daniel, 2026-09-11)",
          sourceInterface: "scripts/parcelas-no-se-llaman-lotes",
        },
        tx,
      );
    });
    console.log(`    ${r.antes}  →  ${r.despues}`);
  }

  for (const v of aVincular) {
    await prisma.$transaction(async (tx) => {
      await tx.location.update({ where: { id: v.id }, data: { organizationId: v.organizationId } });
      await recordAuditEvent(
        {
          actorUserAccountId: admin.id,
          operation: "location.update",
          entityType: "location",
          entityId: v.id,
          before: { organizationId: null },
          after: { organizationId: v.organizationId },
          reason: "la parcela hereda la organización de su finca: sin ella, un operador acotado por organización no la alcanza",
          sourceInterface: "scripts/parcelas-no-se-llaman-lotes",
        },
        tx,
      );
    });
    console.log(`    organización puesta a ${v.nombre}`);
  }

  console.log(`\n  Hecho: ${aRenombrar.length} renombrada(s), ${aVincular.length} vinculada(s).\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
