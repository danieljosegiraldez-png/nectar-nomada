import { PrismaClient } from "../../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * AI_GOVERNANCE.md §3 — a separate Prisma Client bound to the restricted
 * `ai_service` Postgres role (INSERT+SELECT on `ai.recommendation` only,
 * nothing else — see prisma/migrations/*_slice7_ai and
 * *_ai_service_select_own_table). This client must be the ONLY one any
 * AI-generation code path touches; every other file in this codebase uses
 * `lib/db.ts`'s full-access client instead. Importing this client to read
 * or write anything other than `Recommendation` will fail at the database
 * level, not just be a code-review violation.
 */
const globalForAiPrisma = globalThis as unknown as { aiPrisma?: PrismaClient };

const adapter = new PrismaPg({ connectionString: process.env.AI_SERVICE_DATABASE_URL! });

export const aiPrisma = globalForAiPrisma.aiPrisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForAiPrisma.aiPrisma = aiPrisma;
}
