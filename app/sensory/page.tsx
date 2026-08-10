import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../lib/auth/session";
import { getJudgeSessions } from "../../lib/sensory/service";

export const dynamic = "force-dynamic";

export default async function SensorySessionsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const [t, sessions] = await Promise.all([getTranslations("Sensory"), getJudgeSessions(user.userAccountId)]);

  return (
    <div>
      <span className="nn-badge">{t("badge")}</span>
      <h1>{t("title")}</h1>

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
