import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getPublicProjectBySlug } from "../../../lib/discover/service";

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [t, project] = await Promise.all([getTranslations("Discover"), getPublicProjectBySlug(slug)]);

  if (!project) {
    notFound();
  }

  return (
    <div>
      <Link href="/discover" className="nn-back-link">
        {t("backToDiscover")}
      </Link>

      <h1>{project.name}</h1>
      <div className="nn-detail-meta">
        {project.primaryLocation ? (
          <Link href={`/locations/${project.primaryLocation.slug}`}>{project.primaryLocation.name}</Link>
        ) : null}
        {project.organization ? <span>{t("producedBy", { organization: project.organization.name })}</span> : null}
      </div>

      {project.domainTags.length > 0 ? (
        <div className="nn-detail-meta" style={{ marginTop: "-1rem" }}>
          {project.domainTags.map(({ domainTag }) => (
            <span key={domainTag.id} className="nn-badge">
              {domainTag.name}
            </span>
          ))}
        </div>
      ) : null}

      {project.description ? <p>{project.description}</p> : null}

      {project.stories.length > 0 ? (
        <section className="nn-section">
          <h2>{t("relatedStoriesHeading")}</h2>
          <div className="nn-grid">
            {project.stories.map((story) => (
              <Link key={story.id} href={`/stories/${story.slug}`} className="nn-card-link">
                <h3>{story.title}</h3>
                {story.summary ? <p className="nn-muted">{story.summary}</p> : null}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {project.products.length > 0 ? (
        <section className="nn-section">
          <h2>{t("relatedProductsHeading")}</h2>
          <div className="nn-grid">
            {project.products.map((product) => (
              <Link key={product.id} href={`/products/${product.slug}`} className="nn-card-link">
                <h3>{product.name}</h3>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {project.experiences.length > 0 ? (
        <section className="nn-section">
          <h2>{t("relatedExperiencesHeading")}</h2>
          <div className="nn-grid">
            {project.experiences.map((experience) => (
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
