/**
 * Resolving "what classification gates this scope target?" — ADR-068/069.
 *
 * Several records carry no classification of their own: an Experiment, a
 * Measurement, a Hive, a ColonyEvent. What declares how sensitive they are is
 * the Project or Location they belong to. Every such module needs the same
 * three rules, and they are subtle enough that a second hand-written copy
 * would eventually get one of them wrong:
 *
 *   1. A project/location target gates on that record's classification.
 *   2. A target whose record cannot be loaded is *skipped*, never treated as
 *      public — defaulting a missing record to the most permissive level is
 *      how a gate gets bypassed by a stale id.
 *   3. A platform target (emitted only when a candidate has neither a project
 *      nor a location) has no record at all, so `public` is correct and final.
 */
import { prisma } from "../db";
import { CLASSIFICATION_NOT_APPLICABLE } from "./resolve";
import type { ClassificationLevel } from "../../generated/prisma/client";
import type { ScopeTarget } from "./types";

export interface ScopeCandidate {
  projectId?: string | null;
  locationId?: string | null;
}

/**
 * Loads the classification of every Project and Location the candidates name,
 * in two queries rather than one per candidate — these helpers run on every
 * read, and a candidate list commonly holds several rows pointing at the same
 * project.
 */
export async function loadScopeClassifications(
  candidates: ReadonlyArray<ScopeCandidate>,
): Promise<Map<string, ClassificationLevel>> {
  const projectIds = [...new Set(candidates.map((c) => c.projectId).filter((id): id is string => Boolean(id)))];
  const locationIds = [...new Set(candidates.map((c) => c.locationId).filter((id): id is string => Boolean(id)))];

  const [projects, locations] = await Promise.all([
    projectIds.length
      ? prisma.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, classification: true } })
      : Promise.resolve([]),
    locationIds.length
      ? prisma.location.findMany({ where: { id: { in: locationIds } }, select: { id: true, classification: true } })
      : Promise.resolve([]),
  ]);

  return new Map<string, ClassificationLevel>([
    ...projects.map((p) => [p.id, p.classification] as const),
    ...locations.map((l) => [l.id, l.classification] as const),
  ]);
}

/**
 * The classification to gate `target` on, or `null` when the target names a
 * record that could not be loaded and the caller should skip it.
 */
export function classificationForTarget(
  target: ScopeTarget,
  classifications: Map<string, ClassificationLevel>,
): ClassificationLevel | null {
  if (target.scopeRefId === null) return CLASSIFICATION_NOT_APPLICABLE;
  return classifications.get(target.scopeRefId) ?? null;
}
