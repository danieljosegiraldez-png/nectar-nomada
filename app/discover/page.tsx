import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  listPublicLocations,
  listPublicProjects,
  listPublicStories,
  listPublicProducts,
  listPublicExperiences,
} from "../../lib/discover/service";
import { formatPrice, lowestVariantPrice } from "../../lib/discover/format";

export const dynamic = "force-dynamic";

export default async function DiscoverPage() {
  const [t, locations, projects, stories, products, experiences] = await Promise.all([
    getTranslations("Discover"),
    listPublicLocations(),
    listPublicProjects(),
    listPublicStories(),
    listPublicProducts(),
    listPublicExperiences(),
  ]);

  return (
    <div>
      <div className="nn-demo-banner">
        <span className="nn-badge">{t("badge")}</span>
        <span>{t("demoNotice")}</span>
      </div>

      <h1>{t("title")}</h1>

      <section className="nn-section">
        <h2>{t("locationsHeading")}</h2>
        {locations.length === 0 ? (
          <p className="nn-muted">{t("empty")}</p>
        ) : (
          <div className="nn-grid">
            {locations.map((location) => (
              <Link key={location.id} href={`/locations/${location.slug}`} className="nn-card-link">
                <h3>{location.name}</h3>
                <p className="nn-muted">{location.locationType}</p>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="nn-section">
        <h2>{t("projectsHeading")}</h2>
        {projects.length === 0 ? (
          <p className="nn-muted">{t("empty")}</p>
        ) : (
          <div className="nn-grid">
            {projects.map((project) => (
              <Link key={project.id} href={`/projects/${project.slug}`} className="nn-card-link">
                <h3>{project.name}</h3>
                {project.primaryLocation ? <p className="nn-muted">{project.primaryLocation.name}</p> : null}
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="nn-section">
        <h2>{t("storiesHeading")}</h2>
        {stories.length === 0 ? (
          <p className="nn-muted">{t("empty")}</p>
        ) : (
          <div className="nn-grid">
            {stories.map((story) => (
              <Link key={story.id} href={`/stories/${story.slug}`} className="nn-card-link">
                <h3>{story.title}</h3>
                {story.summary ? <p className="nn-muted">{story.summary}</p> : null}
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="nn-section">
        <h2>{t("productsHeading")}</h2>
        {products.length === 0 ? (
          <p className="nn-muted">{t("empty")}</p>
        ) : (
          <div className="nn-grid">
            {products.map((product) => {
              const price = lowestVariantPrice(product.variants);
              return (
                <Link key={product.id} href={`/products/${product.slug}`} className="nn-card-link">
                  <h3>{product.name}</h3>
                  <p className="nn-price">
                    {price ? t("fromPrice", { price: formatPrice(price.amount, price.currency, "") }) : t("priceUnavailable")}
                  </p>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <section className="nn-section">
        <h2>{t("experiencesHeading")}</h2>
        {experiences.length === 0 ? (
          <p className="nn-muted">{t("empty")}</p>
        ) : (
          <div className="nn-grid">
            {experiences.map((experience) => (
              <Link key={experience.id} href={`/experiences/${experience.slug}`} className="nn-card-link">
                <h3>{experience.name}</h3>
                <p className="nn-price">
                  {formatPrice(experience.priceAmount, experience.priceCurrency, t("priceUnavailable"))}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
