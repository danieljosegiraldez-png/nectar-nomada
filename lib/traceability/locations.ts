/**
 * F1 (docs/implementation/30_F1_OPERACION_FINCA_ESQUEMA.md §1-2). Stable
 * terroir attributes on `Location`, and microlot subdivision. Schema only —
 * this ticket has no UI by explicit product-owner decision
 * (`29_BRECHAS_OPERACION_FINCA_INVESTIGACION_MIGRACION.md` §6).
 *
 * RBAC: `location:manage_attributes`, not `lot:manage` — editing a
 * Location's own record is a different authority than recording a fact
 * under an existing one (§4's labourEntry/materialConsumptionEntry
 * extension, in operations.ts, does reuse lot:manage — that's a different
 * kind of write, a new child row, not an edit to the parent).
 */
import { prisma } from "../db";
import { can } from "../rbac/service";
import { recordAuditEvent } from "../audit";
import type { ScopeTarget } from "../rbac/types";
import type { Aspect, ShadePercentageBracket, SubdivisionReason, SunExposure } from "../../generated/prisma/client";

export class LocationAccessError extends Error {}
export class LocationValidationError extends Error {}

/**
 * `Location` carries no `projectId` of its own (a farm's plots aren't
 * scoped to a single Project the way a Lot is) — the only concrete scope
 * target a Location resolves against is itself, leaf-scope containment
 * (RBAC.md §3) doing the rest for a location-scoped Farm Operator
 * Assignment.
 */
export async function requireLocationAttributeAccess(userAccountId: string, locationId: string) {
  // Gate on the Location's own classification (ADR-068). A Location is one of
  // the records that declares its sensitivity — sixteen of them are `internal`
  // — so the AND-gate has a real subject here, unlike the platform-wide
  // capability checks elsewhere.
  //
  // A location that does not exist is refused rather than treated as public:
  // defaulting a missing record to the most permissive level is how a gate
  // gets bypassed by a bad id.
  const location = await prisma.location.findUnique({
    where: { id: locationId },
    select: { classification: true },
  });
  if (!location) throw new LocationAccessError("location_not_found");

  const target: ScopeTarget = { scopeType: "location", scopeRefId: locationId };
  if (await can(userAccountId, "manage_attributes", "location", target, location.classification)) return;
  throw new LocationAccessError("no_location_attribute_access");
}

export interface UpdateLocationAttributesInput {
  locationId: string;
  sunExposure?: SunExposure | null;
  shadePercentage?: ShadePercentageBracket | null;
  altitudeMinM?: number | null;
  altitudeMaxM?: number | null;
  slopeDescription?: string | null;
  // S1 §2 — orientación de la ladera. Enumerada, no texto: el marco la usa
  // para comparar bloques entre sí, y eso exige que el valor agrupe.
  aspect?: Aspect | null;
  soilType?: string | null;
  plantSpacingMeters?: number | null;
  // P1 §3 — declared block area. Not derived from a boundary polygon: none
  // exists, and a producer knows their hectares before anyone walks the
  // perimeter. When polygons arrive this becomes the value to reconcile the
  // computed one against.
  areaHectares?: number | null;
  description?: string | null;
}

/**
 * §1's "typed value + free note" rule is enforced by the schema itself
 * (every field nullable, `description` always present as a column) — there
 * is nothing to validate here beyond the altitude range ordering. Every
 * field is independently updatable; omitted keys are left untouched (a
 * `PATCH` shape, not a full replace) so recording just the altitude range
 * today doesn't require knowing the soil type too.
 */
export async function updateLocationAttributes(userAccountId: string, input: UpdateLocationAttributesInput) {
  const existing = await prisma.location.findUnique({ where: { id: input.locationId } });
  if (!existing) throw new LocationAccessError("location_not_found");

  await requireLocationAttributeAccess(userAccountId, input.locationId);

  const nextMin = input.altitudeMinM !== undefined ? input.altitudeMinM : existing.altitudeMinM;
  const nextMax = input.altitudeMaxM !== undefined ? input.altitudeMaxM : existing.altitudeMaxM;
  if (nextMin != null && nextMax != null && nextMin > nextMax) {
    throw new LocationValidationError("altitude_min_exceeds_max");
  }

  const before = existing;
  const after = await prisma.location.update({
    where: { id: input.locationId },
    data: {
      ...(input.sunExposure !== undefined ? { sunExposure: input.sunExposure } : {}),
      ...(input.shadePercentage !== undefined ? { shadePercentage: input.shadePercentage } : {}),
      ...(input.altitudeMinM !== undefined ? { altitudeMinM: input.altitudeMinM } : {}),
      ...(input.altitudeMaxM !== undefined ? { altitudeMaxM: input.altitudeMaxM } : {}),
      ...(input.slopeDescription !== undefined ? { slopeDescription: input.slopeDescription } : {}),
      ...(input.aspect !== undefined ? { aspect: input.aspect } : {}),
      ...(input.soilType !== undefined ? { soilType: input.soilType } : {}),
      ...(input.plantSpacingMeters !== undefined ? { plantSpacingMeters: input.plantSpacingMeters } : {}),
      ...(input.areaHectares !== undefined ? { areaHectares: input.areaHectares } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
    },
  });

  // C1 §3 pattern: editing a Location's own attribute record is an
  // evidentiary write in spirit (it's the basis for future terroir
  // analysis), even though Location itself doesn't carry the generic
  // provenanceClass column — same reasoning already applied to Assessment.
  await recordAuditEvent({
    actorUserAccountId: userAccountId,
    operation: "location.update_attributes",
    entityType: "location",
    entityId: after.id,
    before,
    after,
    sourceInterface: "traceability.service",
  });

  return after;
}

export interface CreateMicrolotInput {
  parentLocationId: string;
  name: string;
  slug?: string | null;
  subdivisionReason: SubdivisionReason;
  subdivisionReasonNote?: string | null;
}

/**
 * §2 rule 1 (a batch harvested before the microlot existed stays
 * attributed to the whole lot) needs no code — there is no function
 * anywhere in this codebase that reassigns an existing Lot/HarvestEvent's
 * locationId, and this function doesn't add one. §2 rule 2 (the system
 * never detects microlots) also needs no code — see `getAltitudeRange`
 * below for the one arithmetic-only exception the ticket explicitly
 * allows.
 */
export async function createMicrolot(userAccountId: string, input: CreateMicrolotInput) {
  if (!input.name.trim()) throw new LocationValidationError("name_required");

  const parent = await prisma.location.findUnique({ where: { id: input.parentLocationId } });
  if (!parent) throw new LocationAccessError("parent_location_not_found");

  await requireLocationAttributeAccess(userAccountId, input.parentLocationId);

  const microlot = await prisma.location.create({
    data: {
      name: input.name.trim(),
      slug: input.slug ?? null,
      locationType: parent.locationType,
      parentLocationId: parent.id,
      organizationId: parent.organizationId,
      subdivisionReason: input.subdivisionReason,
      subdivisionReasonNote: input.subdivisionReasonNote ?? null,
      createdBy: userAccountId,
    },
  });

  await recordAuditEvent({
    actorUserAccountId: userAccountId,
    operation: "location.create_microlot",
    entityType: "location",
    entityId: microlot.id,
    after: microlot,
    sourceInterface: "traceability.service",
  });

  return microlot;
}

/**
 * §2's own boundary: "el sistema puede señalar que un lote con rango de
 * altitud amplio es candidato a subdividirse — pero eso es aritmética
 * sobre un dato cargado, no detección." Deliberately returns the raw
 * range, not a boolean against an invented threshold — Cerro Azul's own
 * 50m range (600-650) is the example the ticket cites as real
 * subdivision-worthy variation, and Las Nubes Jaramillo's 200m (1300-1500)
 * is another; picking a magic cutoff number here wasn't asked for and
 * would just move the invention from "detecting a microlot" to
 * "guessing which range counts as wide," the same mistake by another name.
 */
export function getAltitudeRange(location: { altitudeMinM: number | null; altitudeMaxM: number | null }): number | null {
  if (location.altitudeMinM == null || location.altitudeMaxM == null) return null;
  return location.altitudeMaxM - location.altitudeMinM;
}
