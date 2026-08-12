import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../../../lib/auth/session";
import { getHive } from "../../../../../lib/apiary/hives";
import { getObserverCandidates } from "../../../../../lib/traceability/lots";
import { listInspectionsForColony } from "../../../../../lib/apiary/inspections";
import { listColonyEventsForColony } from "../../../../../lib/apiary/colonyEvents";
import { NewColonyForm } from "../../../../components/apiary/NewColonyForm";
import { InspectionForm } from "../../../../components/apiary/InspectionForm";
import { ColonyEventQuickEntry } from "../../../../components/apiary/ColonyEventQuickEntry";
import { HarvestForm } from "../../../../components/apiary/HarvestForm";

export const dynamic = "force-dynamic";

export default async function HiveDetailPage({ params }: { params: Promise<{ id: string; hiveId: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id: apiaryId, hiveId } = await params;
  const t = await getTranslations("Apiary");
  const [hive, { selfPersonId }] = await Promise.all([
    getHive(user.userAccountId, hiveId),
    getObserverCandidates(user.userAccountId),
  ]);

  // A Hive holds at most one *current* Colony in practice (A1/A2's own
  // scope — a move/reassignment operation isn't built yet); prefer an
  // active one if several rows exist.
  const colony = hive.colonies.find((c) => c.status === "active") ?? hive.colonies[0] ?? null;

  const [inspections, colonyEvents] = colony
    ? await Promise.all([
        listInspectionsForColony(user.userAccountId, colony.id),
        listColonyEventsForColony(user.userAccountId, colony.id),
      ])
    : [[], []];

  return (
    <div>
      <p>
        <Link href={`/apiaries/${apiaryId}`}>{t("backToApiary")}</Link>
      </p>
      <span className="nn-badge">{t("badge")}</span>
      <h1>{hive.identifier}</h1>
      <p className="nn-muted">{t(`hiveStatus_${hive.status}`)}</p>

      {!colony ? (
        <section className="nn-section">
          <h2>{t("newColonyHeading")}</h2>
          <p className="nn-muted">{t("noColonyYet")}</p>
          <NewColonyForm apiaryId={apiaryId} hiveId={hiveId} />
        </section>
      ) : (
        <>
          <section className="nn-section">
            <h2>{t("colonyHeading")}</h2>
            <p className="nn-detail-meta">
              <span>{t(`originType_${colony.originType}`)}</span>
              <span>{t(`colonyStatus_${colony.status}`)}</span>
            </p>
            {colony.originNote ? <p className="nn-muted">{colony.originNote}</p> : null}
          </section>

          <section className="nn-section">
            <h2>{t("inspectionHeading")}</h2>
            <InspectionForm colonyId={colony.id} selfPersonId={selfPersonId} />
          </section>

          <section className="nn-section">
            <h2>{t("colonyEventHeading")}</h2>
            <ColonyEventQuickEntry colonyId={colony.id} selfPersonId={selfPersonId} />
          </section>

          <section className="nn-section">
            <h2>{t("harvestHeading")}</h2>
            <HarvestForm colonyId={colony.id} />
          </section>

          <section className="nn-section">
            <h2>{t("activityHeading")}</h2>
            {inspections.length === 0 && colonyEvents.length === 0 ? (
              <p className="nn-muted">{t("noActivity")}</p>
            ) : (
              <ul>
                {inspections.map((insp) => (
                  <li key={insp.id}>
                    {insp.occurredAt.toLocaleDateString()} — {t(`inspectionOutcome_${insp.outcome}`)}
                  </li>
                ))}
                {colonyEvents.map((evt) => (
                  <li key={evt.id}>
                    {evt.occurredAt.toLocaleDateString()} — {t(`colonyEventType_${evt.eventType}`)}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
