import "server-only";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/lib/env";

let client: S3Client | null = null;

/** Supabase Storage's S3 endpoint for the project (the direct storage host handles large uploads better). */
function supabaseS3Endpoint(supabaseUrl: string): string {
  const ref = new URL(supabaseUrl).hostname.split(".")[0];
  return `https://${ref}.storage.supabase.co/storage/v1/s3`;
}

/**
 * S3 client for object storage. Talks to Supabase Storage's S3 API by default; set
 * STORAGE_S3_ENDPOINT (and region "auto") to move to R2 or any other S3 service.
 */
export function storage(): S3Client {
  if (client) return client;
  const e = env();
  client = new S3Client({
    region: e.STORAGE_S3_REGION,
    endpoint: e.STORAGE_S3_ENDPOINT ?? supabaseS3Endpoint(e.NEXT_PUBLIC_SUPABASE_URL),
    forcePathStyle: true,
    credentials: { accessKeyId: e.STORAGE_S3_ACCESS_KEY_ID, secretAccessKey: e.STORAGE_S3_SECRET_ACCESS_KEY },
  });
  return client;
}

export const buckets = () => {
  const e = env();
  return { uploads: e.STORAGE_UPLOADS_BUCKET, games: e.STORAGE_GAMES_BUCKET, public: e.STORAGE_PUBLIC_BUCKET };
};

export async function createMultipart(bucket: string, key: string, contentType: string): Promise<string> {
  const res = await storage().send(new CreateMultipartUploadCommand({ Bucket: bucket, Key: key, ContentType: contentType }));
  if (!res.UploadId) throw new Error("Storage did not return an UploadId");
  return res.UploadId;
}

export function presignPart(bucket: string, key: string, uploadId: string, partNumber: number, expiresIn = 900): Promise<string> {
  return getSignedUrl(storage(), new UploadPartCommand({ Bucket: bucket, Key: key, UploadId: uploadId, PartNumber: partNumber }), { expiresIn });
}

export async function completeMultipart(bucket: string, key: string, uploadId: string, parts: { PartNumber: number; ETag: string }[]) {
  await storage().send(
    new CompleteMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: { Parts: [...parts].sort((a, b) => a.PartNumber - b.PartNumber) },
    }),
  );
}

export async function abortMultipart(bucket: string, key: string, uploadId: string) {
  await storage().send(new AbortMultipartUploadCommand({ Bucket: bucket, Key: key, UploadId: uploadId }));
}

export function presignPut(bucket: string, key: string, contentType: string, expiresIn = 3600): Promise<string> {
  return getSignedUrl(storage(), new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }), { expiresIn });
}

export async function headObject(bucket: string, key: string): Promise<{ size: number; etag: string | null; contentType: string | null } | null> {
  try {
    const res = await storage().send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return { size: res.ContentLength ?? 0, etag: res.ETag ?? null, contentType: res.ContentType ?? null };
  } catch (e) {
    const name = (e as { name?: string }).name;
    if (name === "NotFound" || name === "NoSuchKey") return null;
    throw e;
  }
}

export async function putObject(bucket: string, key: string, body: Uint8Array | Buffer | string, contentType: string, extra?: { cacheControl?: string; contentEncoding?: string }) {
  await storage().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: extra?.cacheControl,
      ContentEncoding: extra?.contentEncoding,
    }),
  );
}

export async function copyObject(bucket: string, fromKey: string, toKey: string) {
  await storage().send(new CopyObjectCommand({ Bucket: bucket, CopySource: `/${bucket}/${encodeURIComponent(fromKey).replace(/%2F/g, "/")}`, Key: toKey }));
}

export async function deleteObject(bucket: string, key: string) {
  await storage().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
