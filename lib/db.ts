import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Single Prisma Client instance per process (DECISIONS.md ADR-005 /
 * Prisma driver-adapter guidance) — a fresh instance per request would
 * exhaust the connection pool. The `pg` driver adapter speaks standard
 * Postgres wire protocol, which works unchanged against the local
 * `prisma dev` database and against Neon (ADR-007) — no separate adapter
 * needed per environment.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
