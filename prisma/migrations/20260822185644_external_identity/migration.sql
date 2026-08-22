-- External identities (ADR-075).
--
-- Authority hangs off UserAccount — Assignments, and therefore every
-- permission, belong to the account — so a Person keeps exactly one account
-- (person_id is unique). What was missing was anywhere to record a *second*
-- way of proving identity for that one account.
--
-- Google sign-in tried to solve it by creating a second UserAccount for a
-- Person found by email, which fails on user_account_person_id_key. Reproduced
-- before writing this: "Unique constraint failed on the fields: (person_id)".
-- Every account with an email is affected, which is every account that can
-- currently sign in.
--
-- auth_subject is dropped rather than kept: it held the OAuth subject, is read
-- nowhere once sign-in uses this table, and has zero non-null values in
-- production (14 accounts, all `credentials`, none with a subject). Leaving a
-- dead column that looks meaningful invites someone to write to it.
CREATE TABLE "core"."external_identity" (
  "id"              UUID         NOT NULL DEFAULT gen_random_uuid(),
  "user_account_id" UUID         NOT NULL,
  "provider"        TEXT         NOT NULL,
  "subject"         TEXT         NOT NULL,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_used_at"    TIMESTAMP(3),
  CONSTRAINT "external_identity_pkey" PRIMARY KEY ("id")
);

-- The lookup sign-in performs, and the guarantee that one external identity
-- cannot be claimed by two accounts.
CREATE UNIQUE INDEX "external_identity_provider_subject_key"
  ON "core"."external_identity"("provider", "subject");

-- One Google account per UserAccount: linking a second would make "which
-- Google account signs me in" ambiguous.
CREATE UNIQUE INDEX "external_identity_user_account_id_provider_key"
  ON "core"."external_identity"("user_account_id", "provider");

ALTER TABLE "core"."external_identity"
  ADD CONSTRAINT "external_identity_user_account_id_fkey"
  FOREIGN KEY ("user_account_id") REFERENCES "core"."user_account"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Superseded by external_identity_provider_subject_key.
DROP INDEX IF EXISTS "core"."user_account_auth_provider_auth_subject_key";
ALTER TABLE "core"."user_account" DROP COLUMN "auth_subject";
