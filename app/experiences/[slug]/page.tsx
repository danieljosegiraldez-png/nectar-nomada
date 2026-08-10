import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getPublicExperienceBySlug } from "../../../lib/discover/service";
import { formatPrice } from "../../../lib/discover/format";

export const dynamic = "force-dynamic";

export default async function ExperienceDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [t, experience] = await Promise.all([getTranslations("Discover"), getPublicExperienceBySlug(slug)]);

  if (!experience) {
    notFound();
  }

  return (
    <div>
      <Link href="/discover" className="nn-back-link">
        {t("backToDiscover")}
      </Link>

      <h1>{experience.name}</h1>
      <p className="nn-price" style={{ fontSize: "1.2rem" }}>
        {formatPrice(experience.priceAmount, experience.priceCurrency, t("priceUnavailable"))}
      </p>
      <div className="nn-detail-meta">
        {experience.durationMinutes ? <span>{t("durationMinutes", { minutes: experience.durationMinutes })}</span> : null}
        {experience.project ? (
          <Link href={`/projects/${experience.project.slug}`}>
            {t("partOfProject", { project: experience.project.name })}
          </Link>
        ) : null}
        {experience.organization ? <span>{t("producedBy", { organization: experience.organization.name })}</span> : null}
        {experience.location ? (
          <Link href={`/locations/${experience.location.slug}`}>{experience.location.name}</Link>
        ) : null}
      </div>

      {experience.summary ? <p className="nn-muted">{experience.summary}</p> : null}
      {experience.description ? <div className="nn-prose">{experience.description}</div> : null}
    </div>
  );
}
