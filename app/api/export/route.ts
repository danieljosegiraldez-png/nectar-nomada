/**
 * Producer data export download — CLAUDE.md §46.
 *
 * A route handler rather than a Server Action because the result is a file the
 * browser should save, not a page it should render. Everything about *what*
 * may leave is decided in lib/traceability/export.ts; this only turns it into
 * a zip and sets the headers.
 */

import { zipSync, strToU8 } from "fflate";
import { getCurrentUser } from "../../../lib/auth/session";
import { buildProducerExport, ExportAccessError } from "../../../lib/traceability/export";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    // 401, not a redirect: this is a download, and a browser saving an HTML
    // login page as "export.zip" is worse than an honest error.
    return new Response("Not authenticated", { status: 401 });
  }

  let result;
  try {
    result = await buildProducerExport(user.userAccountId);
  } catch (error) {
    if (error instanceof ExportAccessError) {
      return new Response(
        "You do not have permission to export data. This needs a lot:export grant on a project you are assigned to.",
        { status: 403 },
      );
    }
    throw error;
  }

  const entries = Object.fromEntries(
    Object.entries(result.files).map(([name, contents]) => [name, strToU8(contents)]),
  );
  // Level 6: these are text files that compress well, and the whole export is
  // built in memory anyway — a producer's whole account is kilobytes, not
  // gigabytes. If that ever stops being true this wants streaming instead.
  const zipped = zipSync(entries, { level: 6 });

  const stamp = result.generatedAt.toISOString().slice(0, 10);
  return new Response(new Uint8Array(zipped), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="nectar-nomada-export-${stamp}.zip"`,
      // Nothing about this response should be cached: it is per-user data,
      // and it changes whenever the underlying records do.
      "cache-control": "no-store",
    },
  });
}
