import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../lib/auth/session";
import {
  getStoryForEditor,
  getAuthoringContext,
  isPubliclyVisible,
  ContentAccessError,
} from "../../../lib/content/stories";
import { updateStoryFormAction, setStoryStatusFormAction } from "../../actions/content";
import { BotonDeEnvio } from "../../components/BotonDeEnvio";

export const dynamic = "force-dynamic";

export default async function StoryEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;

  let loaded;
  try {
    loaded = await getStoryForEditor(user.userAccountId, id);
  } catch (error) {
    // A story this account may not see and one that does not exist are the
    // same answer on purpose (ADR-081/092).
    if (error instanceof ContentAccessError) redirect("/content");
    throw error;
  }
  const { story, canEdit, canPublish } = loaded;

  const [t, context, query] = await Promise.all([
    getTranslations("Content"),
    getAuthoringContext(user.userAccountId),
    searchParams,
  ]);

  const live = isPubliclyVisible(story);

  return (
    <div>
      <Link href="/content" className="nn-back-link">{t("backToContent")}</Link>
      <h1>{story.title}</h1>

      <p className="nn-detail-meta">
        <span>{t(`status_${story.status}` as "status_draft")}</span>
        <span>{t(`classification_${story.classification}` as "classification_public")}</span>
        {live ? (
          <Link href={`/stories/${story.slug}`}>{t("viewLive")}</Link>
        ) : (
          <span>{t("notLive")}</span>
        )}
      </p>

      {query.error ? (
        <p className="nn-error" role="alert">{t(`error_${query.error}` as "error_title_required")}</p>
      ) : null}

      {canPublish ? (
        <section className="nn-section">
          <h2>{t("publishHeading")}</h2>
          {/* Status and classification are set together because the public
              site requires both — approved-but-internal is invisible, which
              reads as a broken publish rather than a choice (ADR-092). */}
          <p className="nn-muted">{t("publishIntro")}</p>
          <form className="nn-form" action={setStoryStatusFormAction}>
            <input type="hidden" name="storyId" value={story.id} />
            <div className="nn-field">
              <label htmlFor="status">{t("statusLabel")}</label>
              <select id="status" name="status" defaultValue={story.status}>
                {(["draft", "pending_review", "approved", "archived"] as const).map((s) => (
                  <option key={s} value={s}>{t(`status_${s}` as "status_draft")}</option>
                ))}
              </select>
            </div>
            <div className="nn-field">
              <label htmlFor="classification">{t("classificationLabel")}</label>
              <select id="classification" name="classification" defaultValue={story.classification}>
                {(["public", "registered", "partner", "internal"] as const).map((c) => (
                  <option key={c} value={c}>{t(`classification_${c}` as "classification_public")}</option>
                ))}
              </select>
            </div>
            <p className="nn-muted">{t("publishWarning")}</p>
            <BotonDeEnvio className="nn-button">{t("applyStatusButton")}</BotonDeEnvio>
          </form>
        </section>
      ) : null}

      <section className="nn-section">
        <h2>{t("editHeading")}</h2>
        {canEdit ? (
          <>
            {story.status === "approved" ? (
              <p className="nn-muted">{t("editingPublishedWarning")}</p>
            ) : null}
            <form className="nn-form" action={updateStoryFormAction}>
              <input type="hidden" name="storyId" value={story.id} />
              <div className="nn-field">
                <label htmlFor="title">{t("titleLabel")}</label>
                <input id="title" name="title" defaultValue={story.title} required maxLength={200} />
              </div>
              <div className="nn-field">
                <label htmlFor="summary">{t("summaryLabel")}</label>
                <input id="summary" name="summary" defaultValue={story.summary ?? ""} maxLength={400} />
              </div>
              <div className="nn-field">
                <label htmlFor="bodyMarkdown">{t("bodyLabel")}</label>
                <textarea id="bodyMarkdown" name="bodyMarkdown" rows={16} defaultValue={story.bodyMarkdown ?? ""} />
              </div>
              <div className="nn-field">
                <label htmlFor="projectId">{t("projectLabel")}</label>
                <select id="projectId" name="projectId" defaultValue={story.projectId ?? ""}>
                  <option value="">{t("noneOption")}</option>
                  {context.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="nn-field">
                <label htmlFor="locationId">{t("locationLabel")}</label>
                <select id="locationId" name="locationId" defaultValue={story.locationId ?? ""}>
                  <option value="">{t("noneOption")}</option>
                  {context.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <div className="nn-field">
                <label htmlFor="authorPersonId">{t("authorLabel")}</label>
                <select id="authorPersonId" name="authorPersonId" defaultValue={story.authorPersonId ?? ""}>
                  <option value="">{t("noneOption")}</option>
                  {context.people.map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}
                </select>
              </div>
              <BotonDeEnvio className="nn-button">{t("saveButton")}</BotonDeEnvio>
            </form>
          </>
        ) : (
          <p className="nn-muted">{t("readOnly")}</p>
        )}
      </section>
    </div>
  );
}
