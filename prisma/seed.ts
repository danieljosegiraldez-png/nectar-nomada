/**
 * RBAC.md §5 — seeds the Permission catalog and starter Role Profiles.
 * Idempotent (safe to re-run): everything is an upsert keyed on the same
 * natural keys the schema enforces uniqueness on.
 *
 * The DEMO Platform Admin account (CLAUDE.md §54: seed data must be clearly
 * labeled DEMO, never fabricated real people/credentials) is opt-in via
 * SEED_DEMO_ADMIN=true, specifically so a production `prisma migrate deploy`
 * pipeline never accidentally ships a default login.
 */
import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PERMISSIONS, ROLE_PROFILES } from "../lib/rbac/catalog";
import { hashPassword } from "../lib/auth/password";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function seedPermissions() {
  const byKey = new Map<string, { id: string }>();
  for (const p of PERMISSIONS) {
    const row = await prisma.permission.upsert({
      where: { resourceType_action: { resourceType: p.resourceType, action: p.action } },
      update: { description: p.description },
      create: { resourceType: p.resourceType, action: p.action, description: p.description },
    });
    byKey.set(`${p.resourceType}:${p.action}`, row);
  }
  return byKey;
}

async function seedRoleProfiles(permissionsByKey: Map<string, { id: string }>) {
  for (const profile of ROLE_PROFILES) {
    const roleProfile = await prisma.roleProfile.upsert({
      where: { name: profile.name },
      update: { description: profile.description },
      create: { name: profile.name, description: profile.description },
    });

    for (const [resourceType, action] of profile.permissions) {
      const permission = permissionsByKey.get(`${resourceType}:${action}`);
      if (!permission) {
        throw new Error(
          `Role Profile "${profile.name}" references undefined permission ${resourceType}:${action}`,
        );
      }
      await prisma.roleProfilePermission.upsert({
        where: {
          roleProfileId_permissionId: { roleProfileId: roleProfile.id, permissionId: permission.id },
        },
        update: {},
        create: { roleProfileId: roleProfile.id, permissionId: permission.id },
      });
    }
  }
}

async function seedPlatformScope() {
  const existing = await prisma.scope.findFirst({ where: { scopeType: "platform" } });
  if (existing) return existing;
  return prisma.scope.create({ data: { scopeType: "platform", scopeRefId: null } });
}

async function seedDemoAdmin(platformScopeId: string) {
  const email = "demo-admin@nectar-nomada.example";
  const existingPerson = await prisma.person.findFirst({ where: { email } });
  if (existingPerson) {
    console.log("DEMO Platform Admin already seeded — skipping.");
    return;
  }

  const passwordHash = await hashPassword("DemoAdmin!2026-change-me");

  const person = await prisma.person.create({
    data: {
      givenName: "DEMO",
      familyName: "Admin",
      displayName: "DEMO Platform Admin",
      email,
    },
  });

  const userAccount = await prisma.userAccount.create({
    data: { personId: person.id, authProvider: "credentials", passwordHash, status: "active" },
  });

  const adminProfile = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Platform Admin" } });

  await prisma.assignment.create({
    data: { userAccountId: userAccount.id, roleProfileId: adminProfile.id, scopeId: platformScopeId },
  });

  console.log(`Seeded DEMO Platform Admin — email: ${email}, password: DemoAdmin!2026-change-me`);
  console.log("This is local/dev seed data only — CLAUDE.md §54. Rotate or remove before any shared deployment.");
}

async function main() {
  const permissionsByKey = await seedPermissions();
  await seedRoleProfiles(permissionsByKey);
  const platformScope = await seedPlatformScope();

  if (process.env.SEED_DEMO_ADMIN === "true") {
    await seedDemoAdmin(platformScope.id);
  }

  console.log(`Seeded ${PERMISSIONS.length} permissions and ${ROLE_PROFILES.length} role profiles.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
