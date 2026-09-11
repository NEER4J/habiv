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

export function r2(): S3Client {
  if (client) return client;
  client = new S3Client({
    region: "auto",
    endpoint: `https://${jobEnv.r2AccountId()}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: jobEnv.r2AccessKeyId(), secretAccessKey: jobEnv.r2SecretAccessKey() },
  });
  return client;
}

export class NotFoundError extends Error {}

export async function downloadToFile(bucket: string, key: string, path: string): Promise<number> {
  let res;
  try {
    res = await r2().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  } catch (e) {
    const name = (e as { name?: string }).name;
    if (name === "NoSuchKey" || name === "NotFound") throw new NotFoundError(key);
    throw e;
  }
  await pipeline(res.Body as Readable, createWriteStream(path));
  return res.ContentLength ?? 0;
}

export async function downloadToBuffer(bucket: string, key: string): Promise<Buffer> {
  const res = await r2().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const bytes = await res.Body!.transformToByteArray();
  return Buffer.from(bytes);
}

export type PutOptions = { contentType: string; contentEncoding?: string; cacheControl?: string };

export async function putBuffer(bucket: string, key: string, body: Buffer | Uint8Array, opts: PutOptions) {
  await r2().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: opts.contentType,
      ContentEncoding: opts.contentEncoding,
      CacheControl: opts.cacheControl,
    }),
  );
}

export async function putStream(bucket: string, key: string, body: Readable, opts: PutOptions) {
  const up = new Upload({
    client: r2(),
    params: {
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: opts.contentType,
      ContentEncoding: opts.contentEncoding,
      CacheControl: opts.cacheControl,
    },
    partSize: 8 * 1024 * 1024,
    queueSize: 2,
  });
  await up.done();
}

export async function copyObject(bucket: string, fromKey: string, toKey: string) {
  await r2().send(
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
    const res = await r2().send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
    for (const o of res.Contents ?? []) if (o.Key) keys.push(o.Key);
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return keys;
}

export async function deleteKeys(bucket: string, keys: string[]) {
  for (let i = 0; i < keys.length; i += 1000) {
    const chunk = keys.slice(i, i + 1000);
    await r2().send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true } }));
  }
}
