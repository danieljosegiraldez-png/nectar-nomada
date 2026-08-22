# Security — Néctar Nómada Digital Platform

Implements CLAUDE.md §56–58. This document specifies enforcement mechanisms;
`RBAC.md` specifies the permission model those mechanisms enforce.

---

## 1. Authentication

Auth.js (self-hosted, `DECISIONS.md` ADR-006) with credentials (email + password,
Argon2id hashing) and OAuth (Google at minimum, for lower-friction customer
signup). Sessions are server-side, httpOnly, secure, SameSite=Lax cookies —
no auth tokens in localStorage/sessionStorage where they're reachable by XSS.
Email verification is **not currently enforced anywhere**, corrected here
(C1 §5, 17_ audit) — an earlier version of this section stated it as already
required before Assignments-bearing activity. In reality: `emailVerifiedAt`
is set automatically for Google OAuth signups (already verified by Google)
but is never set at all for Credentials (email+password) signups, because no
verification-email flow exists yet (`grep`-confirmed: no send-verification
or verify-token code anywhere, consistent with `INTEGRATIONS.md` §5's Email
adapter being unbuilt). No code path anywhere reads `emailVerifiedAt` as a
gate. **This was deliberately left as a documentation fix, not a code fix**:
enforcing this gate today would lock out every existing Credentials-based
account, including the real Partner/Farm Operator/Research/Sensory accounts
already in production, since none of them has ever had this field set.
Building the actual control requires an email-sending integration first
(none exists) — worth scoping as its own ticket, not retrofitted here as a
"cheap fix" that would break live accounts.

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

> **Status, 2026-08-22 (ADR-062, ADR-063, ADR-068, ADR-069): enforced
> everywhere it applies; the deferred inventory is empty.** The AND-gate was
> passed at zero of thirteen `can()` call sites, because the parameter
> defaulted to `public` and omission was invisible. The parameter is now
> required, so a bypass is a compile error.
>
> Every call site now passes a real classification, one of three ways:
>
> - **the record's own** — Lot, Sample, Location (`classification` lives on
>   thirteen tables);
> - **its parent's** — a Specimen gates on the Location it stands at; research
>   records, Hives and ColonyEvents gate on the Project or Location the work
>   belongs to, via `lib/rbac/scopeClassification.ts`. A target whose record
>   cannot be loaded is skipped, never treated as public;
> - **`CLASSIFICATION_NOT_APPLICABLE`** — five platform-scoped capability
>   checks ("may this account manage competitions at all") touch no row, so
>   nothing's sensitivity is in question and `public` is the final answer.
>
> `grep -rn CLASSIFICATION_GATE_DEFERRED lib app` returns no call sites. The
> sentinel is kept for future modules not yet ready to gate, so that any such
> site stays greppable rather than passing a bare `"public"`.
>
> Enforcement required correcting two role profiles (ADR-063): Farm Operator
> and Project Viewer now hold `classification:clear_internal`, because every
> Lot defaults to `internal` and neither could otherwise reach records they
> create or are assigned to read. Partner Field Collector and Sensory Judge
> were deliberately left alone.
>
> This section previously stated the enforcement as fact before any of it was
> true. It described intent.

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

`core.audit_event` (`DOMAIN_MODEL.md` §5) is intended to receive a mandatory
row for:

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

**Current build status (17_ audit, C1 §3/§4 — corrected from an earlier
version of this section that stated this list as already fully built):**

- Assignment create/revoke ✅, evidentiary writes across Traceability/Apiary
  (and Sensory's `Assessment` submission, evidentiary by immutability rather
  than a `provenance_class` column) ✅ (C1 §3), AI-suggestion
  accept/reject/modify ✅, `order.paid`/`booking.paid` ✅.
- **Not yet built**: protocol/document version supersession, competition
  result changes, judge assignment changes, refund events (no refund
  capability exists yet at all — `INTEGRATIONS.md` §6), and account status
  changes (suspend/deactivate has no implementing route yet — `RBAC.md` §2).
  These remain real gaps, not silently-satisfied claims.

Audit rows are append-only **by application convention only, not by database
grant** — this corrects an earlier version of this section, which claimed no
role held `UPDATE`/`DELETE` on `audit_event`, including admin. Verified live
(17_ audit, Part A item 4): the application's own connecting database role
holds full `UPDATE`/`DELETE` privileges on `audit_event`, the same as any
Postgres table owner absent an explicit restricting grant — no such grant
exists. What is true is that exactly one function in the codebase
(`lib/audit.ts`'s `recordAuditEvent`) ever writes to this table, and it only
ever calls `create`; no `.update()`/`.delete()` call against `audit_event`
exists anywhere. This is a real, working control — just an application-layer
one, not the database-level guarantee originally claimed. A dedicated
restricted database role (mirroring the `ai_service` pattern already proven
for `ai.recommendation`, `AI_GOVERNANCE.md` §3) would close this gap if a
true database-level guarantee is later required. Sensitive and scientific
records are intended to get this stronger audit treatment by default, not as
an opt-in setting (CLAUDE.md §35) — see the coverage gaps above for where
that intention isn't fully realized yet.

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

Session lifetime is a single uniform value (`lib/auth/config.ts`,
`maxAge: 7 days`), not differentiated by Role Profile. **This corrects an
earlier version of this section**, which described shorter sessions for
Admin/Research/Competition profiles than for Registered Customers — that
differentiated design was never built, and the reason is architectural, not
an oversight: Auth.js's JWT session strategy exposes exactly one `maxAge`
lever, applied uniformly to every session regardless of role, with no
built-in concept of a per-profile or "offline-only" lifetime. The 7-day
value itself was a deliberate decision (ADR-046, made for A5.5's offline
capability — bounding how long a lost or stolen field device stays
authenticated without forcing daily re-login for operators who use the app
most days), not a default left unconsidered. A genuinely differentiated
session lifetime by Role Profile would require custom session-token
infrastructure beyond Auth.js's session strategy — worth building if a real
need justifies that complexity, not built speculatively ahead of one.

Session invalidation on Assignment revocation is immediate in practice, but
as a side effect of the RBAC design rather than a dedicated session-layer
mechanism: `can()` re-queries `Assignment` fresh from the database on every
permission check with no caching layer in between (`lib/rbac/service.ts`),
so a revoked Assignment stops authorizing anything on the very next request
regardless of how long the session token itself remains valid — confirmed
live (ADR-046 decision 4). Session invalidation on password change is not separately implemented — the
Credentials provider (`lib/auth/config.ts`) authenticates against a real
password, but there is no change-password flow anywhere in the codebase yet
(`grep` for it found nothing), so there is nothing this control would
currently apply to; worth building alongside whenever a change-password flow
is added, not before.

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
