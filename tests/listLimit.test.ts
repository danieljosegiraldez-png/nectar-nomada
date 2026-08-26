/**
 * The shared list cap and its truncation signal — ADR-087.
 *
 * The pure half. `truncate` is only correct in company with a query that asked
 * for `LIST_LIMIT + 1`, which is the coupling these cases pin down: given
 * exactly `LIST_LIMIT` rows it must report a complete list, and given one more
 * it must report a cut-off one while still returning only the cap.
 */

import { describe, it, expect } from "vitest";
import { LIST_LIMIT, truncate } from "../lib/listLimit";

const rows = (n: number) => Array.from({ length: n }, (_, i) => i);

describe("truncate", () => {
  it("reports a complete list when the query returned no more than the cap", () => {
    const result = truncate(rows(LIST_LIMIT));
    expect(result.truncated).toBe(false);
    expect(result.items.length).toBe(LIST_LIMIT);
  });

  it("reports truncation on the sentinel row, and does not return it", () => {
    // The whole mechanism: the caller asks for LIST_LIMIT + 1, and the extra
    // row is evidence rather than data. Returning it would overrun the cap the
    // page believes it is rendering.
    const result = truncate(rows(LIST_LIMIT + 1));
    expect(result.truncated).toBe(true);
    expect(result.items.length).toBe(LIST_LIMIT);
    expect(result.items).not.toContain(LIST_LIMIT);
  });

  it("is honest about a short list, including an empty one", () => {
    expect(truncate(rows(0))).toEqual({ items: [], truncated: false, limit: LIST_LIMIT });
    expect(truncate(rows(3)).truncated).toBe(false);
  });

  it("reports the limit it applied, so a caller can name the number", () => {
    // The page renders "showing the newest N" from this rather than from its
    // own copy of the constant, which would drift.
    expect(truncate(rows(5)).limit).toBe(LIST_LIMIT);
    expect(truncate(rows(5), 2).limit).toBe(2);
    expect(truncate(rows(5), 2).truncated).toBe(true);
    expect(truncate(rows(5), 2).items.length).toBe(2);
  });
});
