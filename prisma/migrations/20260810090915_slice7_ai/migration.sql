-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "ai";

-- CreateEnum
CREATE TYPE "ai"."RecommendationStatus" AS ENUM ('pending', 'accepted', 'rejected', 'modified');

-- CreateTable
CREATE TABLE "ai"."recommendation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "suggestion_type" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "model_version" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "context" JSONB,
    "recommendation" TEXT NOT NULL,
    "supporting_evidence" JSONB,
    "confidence" DECIMAL(4,3),
    "related_entity_type" TEXT,
    "related_entity_id" UUID,
    "status" "ai"."RecommendationStatus" NOT NULL DEFAULT 'pending',
    "reviewer_user_account_id" UUID,
    "decision_at" TIMESTAMP(3),
    "action_taken" TEXT,

    CONSTRAINT "recommendation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recommendation_status_idx" ON "ai"."recommendation"("status");

-- CreateIndex
CREATE INDEX "recommendation_related_entity_type_related_entity_id_idx" ON "ai"."recommendation"("related_entity_type", "related_entity_id");

-- AddForeignKey
ALTER TABLE "ai"."recommendation" ADD CONSTRAINT "recommendation_reviewer_user_account_id_fkey" FOREIGN KEY ("reviewer_user_account_id") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AI_GOVERNANCE.md §3 — a real, separately-privileged Postgres role for the
-- AI write path, not just an application-layer promise. Created NOLOGIN
-- here deliberately: this migration file is committed to version control,
-- so no password is ever embedded in it. The password is set out-of-band
-- (ALTER ROLE ... LOGIN PASSWORD ..., run directly, never committed) and
-- the resulting connection string lives only in .env as
-- AI_SERVICE_DATABASE_URL. This role can INSERT into ai.recommendation and
-- nothing else — no SELECT/UPDATE/DELETE anywhere, no access to any other
-- schema. "AI silently mutates a scientific record" is not a bug class
-- that can occur in production regardless of what the application code
-- does, because the write path physically does not exist for this role.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'ai_service') THEN
    CREATE ROLE ai_service NOLOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA ai TO ai_service;
GRANT INSERT ON ai.recommendation TO ai_service;
REVOKE SELECT, UPDATE, DELETE ON ai.recommendation FROM ai_service;

