/**
 * Prisma silently drops `undefined` values from a `where` clause — so
 * `deleteMany({ where: { blindSampleId } })` with `blindSampleId` still
 * `undefined` (e.g. a `beforeAll` that threw or timed out partway through,
 * before that variable was assigned) becomes `deleteMany({ where: {} })`:
 * an unfiltered delete of every row in the table. Every `afterAll` cleanup
 * in this test suite builds its `where` clause from `let` variables
 * assigned inside `beforeAll`, so every one of them is exposed to this
 * exact failure mode, not just the call site where it was first found.
 *
 * This makes the mistake structurally impossible rather than relying on a
 * per-call-site `if` an author has to remember to add: every `where`
 * clause passed through here is rejected, before it ever reaches Prisma,
 * unless every key is present and defined (recursively one level into
 * nested filter objects like `{ in: [...] }`, which have the same
 * silent-drop problem, and into `{ in: [...] }` arrays specifically,
 * where an `undefined` element throws a *different* Prisma error but is
 * exactly as dangerous if the array is empty as a result — deleteMany
 * with `{ in: [] }` is safe, an empty `where` object is not).
 */
export class UnsafeWhereClauseError extends Error {}

function assertNoUndefined(path: string, value: unknown): void {
  if (value === undefined) {
    throw new UnsafeWhereClauseError(
      `assertDefinedWhere: "${path}" is undefined — refusing a delete that would silently drop this filter. ` +
        `This almost always means a beforeAll fixture never got assigned (it threw or timed out partway through).`,
    );
  }
  if (Array.isArray(value)) {
    value.forEach((element, index) => assertNoUndefined(`${path}[${index}]`, element));
    return;
  }
  if (value !== null && typeof value === "object" && !(value instanceof Date)) {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      assertNoUndefined(`${path}.${key}`, nested);
    }
  }
}

/**
 * Validates a Prisma `where` clause before use. Throws
 * `UnsafeWhereClauseError` if the object is empty (an unfiltered
 * operation) or if any key, at any depth, is `undefined`. Returns the
 * same object unchanged on success, so it composes directly into a call:
 *
 *   prisma.panelResult.deleteMany({ where: assertDefinedWhere({ blindSampleId }) })
 */
export function assertDefinedWhere<T extends Record<string, unknown>>(where: T): T {
  const keys = Object.keys(where);
  if (keys.length === 0) {
    throw new UnsafeWhereClauseError("assertDefinedWhere: where clause is empty — refusing to run an unfiltered operation");
  }
  for (const key of keys) {
    assertNoUndefined(key, where[key]);
  }
  return where;
}
