import { redirect } from "next/navigation";
import { prisma } from "../../lib/db";
import { getCurrentUser } from "../../lib/auth/session";
import { canManageOwnProfile, resolvedPermissionKeys } from "../../lib/rbac/service";

export const dynamic = "force-dynamic";

export default async function MyNectarPage() {
  const user = await getCurrentUser();
  // Belt-and-suspenders with middleware.ts — SECURITY.md §2: every server
  // entry point re-checks, it never trusts having gotten this far.
  if (!user) {
    redirect("/login");
  }

  if (!canManageOwnProfile(user.userAccountId, user.userAccountId)) {
    redirect("/login");
  }

  const userAccount = await prisma.userAccount.findUniqueOrThrow({
    where: { id: user.userAccountId },
    include: {
      person: true,
      assignments: {
        where: { status: "active" },
        include: { roleProfile: true, scope: true },
      },
    },
  });

  // No Project/Program tables exist yet (later slices) so the only
  // meaningful target to resolve against right now is the platform scope —
  // this is a live call into the same authorization service every other
  // module will use, not a stub.
  const platformPermissions = await resolvedPermissionKeys(user.userAccountId, {
    scopeType: "platform",
    scopeRefId: null,
  });

  return (
    <div>
      <span className="nn-badge">My Néctar</span>
      <h1>Hola, {userAccount.person.displayName}</h1>
      <p className="nn-muted">{userAccount.person.email}</p>

      <section style={{ marginTop: "2rem" }}>
        <h2>Assignments</h2>
        {userAccount.assignments.length === 0 ? (
          <p className="nn-muted">
            No Role Profile assignments yet. You have baseline Registered Customer access only
            (RBAC.md §5) — an admin can grant a scoped Assignment later without changing your
            account itself.
          </p>
        ) : (
          <ul>
            {userAccount.assignments.map((a) => (
              <li key={a.id}>
                {a.roleProfile.name} — scope: {a.scope.scopeType}
                {a.scope.scopeRefId ? ` (${a.scope.scopeRefId})` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2>Resolved platform-scope permissions</h2>
        {platformPermissions.size === 0 ? (
          <p className="nn-muted">None — expected for a new account with no Assignments.</p>
        ) : (
          <ul>
            {Array.from(platformPermissions).map((key) => (
              <li key={key}>
                <code>{key}</code>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2>Orders · Bookings · Sensory history · Saved items</h2>
        <p className="nn-muted">
          Empty — Commerce, Experiences, and Sensory are later vertical slices (MVP_ROADMAP.md).
          This page is real, not a mock: it queries your actual UserAccount, Person, and
          Assignment rows.
        </p>
      </section>
    </div>
  );
}
