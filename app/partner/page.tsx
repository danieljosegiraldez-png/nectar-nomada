import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../lib/auth/session";
import { getPartnerProjects } from "../../lib/partner/workspace";

export const dynamic = "force-dynamic";

export default async function PartnerWorkspacePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const [t, projects] = await Promise.all([getTranslations("Partner"), getPartnerProjects(user.userAccountId)]);

  return (
    <div>
      <span className="nn-badge">{t("badge")}</span>
      <h1>{t("title")}</h1>

      {projects.length === 0 ? (
        <p className="nn-muted">{t("noProjects")}</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {projects.map((project) => (
            <li key={project.id} className="nn-card" style={{ maxWidth: "none", marginBottom: "1rem" }}>
              <Link href={`/partner/${project.id}`}>
                <h3 style={{ margin: 0 }}>{project.name}</h3>
              </Link>
              {project.description ? <p className="nn-muted">{project.description}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
