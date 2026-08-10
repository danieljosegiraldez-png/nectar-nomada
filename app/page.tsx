import Link from "next/link";
import { getTranslations } from "next-intl/server";

export default async function HomePage() {
  const [tHome, tDiscover] = await Promise.all([getTranslations("Home"), getTranslations("Discover")]);

  return (
    <div className="nn-hero">
      <span className="nn-badge">{tHome("badge")}</span>
      <h1>{tHome("title")}</h1>
      <p>{tHome("description")}</p>
      <p style={{ marginTop: "1.5rem" }}>
        <Link href="/discover" className="nn-button" style={{ display: "inline-block", textDecoration: "none" }}>
          {tDiscover("exploreCta")}
        </Link>
      </p>
    </div>
  );
}
