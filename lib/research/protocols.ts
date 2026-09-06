/**
 * RO1 (docs/implementation/34_RO1_RESEARCH_OS.md §2, §3, §4). Protocol ->
 * ProtocolVersion -> ProtocolVariable/ProtocolRequiredMeasurement — the
 * fourth reuse of the Protocol/ProtocolVersion versioned pattern already
 * proven for Sensory, not a new mechanism (§2).
 *
 * §3's design warning restated: a ProtocolVersion's requiredMeasurements
 * are what make "el sistema sabe qué medir" real — treatments.ts's
 * completeProcessingStage refuses to close a stage that's missing one of
 * these, so this is not documentation, it's an enforced gate (§9.5).
 */
import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { requireResearchAccess, ResearchAccessError } from "./access";
import type { MeasurementVariable } from "../traceability/units";
import type { ProtocolVariableValueType } from "../../generated/prisma/client";

export class ProtocolValidationError extends Error {}

export interface CreateProtocolInput {
  experimentId?: string | null;
  name: string;
  // §4 — stored verbatim ("PE-89"), never decomposed/guessed.
  externalIdentifier?: string | null;
  identifierConvention?: string | null;
  description?: string | null;
}

export async function createProtocol(userAccountId: string, input: CreateProtocolInput) {
  let projectId: string | null = null;
  if (input.experimentId) {
    const experiment = await prisma.experiment.findUnique({ where: { id: input.experimentId } });
    if (!experiment) throw new ResearchAccessError("experiment_not_found");
    projectId = experiment.projectId;
  }
  await requireResearchAccess(userAccountId, "approve_protocol", [{ projectId }]);

  const protocol = await prisma.protocol.create({
    data: {
      experimentId: input.experimentId ?? null,
      name: input.name,
      externalIdentifier: input.externalIdentifier ?? null,
      identifierConvention: input.identifierConvention ?? null,
      description: input.description ?? null,
      createdBy: userAccountId,
    },
  });

  await recordAuditEvent({
    actorUserAccountId: userAccountId,
    operation: "protocol.create",
    entityType: "protocol",
    entityId: protocol.id,
    after: protocol,
    sourceInterface: "research.service",
  });

  return protocol;
}

export interface ProtocolVariableInput {
  name: string;
  description?: string | null;
  valueType: ProtocolVariableValueType;
  unit?: string | null;
  // §3a — required when valueType = "catalog" (Recipiente, Levadura/
  // cultivo, Método de inoculación, Grado de proceso).
  catalogId?: string | null;
  // §3a — required (non-empty) when valueType = "closed_enum" (Fuente de
  // agua, Posición de masa). Frozen at creation.
  enumValues?: string[];
  isControlled?: boolean;
  displayOrder?: number;
}

export interface ProtocolRequiredMeasurementInput {
  // Exactly one of variable/catalogId — §3b: a numeric MeasurementVariable
  // reading (Brix/pH/humedad/peso/densidad), or a categorical
  // VariableCatalog pick ("Estudio de cerezas"'s Selección/Flotado/etc.).
  variable?: MeasurementVariable | null;
  catalogId?: string | null;
  atProcessingStage: string;
  displayOrder?: number;
}

function validateProtocolVariable(v: ProtocolVariableInput) {
  if (v.valueType === "catalog" && !v.catalogId) {
    throw new ProtocolValidationError(`catalog_variable_requires_catalog_id:${v.name}`);
  }
  if (v.valueType === "closed_enum" && (!v.enumValues || v.enumValues.length === 0)) {
    throw new ProtocolValidationError(`closed_enum_variable_requires_enum_values:${v.name}`);
  }
}

function validateRequiredMeasurement(m: ProtocolRequiredMeasurementInput) {
  const hasVariable = Boolean(m.variable);
  const hasCatalog = Boolean(m.catalogId);
  if (hasVariable === hasCatalog) {
    throw new ProtocolValidationError("required_measurement_needs_exactly_one_of_variable_or_catalog");
  }
}

export interface CreateProtocolVersionInput {
  protocolId: string;
  notes?: string | null;
  variables: ProtocolVariableInput[];
  requiredMeasurements: ProtocolRequiredMeasurementInput[];
}

/**
 * Always creates a new, independent version row — never mutates or deletes
 * a prior one (§9.2's "la version anterior sobrevive"). Status starts
 * `draft`; use activateProtocolVersion to promote it and correctly retire
 * whichever version was previously active.
 */
export async function createProtocolVersion(userAccountId: string, input: CreateProtocolVersionInput) {
  const protocol = await prisma.protocol.findUnique({ where: { id: input.protocolId } });
  if (!protocol) throw new ResearchAccessError("protocol_not_found");
  const projectId = protocol.experimentId
    ? (await prisma.experiment.findUnique({ where: { id: protocol.experimentId } }))?.projectId ?? null
    : null;
  await requireResearchAccess(userAccountId, "approve_protocol", [{ projectId }]);

  if (input.variables.length === 0) {
    throw new ProtocolValidationError("at_least_one_variable_required");
  }
  input.variables.forEach(validateProtocolVariable);
  input.requiredMeasurements.forEach(validateRequiredMeasurement);

  const lastVersion = await prisma.protocolVersion.findFirst({
    where: { protocolId: input.protocolId },
    orderBy: { version: "desc" },
  });
  const nextVersion = (lastVersion?.version ?? 0) + 1;

  const version = await prisma.$transaction(async (tx) => {
    const created = await tx.protocolVersion.create({
      data: {
        protocolId: input.protocolId,
        version: nextVersion,
        notes: input.notes ?? null,
        createdBy: userAccountId,
        variables: {
          create: input.variables.map((v, index) => ({
            name: v.name,
            description: v.description ?? null,
            valueType: v.valueType,
            unit: v.unit ?? null,
            catalogId: v.catalogId ?? null,
            enumValues: v.enumValues ?? [],
            isControlled: v.isControlled ?? true,
            displayOrder: v.displayOrder ?? index,
          })),
        },
        requiredMeasurements: {
          create: input.requiredMeasurements.map((m, index) => ({
            variable: m.variable ?? null,
            catalogId: m.catalogId ?? null,
            atProcessingStage: m.atProcessingStage,
            displayOrder: m.displayOrder ?? index,
          })),
        },
      },
      include: { variables: true, requiredMeasurements: true },
    });
    // Dentro de la transacción y con `tx` desde el 2026-09-06: una versión de
    // protocolo confirmada no puede quedarse sin su AuditEvent. Ver la
    // cabecera de `lib/audit.ts`.
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "protocol_version.create",
        entityType: "protocol_version",
        entityId: created.id,
        after: created,
        sourceInterface: "research.service",
      },
      tx,
    );

    return created;
  });

  return version;
}

/**
 * Promotes a draft/superseded version to `active`, and — if a different
 * version of the same Protocol is currently active — retires it to
 * `superseded` with supersededByVersionId pointing at this one. The
 * retired version's own rows (variables, required measurements, any
 * TreatmentBatches already run under it) are untouched (§9.2).
 */
export async function activateProtocolVersion(userAccountId: string, protocolVersionId: string) {
  const version = await prisma.protocolVersion.findUnique({ where: { id: protocolVersionId } });
  if (!version) throw new ResearchAccessError("protocol_version_not_found");
  const protocol = await prisma.protocol.findUniqueOrThrow({ where: { id: version.protocolId } });
  const projectId = protocol.experimentId
    ? (await prisma.experiment.findUnique({ where: { id: protocol.experimentId } }))?.projectId ?? null
    : null;
  await requireResearchAccess(userAccountId, "approve_protocol", [{ projectId }]);

  const result = await prisma.$transaction(async (tx) => {
    const previousActive = await tx.protocolVersion.findFirst({
      where: { protocolId: version.protocolId, status: "active", id: { not: version.id } },
    });
    if (previousActive) {
      await tx.protocolVersion.update({
        where: { id: previousActive.id },
        data: { status: "superseded", supersededByVersionId: version.id },
      });
    }
    // Se nombra para poder auditarla dentro: antes se devolvía directamente y
    // el audit la leía como `result`, ya fuera de la transacción.
    const activated = await tx.protocolVersion.update({
      where: { id: version.id },
      data: { status: "active" },
    });

    // Dentro de la transacción y con `tx` desde el 2026-09-06. Aquí importa
    // especialmente: activar una versión SUPERSEDE a la anterior en la misma
    // transacción, así que el audit de la activación y el cambio de estado de
    // las dos filas se confirman juntos o no se confirma ninguno.
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "protocol_version.activate",
        entityType: "protocol_version",
        entityId: activated.id,
        after: activated,
        sourceInterface: "research.service",
      },
      tx,
    );

    return activated;
  });

  return result;
}

export interface ListProtocolsFilter {
  variableName?: string | null;
}

/**
 * §5 — "listar y consultar protocolos, filtrando por variable." Filters by
 * whether any version of the protocol declares a ProtocolVariable with the
 * given name (case-insensitive substring, matching the field's free-text
 * nature — "agua" should surface "agua de río" and "agua de quebrada").
 */
export async function listProtocols(userAccountId: string, filter: ListProtocolsFilter = {}) {
  await requireResearchAccess(userAccountId, "view", [{}]);

  return prisma.protocol.findMany({
    where: filter.variableName
      ? { versions: { some: { variables: { some: { name: { contains: filter.variableName, mode: "insensitive" } } } } } }
      : undefined,
    include: {
      versions: {
        include: { variables: true, requiredMeasurements: true },
        orderBy: { version: "desc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getProtocolVersionDetail(userAccountId: string, protocolVersionId: string) {
  const version = await prisma.protocolVersion.findUnique({
    where: { id: protocolVersionId },
    include: {
      protocol: true,
      variables: { include: { catalog: { include: { values: true } } }, orderBy: { displayOrder: "asc" } },
      requiredMeasurements: true,
    },
  });
  if (!version) throw new ResearchAccessError("protocol_version_not_found");
  await requireResearchAccess(userAccountId, "view", [{}]);
  return version;
}

/**
 * §9.3 — "Agregar una levadura nueva al catálogo sin migración. Si
 * requiere cambio de esquema, el patrón está mal implementado." This is
 * that test's implementation: a plain INSERT into VariableCatalogValue,
 * scoped by the catalog's own key (lib/research/catalogs.ts's seeded
 * VariableCatalog.key), no schema change involved.
 */
export async function addVariableCatalogValue(
  userAccountId: string,
  input: {
    catalogKey: string;
    value: string;
    // §3a-bis — optional; both fields exist on every catalog value.
    definition?: string | null;
    aliasOfId?: string | null;
    impliesUnknownIdentity?: boolean;
    displayOrder?: number;
  },
) {
  await requireResearchAccess(userAccountId, "approve_protocol", [{}]);

  const catalog = await prisma.variableCatalog.findUnique({ where: { key: input.catalogKey } });
  if (!catalog) throw new ResearchAccessError("variable_catalog_not_found");

  if (input.aliasOfId) {
    const canonical = await prisma.variableCatalogValue.findUnique({ where: { id: input.aliasOfId } });
    if (!canonical || canonical.catalogId !== catalog.id) {
      throw new ProtocolValidationError("alias_target_not_in_same_catalog");
    }
    // One level only — an alias points directly at a canonical row, never
    // chains through another alias (§3a-bis's own "aliasOfId" comment).
    if (canonical.aliasOfId) {
      throw new ProtocolValidationError("alias_target_is_itself_an_alias");
    }
  }

  const created = await prisma.variableCatalogValue.create({
    data: {
      catalogId: catalog.id,
      value: input.value,
      definition: input.definition ?? null,
      aliasOfId: input.aliasOfId ?? null,
      impliesUnknownIdentity: input.impliesUnknownIdentity ?? false,
      displayOrder: input.displayOrder ?? 0,
    },
  });

  await recordAuditEvent({
    actorUserAccountId: userAccountId,
    operation: "variable_catalog_value.create",
    entityType: "variable_catalog_value",
    entityId: created.id,
    after: created,
    sourceInterface: "research.service",
  });

  return created;
}

/**
 * §9.4 — "agregar una definición a un valor de catálogo existente y
 * confirmar que se lee donde ese valor se usa." Same reasoning
 * SensoryDescriptor's expectedPerception/technicalCause already proves
 * (R1): the definition standardizes language over time, so it's editable
 * after the fact, not frozen at creation like a ProtocolVariable's
 * enumValues.
 */
export async function updateVariableCatalogValueDefinition(userAccountId: string, catalogValueId: string, definition: string) {
  await requireResearchAccess(userAccountId, "approve_protocol", [{}]);

  const existing = await prisma.variableCatalogValue.findUnique({ where: { id: catalogValueId } });
  if (!existing) throw new ResearchAccessError("variable_catalog_value_not_found");

  const updated = await prisma.variableCatalogValue.update({ where: { id: catalogValueId }, data: { definition } });

  await recordAuditEvent({
    actorUserAccountId: userAccountId,
    operation: "variable_catalog_value.update_definition",
    entityType: "variable_catalog_value",
    entityId: updated.id,
    before: { definition: existing.definition },
    after: { definition: updated.definition },
    sourceInterface: "research.service",
  });

  return updated;
}

/**
 * §3a-bis/§9.5 — "registrar un alias... y confirmar que ambos resuelven al
 * mismo valor canónico." The real case this exists for (honey-by-color vs.
 * semi-wash-by-percentage) is deliberately NOT pre-linked by this ticket's
 * own seed data (lib/research/catalogs.ts) — the product owner owns that
 * mapping, not an assumed correspondence (§3a-bis: "verificála con él en
 * vez de asumir el mapeo"). This function is the mechanism; which values
 * get linked is a product-owner decision applied later.
 */
export async function setVariableCatalogValueAlias(userAccountId: string, aliasId: string, canonicalId: string) {
  await requireResearchAccess(userAccountId, "approve_protocol", [{}]);

  if (aliasId === canonicalId) {
    throw new ProtocolValidationError("catalog_value_cannot_be_its_own_alias");
  }
  const [alias, canonical] = await Promise.all([
    prisma.variableCatalogValue.findUnique({ where: { id: aliasId } }),
    prisma.variableCatalogValue.findUnique({ where: { id: canonicalId } }),
  ]);
  if (!alias || !canonical) throw new ResearchAccessError("variable_catalog_value_not_found");
  if (alias.catalogId !== canonical.catalogId) {
    throw new ProtocolValidationError("alias_target_not_in_same_catalog");
  }
  if (canonical.aliasOfId) {
    throw new ProtocolValidationError("alias_target_is_itself_an_alias");
  }

  const updated = await prisma.variableCatalogValue.update({ where: { id: aliasId }, data: { aliasOfId: canonicalId } });

  await recordAuditEvent({
    actorUserAccountId: userAccountId,
    operation: "variable_catalog_value.set_alias",
    entityType: "variable_catalog_value",
    entityId: aliasId,
    after: { aliasOfId: canonicalId },
    sourceInterface: "research.service",
  });

  return updated;
}

export async function listVariableCatalogs(userAccountId: string) {
  await requireResearchAccess(userAccountId, "view", [{}]);
  return prisma.variableCatalog.findMany({
    include: { values: { orderBy: { displayOrder: "asc" } } },
    orderBy: { key: "asc" },
  });
}

export async function getProtocolDetail(userAccountId: string, protocolId: string) {
  const protocol = await prisma.protocol.findUnique({
    where: { id: protocolId },
    include: {
      versions: {
        include: { variables: { include: { catalog: true } }, requiredMeasurements: { include: { catalog: true } }, treatmentBatches: true },
        orderBy: { version: "desc" },
      },
    },
  });
  if (!protocol) throw new ResearchAccessError("protocol_not_found");
  await requireResearchAccess(userAccountId, "view", [{}]);
  return protocol;
}
