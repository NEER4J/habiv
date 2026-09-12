import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { buckets, createMultipart, presignPut } from "@/lib/storage";
import { enqueueIngest } from "@/lib/jobs/trigger";
import {
  ACCEPTED_UPLOAD_EXT,
  CREATOR_QUOTA_BYTES,
  MAX_UPLOAD_BYTES,
  PART_SIZE,
  SINGLE_PUT_THRESHOLD,
  UPLOAD_SESSION_TTL_MS,
  extensionOf,
  safeFilename,
  type CreateUploadResponse,
} from "@/lib/contracts/upload";
import { slugify } from "@/lib/db/games";
import { normalizeAgent, normalizeModel } from "@/lib/ai/catalog";

export type CreateVersionInput = {
  userId: string;
  filename: string;
  sizeBytes: number;
  sha256: string;
  gameId?: string | null;
  title?: string | null;
  source: "web" | "mcp" | "remix";
  agent?: string | null;
  model?: string | null;
  prompt?: string | null;
  changelog?: string | null;
  autoPublish?: boolean;
  /** When true, skip the storage session (caller writes the object itself) and return the key only. */
  serverWritesObject?: boolean;
};

export class UploadError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

/**
 * Shared by POST /api/upload/create and the MCP publish tool: validates caps and quota,
 * creates the draft game (if needed) and the version row, dedupes by sha256, and opens a
 * storage upload session (single presigned PUT or multipart).
 */
export async function createVersionForUpload(input: CreateVersionInput): Promise<Extract<CreateUploadResponse, { ok: true }>> {
  const filename = safeFilename(input.filename);
  const ext = extensionOf(filename);
  if (!(ACCEPTED_UPLOAD_EXT as readonly string[]).includes(ext)) {
    throw new UploadError("bad_extension", "Upload a .zip or a single .html file.");
  }
  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) throw new UploadError("bad_size", "File size is required.");
  if (input.sizeBytes > MAX_UPLOAD_BYTES) throw new UploadError("too_large", `Files are capped at ${MAX_UPLOAD_BYTES / 1048576} MB for now.`, 413);
  if (!/^[0-9a-f]{64}$/.test(input.sha256)) throw new UploadError("bad_hash", "sha256 must be 64 hex characters.");

  const admin = createAdminClient();

  const { data: used } = await admin.rpc("creator_storage_bytes", { p_user_id: input.userId });
  if ((used ?? 0) + input.sizeBytes > CREATOR_QUOTA_BYTES) {
    throw new UploadError("quota_exceeded", `This upload would exceed your ${CREATOR_QUOTA_BYTES / 1048576} MB storage quota. Delete old versions first.`, 413);
  }

  let gameId = input.gameId ?? null;
  if (gameId) {
    const { data: g } = await admin.from("games").select("id, creator_id, status").eq("id", gameId).maybeSingle();
    if (!g || g.creator_id !== input.userId) throw new UploadError("game_not_found", "Game not found.", 404);
    if (g.status === "removed") throw new UploadError("removed", "This game was removed.", 403);
  } else {
    const title = (input.title ?? filename.replace(/\.[^.]+$/, "")).trim().slice(0, 80) || "Untitled game";
    const base = slugify(title);
    let created: { id: string } | null = null;
    for (let attempt = 0; attempt < 6 && !created; attempt++) {
      const slug = attempt === 0 ? base : `${base.slice(0, 60)}-${attempt + 1}`;
      const { data, error } = await admin.from("games").insert({ creator_id: input.userId, slug, short_id: "", title }).select("id").single();
      if (!error && data) created = data;
      else if (error?.code !== "23505") throw new UploadError("create_failed", error?.message ?? "Could not create the game.", 500);
    }
    if (!created) throw new UploadError("slug_conflict", "Pick a different title.", 409);
    gameId = created.id;
  }

  const { data: nextVersion } = await admin.rpc("next_version_number", { p_game_id: gameId });
  const version = nextVersion ?? 1;

  // Dedupe: same bytes already ingested for this creator -> reuse without uploading.
  const { data: dup } = await admin
    .from("game_versions")
    // Named FK: games is also linked through games.current_version_id, which makes a bare embed ambiguous.
    .select("id, game_id, games!game_versions_game_id_fkey!inner(creator_id)")
    .eq("sha256", input.sha256)
    .eq("status", "ready")
    .eq("games.creator_id", input.userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: versionRow, error: vErr } = await admin
    .from("game_versions")
    .insert({
      game_id: gameId,
      version,
      status: "uploaded",
      source: input.source,
      agent: normalizeAgent(input.agent),
      model: normalizeModel(input.model),
      prompt: input.prompt ?? null,
      changelog: input.changelog ?? null,
      sha256: input.sha256,
      size_bytes: input.sizeBytes,
      auto_publish: !!input.autoPublish,
    })
    .select("id")
    .single();
  if (vErr || !versionRow) throw new UploadError("version_failed", vErr?.message ?? "Could not create the version.", 500);
  const versionId = versionRow.id;
  const expiresAt = new Date(Date.now() + UPLOAD_SESSION_TTL_MS).toISOString();

  if (dup) {
    await admin.from("game_versions").update({ status: "processing" }).eq("id", versionId);
    const run = await enqueueIngest(versionId, { dedupeFromVersionId: dup.id });
    await admin.from("game_versions").update({ ingest_run_id: run.id }).eq("id", versionId);
    return { ok: true, mode: "dedupe", gameId, versionId, version, key: "", partSize: PART_SIZE, expiresAt };
  }

  const key = `uploads/${input.userId}/${versionId}/${filename}`;
  await admin.from("game_versions").update({ upload_key: key }).eq("id", versionId);

  if (input.serverWritesObject) {
    return { ok: true, mode: "single", gameId, versionId, version, key, partSize: PART_SIZE, expiresAt };
  }

  const contentType = ext === ".zip" ? "application/zip" : "text/html";
  const b = buckets();
  if (input.sizeBytes > SINGLE_PUT_THRESHOLD) {
    const uploadId = await createMultipart(b.uploads, key, contentType);
    await admin.from("upload_sessions").insert({
      user_id: input.userId, game_id: gameId, version_id: versionId, mode: "multipart", key, r2_upload_id: uploadId,
      filename, size_bytes: input.sizeBytes, sha256: input.sha256, expires_at: expiresAt,
    });
    return { ok: true, mode: "multipart", gameId, versionId, version, key, uploadId, partSize: PART_SIZE, expiresAt };
  }

  const putUrl = await presignPut(b.uploads, key, contentType, 3600);
  await admin.from("upload_sessions").insert({
    user_id: input.userId, game_id: gameId, version_id: versionId, mode: "single", key,
    filename, size_bytes: input.sizeBytes, sha256: input.sha256, expires_at: expiresAt,
  });
  return { ok: true, mode: "single", gameId, versionId, version, key, putUrl, partSize: PART_SIZE, expiresAt };
}
