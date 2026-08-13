import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../../../lib/auth/session";
import { getHive } from "../../../../../lib/apiary/hives";
import { getObserverCandidates } from "../../../../../lib/traceability/lots";
import { getSignedUrlForAsset } from "../../../../../lib/traceability/media";
import { listInspectionsForColony } from "../../../../../lib/apiary/inspections";
import { listColonyEventsForColony } from "../../../../../lib/apiary/colonyEvents";
import { NewColonyForm } from "../../../../components/apiary/NewColonyForm";
import { InspectionForm } from "../../../../components/apiary/InspectionForm";
import { ColonyEventQuickEntry } from "../../../../components/apiary/ColonyEventQuickEntry";
import { HarvestForm } from "../../../../components/apiary/HarvestForm";
import { ApiaryPhotoUploadForm } from "../../../../components/apiary/ApiaryPhotoUploadForm";
import type { Asset } from "../../../../../generated/prisma/client";

export const dynamic = "force-dynamic";

export default async function HiveDetailPage({ params }: { params: Promise<{ id: string; hiveId: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id: apiaryId, hiveId } = await params;
  const t = await getTranslations("Apiary");
  const [hive, { people: observers, selfPersonId }] = await Promise.all([
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

  const revalidationPath = `/apiaries/${apiaryId}/hives/${hiveId}`;

  // A6: same "one aggregated gallery, upload forms at each attachment
  // point" pattern as app/lots/[id]/page.tsx — signed GET URLs computed
  // once here, already gated by getHive/listInspectionsForColony/
  // listColonyEventsForColony's own requireApiaryAccess("view", ...) above.
  const allAssets: Asset[] = [
    ...hive.assets,
    ...(colony?.assets ?? []),
    ...inspections.flatMap((insp) => insp.assets),
    ...colonyEvents.flatMap((evt) => evt.assets),
  ];
  const assetsWithUrls = await Promise.all(
    allAssets.map(async (asset) => ({ asset, viewUrl: await getSignedUrlForAsset(asset.storageKey) })),
  );

  return (
    <div>
      <p>
        <Link href={`/apiaries/${apiaryId}`}>{t("backToApiary")}</Link>
      </p>
      <span className="nn-badge">{t("badge")}</span>
      <h1>{hive.identifier}</h1>
      <p className="nn-muted">{t(`hiveStatus_${hive.status}`)}</p>
      <ApiaryPhotoUploadForm
        parent={{ kind: "hive", hiveId: hive.id }}
        revalidationPath={revalidationPath}
        observers={observers}
        selfPersonId={selfPersonId}
      />

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
            <ApiaryPhotoUploadForm
              parent={{ kind: "colony", colonyId: colony.id }}
              revalidationPath={revalidationPath}
              observers={observers}
              selfPersonId={selfPersonId}
            />
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
                    <ApiaryPhotoUploadForm
                      parent={{ kind: "inspection", inspectionId: insp.id }}
                      revalidationPath={revalidationPath}
                      observers={observers}
                      selfPersonId={selfPersonId}
                    />
                  </li>
                ))}
                {colonyEvents.map((evt) => (
                  <li key={evt.id}>
                    {evt.occurredAt.toLocaleDateString()} — {t(`colonyEventType_${evt.eventType}`)}
                    <ApiaryPhotoUploadForm
                      parent={{ kind: "colonyEvent", colonyEventId: evt.id }}
                      revalidationPath={revalidationPath}
                      observers={observers}
                      selfPersonId={selfPersonId}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {assetsWithUrls.length > 0 ? (
        <section className="nn-section">
          <h2>{t("photosHeading")}</h2>
          <ul style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", listStyle: "none", padding: 0 }}>
            {assetsWithUrls.map(({ asset, viewUrl }) => (
              <li key={asset.id}>
                {asset.assetType === "photo" ? (
                  // eslint-disable-next-line @next/next/no-img-element -- signed R2 URL, not a static/optimizable Next asset
                  <img src={viewUrl} alt="" style={{ width: 160, height: 160, objectFit: "cover", borderRadius: 4 }} />
                ) : (
                  <a href={viewUrl}>{asset.originalFilename ?? asset.id}</a>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
