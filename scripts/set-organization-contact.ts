/**
 * Set an Organization's contact details — ADR-073.
 *
 * How to reach an organization is a fact about the organization, not about
 * whichever Person happens to be a member. Like a Person's address, it is a
 * business fact and cannot be derived or invented (CLAUDE.md §61E), so it
 * arrives here from someone who knows it.
 *
 * Run with no arguments to list what is recorded.
 *
 * Usage:
 *   npm run org:set-contact
 *   npm run org:set-contact -- "Néctar Nómada" --email=hello@example.com
 *   npm run org:set-contact -- "Finca X" --phone="+507 6000 0000" --website=https://example.com
 *   npm run org:set-contact -- "Finca X" --phone=              # clears it
 */

// Must come first: lib/db reads DATABASE_URL at import time.
import "dotenv/config";

import { prisma } from "../lib/db";
import { recordAuditEvent } from "../lib/audit";

function fail(message: string, ...detail: string[]): never {
  console.error(`\n  ${message}`);
  for (const line of detail) console.error(`  ${line}`);
  console.error("");
  process.exit(1);
}

// A guard against an obvious typo reaching the database, not a claim that the
// address is real — only mail arriving proves that.
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function list() {
  const orgs = await prisma.organization.findMany({
    orderBy: { name: "asc" },
    select: { name: true, organizationType: true, classification: true, contactEmail: true, contactPhone: true, websiteUrl: true },
  });
  console.log("\n  Organizations and their contact details\n");
  for (const o of orgs) {
    const bits = [o.contactEmail, o.contactPhone, o.websiteUrl].filter(Boolean);
    console.log(`  ${o.name.padEnd(32)} ${o.organizationType} · ${o.classification}`);
    console.log(`  ${"".padEnd(32)} ${bits.length ? bits.join("  ·  ") : "— nothing recorded"}`);
  }
  console.log('\n  Set with:  npm run org:set-contact -- "Name" --email=hello@example.com\n');
}

/** `--key=value`. An explicit empty value clears the field; an absent flag leaves it untouched. */
function parseFlags(args: string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const arg of args) {
    const m = /^--([a-zA-Z]+)=(.*)$/.exec(arg);
    if (!m) fail(`Unrecognised argument "${arg}".`, "", "Expected --email=, --phone= or --website=");
    out.set(m[1]!.toLowerCase(), m[2]!);
  }
  return out;
}

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    fail("DATABASE_URL is not set, and .env does not define it either.", "", "Run this from the project root.");
  }

  const [, , who, ...rest] = process.argv;
  if (!who) return list();
  if (rest.length === 0) {
    fail('Nothing to set. Pass at least one of --email= --phone= --website=');
  }

  const flags = parseFlags(rest);
  for (const key of flags.keys()) {
    if (!["email", "phone", "website"].includes(key)) {
      fail(`Unknown field "--${key}". Expected --email, --phone or --website.`);
    }
  }

  const looksLikeId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(who);
  const matches = await prisma.organization.findMany({
    where: looksLikeId ? { OR: [{ id: who }, { name: who }] } : { name: who },
  });

  if (matches.length === 0) {
    const all = await prisma.organization.findMany({ orderBy: { name: "asc" }, select: { name: true } });
    fail(`No organization named exactly "${who}".`, "", "Known organizations:", ...all.map((o) => `  ${o.name}`));
  }
  if (matches.length > 1) {
    fail(`"${who}" matches ${matches.length} organizations. Pass the id instead:`, "", ...matches.map((o) => `  ${o.id}  ${o.name}`));
  }
  const org = matches[0]!;

  const data: { contactEmail?: string | null; contactPhone?: string | null; websiteUrl?: string | null } = {};

  if (flags.has("email")) {
    const raw = flags.get("email")!.trim();
    if (raw === "") data.contactEmail = null;
    else {
      const email = raw.toLowerCase();
      if (!LOOKS_LIKE_EMAIL.test(email)) fail(`"${raw}" does not look like an email address. Nothing was changed.`);
      data.contactEmail = email;
    }
  }
  if (flags.has("phone")) {
    const raw = flags.get("phone")!.trim();
    // Deliberately unvalidated beyond emptiness: phone formats vary by country
    // and a regex here would reject real numbers rather than catch typos.
    data.contactPhone = raw === "" ? null : raw;
  }
  if (flags.has("website")) {
    const raw = flags.get("website")!.trim();
    if (raw === "") data.websiteUrl = null;
    else {
      try {
        const url = new URL(raw);
        if (!["http:", "https:"].includes(url.protocol)) throw new Error("scheme");
        data.websiteUrl = url.toString();
      } catch {
        fail(`"${raw}" is not an http(s) URL. Nothing was changed.`);
      }
    }
  }

  const before = { contactEmail: org.contactEmail, contactPhone: org.contactPhone, websiteUrl: org.websiteUrl };
  const unchanged = Object.entries(data).every(([k, v]) => before[k as keyof typeof before] === v);
  if (unchanged) {
    console.log(`\n  ${org.name} already has those details. Nothing to do.\n`);
    return;
  }

  // La escritura y su AuditEvent en la misma transacción desde el 2026-09-06.
  // Antes eran dos llamadas sueltas: los datos quedaban puestos y, si el audit
  // fallaba, no quedaba rastro de quién los cambió ni desde dónde.
  const after = await prisma.$transaction(async (tx) => {
    const actualizada = await tx.organization.update({ where: { id: org.id }, data });

    await recordAuditEvent(
      {
        actorUserAccountId: null,
        operation: "update",
        entityType: "organization",
        entityId: org.id,
        before,
        after: {
          contactEmail: actualizada.contactEmail,
          contactPhone: actualizada.contactPhone,
          websiteUrl: actualizada.websiteUrl,
        },
        reason: "contact details set via scripts/set-organization-contact.ts",
        sourceInterface: "cli",
      },
      tx,
    );

    return actualizada;
  });

  console.log(`\n  ${org.name}`);
  console.log(`    email:   ${before.contactEmail ?? "(none)"} → ${after.contactEmail ?? "(none)"}`);
  console.log(`    phone:   ${before.contactPhone ?? "(none)"} → ${after.contactPhone ?? "(none)"}`);
  console.log(`    website: ${before.websiteUrl ?? "(none)"} → ${after.websiteUrl ?? "(none)"}`);
  console.log(`\n  Classification is ${org.classification} — that still governs who can see this.\n`);
}

main()
  .catch((error) => {
    console.error("\n  Failed:", error instanceof Error ? error.message : error, "\n");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
