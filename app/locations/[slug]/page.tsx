import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getPublicLocationBySlug } from "../../../lib/discover/service";

export const dynamic = "force-dynamic";

export default async function LocationDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [t, location] = await Promise.all([getTranslations("Discover"), getPublicLocationBySlug(slug)]);

  if (!location) {
    notFound();
  }

  return (
    <div>
      <Link href="/discover" className="nn-back-link">
        {t("backToDiscover")}
      </Link>

      <span className="nn-badge">{location.locationType}</span>
      <h1>{location.name}</h1>
      <div className="nn-detail-meta">
        {location.parentLocation ? <span>{location.parentLocation.name}</span> : null}
        {location.organization ? <span>{t("producedBy", { organization: location.organization.name })}</span> : null}
      </div>

      {location.projectsWithPrimaryLocation.length > 0 ? (
        <section className="nn-section">
          <h2>{t("projectsHeading")}</h2>
          <div className="nn-grid">
            {location.projectsWithPrimaryLocation.map((project) => (
              <Link key={project.id} href={`/projects/${project.slug}`} className="nn-card-link">
                <h3>{project.name}</h3>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {location.stories.length > 0 ? (
        <section className="nn-section">
          <h2>{t("relatedStoriesHeading")}</h2>
          <div className="nn-grid">
            {location.stories.map((story) => (
              <Link key={story.id} href={`/stories/${story.slug}`} className="nn-card-link">
                <h3>{story.title}</h3>
                {story.summary ? <p className="nn-muted">{story.summary}</p> : null}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {location.products.length > 0 ? (
        <section className="nn-section">
          <h2>{t("relatedProductsHeading")}</h2>
          <div className="nn-grid">
            {location.products.map((product) => (
              <Link key={product.id} href={`/products/${product.slug}`} className="nn-card-link">
                <h3>{product.name}</h3>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {location.experiences.length > 0 ? (
        <section className="nn-section">
          <h2>{t("relatedExperiencesHeading")}</h2>
          <div className="nn-grid">
            {location.experiences.map((experience) => (
              <Link key={experience.id} href={`/experiences/${experience.slug}`} className="nn-card-link">
                <h3>{experience.name}</h3>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
