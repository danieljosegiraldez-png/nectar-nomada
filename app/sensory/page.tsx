import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../lib/auth/session";
import { getJudgeSessions } from "../../lib/sensory/service";
import { permissionKeysAnywhere } from "../../lib/rbac/service";
import { buildSensoryTools } from "../../lib/navigation";

export const dynamic = "force-dynamic";

export default async function SensorySessionsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  // S2 §4 — Competitions and Calibration are not separate sections of the
  // platform; they are this discipline used for a different purpose. They are
  // offered here, and only to viewers who can actually use them.
  const [t, tNav, sessions, granted] = await Promise.all([
    getTranslations("Sensory"),
    getTranslations("Nav"),
    getJudgeSessions(user.userAccountId),
    permissionKeysAnywhere(user.userAccountId),
  ]);
  const tools = buildSensoryTools(granted);

  return (
    <div>
      <span className="nn-badge">{t("badge")}</span>
      <h1>{t("title")}</h1>

      {tools.length > 0 ? (
        <div className="nn-chips" aria-label={t("toolsLabel")}>
          {tools.map((tool) => (
            <Link key={tool.href} href={tool.href} className="nn-chip">
              {tNav(tool.labelKey as "competitions")}
            </Link>
          ))}
        </div>
      ) : null}

      {sessions.length === 0 ? (
        <p className="nn-muted">{t("noSessions")}</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {sessions.map((session) => (
            <li key={session.id} className="nn-card" style={{ maxWidth: "none", marginBottom: "1rem" }}>
              <Link href={`/sensory/${session.id}`}>
                <h3 style={{ margin: 0 }}>{session.name}</h3>
              </Link>
              <p className="nn-muted">
                {session.protocolVersion.protocol.name} v{session.protocolVersion.version}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
