/**
 * Producer data export — CLAUDE.md §46, ADR-059.
 *
 * The two properties worth defending are that it cannot be used without the
 * grant, and that it cannot return more than the caller's Assignments allow.
 * Everything else about the export is presentation.
 */

import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "../../lib/db";
import { buildProducerExport, ExportAccessError, __testing } from "../../lib/traceability/export";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const { cell, toCsv } = __testing;

const RUN_ID = `exporttest-${Date.now()}`;
const created = { personIds: [] as string[], userAccountIds: [] as string[] };

// Each fixture needs its own address. This helper is called more than once,
// and both callers shared one until Person.email became unique (ADR-072) —
// which is exactly the ambiguity that constraint exists to prevent, sitting
// unnoticed in the test suite.
let seq = 0;

async function makeUserWithoutAssignments() {
  const email = `${RUN_ID}-${++seq}@example.test`;
  const person = await prisma.person.create({
    data: { givenName: "EXPORT", familyName: "Test", displayName: `EXPORT Test ${email}`, email },
  });
  const account = await prisma.userAccount.create({
    data: { personId: person.id, authProvider: "credentials", status: "active" },
  });
  created.personIds.push(person.id);
  created.userAccountIds.push(account.id);
  return account.id;
}

afterAll(async () => {
  // ADR-045 — never a deleteMany whose where clause could silently become {}.
  if (created.userAccountIds.length) {
    await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: created.userAccountIds } }) });
  }
  if (created.personIds.length) {
    await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: created.personIds } }) });
  }
});

describe("CSV serialisation (RFC 4180)", () => {
  it("leaves ordinary values alone", () => {
    expect(cell("NN-2026-014")).toBe("NN-2026-014");
    expect(cell(12.5)).toBe("12.5");
  });

  it("renders null and undefined as empty, not as the words", () => {
    // The failure this prevents: a spreadsheet column full of the literal
    // string "null", which reads as data rather than as absence.
    expect(cell(null)).toBe("");
    expect(cell(undefined)).toBe("");
  });

  it("quotes values containing a comma, quote or newline, and doubles quotes", () => {
    expect(cell("Las Nubes, Cerro Azul")).toBe('"Las Nubes, Cerro Azul"');
    expect(cell('he said "guacho"')).toBe('"he said ""guacho"""');
    expect(cell("line one\nline two")).toBe('"line one\nline two"');
  });

  it("serialises dates as ISO 8601 so they survive a spreadsheet round trip", () => {
    expect(cell(new Date("2026-08-21T00:00:00.000Z"))).toBe("2026-08-21T00:00:00.000Z");
  });

  it("writes a header row, one row per record, and a trailing newline", () => {
    const csv = toCsv([{ a: 1, b: "x,y" }], ["a", "b"]);
    expect(csv).toBe('a,b\n1,"x,y"\n');
  });

  it("emits empty cells for columns a row does not have, keeping the shape rectangular", () => {
    expect(toCsv([{ a: 1 }], ["a", "b"])).toBe("a,b\n1,\n");
  });
});

describe("buildProducerExport authorisation", () => {
  it("refuses a user with no assignments at all", async () => {
    const userAccountId = await makeUserWithoutAssignments();
    await expect(buildProducerExport(userAccountId)).rejects.toBeInstanceOf(ExportAccessError);
  });

  it("refuses with no_export_permission, not a generic error", async () => {
    const userAccountId = await makeUserWithoutAssignments();
    await expect(buildProducerExport(userAccountId)).rejects.toThrow("no_export_permission");
  });
});

describe("buildProducerExport contents", () => {
  it("produces every promised file for a platform-scoped caller", async () => {
    const admin = await prisma.assignment.findFirst({
      where: {
        status: "active",
        scope: { scopeType: "platform" },
        roleProfile: { permissions: { some: { permission: { resourceType: "lot", action: "export" } } } },
      },
      select: { userAccountId: true },
    });
    // Skip rather than fail if the environment has no platform-scoped
    // exporter — the authorisation tests above are the ones that must hold
    // everywhere.
    if (!admin) return;

    const result = await buildProducerExport(admin.userAccountId);
    expect(Object.keys(result.files).sort()).toEqual([
      "MANIFEST.txt",
      "export.json",
      "lots.csv",
      "measurements.csv",
      "samples.csv",
      "sensory-results.csv",
    ]);

    // The JSON must parse — it is the representation meant to survive being
    // handed to something other than a spreadsheet.
    const parsed = JSON.parse(result.files["export.json"]!);
    expect(parsed).toHaveProperty("generated_at");
    expect(Array.isArray(parsed.lots)).toBe(true);
    expect(parsed.lots.length).toBe(result.lotCount);

    // Every CSV carries its header even when there are no rows, so an empty
    // export still opens as a table rather than as an empty file.
    for (const name of ["lots.csv", "measurements.csv", "samples.csv"]) {
      expect(result.files[name]!.split("\n")[0]).toContain(",");
    }
    expect(result.files["lots.csv"]!.split("\n")[0]).toBe(
      "lot_code,lot_type,status,project,organization,location,classification,created_at",
    );
  });

  it("records an audit event naming what left, and never the contents", async () => {
    const admin = await prisma.assignment.findFirst({
      where: {
        status: "active",
        scope: { scopeType: "platform" },
        roleProfile: { permissions: { some: { permission: { resourceType: "lot", action: "export" } } } },
      },
      select: { userAccountId: true },
    });
    if (!admin) return;

    const before = await prisma.auditEvent.count({ where: { entityType: "producer_data_export" } });
    await buildProducerExport(admin.userAccountId);
    const after = await prisma.auditEvent.count({ where: { entityType: "producer_data_export" } });
    expect(after).toBe(before + 1);

    const event = await prisma.auditEvent.findFirst({
      where: { entityType: "producer_data_export" },
      orderBy: { occurredAt: "desc" },
    });
    expect(event?.operation).toBe("export");
    // Counts, not records: the audit trail says a copy was taken, not what
    // was in it.
    expect(JSON.stringify(event?.after)).toMatch(/"lots":\d+/);
    expect(JSON.stringify(event?.after)).not.toMatch(/lot_code/);
  });
});
