# Security — Néctar Nómada Digital Platform

Implements CLAUDE.md §56–58. This document specifies enforcement mechanisms;
`RBAC.md` specifies the permission model those mechanisms enforce.

---

## 1. Authentication

Auth.js (self-hosted, `DECISIONS.md` ADR-006) with credentials (email + password,
Argon2id hashing) and OAuth (Google at minimum, for lower-friction customer
signup). Sessions are server-side, httpOnly, secure, SameSite=Lax cookies —
no auth tokens in localStorage/sessionStorage where they're reachable by XSS.
Email verification required before an account can create Assignments-bearing
activity (booking/ordering as a guest is allowed without verification; anything
touching Partner/Research/Sensory workspaces requires a verified, invited
account).

## 2. Authorization — server-side, single choke point

Every request that reads or writes RBAC-governed data passes through one shared
authorization service implementing `RBAC.md` §4's resolution algorithm. No
module route handler queries permission tables directly or re-implements scope
containment. This is the concrete answer to CLAUDE.md §56's "never rely
exclusively on hidden UI elements for authorization" — the UI hides controls the
user can't use for UX reasons, but every underlying API route independently
re-checks permission server-side regardless of what the UI sent or hid.

## 3. Input validation

Zod schemas at every API boundary (or Server Action boundary, given the Next.js
choice in `DECISIONS.md` ADR-004), validated before the request reaches any
service-layer or database call. File uploads are validated by content-sniffed
MIME type (not trusted from the client-supplied filename/header alone), size-
limited per asset type, and stored under a generated key (`DATA_ARCHITECTURE.md`
§5) — never the user-supplied filename, to avoid path traversal or overwrite
attacks against object storage.

## 4. Classification enforcement

The `public | registered | partner | internal | confidential | trade_secret`
axis (`RBAC.md` §6) is enforced in the same authorization service as permission
checks (§2 above) — never only in a query's `WHERE` clause written ad hoc per
endpoint. Public-facing pages (Discover, product pages, story pages) query
through a view or service method that hard-filters to `classification = 'public'`
by construction, so a future engineer adding a new public route cannot
accidentally expose a non-public record by forgetting a filter — the filter is
the only path to the data, not an opt-in guard.

## 5. CSRF

Next.js Server Actions get built-in CSRF protection (origin-check) for v1's
primary write path. Any additional REST/API routes accepting state-changing
requests from a browser session use SameSite cookies plus a double-submit CSRF
token for defense in depth, per CLAUDE.md §56.

## 6. Audit trail

`core.audit_event` (`DOMAIN_MODEL.md` §5) receives a mandatory row for:

- every Assignment create/revoke and classification-clearance grant (`RBAC.md` §8);
- every write to a table carrying `provenance_class` in
  {`measured_fact`, `original_record`, `direct_observation`, `scientific_evidence`}
  (i.e. anything the provenance model treats as authoritative evidence);
- every protocol/document version supersession;
- every competition result change or judge assignment change;
- every AI-suggestion acceptance (`AI_GOVERNANCE.md` §4), recording which human
  accepted it and what action they actually took;
- every payment/refund event and every account status change (suspend/
  deactivate/role assignment).

Audit rows are append-only (no `UPDATE`/`DELETE` grant on `audit_event` for any
application role, including admin — corrections are new rows, consistent with
the version-preservation principle running through the whole spec). Sensitive and
scientific records get this stronger audit treatment by default, not as an
opt-in setting (CLAUDE.md §35).

## 7. Rate limiting

Applied at the edge (Vercel) for unauthenticated endpoints (login, signup,
password reset, public search) to blunt credential stuffing and scraping, and at
the authorization-service layer for authenticated write endpoints handling
sensitive actions (competition result submission, protocol approval) to limit
blast radius of a compromised session. Concrete limits are tuned during
implementation, not fixed here; the requirement is that every public-facing
mutation endpoint has *some* limit before it ships, not that a specific number
is architecturally load-bearing.

## 8. Secrets management

No secrets in the repository, ever — environment variables managed through the
hosting platform's encrypted secret storage (Vercel encrypted env vars in
production; `.env.local`, gitignored, for local dev). Third-party API keys
(weather, maps, payments, AI providers) are scoped to least privilege where the
provider supports it (e.g., a Mapbox token restricted to the app's domains, a
Stripe restricted key rather than the full secret key where an operation allows
it).

## 9. Signed asset URLs

Every non-`public`-classified Asset is served via a short-expiry signed URL
generated server-side after the same authorization check as any other read
(§2, §4) — never a permanently public object URL for anything above `public`
classification, and never a "security by obscurity" unlisted-but-guessable URL.

## 10. Encryption in transit

TLS everywhere, enforced by the hosting platform (Vercel terminates TLS;
database connections to the managed Postgres provider use `sslmode=require`).
No internal service-to-service call in the modular monolith crosses a network
boundary in v1 (single deployable), so this is primarily about the
browser-to-app and app-to-database/object-storage/third-party-API legs — all of
which are TLS by default with the chosen managed providers.

## 11. Session handling

Session lifetime and idle timeout are shorter for Admin/Research/Competition
Role Profiles (workspaces touching confidential or evidentiary data) than for
Registered Customer sessions — a concrete, testable difference, not just a
stated intention. Session invalidation on password change and on Assignment
revocation is immediate (revoking a Partner's project Assignment terminates
their ability to act in that scope on their next request, not merely at next
login).

## 12. Testing

Per CLAUDE.md §57: unit, integration, permission, API, and critical-user-flow
tests are required. Permission tests specifically must include an explicit
unauthorized-access assertion for every Role Profile against every scope it does
*not* cover (`RBAC.md` §9) — a passing test suite that only exercises the happy
path of "this role can do the thing it's supposed to" does not satisfy this
requirement; the negative case is the one that actually protects sensitive
objects.

## 13. Observability

Structured logging (JSON, one line per request with actor, route, outcome,
latency) plus error monitoring (Sentry-class service) plus the audit trail (§6)
plus basic health checks on the app and database. Logs never include secrets,
full session tokens, or unredacted PII payloads (CLAUDE.md §58) — request logs
capture that a login attempt occurred and its outcome, not the submitted
password, and capture that a sensory assessment was submitted, not necessarily
its full content if that content is separately classified.
