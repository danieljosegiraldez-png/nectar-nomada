import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl as presign } from "@aws-sdk/s3-request-presigner";
import type { ObjectStorageProvider, PutObjectInput, PutObjectResult } from "./types";

const UPLOAD_URL_EXPIRY_SECONDS = 300; // 5 minutes — long enough for a client-side upload to start
const GET_URL_EXPIRY_SECONDS = 300; // DATA_ARCHITECTURE.md §5 — short expiry, generated after a permission check

function getClient(): S3Client {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY are not set — see SETUP.md.");
  }
  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

function getBucket(): string {
  const bucket = process.env.R2_BUCKET;
  if (!bucket) {
    throw new Error("R2_BUCKET is not set — see SETUP.md.");
  }
  return bucket;
}

export const r2ObjectStorageProvider: ObjectStorageProvider = {
  async putObject(input: PutObjectInput): Promise<PutObjectResult> {
    const client = getClient();
    const bucket = getBucket();
    const command = new PutObjectCommand({ Bucket: bucket, Key: input.key, ContentType: input.contentType });
    const uploadUrl = await presign(client, command, { expiresIn: UPLOAD_URL_EXPIRY_SECONDS });
    return { uploadUrl };
  },

  async getSignedUrl(key: string): Promise<string> {
    const client = getClient();
    const bucket = getBucket();
    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    return presign(client, command, { expiresIn: GET_URL_EXPIRY_SECONDS });
  },

  async deleteObject(key: string): Promise<void> {
    const client = getClient();
    const bucket = getBucket();
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  },
};
