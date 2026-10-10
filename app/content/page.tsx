import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../lib/auth/session";
import { listStoriesForEditor, isPubliclyVisible } from "../../lib/content/stories";
import { permissionKeysAnywhere } from "../../lib/rbac/service";

export const dynamic = "force-dynamic";

export default async function ContentPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [t, stories, granted] = await Promise.all([
    getTranslations("Content"),
    // Already filtered by permission AND clearance — a viewer holding no
    // content permission gets an empty list rather than a refusal, because
    // "nothing here for you" and "you may not ask" are the same answer from
    // outside (ADR-092).
    listStoriesForEditor(user.userAccountId),
    permissionKeysAnywhere(user.userAccountId),
  ]);
  const canCreate = granted.has("content:create");

  const live = stories.filter(isPubliclyVisible).length;

  return (
    <div>
      <span className="nn-badge">{t("badge")}</span>
      <h1>{t("title")}</h1>
      <p className="nn-muted">{t("summary", { total: stories.length, live })}</p>

      {canCreate ? (
        <p style={{ marginTop: "1rem" }}>
          <Link href="/content/new" className="nn-button">
            {t("newStory")}
          </Link>
        </p>
      ) : null}

      <section className="nn-section">
        {stories.length === 0 ? (
          <p className="nn-muted">{t("noStories")}</p>
        ) : (
          <div className="nn-grid">
            {stories.map((story) => (
              <Link key={story.id} href={`/content/${story.id}`} className="nn-card-link">
                <h3>{story.title}</h3>
                <p className="nn-detail-meta">
                  {/* Both facts, because either alone is misleading: an
                      approved story that is still internal is not live. */}
                  <span>{t(`status_${story.status}` as "status_draft")}</span>
                  <span>{t(`classification_${story.classification}` as "classification_public")}</span>
                  {isPubliclyVisible(story) ? <strong>{t("liveOnSite")}</strong> : null}
                </p>
                {story.summary ? <p className="nn-muted">{story.summary}</p> : null}
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
