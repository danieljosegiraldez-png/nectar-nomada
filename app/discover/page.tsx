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
    // `nn-editorial` opts this surface into the public register (CLAUDE.md §48):
    // serif headings, chapter-mark section rules, flatter cards, more air. The
    // operator pages keep the dense sans register. One system, two densities.
    <div className="nn-editorial">
      {/* The demo banner that used to sit here claimed "everything on this page
          is demo content — fictional data, not real project information". That
          became false: Boquete, Cerro Azul and both stories are real, and the
          DEMO records that remained are being removed (ADR-071). A standing
          disclaimer that is wrong is worse than none — it teaches a reader to
          disbelieve the real material. */}
      <h1>{t("title")}</h1>
      <p className="nn-lead">{t("intro")}</p>

      {/* Stories lead. They are what §48's public side is for — territory,
          origin, craft, people — and a visitor arriving with no context needs
          a way in, not a directory. Everything below is the directory. */}
      {stories.length > 0 ? (
        <section className="nn-section">
          <h2>{t("storiesHeading")}</h2>
          <div className="nn-grid nn-grid-wide">
            {stories.map((story) => (
              <Link key={story.id} href={`/stories/${story.slug}`} className="nn-card-link">
                <h3>{story.title}</h3>
                {story.summary ? <p className="nn-muted">{story.summary}</p> : null}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {locations.length > 0 ? (
        <section className="nn-section">
          <h2>{t("locationsHeading")}</h2>
          <div className="nn-grid">
            {locations.map((location) => (
              <Link key={location.id} href={`/locations/${location.slug}`} className="nn-card-link">
                <h3>{location.name}</h3>
                <p className="nn-muted">{location.locationType}</p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {projects.length > 0 ? (
        <section className="nn-section">
          <h2>{t("projectsHeading")}</h2>
          <div className="nn-grid">
            {projects.map((project) => (
              <Link key={project.id} href={`/projects/${project.slug}`} className="nn-card-link">
                <h3>{project.name}</h3>
                {project.primaryLocation ? <p className="nn-muted">{project.primaryLocation.name}</p> : null}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {experiences.length > 0 ? (
        <section className="nn-section">
          <h2>{t("experiencesHeading")}</h2>
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
        </section>
      ) : null}

      {products.length > 0 ? (
        <section className="nn-section">
          <h2>{t("productsHeading")}</h2>
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
        </section>
      ) : null}

      {/* Only reachable before any public content exists at all. A visitor is
          told the page is empty once, rather than five times in five headed
          sections — the same correction the lots page needed. */}
      {stories.length === 0 &&
      locations.length === 0 &&
      projects.length === 0 &&
      experiences.length === 0 &&
      products.length === 0 ? (
        <p className="nn-muted">{t("empty")}</p>
      ) : null}
    </div>
  );
}
