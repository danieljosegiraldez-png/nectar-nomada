import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../lib/auth/session";
import { getActiveOperations, getLotList, type LotListFilters } from "../../lib/traceability/lots";

export const dynamic = "force-dynamic";

const LOT_TYPES: NonNullable<LotListFilters["lotType"]>[] = [
  "cherry",
  "processing",
  "drying",
  "green",
  "roast",
  "sample",
  "other",
];

export default async function LotsPage({ searchParams }: { searchParams: Promise<{ lotType?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { lotType } = await searchParams;
  const filter = LOT_TYPES.includes(lotType as never) ? (lotType as LotListFilters["lotType"]) : undefined;

  const t = await getTranslations("Traceability");
  const [operations, lots] = await Promise.all([
    getActiveOperations(user.userAccountId),
    getLotList(user.userAccountId, { lotType: filter }),
  ]);

  return (
    <div>
      <span className="nn-badge">{t("badge")}</span>
      <h1>{t("lotsTitle")}</h1>
      <p className="nn-muted">{t("lotsIntro")}</p>
      <p style={{ marginTop: "1rem" }}>
        <Link href="/lots/new" className="nn-button" style={{ display: "inline-block", textDecoration: "none" }}>
          {t("createLotButton")}
        </Link>
      </p>

      <section className="nn-section">
        <h2>{t("activeOperationsHeading")}</h2>
        <div className="nn-grid">
          <div className="nn-card-link" style={{ cursor: "default" }}>
            <h3>{t("activeFermentationHeading")}</h3>
            {operations.activeFermentationRuns.length === 0 ? (
              <p className="nn-muted">{t("noneActive")}</p>
            ) : (
              operations.activeFermentationRuns.map((entry) => (
                <p key={entry.run.id}>
                  <Link href={`/lots/${(entry.lot as { id: string }).id}`}>
                    {(entry.lot as { lotCode: string }).lotCode}
                  </Link>
                </p>
              ))
            )}
          </div>

          <div className="nn-card-link" style={{ cursor: "default" }}>
            <h3>{t("activeDryingHeading")}</h3>
            {operations.activeDryingRuns.length === 0 ? (
              <p className="nn-muted">{t("noneActive")}</p>
            ) : (
              operations.activeDryingRuns.map((entry) => (
                <p key={entry.run.id}>
                  <Link href={`/lots/${(entry.lot as { id: string }).id}`}>
                    {(entry.lot as { lotCode: string }).lotCode}
                  </Link>
                </p>
              ))
            )}
          </div>

          <div className="nn-card-link" style={{ cursor: "default" }}>
            <h3>{t("needsMeasurementHeading")}</h3>
            {operations.lotsNeedingMeasurement.length === 0 ? (
              <p className="nn-muted">{t("noneActive")}</p>
            ) : (
              operations.lotsNeedingMeasurement.map((lot) => (
                <p key={lot.id}>
                  <Link href={`/lots/${lot.id}`}>{lot.lotCode}</Link>
                </p>
              ))
            )}
          </div>

          <div className="nn-card-link" style={{ cursor: "default" }}>
            <h3>{t("awaitingSensoryHeading")}</h3>
            {operations.samplesAwaitingSensory.length === 0 ? (
              <p className="nn-muted">{t("noneActive")}</p>
            ) : (
              operations.samplesAwaitingSensory.map((sample) => (
                <p key={sample.id}>
                  {sample.sourceLotId ? (
                    <Link href={`/lots/${sample.sourceLotId}`}>{sample.sampleCode}</Link>
                  ) : (
                    sample.sampleCode
                  )}
                </p>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="nn-section">
        <h2>{t("lotListHeading")}</h2>
        <div style={{ marginBottom: "1rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <Link href="/lots" className={filter ? undefined : "nn-price"}>
            {t("filterAll")}
          </Link>
          {LOT_TYPES.map((type) => (
            <Link key={type} href={`/lots?lotType=${type}`} className={filter === type ? "nn-price" : undefined}>
              {t(`lotType_${type}`)}
            </Link>
          ))}
        </div>

        {lots.length === 0 ? (
          <p className="nn-muted">{t("noLots")}</p>
        ) : (
          <div className="nn-grid">
            {lots.map((lot) => (
              <Link key={lot.id} href={`/lots/${lot.id}`} className="nn-card-link">
                <h3>{lot.lotCode}</h3>
                <p className="nn-muted">{t(`lotType_${lot.lotType}` as "lotType_cherry")}</p>
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
