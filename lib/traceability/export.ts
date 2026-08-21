/**
 * Producer data export — CLAUDE.md §46, and the last piece of data
 * sovereignty (`docs/implementation/README.md`).
 *
 * A producer could see their lots in the app and print one report at a time,
 * but could not take their own records out. Sovereignty that only the
 * platform's operator enjoys is not sovereignty.
 *
 * Two representations of the same data, because they serve different people:
 * CSVs open in the spreadsheet a producer already uses, and one JSON keeps the
 * lineage and nesting that CSV flattens into a column of ids — the thing a lab
 * or a re-import actually needs.
 *
 * **Scope is the same question the app already answers.** `resolveLotVisibility`
 * decides which lots the caller may export, asked of `lot:export` rather than
 * `lot:view`, so the export can never contain more than an Assignment allows.
 *
 * **Classification, deliberately not gated — see ADR-059.** Every Lot on this
 * platform is `internal` and Farm Operator holds only `classification:
 * clear_partner`, so an AND-gate here would return nothing to precisely the
 * person this feature exists for. The traceability read path does not apply
 * one either (`lots.ts`'s note above `getSensoryLinkageForSamples`). Matching
 * it keeps the export honest — it contains exactly what the app already shows
 * — rather than inventing a stricter rule in one corner. The underlying
 * inconsistency is recorded as a known gap, not silently inherited.
 */

import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import {
  resolveLotVisibility,
  lotWhereFromVisibility,
  sampleWhereFromVisibility,
  getSensoryLinkageForSamples,
} from "./lots";

export class ExportAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExportAccessError";
  }
}

/** One CSV cell. RFC 4180: quote when the value contains a delimiter, quote or newline; escape quotes by doubling. */
function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = value instanceof Date ? value.toISOString() : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows: Array<Record<string, unknown>>, columns: readonly string[]): string {
  const lines = [columns.join(",")];
  for (const row of rows) lines.push(columns.map((c) => cell(row[c])).join(","));
  // Trailing newline: without it, some tools drop or merge the final record.
  return lines.join("\n") + "\n";
}

export interface ProducerExport {
  /** filename -> file contents, ready to be zipped. */
  files: Record<string, string>;
  lotCount: number;
  generatedAt: Date;
}

/**
 * Everything the caller may export, as CSVs plus one faithful JSON.
 *
 * Throws ExportAccessError when no Assignment grants `lot:export` anywhere —
 * distinct from an empty export, which is a legitimate answer for someone who
 * holds the permission but has no lots yet.
 */
export async function buildProducerExport(userAccountId: string): Promise<ProducerExport> {
  const visibility = await resolveLotVisibility(userAccountId, "export");
  if (visibility.mode === "none") {
    throw new ExportAccessError("no_export_permission");
  }

  const lotWhere = lotWhereFromVisibility(visibility);
  const sampleWhere = sampleWhereFromVisibility(visibility);
  const generatedAt = new Date();

  const lots = lotWhere
    ? await prisma.lot.findMany({
        where: lotWhere,
        include: { project: true, organization: true, location: true },
        orderBy: { lotCode: "asc" },
      })
    : [];
  const lotIds = lots.map((l) => l.id);

  const [measurements, samples] = await Promise.all([
    lotIds.length
      ? prisma.measurement.findMany({ where: { lotId: { in: lotIds } }, orderBy: { occurredAt: "asc" } })
      : [],
    sampleWhere ? prisma.sample.findMany({ where: sampleWhere, orderBy: { sampleCode: "asc" } }) : [],
  ]);

  // Panel results only — this helper deliberately never returns blind codes,
  // mappings, or individual evaluator identities.
  const sensoryBySample = await getSensoryLinkageForSamples(samples.map((s) => s.id));

  const lotRows = lots.map((l) => ({
    lot_code: l.lotCode,
    lot_type: l.lotType,
    status: l.status,
    project: l.project?.name ?? "",
    organization: l.organization?.name ?? "",
    location: l.location?.name ?? "",
    classification: l.classification,
    created_at: l.createdAt,
  }));

  const lotCodeById = new Map(lots.map((l) => [l.id, l.lotCode]));

  const measurementRows = measurements.map((m) => ({
    lot_code: m.lotId ? (lotCodeById.get(m.lotId) ?? "") : "",
    variable: m.variable,
    value: m.value?.toString() ?? "",
    unit: m.unit,
    occurred_at: m.occurredAt,
  }));

  const sampleRows = samples.map((s) => ({
    sample_code: s.sampleCode,
    sample_type: s.sampleType,
    source_lot_code: s.sourceLotId ? (lotCodeById.get(s.sourceLotId) ?? "") : "",
    description: s.description ?? "",
    created_at: s.createdAt,
  }));

  const sensoryRows = samples.flatMap((s) =>
    (sensoryBySample[s.id] ?? []).map((entry) => ({
      sample_code: s.sampleCode,
      ...Object.fromEntries(Object.entries(entry).filter(([, v]) => typeof v !== "object" || v === null)),
    })),
  );

  const json = {
    generated_at: generatedAt.toISOString(),
    scope: {
      // Says what the export covers without naming internal ids.
      mode: visibility.mode,
      projects: [...new Set(lots.map((l) => l.project?.name).filter(Boolean))],
    },
    lots: lots.map((l) => ({
      lot_code: l.lotCode,
      lot_type: l.lotType,
      status: l.status,
      classification: l.classification,
      project: l.project?.name ?? null,
      organization: l.organization?.name ?? null,
      location: l.location?.name ?? null,
      created_at: l.createdAt.toISOString(),
      measurements: measurements
        .filter((m) => m.lotId === l.id)
        .map((m) => ({
          variable: m.variable,
          value: m.value?.toString() ?? null,
          unit: m.unit,
          occurred_at: m.occurredAt.toISOString(),
        })),
      samples: samples
        .filter((s) => s.sourceLotId === l.id)
        .map((s) => ({
          sample_code: s.sampleCode,
          sample_type: s.sampleType,
          description: s.description ?? null,
          sensory: sensoryBySample[s.id] ?? [],
        })),
    })),
  };

  const manifest = [
    "Néctar Nómada — producer data export",
    `generated_at: ${generatedAt.toISOString()}`,
    `lots: ${lots.length}`,
    `measurements: ${measurements.length}`,
    `samples: ${samples.length}`,
    "",
    "Files:",
    "  lots.csv             one row per lot",
    "  measurements.csv     one row per measurement, joined to its lot by lot_code",
    "  samples.csv          one row per sample",
    "  sensory-results.csv  panel results only — no blind codes, no evaluator identities",
    "  export.json          the same data with lineage and nesting intact",
    "",
    "Scope: exactly the lots your Assignments permit you to export — the same",
    "records the application already shows you, no more.",
    "",
  ].join("\n");

  // CLAUDE.md §35 — taking a copy of the research record out of the platform
  // is exactly the kind of act the audit trail exists for. Recorded with what
  // left and how much, never the contents.
  await recordAuditEvent({
    actorUserAccountId: userAccountId,
    operation: "export",
    entityType: "producer_data_export",
    // An export has no single entity. The account whose Assignments defined
    // the scope is the honest subject of the record.
    entityId: userAccountId,
    after: {
      lots: lots.length,
      measurements: measurements.length,
      samples: samples.length,
      scopeMode: visibility.mode,
    },
    sourceInterface: "web",
  });

  return {
    generatedAt,
    lotCount: lots.length,
    files: {
      "lots.csv": toCsv(lotRows, [
        "lot_code", "lot_type", "status", "project", "organization", "location",
        "classification", "created_at",
      ]),
      "measurements.csv": toCsv(measurementRows, ["lot_code", "variable", "value", "unit", "occurred_at"]),
      "samples.csv": toCsv(sampleRows, ["sample_code", "sample_type", "source_lot_code", "description", "created_at"]),
      "sensory-results.csv": toCsv(
        sensoryRows,
        sensoryRows.length ? Object.keys(sensoryRows[0]!) : ["sample_code"],
      ),
      "export.json": JSON.stringify(json, null, 2) + "\n",
      "MANIFEST.txt": manifest,
    },
  };
}

/** Exposed for tests, and for anything else that needs RFC 4180 escaping. */
export const __testing = { cell, toCsv };
