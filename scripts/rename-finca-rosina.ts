/**
 * Rename the Cerro Azul property from "Las Nubes" to its real names
 * (product owner, 2026-08-27).
 *
 * The correction: **Finca Rosina** is the farm, **Cerro Azul** is the place it
 * sits in, and **Las Nubes** is not being retired — it is the name of the
 * *beneficio*. Every location under the property had inherited the string
 * "Finca Las Nubes Cerro Azul", so the organization said Rosina and all eleven
 * of its locations said Las Nubes.
 *
 * Matching is by **exact current name**, never `contains`. A substring match
 * would also catch `Finca Las Nubes (Jaramillo Arriba, Boquete)` — a genuinely
 * different property in a different district that the product owner asked to
 * leave untouched — and quietly renaming someone else's farm is precisely the
 * failure this explicitness prevents.
 *
 * Deliberately NOT touched:
 *   - the `locality` "Cerro Azul" (the place is correctly named)
 *   - the Boquete organization and its site
 *   - the public Story "Discovering Las Nubes" and Experience
 *     "Farm Visit — Las Nubes" (editorial content, left as-is by decision)
 *   - every `slug`, so public URLs survive the rename
 *
 * Usage:
 *   npm run data:rename-finca-rosina             (dry run; prints only)
 *   npm run data:rename-finca-rosina -- --apply
 */
import "dotenv/config";
import { prisma } from "../lib/db";
import { recordAuditEvent } from "../lib/audit";

const REASON =
  "Product owner correction 2026-08-27: Finca Rosina is the farm, Cerro Azul is the " +
  "locality, and Las Nubes is the beneficio's name — not the property's.";

/** Exact current name → new name. Anything not listed here is not touched. */
const LOCATION_RENAMES: ReadonlyArray<readonly [from: string, to: string]> = [
  ["Finca Las Nubes Cerro Azul", "Finca Rosina"],
  ["Beneficio — Finca Las Nubes Cerro Azul", "Beneficio Las Nubes"],
  // Drying is a processing stage, and RO1 already treats the drying room as
  // processing infrastructure (its light exposure and bed-level count are
  // ProcessingStage context), so it belongs to the beneficio, not the farm.
  ["Cuarto de secado — Finca Las Nubes Cerro Azul", "Cuarto de secado — Beneficio Las Nubes"],
  ["Lote 1 — Finca Las Nubes Cerro Azul", "Lote 1 — Finca Rosina"],
  ["Lote 2 — Finca Las Nubes Cerro Azul", "Lote 2 — Finca Rosina"],
  ["Lote 3 — Finca Las Nubes Cerro Azul", "Lote 3 — Finca Rosina"],
  ["Lote 4 — Finca Las Nubes Cerro Azul", "Lote 4 — Finca Rosina"],
  ["Lote 5 — Finca Las Nubes Cerro Azul", "Lote 5 — Finca Rosina"],
  ["Lote 6 — Finca Las Nubes Cerro Azul", "Lote 6 — Finca Rosina"],
  ["Apiario 1 — Finca Las Nubes Cerro Azul", "Apiario 1 — Finca Rosina"],
  ["Apiario 2 — Finca Las Nubes Cerro Azul", "Apiario 2 — Finca Rosina"],
];

const PROJECT_RENAMES: ReadonlyArray<readonly [from: string, to: string]> = [
  ["Las Nubes Cerro Azul — Café", "Finca Rosina — Café"],
  ["Las Nubes Cerro Azul — Apiario", "Finca Rosina — Apiario"],
];

async function main() {
  const apply = process.argv.includes("--apply");
  let planned = 0;
  let missing = 0;
  let alreadyDone = 0;

  console.log(apply ? "APPLYING renames\n" : "DRY RUN — nothing will be written\n");

  console.log("Locations:");
  for (const [from, to] of LOCATION_RENAMES) {
    const row = await prisma.location.findFirst({ where: { name: from } });
    if (!row) {
      const already = await prisma.location.findFirst({ where: { name: to } });
      if (already) {
        console.log(`  · ${to}  (already renamed)`);
        alreadyDone++;
      } else {
        console.log(`  ! NOT FOUND: "${from}"`);
        missing++;
      }
      continue;
    }
    console.log(`  ${from}\n    → ${to}`);
    planned++;
    if (!apply) continue;

    const after = await prisma.location.update({ where: { id: row.id }, data: { name: to } });
    await recordAuditEvent({
      actorUserAccountId: null,
      operation: "location.rename",
      entityType: "location",
      entityId: row.id,
      before: row,
      after,
      reason: REASON,
      sourceInterface: "scripts/rename-finca-rosina.ts",
    });
  }

  console.log("\nProjects:");
  for (const [from, to] of PROJECT_RENAMES) {
    const row = await prisma.project.findFirst({ where: { name: from } });
    if (!row) {
      const already = await prisma.project.findFirst({ where: { name: to } });
      if (already) {
        console.log(`  · ${to}  (already renamed)`);
        alreadyDone++;
      } else {
        console.log(`  ! NOT FOUND: "${from}"`);
        missing++;
      }
      continue;
    }
    console.log(`  ${from}\n    → ${to}`);
    planned++;
    if (!apply) continue;

    const after = await prisma.project.update({ where: { id: row.id }, data: { name: to } });
    await recordAuditEvent({
      actorUserAccountId: null,
      operation: "project.rename",
      entityType: "project",
      entityId: row.id,
      before: row,
      after,
      reason: REASON,
      sourceInterface: "scripts/rename-finca-rosina.ts",
    });
  }

  console.log(
    `\n${apply ? "Renamed" : "Would rename"} ${planned} row(s).` +
      (alreadyDone ? ` ${alreadyDone} already done.` : "") +
      (missing ? ` ${missing} NOT FOUND — investigate before re-running.` : ""),
  );
  if (!apply && planned > 0) console.log("Re-run with --apply to write these.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
