import { buckets, putObject } from "@/lib/storage";
import { openRelay } from "@/lib/uploads/relay";

const fail = (error: string, status: number) => Response.json({ ok: false, error }, { status, headers: { "cache-control": "no-store" } });

/**
 * Receives a file for an upload URL from the MCP tools create_upload or create_art_upload (see
 * lib/uploads/relay.ts): the raw bytes as the request body (curl --data-binary @file), or a
 * multipart form with a `file` field (curl -F file=@file).
 */
async function receive(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const relay = openRelay((await params).token);
  if (!relay) return fail("This upload URL is invalid or has expired. Ask for a new one.", 403);
  if (Number(request.headers.get("content-length") ?? 0) > relay.maxBytes + 64 * 1024) return fail(`The file is over the ${relay.maxBytes} byte limit for this URL.`, 413);

  let bytes: Uint8Array;
  if ((request.headers.get("content-type") ?? "").startsWith("multipart/form-data")) {
    const file = (await request.formData().catch(() => null))?.get("file");
    if (!(file instanceof Blob)) return fail("Send the file as the request body, or as a form field named file.", 400);
    bytes = new Uint8Array(await file.arrayBuffer());
  } else {
    bytes = new Uint8Array(await request.arrayBuffer());
  }
  if (!bytes.length) return fail("The request body is empty. Send the file with curl --data-binary @path.", 400);
  if (bytes.length > relay.maxBytes) return fail(`The file is over the ${relay.maxBytes} byte limit for this URL.`, 413);

  await putObject(buckets().uploads, relay.key, bytes, relay.contentType);
  return Response.json({ ok: true, size: bytes.length }, { headers: { "cache-control": "no-store" } });
}

export const PUT = receive;
export const POST = receive;
