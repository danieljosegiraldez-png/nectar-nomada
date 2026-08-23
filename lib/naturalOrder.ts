/**
 * Ordering names that contain numbers — ADR-078.
 *
 * Postgres `ORDER BY name` and JavaScript's default sort both compare strings
 * codepoint by codepoint, so "Lote 10" sorts before "Lote 2": the character
 * "1" precedes "2" and the comparison stops there. `/plots` listed
 * Lote 1, Lote 10, Lote 2, Lote 3 …, which is exactly the order nobody scans
 * a list in.
 *
 * `Intl.Collator` with `numeric: true` compares digit runs as numbers, and
 * being locale-aware also sorts accented names the way a Spanish reader
 * expects rather than pushing them after Z.
 *
 * Sorting happens in the application rather than in SQL because Postgres has
 * no natural-order collation by default, and adding one is a database-wide
 * change for a presentation concern.
 */

const collator = new Intl.Collator(["es", "en"], { numeric: true, sensitivity: "base" });

/** Compare two names so embedded numbers order numerically. */
export function compareNames(a: string, b: string): number {
  return collator.compare(a, b);
}

/**
 * Sort a list by a name field, returning a new array. Callers usually have
 * rows straight from Prisma, whose `orderBy` cannot express this.
 */
export function sortByName<T>(rows: readonly T[], name: (row: T) => string): T[] {
  return [...rows].sort((a, b) => compareNames(name(a), name(b)));
}
