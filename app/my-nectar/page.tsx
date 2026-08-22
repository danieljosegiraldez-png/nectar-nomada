import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { prisma } from "../../lib/db";
import { getCurrentUser } from "../../lib/auth/session";
import { canManageOwnProfile, resolvedPermissionKeys } from "../../lib/rbac/service";
import { getOrdersForUser } from "../../lib/commerce/orders";
import { getBookingsForUser } from "../../lib/experiences/bookings";
import { getAssessmentHistoryForEvaluator } from "../../lib/sensory/service";
import { formatPrice } from "../../lib/discover/format";

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

  const userAccount = await prisma.userAccount.findUnique({
    where: { id: user.userAccountId },
    include: {
      person: true,
      assignments: {
        where: { status: "active" },
        include: { roleProfile: true, scope: true },
      },
    },
  });

  // A valid, correctly-signed session can still reference a UserAccount that
  // no longer exists (deleted account, or a session cookie issued against a
  // different database) — fail closed with a clean redirect, not a 500.
  if (!userAccount) {
    redirect("/login");
  }

  // No Project/Program tables exist yet (later slices) so the only
  // meaningful target to resolve against right now is the platform scope —
  // this is a live call into the same authorization service every other
  // module will use, not a stub.
  const [platformPermissions, t, orders, bookings, assessments] = await Promise.all([
    resolvedPermissionKeys(user.userAccountId, { scopeType: "platform", scopeRefId: null }),
    getTranslations("MyNectar"),
    getOrdersForUser(user.userAccountId),
    getBookingsForUser(user.userAccountId),
    getAssessmentHistoryForEvaluator(user.userAccountId),
  ]);

  // Resolve scope references to names. A Scope carries scopeRefId and a
  // scopeType that says which table it points at, so this is two lookups
  // rather than a join — printing the raw UUID told the reader nothing about
  // which project or location the role actually applies to.
  const scopeRefIds = userAccount.assignments
    .map((a) => a.scope.scopeRefId)
    .filter((id): id is string => Boolean(id));

  const [scopeProjects, scopeLocations] = await Promise.all([
    scopeRefIds.length
      ? prisma.project.findMany({ where: { id: { in: scopeRefIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
    scopeRefIds.length
      ? prisma.location.findMany({ where: { id: { in: scopeRefIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);
  const scopeNames = new Map<string, string>(
    [...scopeProjects, ...scopeLocations].map((row) => [row.id, row.name]),
  );

  // Group permissions by the resource they act on. Thirty-eight keys listed
  // flat is a data dump; "lot: view, manage, export" is a sentence someone can
  // read. Sorted so the order does not shift between requests.
  const permissionsByResource = new Map<string, string[]>();
  for (const key of platformPermissions) {
    const [resource, action] = key.split(":");
    if (!resource || !action) continue;
    permissionsByResource.set(resource, [...(permissionsByResource.get(resource) ?? []), action]);
  }
  const groupedPermissions = [...permissionsByResource.entries()]
    .map(([resource, actions]) => [resource, actions.sort()] as const)
    .sort(([a], [b]) => a.localeCompare(b));

  return (
    <div>
      <span className="nn-badge">{t("badge")}</span>
      <h1>{t("greeting", { name: userAccount.person.displayName })}</h1>
      <p className="nn-muted">{userAccount.person.email}</p>

      <section style={{ marginTop: "2rem" }}>
        <h2>{t("assignmentsHeading")}</h2>
        {userAccount.assignments.length === 0 ? (
          <p className="nn-muted">{t("noAssignments")}</p>
        ) : (
          <ul>
            {userAccount.assignments.map((a) => {
              // Name the thing the role applies to. Falling back to the id
              // only when the referenced record cannot be found keeps a
              // dangling scope visible rather than silently blank.
              const target = a.scope.scopeRefId
                ? (scopeNames.get(a.scope.scopeRefId) ?? a.scope.scopeRefId)
                : null;
              return (
                <li key={a.id}>
                  <strong>{a.roleProfile.name}</strong>
                  {" — "}
                  {target ?? t("assignmentScope", { scope: a.scope.scopeType })}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2>{t("permissionsHeading")}</h2>
        {platformPermissions.size === 0 ? (
          <p className="nn-muted">{t("noPermissions")}</p>
        ) : (
          <>
            <p className="nn-muted">
              {t("permissionsSummary", {
                count: platformPermissions.size,
                areas: groupedPermissions.length,
              })}
            </p>
            <ul>
              {groupedPermissions.map(([resource, actions]) => (
                <li key={resource}>
                  <strong>{resource}</strong>
                  {" — "}
                  {actions.join(", ")}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2>{t("ordersHeading")}</h2>
        {orders.length === 0 ? (
          <p className="nn-muted">{t("noOrders")}</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0 }}>
            {orders.map((order) => (
              <li key={order.id} className="nn-card" style={{ maxWidth: "none", marginBottom: "1rem" }}>
                <p>
                  <strong>{order.orderNumber}</strong> —{" "}
                  {t(`orderStatus_${order.status}` as "orderStatus_pending_payment")}
                </p>
                <ul>
                  {order.items.map((item) => (
                    <li key={item.id}>
                      {item.productVariant.product.name}
                      {item.productVariant.variantName ? ` — ${item.productVariant.variantName}` : ""} ×
                      {item.quantity} — {formatPrice(item.unitPriceAmount, item.currency, "")}
                    </li>
                  ))}
                </ul>
                <p className="nn-price">{formatPrice(order.subtotalAmount, order.currency, "")}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2>{t("bookingsHeading")}</h2>
        {bookings.length === 0 ? (
          <p className="nn-muted">{t("noBookings")}</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0 }}>
            {bookings.map((booking) => (
              <li key={booking.id} className="nn-card" style={{ maxWidth: "none", marginBottom: "1rem" }}>
                <p>
                  <strong>{booking.bookingNumber}</strong> —{" "}
                  {t(`bookingStatus_${booking.status}` as "bookingStatus_pending_payment")}
                </p>
                <p>{booking.experienceSession.experience.name}</p>
                <ul>
                  {booking.participants.map((participant) => (
                    <li key={participant.id}>{participant.fullName}</li>
                  ))}
                </ul>
                <p className="nn-price">
                  {formatPrice(booking.unitPriceAmount.mul(booking.participantCount), booking.currency, "")}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2>{t("sensoryHistoryHeading")}</h2>
        {assessments.length === 0 ? (
          <p className="nn-muted">{t("noSensoryHistory")}</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0 }}>
            {assessments.map((assessment) => {
              const session = assessment.blindSample.flight.session;
              return (
                <li key={assessment.id} className="nn-card" style={{ maxWidth: "none", marginBottom: "1rem" }}>
                  <p style={{ margin: 0 }}>
                    <strong>{session.protocolVersion.protocol.name}</strong> —{" "}
                    {t("sensoryHistorySample", { code: assessment.blindSample.blindCode })}
                  </p>
                  <p className="nn-muted" style={{ margin: 0 }}>
                    {session.name} · {assessment.submittedAt.toLocaleDateString()}
                  </p>
                  {assessment.overallScore ? (
                    <p className="nn-price">
                      {t("sensoryHistoryScore", { score: assessment.overallScore.toNumber().toFixed(2) })}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
