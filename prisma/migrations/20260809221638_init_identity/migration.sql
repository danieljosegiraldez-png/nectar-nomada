-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "core";

-- CreateEnum
CREATE TYPE "core"."PersonStatus" AS ENUM ('active', 'archived');

-- CreateEnum
CREATE TYPE "core"."UserAccountStatus" AS ENUM ('active', 'invited', 'suspended', 'deactivated');

-- CreateEnum
CREATE TYPE "core"."ScopeType" AS ENUM ('platform', 'program', 'project', 'location', 'competition', 'session', 'experience');

-- CreateEnum
CREATE TYPE "core"."RoleProfileStatus" AS ENUM ('active', 'archived');

-- CreateEnum
CREATE TYPE "core"."AssignmentStatus" AS ENUM ('active', 'revoked', 'expired');

-- CreateTable
CREATE TABLE "core"."person" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "given_name" TEXT NOT NULL,
    "family_name" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'es',
    "bio" TEXT,
    "status" "core"."PersonStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."user_account" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "person_id" UUID NOT NULL,
    "auth_provider" TEXT NOT NULL,
    "auth_subject" TEXT,
    "password_hash" TEXT,
    "email_verified_at" TIMESTAMP(3),
    "last_login_at" TIMESTAMP(3),
    "status" "core"."UserAccountStatus" NOT NULL DEFAULT 'invited',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "user_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."scope" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "scope_type" "core"."ScopeType" NOT NULL,
    "scope_ref_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "scope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."role_profile" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "core"."RoleProfileStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "role_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."permission" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "resource_type" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."role_profile_permission" (
    "role_profile_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_profile_permission_pkey" PRIMARY KEY ("role_profile_id","permission_id")
);

-- CreateTable
CREATE TABLE "core"."assignment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_account_id" UUID NOT NULL,
    "role_profile_id" UUID NOT NULL,
    "scope_id" UUID NOT NULL,
    "granted_by" UUID,
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_to" TIMESTAMP(3),
    "status" "core"."AssignmentStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."audit_event" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actor_user_account_id" UUID,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "operation" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "source_interface" TEXT NOT NULL,

    CONSTRAINT "audit_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_account_person_id_key" ON "core"."user_account"("person_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_account_auth_provider_auth_subject_key" ON "core"."user_account"("auth_provider", "auth_subject");

-- CreateIndex
CREATE UNIQUE INDEX "scope_scope_type_scope_ref_id_key" ON "core"."scope"("scope_type", "scope_ref_id");

-- CreateIndex
CREATE UNIQUE INDEX "role_profile_name_key" ON "core"."role_profile"("name");

-- CreateIndex
CREATE UNIQUE INDEX "permission_resource_type_action_key" ON "core"."permission"("resource_type", "action");

-- CreateIndex
CREATE INDEX "assignment_user_account_id_status_idx" ON "core"."assignment"("user_account_id", "status");

-- CreateIndex
CREATE INDEX "audit_event_entity_type_entity_id_idx" ON "core"."audit_event"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_event_actor_user_account_id_idx" ON "core"."audit_event"("actor_user_account_id");

-- AddForeignKey
ALTER TABLE "core"."person" ADD CONSTRAINT "person_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."user_account" ADD CONSTRAINT "user_account_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "core"."person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."user_account" ADD CONSTRAINT "user_account_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."scope" ADD CONSTRAINT "scope_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."role_profile" ADD CONSTRAINT "role_profile_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."role_profile_permission" ADD CONSTRAINT "role_profile_permission_role_profile_id_fkey" FOREIGN KEY ("role_profile_id") REFERENCES "core"."role_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."role_profile_permission" ADD CONSTRAINT "role_profile_permission_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "core"."permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."assignment" ADD CONSTRAINT "assignment_user_account_id_fkey" FOREIGN KEY ("user_account_id") REFERENCES "core"."user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."assignment" ADD CONSTRAINT "assignment_role_profile_id_fkey" FOREIGN KEY ("role_profile_id") REFERENCES "core"."role_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."assignment" ADD CONSTRAINT "assignment_scope_id_fkey" FOREIGN KEY ("scope_id") REFERENCES "core"."scope"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."assignment" ADD CONSTRAINT "assignment_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."audit_event" ADD CONSTRAINT "audit_event_actor_user_account_id_fkey" FOREIGN KEY ("actor_user_account_id") REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
