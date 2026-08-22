-- Organization contact details (ADR-073).
--
-- CLAUDE.md §9 models Organizations as canonical entities. How to reach one is
-- a fact about the organization, not about whichever Person is currently a
-- member — there was previously nowhere to record it, so an organizational
-- address had no home at all.
--
-- All nullable: most organizations will not have these, and an absent contact
-- must stay absent rather than be invented (CLAUDE.md §3 — missing information
-- remains missing).
--
-- Not unique, unlike person.email: an Organization never authenticates, so no
-- lookup becomes ambiguous, and two organizations sharing an owner's address
-- is ordinary.
ALTER TABLE "core"."organization"
  ADD COLUMN "contact_email" TEXT,
  ADD COLUMN "contact_phone" TEXT,
  ADD COLUMN "website_url"   TEXT;
