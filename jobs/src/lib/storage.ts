import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";
import {
  CopyObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { jobEnv } from "./env";

let client: S3Client | null = null;

/** S3 client for object storage (Supabase Storage's S3 API unless STORAGE_S3_ENDPOINT overrides it). */
export function storage(): S3Client {
  if (client) return client;
  client = new S3Client({
    region: jobEnv.s3Region(),
    endpoint: jobEnv.s3Endpoint(),
    forcePathStyle: true,
    credentials: { accessKeyId: jobEnv.s3AccessKeyId(), secretAccessKey: jobEnv.s3SecretAccessKey() },
  });
  return client;
}

export class NotFoundError extends Error {}

export async function downloadToFile(bucket: string, key: string, path: string): Promise<number> {
  let res;
  try {
    res = await storage().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  } catch (e) {
    const name = (e as { name?: string }).name;
    if (name === "NoSuchKey" || name === "NotFound") throw new NotFoundError(key);
    throw e;
  }
  await pipeline(res.Body as Readable, createWriteStream(path));
  return res.ContentLength ?? 0;
}

export async function downloadToBuffer(bucket: string, key: string): Promise<Buffer> {
  const res = await storage().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const bytes = await res.Body!.transformToByteArray();
  return Buffer.from(bytes);
}

/**
 * `contentEncoding` is accepted but not stored: the game-origin worker sets Content-Encoding
 * from the .br/.gz suffix, and a stored encoding would make the worker's fetch() decode the body.
 */
export type PutOptions = { contentType: string; contentEncoding?: string; cacheControl?: string };

export async function putBuffer(bucket: string, key: string, body: Buffer | Uint8Array, opts: PutOptions) {
  await storage().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: opts.contentType,
      CacheControl: opts.cacheControl,
    }),
  );
}

export async function putStream(bucket: string, key: string, body: Readable, opts: PutOptions) {
  const up = new Upload({
    client: storage(),
    params: {
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: opts.contentType,
      CacheControl: opts.cacheControl,
    },
    partSize: 8 * 1024 * 1024,
    queueSize: 2,
  });
  await up.done();
}

export async function copyObject(bucket: string, fromKey: string, toKey: string) {
  await storage().send(
    new CopyObjectCommand({
      Bucket: bucket,
      CopySource: `/${bucket}/${encodeURIComponent(fromKey).replace(/%2F/g, "/")}`,
      Key: toKey,
      MetadataDirective: "COPY",
    }),
  );
}

export async function listPrefix(bucket: string, prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const res = await storage().send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
    for (const o of res.Contents ?? []) if (o.Key) keys.push(o.Key);
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return keys;
}

export async function deleteKeys(bucket: string, keys: string[]) {
  for (let i = 0; i < keys.length; i += 1000) {
    const chunk = keys.slice(i, i + 1000);
    await storage().send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true } }));
  }
}
