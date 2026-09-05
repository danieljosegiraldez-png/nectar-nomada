import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../lib/auth/session";
import { getActiveOperations, getLotList, type LotListFilters } from "../../lib/traceability/lots";
import { permissionKeysAnywhere } from "../../lib/rbac/service";

export const dynamic = "force-dynamic";

const LOT_TYPES: NonNullable<LotListFilters["lotType"]>[] = [
  "cherry",
  "processing",
  "drying",
  "green",
  "roast",
  "sample",
  "other",
  // A5 (22_APIARY_V1_SCOPING_REPORT.md) — flagged as a gap when
  // CreateLotInput["lotType"] widened for "honey" (A3/A4 follow-up); this
  // is the actual UI wiring that gap left undone.
  "honey",
];

export default async function LotsPage({ searchParams }: { searchParams: Promise<{ lotType?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { lotType } = await searchParams;
  const filter = LOT_TYPES.includes(lotType as never) ? (lotType as LotListFilters["lotType"]) : undefined;

  const t = await getTranslations("Traceability");
  const [operations, lots, granted] = await Promise.all([
    getActiveOperations(user.userAccountId),
    getLotList(user.userAccountId, { lotType: filter }),
    permissionKeysAnywhere(user.userAccountId),
  ]);
  const { items: lotItems, truncated: lotsTruncated, limit: lotLimit } = lots;
  // Una cuenta sin asignaciones ve las mismas listas vacías que una finca sin
  // nada. Decirle «nada en curso ahora mismo» es afirmar algo sobre la finca
  // que puede ser falso — y es la primera pantalla de quien acaba de recibir
  // acceso. Mismo trato que `Partner.noProjects` ya daba: se nombra la causa y
  // se dice a quién pedirle el acceso.
  const sinAmbito = lots.sinAmbito && operations.sinAmbito;
  const canExport = granted.has("lot:export");
  const canManageLots = granted.has("lot:manage");

  return (
    <div>
      <span className="nn-badge">{t("badge")}</span>
      <h1>{t("lotsTitle")}</h1>
      <p className="nn-muted">{t("lotsIntro")}</p>
      <p style={{ marginTop: "1rem", display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <Link href="/lots/new" className="nn-button" style={{ display: "inline-block", textDecoration: "none" }}>
          {t("createLotButton")}
        </Link>
        {/* ADR-100. Recipes live here rather than in the top navigation: they
            are process configuration used from the batch flow, and S2
            consolidated that bar from ten entries precisely so it would fit a
            phone. A test asserts it stays at eight or fewer, and it was right
            to refuse a ninth. */}
        {canManageLots ? (
          <Link href="/recipes" className="nn-button-quiet" style={{ display: "inline-block", textDecoration: "none" }}>
            {t("recipesTitle")}
          </Link>
        ) : null}
        {canExport ? (
          // A plain anchor, not next/link: this is a file download, and
          // client-side navigation to a route handler would fetch the zip and
          // then have nowhere to put it.
          <a href="/api/export" className="nn-button-quiet" style={{ textDecoration: "none" }}>
            {t("exportButton")}
          </a>
        ) : null}
      </p>

      {/* Only live work earns a card. Rendering all four buckets regardless of
          contents opened the page with four boxes reading "nothing here",
          pushing the batches that do exist below the fold — the emptiest part
          of the screen was the most prominent. When nothing is running, one
          line says so. */}
      {(() => {
        const buckets = [
          {
            key: "fermentation",
            heading: t("activeFermentationHeading"),
            items: operations.activeFermentationRuns.map((entry) => ({
              id: entry.run.id,
              label: (entry.lot as { lotCode: string }).lotCode,
              href: `/lots/${(entry.lot as { id: string }).id}`,
            })),
          },
          {
            key: "drying",
            heading: t("activeDryingHeading"),
            items: operations.activeDryingRuns.map((entry) => ({
              id: entry.run.id,
              label: (entry.lot as { lotCode: string }).lotCode,
              href: `/lots/${(entry.lot as { id: string }).id}`,
            })),
          },
          {
            key: "measurement",
            heading: t("needsMeasurementHeading"),
            items: operations.lotsNeedingMeasurement.map((lot) => ({
              id: lot.id,
              label: lot.lotCode,
              href: `/lots/${lot.id}`,
            })),
          },
          {
            key: "sensory",
            heading: t("awaitingSensoryHeading"),
            items: operations.samplesAwaitingSensory.map((sample) => ({
              id: sample.id,
              label: sample.sampleCode,
              // A sample taken from a lot links back to it; one without a
              // source lot has nowhere to go, so it stays plain text.
              href: sample.sourceLotId ? `/lots/${sample.sourceLotId}` : null,
            })),
          },
        ].filter((bucket) => bucket.items.length > 0);

        return (
          <section className="nn-section">
            <h2>{t("activeOperationsHeading")}</h2>
            {buckets.length === 0 ? (
              <p className="nn-muted">{sinAmbito ? t("sinAmbitoBody") : t("noActiveOperations")}</p>
            ) : (
              <div className="nn-grid">
                {buckets.map((bucket) => (
                  <div key={bucket.key} className="nn-card-link" style={{ cursor: "default" }}>
                    <h3>
                      {bucket.heading} <span className="nn-chip">{bucket.items.length}</span>
                    </h3>
                    {bucket.items.map((item) => (
                      <p key={item.id}>
                        {item.href ? (
                          <Link href={item.href} className="nn-code">
                            {item.label}
                          </Link>
                        ) : (
                          <span className="nn-code">{item.label}</span>
                        )}
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })()}

      <section className="nn-section">
        <h2>{t("lotListHeading")}</h2>
        <div className="nn-chips">
          <Link
            href="/lots"
            className={filter ? "nn-chip" : "nn-chip nn-chip-active"}
            aria-current={filter ? undefined : "page"}
          >
            {t("filterAll")}
          </Link>
          {LOT_TYPES.map((type) => (
            <Link
              key={type}
              href={`/lots?lotType=${type}`}
              className={filter === type ? "nn-chip nn-chip-active" : "nn-chip"}
              aria-current={filter === type ? "page" : undefined}
            >
              {t(`lotType_${type}`)}
            </Link>
          ))}
        </div>

        {/* Said out loud rather than left to inference — ADR-087. A list that
            has been cut off and does not say so presents part of the data as
            all of it. */}
        {lotsTruncated ? <p className="nn-muted">{t("listTruncated", { limit: lotLimit })}</p> : null}

        {lotItems.length === 0 ? (
          <p className="nn-muted">{sinAmbito ? t("sinAmbitoHeading") : t("noLots")}</p>
        ) : (
          <div className="nn-grid">
            {lotItems.map((lot) => (
              <Link key={lot.id} href={`/lots/${lot.id}`} className="nn-card-link">
                <h3 className="nn-code">{lot.lotCode}</h3>
                <p className="nn-muted">
                  {t(`lotType_${lot.lotType}` as "lotType_cherry")}
                  {/* P3 §3 — a rejection stream keeps its physical lotType, so
                      without this a floater batch is indistinguishable from
                      accepted coffee in this list. */}
                  {lot.rejectionCategoryValue ? (
                    <> · <span className="nn-badge">{t("rejectBadge", { category: lot.rejectionCategoryValue.value })}</span></>
                  ) : null}
                </p>
                <p className="nn-detail-meta">
                  {lot.project ? <span>{lot.project.name}</span> : null}
                  {lot.location ? <span>{lot.location.name}</span> : null}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
