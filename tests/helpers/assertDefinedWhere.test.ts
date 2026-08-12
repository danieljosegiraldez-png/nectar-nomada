/**
 * Pins the guard itself, per the incident this exists to prevent: a
 * `deleteMany({ where: {...} })` built from an undefined variable must
 * throw before reaching Prisma, never run as an unfiltered delete.
 */
import { describe, expect, it } from "vitest";
import { assertDefinedWhere, UnsafeWhereClauseError } from "./assertDefinedWhere";

describe("assertDefinedWhere", () => {
  it("throws on a completely empty where clause", () => {
    expect(() => assertDefinedWhere({})).toThrow(UnsafeWhereClauseError);
  });

  it("throws when a top-level key is undefined — the exact shape of the incident", () => {
    const blindSampleId: string | undefined = undefined;
    expect(() => assertDefinedWhere({ blindSampleId })).toThrow(UnsafeWhereClauseError);
  });

  it("throws when a nested filter value is undefined (e.g. { in: undefined })", () => {
    const lotId: string | undefined = undefined;
    expect(() => assertDefinedWhere({ id: { in: [lotId] } })).toThrow(UnsafeWhereClauseError);
  });

  it("throws when one of several keys is undefined, not just when all are", () => {
    const definedId = "real-id";
    const undefinedId: string | undefined = undefined;
    expect(() => assertDefinedWhere({ id: definedId, otherId: undefinedId })).toThrow(UnsafeWhereClauseError);
  });

  it("passes through a fully-defined where clause unchanged", () => {
    const where = { id: "real-id", name: { contains: "TEST" } };
    expect(assertDefinedWhere(where)).toEqual(where);
  });

  it("allows an explicit empty array inside 'in' — a deliberate, safe no-op, not the same danger as an empty where", () => {
    expect(() => assertDefinedWhere({ id: { in: [] } })).not.toThrow();
  });

  it("allows null as a real, deliberate value distinct from undefined", () => {
    expect(() => assertDefinedWhere({ endedAt: null })).not.toThrow();
  });

  it("never lets a deleteMany actually execute when the guard rejects it — the guard runs before the query, not alongside it", () => {
    // A minimal stand-in for `prisma.someModel.deleteMany`, proving the
    // call site pattern this fixes: `deleteMany({ where: assertDefinedWhere({...}) })`.
    // If assertDefinedWhere didn't throw synchronously before the argument
    // is constructed, this fake delete would still receive a call.
    let deleteWasCalled = false;
    const fakeDeleteMany = (_args: { where: Record<string, unknown> }) => {
      deleteWasCalled = true;
      return Promise.resolve({ count: 999 });
    };

    const undefinedId: string | undefined = undefined;
    expect(() => fakeDeleteMany({ where: assertDefinedWhere({ id: undefinedId }) })).toThrow(UnsafeWhereClauseError);
    expect(deleteWasCalled).toBe(false);
  });
});
