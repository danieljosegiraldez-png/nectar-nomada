import { getTranslations } from "next-intl/server";
import type { TargetComparison } from "../../../lib/traceability/processTargets";

/**
 * Target versus actual, for one run — ADR-099.
 *
 * A table because that is what the question is: three columns, one row per
 * target, and the eye goes down the deviation column. The product owner
 * described it as BeerSmith does it, and BeerSmith is a table.
 *
 * The design constraint that shaped everything here is that **null is a real
 * value in four places** (ADR-098), and each one means something different:
 *
 *   - no readings yet     → the run has not been measured for this variable
 *   - no target declared  → the recipe asks to measure, not to hit a number
 *   - no range declared   → there is a point target but no tolerance
 *   - no recipe on the run → nothing to compare, and the table is not rendered
 *
 * Rendering any of those as `0`, or as a dash that means four different
 * things, would be the same failure ADR-080 fixed when an unweighed lot read
 * "Cantidad: 0". So each gets its own words.
 */
export async function TargetComparisonTable({ rows }: { rows: TargetComparison[] }) {
  const t = await getTranslations("Traceability");
  if (rows.length === 0) return null;

  return (
    <div style={{ marginTop: "1rem" }}>
      <h3 style={{ marginBottom: "0.25rem" }}>{t("targetsHeading")}</h3>
      <p className="nn-muted" style={{ margin: "0 0 0.75rem", fontSize: "0.9em" }}>
        {t("targetsIntro")}
      </p>

      <div style={{ overflowX: "auto" }}>
        <table className="nn-table" style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>{t("targetsColVariable")}</th>
              <th style={{ textAlign: "right" }}>{t("targetsColTarget")}</th>
              <th style={{ textAlign: "right" }}>{t("targetsColActual")}</th>
              <th style={{ textAlign: "right" }}>{t("targetsColDeviation")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const key = `${r.variable}-${r.moment}`;
              const n = r.actual.readings.length;

              // The target column says which kind of target it is, rather than
              // printing a number whose meaning depends on a column header.
              const targetText =
                r.target.value !== null
                  ? `${r.target.value.toString()} ${r.unit}`
                  : r.target.min !== null || r.target.max !== null
                    ? t("targetsRange", {
                        min: r.target.min?.toString() ?? "—",
                        max: r.target.max?.toString() ?? "—",
                        unit: r.unit,
                      })
                    : t("targetsNoNumber");

              return (
                <tr key={key} style={{ borderTop: "1px solid var(--nn-border)" }}>
                  <td style={{ padding: "0.5rem 0" }}>
                    <strong>{t(`variable_${r.variable}` as "variable_ph", { fallback: r.variable })}</strong>
                    <br />
                    <span className="nn-muted" style={{ fontSize: "0.85em" }}>
                      {t(`moment_${r.moment}` as "moment_initial")}
                      {r.note ? ` · ${r.note}` : ""}
                    </span>
                  </td>

                  <td style={{ textAlign: "right", padding: "0.5rem 0" }}>{targetText}</td>

                  <td style={{ textAlign: "right", padding: "0.5rem 0" }}>
                    {r.actual.mean === null ? (
                      // Not "0", and not a dash. The run simply has not been
                      // measured for this variable yet.
                      <span className="nn-muted">{t("targetsNoReadings")}</span>
                    ) : (
                      <>
                        <strong>
                          {r.actual.mean.toDecimalPlaces(4).toString()} {r.unit}
                        </strong>
                        <br />
                        {/* §28: a derived number never appears without saying
                            how it was derived and from what. */}
                        <span className="nn-muted" style={{ fontSize: "0.85em" }}>
                          {n === 1
                            ? t("targetsOneReading")
                            : t("targetsMeanOf", { count: n })}
                        </span>
                        {n > 1 ? (
                          <>
                            <br />
                            <span className="nn-muted" style={{ fontSize: "0.8em" }}>
                              {r.actual.readings.map((x) => x.value.toString()).join(" · ")}
                            </span>
                          </>
                        ) : null}
                      </>
                    )}
                  </td>

                  <td style={{ textAlign: "right", padding: "0.5rem 0" }}>
                    {r.deviation === null ? (
                      <span className="nn-muted">—</span>
                    ) : (
                      <strong>
                        {r.deviation.greaterThan(0) ? "+" : ""}
                        {r.deviation.toDecimalPlaces(4).toString()}
                      </strong>
                    )}
                    {r.withinRange !== null ? (
                      <>
                        <br />
                        <span className="nn-muted" style={{ fontSize: "0.85em" }}>
                          {r.withinRange ? t("targetsWithinRange") : t("targetsOutOfRange")}
                        </span>
                      </>
                    ) : null}
                    {/* One reading cannot truthfully be both an original and a
                        final value. Saying so beats reporting a deviation
                        against both (ADR-098). */}
                    {r.ambiguousSingleReading ? (
                      <>
                        <br />
                        <span className="nn-muted" style={{ fontSize: "0.85em" }}>
                          {t("targetsSingleReadingAmbiguous")}
                        </span>
                      </>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
