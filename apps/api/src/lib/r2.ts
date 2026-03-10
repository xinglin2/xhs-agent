import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl as awsGetSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createLogger } from '@xhs/logger';

const log = createLogger('r2');

// ── S3 Client (Cloudflare R2) ─────────────────────────────────────────────────

function getR2Client(): S3Client {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error(
      'R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY environment variables are required',
    );
  }

  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

function getBucketName(): string {
  const bucket = process.env.R2_BUCKET_NAME;
  if (!bucket) throw new Error('R2_BUCKET_NAME environment variable is required');
  return bucket;
}

// Lazy-init client to avoid crashing at import time if env vars not set
let _client: S3Client | null = null;
function getClient(): S3Client {
  if (!_client) _client = getR2Client();
  return _client;
}

// ── Public R2 CDN base URL ────────────────────────────────────────────────────

function getPublicCdnBase(): string {
  return (process.env.R2_PUBLIC_URL ?? '').replace(/\/$/, '');
}

/**
 * Upload a file buffer to R2.
 * @param key - Object key (path within bucket)
 * @param buffer - File contents
 * @param contentType - MIME type
 */
export async function uploadFile(
  key: string,
  buffer: Buffer,
  contentType: string,
): Promise<void> {
  log.debug({ key, contentType, bytes: buffer.byteLength }, 'Uploading to R2');

  await getClient().send(
    new PutObjectCommand({
      Bucket: getBucketName(),
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }),
  );

  log.debug({ key }, 'Upload complete');
}

/**
 * Generate a presigned GET URL for a private R2 object.
 * @param key - Object key
 * @param expiresIn - Expiry in seconds (default 3600 = 1 hour)
 */
export async function getSignedUrl(
  key: string,
  expiresIn = 3600,
): Promise<string> {
  // If a public CDN URL is configured, return it directly (no signing needed)
  const cdnBase = getPublicCdnBase();
  if (cdnBase) {
    return `${cdnBase}/${key}`;
  }

  const command = new GetObjectCommand({
    Bucket: getBucketName(),
    Key: key,
  });

  return awsGetSignedUrl(getClient(), command, { expiresIn });
}

/**
 * Delete an object from R2.
 * @param key - Object key
 */
export async function deleteFile(key: string): Promise<void> {
  log.debug({ key }, 'Deleting from R2');

  await getClient().send(
    new DeleteObjectCommand({
      Bucket: getBucketName(),
      Key: key,
    }),
  );

  log.debug({ key }, 'Delete complete');
}

/**
 * Download an object from R2 as a Buffer.
 * @param key - Object key
 */
export async function downloadFile(key: string): Promise<Buffer> {
  log.debug({ key }, 'Downloading from R2');

  const response = await getClient().send(
    new GetObjectCommand({
      Bucket: getBucketName(),
      Key: key,
    }),
  );

  if (!response.Body) {
    throw new Error(`R2 object not found: ${key}`);
  }

  // Collect stream chunks
  const chunks: Buffer[] = [];
  for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}
