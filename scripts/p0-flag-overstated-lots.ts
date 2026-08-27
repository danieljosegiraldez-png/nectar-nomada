/**
 * P0 §8 (docs/implementation/41_P0_MASS_BALANCE.md) — flag the lots whose
 * quantity ledger was inflated by the pre-P0 write path.
 *
 * Those lots were consumed as a transformation input, but no decrement was
 * ever written for them, so they still report their full intake while their
 * children also report theirs. Measured against the 2026-08-26 restore: three
 * such lots (PE-79, PE-80, PE-90 — Cafelino cherry, 145.3 kg between them).
 *
 * **No quantity is synthesized.** Per §58 Decision C the remediation is to
 * mark the record as untrustworthy and exclude it from yield reporting, not
 * to invent a corrected figure. If the true consumed weights are recoverable
 * from the Cafelino source CSVs or from Cafelino directly, they should be
 * entered afterwards as genuine corrections — a real `transfer_out` event
 * with a real provenance class. If they are not recoverable, these lots stay
 * flagged permanently, and that is the honest outcome.
 *
 * Detection is **by condition, not by hardcoded lot code**: a lot that was
 * consumed as an input and carries a ledger but no subtractive event of any
 * kind. After the P0 fix no newly written transformation can produce that
 * shape, so this identifies exactly the historical rows and nothing else —
 * and re-running it is a safe no-op.
 *
 * Usage:
 *   npm run data:flag-overstated-lots -- --dry-run    (default; prints only)
 *   npm run data:flag-overstated-lots -- --apply
 */
import "dotenv/config";
import { prisma } from "../lib/db";
import { recordAuditEvent } from "../lib/audit";

const REASON =
  "P0 (41_P0_MASS_BALANCE.md §8): consumed as a transformation input before the " +
  "input-side ledger existed, so this quantity is overstated. Excluded from yield " +
  "reporting until corrected with real weights.";

async function main() {
  const apply = process.argv.includes("--apply");

  const candidates = await prisma.$queryRaw<Array<{ id: string; lot_code: string; ledger: string }>>`
    SELECT l.id,
           l.lot_code,
           COALESCE(SUM(q.quantity) FILTER (
             WHERE q.event_type IN ('received','process_output','transfer_in','adjustment_increase')
           ), 0)::text AS ledger
    FROM traceability.lot l
    JOIN traceability.quantity_event q ON q.lot_id = l.id
    WHERE EXISTS (
      SELECT 1 FROM traceability.lot_transformation_input i WHERE i.lot_id = l.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM traceability.quantity_event q2
      WHERE q2.lot_id = l.id
        AND q2.event_type IN ('transfer_out','loss','adjustment_decrease','sample_removed')
    )
    GROUP BY l.id, l.lot_code
    ORDER BY l.lot_code
  `;

  if (candidates.length === 0) {
    console.log("No overstated lots found — nothing to flag.");
    return;
  }

  const total = candidates.reduce((sum, c) => sum + Number(c.ledger), 0);
  console.log(`${candidates.length} overstated lot(s), ${total} overstated in their ledger units:\n`);
  for (const c of candidates) console.log(`  ${c.lot_code.padEnd(12)} ledger says ${c.ledger}`);

  if (!apply) {
    console.log("\nDry run. Re-run with --apply to set dataQuality = conflicting on these lots.");
    return;
  }

  let flagged = 0;
  for (const candidate of candidates) {
    const before = await prisma.lot.findUniqueOrThrow({ where: { id: candidate.id } });
    if (before.dataQuality === "conflicting") continue; // idempotent

    const after = await prisma.lot.update({
      where: { id: candidate.id },
      data: { dataQuality: "conflicting" },
    });

    await recordAuditEvent({
      actorUserAccountId: null,
      operation: "lot.flag_conflicting_quantity",
      entityType: "lot",
      entityId: candidate.id,
      before,
      after,
      reason: REASON,
      sourceInterface: "scripts/p0-flag-overstated-lots.ts",
    });
    flagged++;
  }

  console.log(`\nFlagged ${flagged} lot(s) as dataQuality = conflicting.`);
  if (flagged < candidates.length) {
    console.log(`${candidates.length - flagged} were already flagged — no change.`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
