import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../lib/auth/session";
import {
  listPeopleForAdmin,
  listRoleProfiles,
  listScopeChoices,
  requirePermissionAdmin,
  UserAdminError,
} from "../../../lib/rbac/admin";
import { grantRoleFormAction, revokeRoleFormAction } from "../../actions/admin";
import { BotonDeEnvio } from "../../components/BotonDeEnvio";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Server-side, before anything is read — SECURITY.md: never rely on a hidden
  // control for authorization. The nav does not link here for someone without
  // the permission, but the page refuses regardless.
  try {
    await requirePermissionAdmin(user.userAccountId);
  } catch (error) {
    if (error instanceof UserAdminError) redirect("/my-nectar");
    throw error;
  }

  const [t, people, roles, scopes, params] = await Promise.all([
    getTranslations("Admin"),
    listPeopleForAdmin(),
    listRoleProfiles(),
    listScopeChoices(),
    searchParams,
  ]);

  const canSignIn = people.filter((p) => p.account?.canSignIn).length;
  const withoutEmail = people.filter((p) => !p.email).length;
  const withoutRoles = people.filter((p) => p.assignments.length === 0).length;

  return (
    <div>
      <span className="nn-badge">{t("badge")}</span>
      <h1>{t("usersTitle")}</h1>
      <p className="nn-muted">
        {t("usersSummary", { total: people.length, canSignIn, withoutEmail, withoutRoles })}
      </p>

      {params.error ? (
        <p className="nn-error" role="alert" style={{ marginTop: "1rem" }}>
          {t(`error_${params.error}` as "error_already_granted")}
        </p>
      ) : null}

      <section className="nn-section">
        <h2>{t("grantHeading")}</h2>
        <form action={grantRoleFormAction} className="nn-form">
          <div className="nn-field">
            <label htmlFor="userAccountId">{t("personLabel")}</label>
            <select id="userAccountId" name="userAccountId" required>
              {people
                .filter((p) => p.account)
                .map((p) => (
                  <option key={p.account!.id} value={p.account!.id}>
                    {p.displayName}
                    {p.email ? ` — ${p.email}` : ` — ${t("noEmailSuffix")}`}
                  </option>
                ))}
            </select>
          </div>

          <div className="nn-field">
            <label htmlFor="roleProfileId">{t("roleLabel")}</label>
            <select id="roleProfileId" name="roleProfileId" required>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          <div className="nn-field">
            <label htmlFor="scopeType">{t("scopeTypeLabel")}</label>
            <select id="scopeType" name="scopeType" defaultValue="project">
              <option value="platform">{t("scopePlatform")}</option>
              <option value="project">{t("scopeProject")}</option>
              <option value="location">{t("scopeLocation")}</option>
            </select>
          </div>

          <div className="nn-field">
            <label htmlFor="scopeRefId">{t("scopeTargetLabel")}</label>
            {/* One list for both project and location: a native dependent
                select would need client JS, and the ids are unambiguous, so the
                server validates the pairing instead. Platform scope ignores
                this field entirely. */}
            <select id="scopeRefId" name="scopeRefId" defaultValue="">
              <option value="">{t("scopeTargetNone")}</option>
              <optgroup label={t("scopeProject")}>
                {scopes.projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label={t("scopeLocation")}>
                {scopes.locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          <BotonDeEnvio className="nn-button">
            {t("grantButton")}
          </BotonDeEnvio>
        </form>
      </section>

      <section className="nn-section">
        <h2>{t("peopleHeading")}</h2>
        <div className="nn-grid">
          {people.map((person) => (
            <div key={person.id} className="nn-card-link" style={{ cursor: "default" }}>
              <h3>{person.displayName}</h3>
              <p className="nn-muted">{person.email ?? t("noEmail")}</p>
              <p className="nn-muted">
                {!person.account
                  ? t("stateNoAccount")
                  : person.account.canSignIn
                    ? t("stateCanSignIn")
                    : t("stateCannotSignIn", { status: person.account.status })}
              </p>

              {person.assignments.length === 0 ? (
                <p className="nn-muted">{t("noRoles")}</p>
              ) : (
                person.assignments.map((a) => (
                  // A div, not a p: a <form> cannot be a descendant of <p>, and
                  // the browser silently closes the paragraph before it — which
                  // makes the server and client trees disagree and fails
                  // hydration. Caught by opening the page, not by the tests.
                  <div
                    key={a.id}
                    style={{ display: "flex", gap: "0.5rem", alignItems: "baseline", flexWrap: "wrap", margin: "0.25rem 0" }}
                  >
                    <strong>{a.roleName}</strong>
                    <span className="nn-muted">
                      {a.scopeLabel ?? t(`scope_${a.scopeType}` as "scope_platform")}
                    </span>
                    <form action={revokeRoleFormAction}>
                      <input type="hidden" name="assignmentId" value={a.id} />
                      <BotonDeEnvio className="nn-button-quiet">
                        {t("revokeButton")}
                      </BotonDeEnvio>
                    </form>
                  </div>
                ))
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
