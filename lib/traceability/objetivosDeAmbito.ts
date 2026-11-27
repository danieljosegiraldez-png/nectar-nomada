import type { ScopeTarget } from "../rbac/types";

/**
 * Every concrete scope target a Lot (or a to-be-created Lot's parent context) resolves against — never just one.
 *
 * Vivía en `lots.ts`, que la sigue reexportando. Está aquí sola para que `lib/research/access.ts` la use sin
 * importar `lots.ts`, que desde el 2026-10-12 pregunta por investigación (el historial del lote enseña sus
 * ensayos sólo a quien puede verlos).
 */
/** Every concrete scope target a Lot (or a to-be-created Lot's parent context) resolves against — never just one. */
export function scopeTargetsFor(input: { projectId?: string | null; locationId?: string | null }): ScopeTarget[] {
  const targets: ScopeTarget[] = [];
  if (input.projectId) targets.push({ scopeType: "project", scopeRefId: input.projectId });
  if (input.locationId) targets.push({ scopeType: "location", scopeRefId: input.locationId });
  // A Lot with neither is only manageable platform-wide — `can()` already
  // resolves a Platform Admin's assignment against any concrete target, but
  // with no project/location to point at, the only target left to check is
  // platform scope itself.
  if (targets.length === 0) targets.push({ scopeType: "platform", scopeRefId: null });
  return targets;
}
