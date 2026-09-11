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

/** S3 client for R2. Presigning must target the account endpoint, never a custom domain. */
export function r2(): S3Client {
  if (client) return client;
  const e = env();
  client = new S3Client({
    region: "auto",
    endpoint: `https://${e.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: e.R2_ACCESS_KEY_ID, secretAccessKey: e.R2_SECRET_ACCESS_KEY },
  });
  return client;
}

export const buckets = () => {
  const e = env();
  return { uploads: e.R2_UPLOADS_BUCKET, games: e.R2_GAMES_BUCKET, public: e.R2_PUBLIC_BUCKET };
};

export async function createMultipart(bucket: string, key: string, contentType: string): Promise<string> {
  const res = await r2().send(new CreateMultipartUploadCommand({ Bucket: bucket, Key: key, ContentType: contentType }));
  if (!res.UploadId) throw new Error("R2 did not return an UploadId");
  return res.UploadId;
}

export function presignPart(bucket: string, key: string, uploadId: string, partNumber: number, expiresIn = 900): Promise<string> {
  return getSignedUrl(r2(), new UploadPartCommand({ Bucket: bucket, Key: key, UploadId: uploadId, PartNumber: partNumber }), { expiresIn });
}

export async function completeMultipart(bucket: string, key: string, uploadId: string, parts: { PartNumber: number; ETag: string }[]) {
  await r2().send(
    new CompleteMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: { Parts: [...parts].sort((a, b) => a.PartNumber - b.PartNumber) },
    }),
  );
}

export async function abortMultipart(bucket: string, key: string, uploadId: string) {
  await r2().send(new AbortMultipartUploadCommand({ Bucket: bucket, Key: key, UploadId: uploadId }));
}

export function presignPut(bucket: string, key: string, contentType: string, expiresIn = 3600): Promise<string> {
  return getSignedUrl(r2(), new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }), { expiresIn });
}

export async function headObject(bucket: string, key: string): Promise<{ size: number; etag: string | null; contentType: string | null } | null> {
  try {
    const res = await r2().send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return { size: res.ContentLength ?? 0, etag: res.ETag ?? null, contentType: res.ContentType ?? null };
  } catch (e) {
    const name = (e as { name?: string }).name;
    if (name === "NotFound" || name === "NoSuchKey") return null;
    throw e;
  }
}

export async function putObject(bucket: string, key: string, body: Uint8Array | Buffer | string, contentType: string, extra?: { cacheControl?: string; contentEncoding?: string }) {
  await r2().send(
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
  await r2().send(new CopyObjectCommand({ Bucket: bucket, CopySource: `/${bucket}/${encodeURIComponent(fromKey).replace(/%2F/g, "/")}`, Key: toKey }));
}

export async function deleteObject(bucket: string, key: string) {
  await r2().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
