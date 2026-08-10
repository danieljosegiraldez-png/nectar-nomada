/**
 * INTEGRATIONS.md §3 — object storage adapter boundary. Business logic
 * (lib/partner/workspace.ts) depends only on this interface, never on the
 * `@aws-sdk/client-s3` package directly, so a future move off R2 to AWS S3
 * or another S3-compatible vendor (DECISIONS.md ADR-003) is a
 * credentials/endpoint change in the adapter file, not a rewrite.
 *
 * `putObject` returns a presigned PUT URL rather than accepting bytes and
 * uploading them itself — the actual upload happens client-side, a direct
 * PUT from the browser to R2. This avoids proxying potentially large media
 * files through a Next.js serverless function (payload-size limits on
 * Vercel) and matches how INTEGRATIONS.md §3 names the method
 * (`putObject`) without mandating the server hold the bytes.
 */
export interface PutObjectInput {
  key: string;
  contentType: string;
}

export interface PutObjectResult {
  uploadUrl: string;
}

export interface ObjectStorageProvider {
  putObject(input: PutObjectInput): Promise<PutObjectResult>;
  /** Short-expiry signed GET URL — DATA_ARCHITECTURE.md §5: never a public bucket for anything not explicitly classified Public. */
  getSignedUrl(key: string): Promise<string>;
  deleteObject(key: string): Promise<void>;
}
