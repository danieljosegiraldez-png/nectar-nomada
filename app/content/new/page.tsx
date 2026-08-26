import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../lib/auth/session";
import { getAuthoringContext } from "../../../lib/content/stories";
import { permissionKeysAnywhere } from "../../../lib/rbac/service";
import { createStoryFormAction } from "../../actions/content";

export const dynamic = "force-dynamic";

export default async function NewStoryPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const granted = await permissionKeysAnywhere(user.userAccountId);
  // Server-side, before the form is rendered — SECURITY.md §2. The nav hides
  // this from someone without the permission; the page refuses regardless.
  if (!granted.has("content:create")) redirect("/content");

  const [t, context, params] = await Promise.all([
    getTranslations("Content"),
    getAuthoringContext(user.userAccountId),
    searchParams,
  ]);

  return (
    <div>
      <Link href="/content" className="nn-back-link">{t("backToContent")}</Link>
      <h1>{t("newStory")}</h1>
      {/* Said before the form rather than after it: a new story is internal,
          and becoming public is a separate, deliberate act (ADR-092). */}
      <p className="nn-muted">{t("newStoryIntro")}</p>

      {params.error ? (
        <p className="nn-error" role="alert">{t(`error_${params.error}` as "error_title_required")}</p>
      ) : null}

      <form className="nn-form" action={createStoryFormAction}>
        <div className="nn-field">
          <label htmlFor="title">{t("titleLabel")}</label>
          <input id="title" name="title" required maxLength={200} />
        </div>
        <div className="nn-field">
          <label htmlFor="summary">{t("summaryLabel")}</label>
          <input id="summary" name="summary" maxLength={400} />
        </div>
        <div className="nn-field">
          <label htmlFor="bodyMarkdown">{t("bodyLabel")}</label>
          <textarea id="bodyMarkdown" name="bodyMarkdown" rows={12} />
        </div>
        <div className="nn-field">
          <label htmlFor="projectId">{t("projectLabel")}</label>
          <select id="projectId" name="projectId" defaultValue="">
            <option value="">{t("noneOption")}</option>
            {context.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="nn-field">
          <label htmlFor="locationId">{t("locationLabel")}</label>
          <select id="locationId" name="locationId" defaultValue="">
            <option value="">{t("noneOption")}</option>
            {context.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <div className="nn-field">
          <label htmlFor="authorPersonId">{t("authorLabel")}</label>
          <select id="authorPersonId" name="authorPersonId" defaultValue="">
            <option value="">{t("noneOption")}</option>
            {context.people.map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}
          </select>
        </div>
        <button type="submit" className="nn-button">{t("createButton")}</button>
      </form>
    </div>
  );
}
