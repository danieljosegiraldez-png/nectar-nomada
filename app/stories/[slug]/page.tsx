import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getPublicStoryBySlug } from "../../../lib/discover/service";

export const dynamic = "force-dynamic";

export default async function StoryDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [t, story] = await Promise.all([getTranslations("Discover"), getPublicStoryBySlug(slug)]);

  if (!story) {
    notFound();
  }

  return (
    <div>
      <Link href="/discover" className="nn-back-link">
        {t("backToDiscover")}
      </Link>

      <h1>{story.title}</h1>
      <div className="nn-detail-meta">
        {story.project ? (
          <span>{t("partOfProject", { project: story.project.name })}</span>
        ) : null}
        {story.location ? <Link href={`/locations/${story.location.slug}`}>{story.location.name}</Link> : null}
      </div>

      {story.summary ? <p className="nn-muted">{story.summary}</p> : null}
      {/*
        Rendered as plain text (white-space: pre-wrap), not parsed as
        markdown — no markdown-rendering dependency added for this pass.
        ADAPTIVE_INTELLIGENCE_EXPERIENCE_REVIEW.md's StoryBlock composition
        system is the real future replacement for this field, not a
        markdown renderer bolted onto a single text column.
      */}
      {story.bodyMarkdown ? <div className="nn-prose">{story.bodyMarkdown}</div> : null}
    </div>
  );
}
