import { prisma } from "../db";
import { TraceabilityAccessError } from "./lots";
import { getRoastSessionDetail } from "./roasting";

/** Called only after the report has authorized these samples' source lot.
 * Preparation details additionally pass the existing roast source-lot gate.
 * Never return blind codes, assessments, or evaluator identity.
 */
export async function getReportRoastPreparations(userAccountId: string, sampleIds: string[]) {
  if (!sampleIds.length) return [];
  const mappings = await prisma.sensoryBlindMapping.findMany({
    where: { sampleId: { in: sampleIds }, roastSessionId: { not: null } },
    select: { sampleId: true, roastSessionId: true,
      blindSample: { select: { flight: { select: { sessionId: true } } } } },
  });
  const preparations = [];
  for (const mapping of mappings) {
    if (!mapping.roastSessionId) continue;
    try {
      const roast = await getRoastSessionDetail(userAccountId, mapping.roastSessionId);
      preparations.push({
        sampleId: mapping.sampleId, sessionId: mapping.blindSample.flight.sessionId,
        roastId: roast.id, startedAt: roast.startedAt, endedAt: roast.endedAt,
        roastLevel: roast.roastLevel,
        chargeWeightKg: roast.chargeWeightKg?.toString() ?? null,
        dischargeWeightKg: roast.dischargeWeightKg?.toString() ?? null,
      });
    } catch (error) {
      if (!(error instanceof TraceabilityAccessError)) throw error;
      // An inaccessible preparation must not expose even its reference.
    }
  }
  return preparations;
}
