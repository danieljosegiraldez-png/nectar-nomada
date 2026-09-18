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
import { CLASSIFICATION_NOT_APPLICABLE } from "../rbac/resolve";
import { recordAuditEvent } from "../audit";
import type { ScopeTarget } from "../rbac/types";
import type { Aspect, ShadePercentageBracket, SubdivisionReason, SunExposure } from "../../generated/prisma/client";

export class LocationAccessError extends Error {}

/**
 * La organización a la que pertenece una Location, subiendo por la jerarquía.
 *
 * Existe por un hallazgo de la revisión independiente del 2026-09-01:
 * `createBiocharBatch` aceptaba `organizationId` del llamador y sólo comprobaba
 * que existiera, así que un lote podía quedar **producido en la finca A y
 * propiedad de la organización B**. Eso contradice la regla del repositorio —
 * el dueño de una Location se mira en `core.location.organization_id`, y leer
 * otra cosa es exactamente lo que salió mal en el renombrado de Finca Rosina.
 *
 * Sube por `parentLocationId` porque una parcela puede no llevar organización
 * propia y heredarla de su finca; es la misma resolución que
 * `getManageableContext` hace para decidir visibilidad, aquí extraída para que
 * no viva sólo dentro de aquella función.
 *
 * Devuelve `null` cuando ni ella ni ningún ancestro la declaran. Quien llame
 * decide si eso es un error: para un lote de biochar lo es, porque un lote sin
 * dueño no se puede atribuir.
 */
export async function resolveOrganizationForLocation(locationId: string): Promise<string | null> {
  const vistos = new Set<string>();
  let actual: { id: string; organizationId: string | null; parentLocationId: string | null } | null =
    await prisma.location.findUnique({
      where: { id: locationId },
      select: { id: true, organizationId: true, parentLocationId: true },
    });

  while (actual) {
    if (actual.organizationId) return actual.organizationId;
    // Un ciclo en la jerarquía colgaría el bucle. No debería haberlos, pero
    // «no debería» no es una garantía y el coste de comprobarlo es un Set.
    if (vistos.has(actual.id)) return null;
    vistos.add(actual.id);
    if (!actual.parentLocationId) return null;
    actual = await prisma.location.findUnique({
      where: { id: actual.parentLocationId },
      select: { id: true, organizationId: true, parentLocationId: true },
    });
  }
  return null;
}
export class LocationValidationError extends Error {}

/**
 * `Location` carries no `projectId` of its own (a farm's plots aren't
 * scoped to a single Project the way a Lot is) — the only concrete scope
 * target a Location resolves against is itself, leaf-scope containment
 * (RBAC.md §3) doing the rest for a location-scoped Farm Operator
 * Assignment.
 */
/**
 * La versión que pregunta en vez de exigir, para que una pantalla pueda decidir
 * si ofrece el formulario. Misma comprobación que la escritura —no una copia—,
 * y sólo se traga la negativa.
 */
export async function puedeGestionarAtributosDeUbicacion(userAccountId: string, locationId: string): Promise<boolean> {
  try {
    await requireLocationAttributeAccess(userAccountId, locationId);
    return true;
  } catch (error) {
    if (error instanceof LocationAccessError) return false;
    throw error;
  }
}

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

/**
 * «Editar beneficio» (spec #370 §4.3). No hace nada si la ubicación no es un
 * beneficio: parcelas y sitios siguen como estaban. Si lo es, exige
 * `location:edit_beneficio` sobre el propio beneficio.
 *
 * Existe porque la auditoría de Codex del 2026-09-18 encontró que el capataz
 * —que tiene `manage_attributes` por perfil y lo hereda del sitio— editaba
 * atributos y coordenadas de un beneficio por la acción de parcela, que no
 * miraba el tipo. La regla de Daniel es sobre escrituras, así que vive aquí,
 * en el servicio, y cada camino la llama.
 */
export async function exigeEditarBeneficioSiLoEs(userAccountId: string, locationId: string) {
  const location = await prisma.location.findUnique({
    where: { id: locationId },
    select: { locationType: true, classification: true },
  });
  if (!location) throw new LocationAccessError("location_not_found");
  if (location.locationType !== "beneficio") return;
  const target: ScopeTarget = { scopeType: "location", scopeRefId: locationId };
  if (await can(userAccountId, "edit_beneficio", "location", target, location.classification)) return;
  throw new LocationAccessError("no_beneficio_edit_access");
}

/**
 * `location:edit_beneficio` sobre una ubicación, sea del tipo que sea. Para lo
 * que es configuración del beneficio aunque no cuelgue de él: las
 * instalaciones de secado y sus camas cuelgan del sitio (decisión de Daniel
 * del 2026-09-18: «todas», cuelguen de donde cuelguen). `can()` sube por los
 * ancestros, así que un Farm Manager asignado en la finca pasa sobre sus hijos.
 */
export async function exigeEditarBeneficioEn(userAccountId: string, locationId: string) {
  const location = await prisma.location.findUnique({ where: { id: locationId }, select: { classification: true } });
  if (!location) throw new LocationAccessError("location_not_found");
  const target: ScopeTarget = { scopeType: "location", scopeRefId: locationId };
  if (await can(userAccountId, "edit_beneficio", "location", target, location.classification)) return;
  throw new LocationAccessError("no_beneficio_edit_access");
}

/**
 * `location:edit_beneficio` en ALGÚN lugar de una organización — para lo que es
 * de la organización y no de un lugar, como las recetas. Una receta compartida
 * (`organizationId` nulo) sólo se configura con alcance de plataforma.
 */
export async function exigeEditarBeneficioEnOrganizacion(userAccountId: string, organizationId: string | null) {
  if (organizationId === null) {
    if (
      await can(
        userAccountId,
        "edit_beneficio",
        "location",
        { scopeType: "platform", scopeRefId: null },
        CLASSIFICATION_NOT_APPLICABLE,
      )
    )
      return;
    throw new LocationAccessError("no_beneficio_edit_access");
  }
  const lugares = await prisma.location.findMany({ where: { organizationId }, select: { id: true, classification: true } });
  for (const l of lugares) {
    if (await can(userAccountId, "edit_beneficio", "location", { scopeType: "location", scopeRefId: l.id }, l.classification)) return;
  }
  // Una organización con lotes pero sin ninguna Location propia (los tres
  // archivos de recetas existentes, con actor Platform Admin, la dejan así)
  // no tiene ningún lugar contra el que comprobar `can()`: sin este último
  // intento de plataforma, ni siquiera un Platform Admin podría configurarla
  // — el mismo respaldo que `scopeTargetsFor` en lots.ts usa para un lote sin
  // proyecto ni ubicación.
  if (
    await can(
      userAccountId,
      "edit_beneficio",
      "location",
      { scopeType: "platform", scopeRefId: null },
      CLASSIFICATION_NOT_APPLICABLE,
    )
  )
    return;
  throw new LocationAccessError("no_beneficio_edit_access");
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
  await exigeEditarBeneficioSiLoEs(userAccountId, input.locationId);

  const nextMin = input.altitudeMinM !== undefined ? input.altitudeMinM : existing.altitudeMinM;
  const nextMax = input.altitudeMaxM !== undefined ? input.altitudeMaxM : existing.altitudeMaxM;
  if (nextMin != null && nextMax != null && nextMin > nextMax) {
    throw new LocationValidationError("altitude_min_exceeds_max");
  }

  const before = existing;
  const after = await prisma.$transaction(async (tx) => {
    const after = await tx.location.update({
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
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "location.update_attributes",
        entityType: "location",
        entityId: after.id,
        before,
        after,
        sourceInterface: "traceability.service",
      },
      tx,
    );

    return after;
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

  // Un microlote copia el tipo del padre, así que sobre un beneficio crearía
  // OTRO beneficio, saltándose `create_site` y la regla de que un beneficio
  // cuelga de un sitio. Hoy ninguna pantalla lo llama; se cierra igual.
  if (parent.locationType === "beneficio") throw new LocationValidationError("beneficio_no_se_subdivide");

  const microlot = await prisma.$transaction(async (tx) => {
    const microlot = await tx.location.create({
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

    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "location.create_microlot",
        entityType: "location",
        entityId: microlot.id,
        after: microlot,
        sourceInterface: "traceability.service",
      },
      tx,
    );

    return microlot;
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
