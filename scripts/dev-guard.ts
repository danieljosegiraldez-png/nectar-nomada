/**
 * Refuses to start the dev server against a remote database — ADR-084.
 *
 * `npm run dev` was plain `next dev`, which loads `.env` and therefore talks
 * to production Neon. Nothing about the running app announces which database
 * it is on, so every click in a dev session — create a batch, record a
 * transformation, submit an assessment — wrote to the live research record
 * while looking exactly like local work.
 *
 * This is the same refusal `tests/setup.ts` has made since the suite was found
 * writing into production, and it shares that file's definition of "local"
 * rather than restating it (lib/databaseHost.ts).
 *
 * The escape hatch is deliberate and deliberately explicit: reading production
 * data through the real UI is a legitimate thing to want, and a guard with no
 * way past it gets deleted rather than respected. It just should be a sentence
 * someone typed, not the default.
 */
import "dotenv/config";
import { hostOf, isLocalDatabaseUrl } from "../lib/databaseHost";

const url = process.env.DATABASE_URL;

if (!isLocalDatabaseUrl(url) && process.env.ALLOW_REMOTE_DEV_DB !== "1") {
  const host = hostOf(url);
  console.error(
    [
      "",
      `Refusing to start the dev server against a remote database (${host ?? "unset or unparseable DATABASE_URL"}).`,
      "",
      "`next dev` reads .env, so this would be production. Nothing in the running",
      "app says which database it is on, and every write a dev session makes —",
      "a batch, a transformation, an assessment — would land in the live record.",
      "",
      "Run against a local copy restored from the newest verified backup:",
      "",
      "  npm run test:db up     # once, to create it",
      "  npm run dev:local",
      "",
      "If you genuinely mean to point dev at the remote database, say so:",
      "",
      "  ALLOW_REMOTE_DEV_DB=1 npm run dev",
      "",
    ].join("\n"),
  );
  process.exit(1);
}
