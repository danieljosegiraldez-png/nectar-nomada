/**
 * The row cap the list services share, and an honest way to report hitting it
 * — ADR-087.
 *
 * Four services carried `take: 200` with no pagination and no signal to the
 * caller that anything had been dropped. A roaster with a long history simply
 * stopped seeing their older sessions, and the page said nothing. It also
 * turned a test-fixture leak into an intermittent failure once the table
 * crossed the limit (ADR-085/086), which is how it was found.
 *
 * This is not pagination. It is the smaller, prior fix: a list that has been
 * cut off says so, rather than presenting a truncated set as the whole truth.
 * Silence is the actual defect — a visible "showing the newest 200" is a
 * limitation, an invisible one is a lie about the data.
 */

/** Rows a list service returns before it reports truncation. */
export const LIST_LIMIT = 200;

export interface TruncatedList<T> {
  items: T[];
  /** True when more rows matched than were returned. */
  truncated: boolean;
  /** The cap applied, so a caller can say which number it is showing. */
  limit: number;
}

/**
 * Detecting truncation costs one extra row, not a second `count()` query:
 * fetch `LIST_LIMIT + 1` and see whether it came back. A separate count would
 * be a second round trip against a different snapshot, and could disagree with
 * the rows actually returned.
 *
 * Callers must therefore query with `take: LIST_LIMIT + 1`. Passing a list
 * fetched with a plain `take: LIST_LIMIT` would always report `truncated:
 * false`, so the two belong together — hence this helper rather than the rule
 * written out four times.
 */
export function truncate<T>(rows: T[], limit: number = LIST_LIMIT): TruncatedList<T> {
  return { items: rows.slice(0, limit), truncated: rows.length > limit, limit };
}
