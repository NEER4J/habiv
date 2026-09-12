"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type DragEvent } from "react";
import { createSHA256 } from "hash-wasm";
import { ACCEPTED_UPLOAD_EXT, extensionOf, MAX_UPLOAD_BYTES, type CreateUploadResponse, type VersionStatusResponse } from "@/lib/contracts/upload";
import { publishVersion, setVersionMeta, updateGameMeta, updateLeaderboardConfig } from "@/lib/actions/games";
import {
  emptyExtraDetails,
  extraDetailsFrom,
  licences,
  orientations,
  toDetailsPatch,
  type ExtraDetails,
  type Licence,
  type Orientation,
} from "@/lib/habiv/game-details";
import { durationLabel, formatBytes, type CategoryInfo } from "@/lib/habiv/games";
import { AGENT_OPTIONS, MODEL_OPTIONS, normalizeAgent, normalizeModel } from "@/lib/ai/catalog";
import { sdkFeatureLabel } from "@/lib/habiv/sdk";
import { buildDetailsSourceLabel } from "@/lib/habiv/build-details";
import type { GameMeta } from "@/lib/contracts/ingest";
import { filesFromDrop, filesFromInput, isSingleBuild, packFiles, type PickedFile } from "@/lib/upload/pack-files";
import type { GameEditData } from "@/lib/habiv/page-data";
import {
  bpanel,
  chipBtn,
  chipStyle,
  fieldLabelStyle,
  fieldStyle,
  mono,
  primaryBtn,
  stepStyle,
} from "@/lib/habiv/ui";
import { siteUrl } from "@/lib/site";
import { BentoAutoGrid, EmptyCell, PageHead } from "./game-card";
import { CatalogField } from "./catalog-picker";
import { CategoryChips } from "./category-chips";
import { LeaderboardSettings, SdkFeatureTags, SdkUpgradePrompt } from "./sdk-features";
import { GameArtFields, type GameArt } from "./game-art-fields";
import { GameExtraFields } from "./game-extra-fields";
import { useShell } from "./shell-context";

const stepNames = ["Source", "Checks", "Details", "Art", "Review"];

type Visibility = "public" | "draft";

const visibilities: { k: Visibility; t: string; d: string }[] = [
  { k: "public", t: "Public", d: "Listed in the feed, search and category rows." },
  { k: "draft", t: "Draft", d: "Visible to you only, saved under My games." },
];

const visLabel: Record<Visibility, string> = {
  public: "Public",
  draft: "Draft · private",
};

const rejectText: Record<string, string> = {
  no_entry: "No index.html found",
  too_many_files: "Over 1,000 files",
  too_large: "Over 300 MB extracted",
  banned_file: "Contains executables",
  http_reference: "Uses insecure http:// resources",
  zip_bomb: "Suspicious compression",
  corrupt_zip: "Could not read the zip",
  source_expired: "Upload expired, try again",
  internal_error: "Processing failed, try again",
  aborted: "Upload was cancelled",
};

/** `arrived` is set on a resumed single-PUT upload whose bytes already reached storage. */
type UploadSession = Extract<CreateUploadResponse, { ok: true }> & { arrived?: boolean };
type VersionStatus = Extract<VersionStatusResponse, { ok: true }>;
type UploadPhase = "idle" | "hashing" | "creating" | "uploading" | "paused" | "completing" | "done" | "error";

const HASH_CHUNK = 4 * 1024 * 1024;
const PART_CONCURRENCY = 4;

/* ---------- resumable drafts ---------- */

// The wizard is mirrored to localStorage so a closed tab or dropped connection can continue later.
// A browser cannot reopen a file by itself, so an unfinished upload asks for the same file again
// and sends only the multipart parts storage has no ETag for.
const DRAFT_VERSION = 1;
const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type FileStamp = { name: string; size: number; lastModified: number };
type DraftForm = {
  title: string;
  desc: string;
  category: string;
  /** Every picked category, main first; missing in drafts saved before multi-category. */
  categories?: string[];
  orient: Orientation;
  licence: Licence;
  extra: ExtraDetails;
  model: string;
  agent: string;
  prompt: string;
  changelog: string;
  lbEnabled: boolean;
  lbSort: "desc" | "asc";
  visibility: Visibility;
  art: GameArt;
};
type SavedDraft = {
  v: typeof DRAFT_VERSION;
  savedAt: number;
  file: FileStamp;
  sha256: string | null;
  session: UploadSession | null;
  parts: [number, string][];
  /** Storage has the whole file and /api/upload/complete succeeded. */
  uploaded: boolean;
  step: number;
  form: DraftForm;
};

const draftKey = (gameId: string | undefined) => `habiv:publish-draft:${gameId ?? "new"}`;

function readDraft(key: string): SavedDraft | null {
  try {
    const d = JSON.parse(localStorage.getItem(key) ?? "null") as SavedDraft | null;
    if (!d || d.v !== DRAFT_VERSION || !d.file || Date.now() - d.savedAt > DRAFT_MAX_AGE_MS) return null;
    // An unfinished upload can only continue while its storage session is open.
    if (!d.uploaded && (!d.session || Date.parse(d.session.expiresAt) <= Date.now())) return null;
    return d;
  } catch {
    return null;
  }
}

function writeDraft(key: string, d: SavedDraft) {
  try {
    localStorage.setItem(key, JSON.stringify(d));
  } catch {
    // Storage full or blocked: resuming is a convenience, the upload itself still works.
  }
}

function clearDraft(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

const sameFile = (f: File, s: FileStamp) => f.name === s.name && f.size === s.size && f.lastModified === s.lastModified;

function savedProgress(d: SavedDraft): number {
  if (d.uploaded) return 1;
  const s = d.session;
  if (!s || s.mode !== "multipart" || !d.file.size) return 0;
  let sent = 0;
  for (const [n] of d.parts) sent += Math.min(s.partSize, d.file.size - (n - 1) * s.partSize);
  return Math.min(1, sent / d.file.size);
}

const resumeStep = (d: SavedDraft) => Math.min(Math.max(d.step, 1), 4);

const slugify = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "untitled-game";

const siteHost = siteUrl.replace(/^https?:\/\//, "");

function contentTypeFor(name: string) {
  return extensionOf(name) === ".zip" ? "application/zip" : "text/html";
}

async function sha256Of(file: File): Promise<string> {
  const hasher = await createSHA256();
  hasher.init();
  for (let off = 0; off < file.size; off += HASH_CHUNK) {
    const buf = await file.slice(off, Math.min(file.size, off + HASH_CHUNK)).arrayBuffer();
    hasher.update(new Uint8Array(buf));
  }
  return String(hasher.digest("hex"));
}

async function postJson<T = Record<string, unknown>>(url: string, body: unknown): Promise<T & { ok: boolean; error?: string; code?: string }> {
  const res = await fetch(url, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  let json: (T & { ok: boolean; error?: string; code?: string }) | null = null;
  try {
    json = (await res.json()) as T & { ok: boolean; error?: string; code?: string };
  } catch {
    json = null;
  }
  if (!json) throw new Error(res.ok ? "Unexpected response from the server." : `Request failed (${res.status}).`);
  if (!res.ok || !json.ok) throw new Error(json.error ?? `Request failed (${res.status}).`);
  return json;
}

/** PUT with progress events. Resolves with the response ETag (needed for multipart parts). */
function xhrPut(
  url: string,
  body: Blob,
  contentType: string | null,
  onProgress: (loaded: number) => void,
  register: (xhr: XMLHttpRequest | null) => void,
): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    register(xhr);
    xhr.open("PUT", url, true);
    if (contentType) xhr.setRequestHeader("content-type", contentType);
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => {
      register(null);
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(body.size);
        resolve(xhr.getResponseHeader("ETag"));
      } else reject(new Error(`Storage rejected the upload (${xhr.status}).`));
    };
    xhr.onerror = () => {
      register(null);
      reject(new Error("Network error while uploading. Check your connection and retry."));
    };
    xhr.onabort = () => {
      register(null);
      reject(new Error("Upload cancelled."));
    };
    xhr.send(body);
  });
}

function useCols() {
  const { cols } = useShell();
  return {
    main: { ...bpanel, gridColumn: cols <= 6 ? "1 / -1" : `span ${cols === 8 ? 5 : 7}`, padding: "22px" } as CSSProperties,
    side: {
      ...bpanel,
      gridColumn: cols <= 6 ? "1 / -1" : `span ${cols === 8 ? 3 : 5}`,
      padding: "22px",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "14px",
    } as CSSProperties,
  };
}

type RowState = "ok" | "warn" | "info" | "pending" | "bad";
type CheckRow = { label: string; value: string; state: RowState };

const dotColor: Record<RowState, string> = {
  ok: "var(--pos)",
  warn: "oklch(0.72 0.14 80)",
  info: "oklch(0.7 0.12 240)",
  pending: "var(--ink-6)",
  bad: "var(--danger-ink)",
};

const valueColor: Record<RowState, string> = {
  ok: "var(--ink-5)",
  warn: "oklch(0.62 0.13 70)",
  info: "oklch(0.6 0.12 240)",
  pending: "var(--ink-5)",
  bad: "var(--danger-ink)",
};

function checkRows(status: VersionStatus | null): CheckRow[] {
  const settled = status?.status === "ready" || status?.status === "rejected";
  const rows: CheckRow[] = [{ label: "Bundle received", value: "ok", state: "ok" }];
  rows.push(
    status?.engine
      ? { label: `Engine detected: ${status.engine}`, value: "ok", state: "ok" }
      : { label: "Detecting engine", value: "running", state: "pending" },
  );
  rows.push(
    status?.sizeBytes != null
      ? { label: `Size ${formatBytes(status.sizeBytes)}`, value: "ok", state: "ok" }
      : { label: "Measuring size", value: "running", state: "pending" },
  );
  rows.push(
    status?.fileCount != null
      ? { label: `Files ${status.fileCount.toLocaleString()}`, value: "ok", state: "ok" }
      : { label: "Counting files", value: "running", state: "pending" },
  );
  if (!settled) rows.push({ label: "External requests", value: "running", state: "pending" });
  else if (status.usesNetwork) rows.push({ label: "External requests", value: "talks to the network", state: "warn" });
  else rows.push({ label: "External requests", value: "none", state: "ok" });
  if (status?.needsIsolation) rows.push({ label: "Cross-origin isolation", value: "required", state: "info" });
  if (status?.status === "ready") {
    const found = status.sdk?.features ?? [];
    if (!status.sdk) rows.push({ label: "Habiv SDK", value: "not checked", state: "info" });
    else if (found.length) rows.push({ label: `Habiv SDK: ${found.map(sdkFeatureLabel).join(", ").toLowerCase()}`, value: "detected", state: "ok" });
    else rows.push({ label: "Habiv SDK", value: "not used", state: "info" });
  }
  for (const w of status?.warnings ?? []) rows.push({ label: w, value: "check manually", state: "warn" });
  if (status?.status === "rejected") {
    const reason = status.rejectReason ?? "internal_error";
    rows.push({ label: rejectText[reason] ?? reason.replace(/_/g, " "), value: "rejected", state: "bad" });
  }
  return rows;
}

export function PublishView({
  categories,
  existingGame,
  handle,
}: {
  categories: CategoryInfo[];
  /** Set when publishing a new version: its current details prefill the form so nothing is lost. */
  existingGame: GameEditData | null;
  handle: string;
}) {
  const { showToast, openModal, setModalGameId } = useShell();
  const cell = useCols();

  const [step, setStep] = useState(0);

  // Source
  const [fileName, setFileName] = useState("");
  const [fileSize, setFileSize] = useState(0);
  const [phase, setPhase] = useState<UploadPhase>("idle");
  const [progress, setProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [session, setSession] = useState<UploadSession | null>(null);
  const [art, setArt] = useState<GameArt>(() => ({ coverUrl: existingGame?.game.coverUrl ?? null, cardUrl: existingGame?.game.cardUrl ?? null }));

  // Checks
  const [status, setStatus] = useState<VersionStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  // Details
  const eg = existingGame?.game;
  const ev = existingGame?.version;
  const [title, setTitle] = useState(eg?.title ?? "");
  const [desc, setDesc] = useState(eg?.tagline ?? "");
  const [cats, setCats] = useState<string[]>(eg?.categories ?? [categories[0]?.slug ?? "arcade"]);
  const [orient, setOrient] = useState<Orientation>(eg?.orientation ?? "portrait");
  const [licence, setLicence] = useState<Licence>(eg?.remixLicence ?? "open");
  const [extra, setExtra] = useState<ExtraDetails>(() => (eg ? extraDetailsFrom(eg) : emptyExtraDetails));
  const [model, setModel] = useState(ev?.model ?? "");
  const [agent, setAgent] = useState(ev?.agent ?? "");
  const [prompt, setPrompt] = useState(ev?.prompt ?? "");
  const [changelog, setChangelog] = useState("");
  const [lbEnabled, setLbEnabled] = useState(false);
  const [lbSort, setLbSort] = useState<"desc" | "asc">("desc");
  // Scores found in the build switch the leaderboard on, unless the creator already chose.
  const lbTouched = useRef(false);
  const sdkScores = status?.status === "ready" && !!status.sdk?.features.includes("scores");
  useEffect(() => {
    if (sdkScores && !lbTouched.current) setLbEnabled(true);
  }, [sdkScores]);

  // Review / publish
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string; shortUrl: string } | null>(null);

  const fileRef = useRef<File | null>(null);
  const shaRef = useRef<string | null>(null);
  const sessionRef = useRef<UploadSession | null>(null);
  const partsRef = useRef<Map<number, string>>(new Map());
  const xhrsRef = useRef<Set<XMLHttpRequest>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);
  /** Game of a finished upload, so a replacement file becomes its next version instead of a second draft game. */
  const keepGameRef = useRef<string | null>(null);
  const [sdkPromptOpen, setSdkPromptOpen] = useState(false);
  const runIdRef = useRef(0);
  const folderRef = useRef<HTMLInputElement | null>(null);
  /** Set while a folder or several files are zipped in the browser, before the upload starts. */
  const [packing, setPacking] = useState<string | null>(null);
  // Build details (habiv.json …) fill the form once per version; chips the creator picked stay theirs.
  const catsTouched = useRef(false);
  const orientTouched = useRef(false);
  const metaDoneFor = useRef<string | null>(null);
  const [metaFilled, setMetaFilled] = useState<string[]>([]);

  // Resume
  const draftStorageKey = draftKey(existingGame?.game.id);
  /** A saved draft found on load, offered until the creator continues or discards it. */
  const [pending, setPending] = useState<SavedDraft | null>(null);
  /** Set after continuing an unfinished upload: waiting for the same file to be picked again. */
  const [resumeFor, setResumeFor] = useState<FileStamp | null>(null);
  const stampRef = useRef<FileStamp | null>(null);
  const uploadedRef = useRef(false);
  const snapshotRef = useRef<() => SavedDraft | null>(() => null);

  const abortInFlight = useCallback(() => {
    runIdRef.current += 1;
    for (const x of xhrsRef.current) x.abort();
    xhrsRef.current.clear();
  }, []);

  useEffect(() => () => abortInFlight(), [abortInFlight]);

  useEffect(() => {
    // localStorage is only readable after hydration.
    setPending(readDraft(draftStorageKey));
  }, [draftStorageKey]);

  useEffect(() => {
    snapshotRef.current = () =>
      stampRef.current
        ? {
            v: DRAFT_VERSION,
            savedAt: Date.now(),
            file: stampRef.current,
            sha256: shaRef.current,
            session: sessionRef.current,
            parts: [...partsRef.current],
            uploaded: uploadedRef.current,
            step,
            form: { title, desc, category: cats[0], categories: cats, orient, licence, extra, model, agent, prompt, changelog, lbEnabled, lbSort, visibility, art },
          }
        : null;
  });

  const persist = useCallback(() => {
    const d = snapshotRef.current();
    if (d) writeDraft(draftStorageKey, d);
  }, [draftStorageKey]);

  // Saved on every step and field change; parts are saved as each one lands (see transfer).
  // A draft offered on load is left alone until the creator decides what to do with it.
  useEffect(() => {
    if (!pending && step < 5) persist();
  }, [pending, persist, step, session, phase, title, desc, cats, orient, licence, extra, model, agent, prompt, changelog, lbEnabled, lbSort, visibility, art]);

  const goto = (n: number) => {
    setStep(n);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  /* ---------- upload pipeline ---------- */

  const register = (xhr: XMLHttpRequest | null, prev?: XMLHttpRequest) => {
    if (prev) xhrsRef.current.delete(prev);
    if (xhr) xhrsRef.current.add(xhr);
  };

  const transfer = useCallback(async (file: File, s: UploadSession, runId: number) => {
    const alive = () => runIdRef.current === runId;
    const total = file.size;
    if (s.mode === "single") {
      // A resumed upload whose bytes already reached storage only needs closing.
      if (!s.arrived) {
        if (!s.putUrl) throw new Error("The server did not return an upload URL.");
        let current: XMLHttpRequest | undefined;
        await xhrPut(
          s.putUrl,
          file,
          contentTypeFor(file.name),
          (loaded) => alive() && setProgress(Math.min(1, loaded / total)),
          (x) => {
            register(x, current);
            current = x ?? undefined;
          },
        );
        if (!alive()) return;
      }
      setPhase("completing");
      await postJson("/api/upload/complete", { key: s.key });
      return;
    }

    if (s.mode === "multipart") {
      if (!s.uploadId) throw new Error("The server did not open a multipart upload.");
      const partSize = s.partSize;
      const count = Math.ceil(total / partSize);
      const loadedByPart = new Map<number, number>();
      const bump = () => {
        if (!alive()) return;
        let sum = 0;
        for (let i = 1; i <= count; i++) {
          sum += partsRef.current.has(i) ? Math.min(partSize, total - (i - 1) * partSize) : (loadedByPart.get(i) ?? 0);
        }
        setProgress(Math.min(1, sum / total));
      };
      const queue = Array.from({ length: count }, (_, i) => i + 1).filter((n) => !partsRef.current.has(n));
      // A resumed upload starts the bar at what already landed.
      bump();
      let firstError: Error | null = null;
      const worker = async () => {
        while (queue.length && alive() && !firstError) {
          const partNumber = queue.shift()!;
          try {
            const signed = await postJson<{ url: string }>("/api/upload/sign-part", { uploadId: s.uploadId, key: s.key, partNumber });
            const start = (partNumber - 1) * partSize;
            const chunk = file.slice(start, Math.min(total, start + partSize));
            let current: XMLHttpRequest | undefined;
            const etag = await xhrPut(
              signed.url,
              chunk,
              null,
              (loaded) => {
                loadedByPart.set(partNumber, loaded);
                bump();
              },
              (x) => {
                register(x, current);
                current = x ?? undefined;
              },
            );
            if (!etag) throw new Error("Storage did not return an ETag for a part. Check the bucket CORS ExposeHeaders.");
            partsRef.current.set(partNumber, etag);
            persist();
            bump();
          } catch (e) {
            firstError = e instanceof Error ? e : new Error(String(e));
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(PART_CONCURRENCY, queue.length) }, worker));
      if (!alive()) return;
      if (firstError) throw firstError;
      setPhase("completing");
      const parts = Array.from(partsRef.current.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([PartNumber, ETag]) => ({ PartNumber, ETag }));
      await postJson("/api/upload/complete", { key: s.key, uploadId: s.uploadId, parts });
      return;
    }
    // dedupe: the server already has these bytes and has queued ingest.
  }, [persist]);

  const startUpload = useCallback(
    async (file: File) => {
      abortInFlight();
      const runId = runIdRef.current;
      const alive = () => runIdRef.current === runId;
      setUploadError(null);
      setStatus(null);
      setStatusError(null);
      try {
        if (!shaRef.current) {
          setPhase("hashing");
          setProgress(0);
          const sha = await sha256Of(file);
          if (!alive()) return;
          shaRef.current = sha;
        }
        let s = sessionRef.current;
        if (!s) {
          setPhase("creating");
          const created = await postJson<UploadSession>("/api/upload/create", {
            filename: file.name,
            size: file.size,
            sha256: shaRef.current,
            title: existingGame?.game.title ?? file.name.replace(/\.[^.]+$/, "").slice(0, 80),
            gameId: existingGame?.game.id ?? keepGameRef.current ?? undefined,
          });
          if (!alive()) return;
          s = created;
          sessionRef.current = s;
          partsRef.current = new Map();
          setSession(s);
          if (!existingGame && !title) setTitle(file.name.replace(/\.[^.]+$/, "").slice(0, 80));
        }
        setPhase("uploading");
        setProgress(s.mode === "dedupe" ? 1 : 0);
        await transfer(file, s, runId);
        if (!alive()) return;
        uploadedRef.current = true;
        setProgress(1);
        setPhase("done");
        showToast(s.mode === "dedupe" ? "Already on file · skipped upload" : "Upload complete");
        goto(1);
      } catch (e) {
        if (!alive()) return;
        setPhase("error");
        setUploadError(e instanceof Error ? e.message : "Upload failed.");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [abortInFlight, existingGame, showToast, transfer],
  );

  const abortSession = useCallback((s: UploadSession | null) => {
    if (!s || s.mode === "dedupe" || !s.key) return;
    void fetch("/api/upload/abort", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: s.key, uploadId: s.uploadId }),
    }).catch(() => undefined);
  }, []);

  /** Puts a saved draft back into the wizard. A finished upload jumps to the step the creator was on. */
  const restoreDraft = (d: SavedDraft) => {
    const f = d.form;
    setTitle(f.title);
    setDesc(f.desc);
    // Drafts saved before multi-category only have `category`.
    setCats(f.categories?.length ? f.categories : [f.category]);
    setOrient(f.orient);
    setLicence(f.licence);
    setExtra(f.extra);
    setModel(f.model);
    setAgent(f.agent);
    setPrompt(f.prompt);
    setChangelog(f.changelog);
    setLbEnabled(f.lbEnabled);
    setLbSort(f.lbSort);
    setVisibility(f.visibility);
    setArt(f.art);
    // A saved draft already holds whatever the build's details filled in, plus the creator's edits.
    catsTouched.current = true;
    orientTouched.current = true;
    metaDoneFor.current = d.session?.versionId ?? null;
    stampRef.current = d.file;
    shaRef.current = d.sha256;
    sessionRef.current = d.session;
    partsRef.current = new Map(d.parts);
    uploadedRef.current = d.uploaded;
    setSession(d.session);
    setFileName(d.file.name);
    setFileSize(d.file.size);
    setUploadError(null);
    setProgress(savedProgress(d));
    setPending(null);
    if (d.uploaded) {
      setPhase("done");
      goto(resumeStep(d));
    } else {
      setPhase("paused");
      setResumeFor(d.file);
    }
  };

  const discardDraft = (d: SavedDraft) => {
    // A finished upload is already a draft game under My games, so only an unfinished one is cancelled.
    if (!d.uploaded && d.session) abortSession(d.session);
    clearDraft(draftStorageKey);
    setPending(null);
  };

  /** Continues the current session with the file picked again: storage only gets what it is missing. */
  const resumeUpload = async (file: File) => {
    fileRef.current = file;
    setResumeFor(null);
    setUploadError(null);
    const s = sessionRef.current;
    if (s && s.mode !== "dedupe") {
      try {
        const r = await postJson<{ state: "open" | "completed" | "closed" | "expired"; arrived?: boolean; putUrl?: string | null }>("/api/upload/resume", { key: s.key });
        if (r.state === "completed") {
          uploadedRef.current = true;
          setProgress(1);
          setPhase("done");
          goto(1);
          return;
        }
        if (r.state === "open") {
          if (s.mode === "single") sessionRef.current = { ...s, arrived: !!r.arrived, putUrl: r.putUrl ?? undefined };
        } else {
          if (r.state === "expired") abortSession(s);
          sessionRef.current = null;
          partsRef.current = new Map();
          setSession(null);
          showToast("The earlier upload expired · starting it again");
        }
      } catch (e) {
        setPhase("error");
        setUploadError(e instanceof Error ? e.message : "Could not resume the upload.");
        return;
      }
    }
    void startUpload(file);
  };

  const pickFile = (file: File | null | undefined) => {
    if (!file) return;
    const ext = extensionOf(file.name);
    // Validation failures leave any already-uploaded file untouched; only the error line changes.
    if (!(ACCEPTED_UPLOAD_EXT as readonly string[]).includes(ext)) {
      setUploadError(`Only ${ACCEPTED_UPLOAD_EXT.join(", ")} files are accepted.`);
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError(`That file is ${formatBytes(file.size)}. The limit is ${formatBytes(MAX_UPLOAD_BYTES)}.`);
      return;
    }
    if (file.size === 0) {
      setUploadError("That file is empty.");
      return;
    }
    // The file an unfinished upload was sending picks up where it stopped instead of starting over.
    const waiting = resumeFor ?? (pending && !pending.uploaded ? pending.file : null);
    if (waiting && sameFile(file, waiting)) {
      if (pending) restoreDraft(pending);
      void resumeUpload(file);
      return;
    }
    if (pending) discardDraft(pending);
    setResumeFor(null);
    // After a finished upload (e.g. the AI added SDK calls), the new file is the same game's next version
    // and everything typed so far stays.
    if (sessionRef.current && phase === "done") keepGameRef.current = sessionRef.current.gameId;
    // A replacement file abandons any half-finished session.
    if (sessionRef.current && phase !== "done") abortSession(sessionRef.current);
    stampRef.current = { name: file.name, size: file.size, lastModified: file.lastModified };
    uploadedRef.current = false;
    fileRef.current = file;
    shaRef.current = null;
    sessionRef.current = null;
    partsRef.current = new Map();
    setSession(null);
    setFileName(file.name);
    setFileSize(file.size);
    void startUpload(file);
  };

  /** A folder or several files are zipped here first, then uploaded like any zip. One .zip or .html goes straight through. */
  const pickMany = async (load: PickedFile[] | Promise<PickedFile[]>) => {
    let picked: PickedFile[];
    try {
      picked = await load;
    } catch {
      setUploadError("Could not read those files. Try choosing them again.");
      return;
    }
    if (!picked.length) return;
    if (isSingleBuild(picked, ACCEPTED_UPLOAD_EXT)) {
      pickFile(picked[0].file);
      return;
    }
    setUploadError(null);
    setPacking(`Zipping ${picked.length.toLocaleString()} files…`);
    // Let the label paint before zipping holds the page for a moment.
    await new Promise((r) => setTimeout(r, 30));
    try {
      const { file, count } = await packFiles(picked);
      if (file.size > MAX_UPLOAD_BYTES) throw new Error(`Zipped, those ${count.toLocaleString()} files come to ${formatBytes(file.size)}. The limit is ${formatBytes(MAX_UPLOAD_BYTES)}.`);
      pickFile(file);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Could not zip those files.");
    } finally {
      setPacking(null);
    }
  };

  const onPickInput = (input: HTMLInputElement) => {
    if (input.files?.length) void pickMany(filesFromInput(input.files));
    input.value = "";
  };

  const retryUpload = () => {
    const f = fileRef.current;
    if (!f) {
      inputRef.current?.click();
      return;
    }
    // An open session is re-checked first: single-PUT URLs expire after an hour.
    if (sessionRef.current && !uploadedRef.current) void resumeUpload(f);
    else void startUpload(f);
  };

  /** "Upload the new build" in the SDK prompt: back to Source with the file picker open. */
  const reupload = () => {
    goto(0);
    setSdkPromptOpen(false);
    // The input only exists on step 0, so wait for it to render; the click still counts as the user's.
    setTimeout(() => inputRef.current?.click(), 60);
  };

  const resetAll = () => {
    abortInFlight();
    clearDraft(draftStorageKey);
    keepGameRef.current = null;
    stampRef.current = null;
    uploadedRef.current = false;
    setResumeFor(null);
    fileRef.current = null;
    shaRef.current = null;
    sessionRef.current = null;
    partsRef.current = new Map();
    if (inputRef.current) inputRef.current.value = "";
    setFileName("");
    setFileSize(0);
    setPhase("idle");
    setProgress(0);
    setUploadError(null);
    setSession(null);
    setStatus(null);
    setStatusError(null);
    setTitle(existingGame?.game.title ?? "");
    setDesc("");
    setCats([categories[0]?.slug ?? "arcade"]);
    setOrient("portrait");
    setLicence("open");
    setModel("");
    setAgent("");
    setPrompt("");
    setChangelog("");
    setLbEnabled(false);
    setLbSort("desc");
    setVisibility("public");
    setPublishing(false);
    setPublishError(null);
    setResult(null);
    catsTouched.current = false;
    orientTouched.current = false;
    metaDoneFor.current = null;
    setMetaFilled([]);
    goto(0);
  };

  /** Drops an unfinished upload (cancelling its storage session) and empties the wizard. */
  const startOver = () => {
    if (sessionRef.current && !uploadedRef.current) abortSession(sessionRef.current);
    resetAll();
  };

  /* ---------- status polling ---------- */

  const versionId = session?.versionId ?? null;
  const settled = status?.status === "ready" || status?.status === "rejected";

  useEffect(() => {
    // Steps 2-4 poll too: a resumed draft can land on any of them and Publish needs the ready status.
    if (step < 1 || step > 4 || !versionId || settled) return;
    let stopped = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/upload/status?versionId=${encodeURIComponent(versionId)}`, { credentials: "same-origin", cache: "no-store" });
        const json = (await res.json()) as VersionStatusResponse;
        if (stopped) return;
        if (!json.ok) {
          setStatusError(json.error);
          return;
        }
        setStatusError(null);
        setStatus(json);
      } catch {
        if (!stopped) setStatusError("Could not reach the server. Still trying…");
      }
    };
    void tick();
    const id = setInterval(tick, 2000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [step, versionId, settled]);

  /* ---------- details from the build ---------- */

  const buildMeta = status?.status === "ready" ? (status.meta ?? null) : null;

  /** Copies the build's details into the form: only empty fields, or every one it has when `overwrite`. Returns what changed, for the note. */
  const applyBuildMeta = (m: GameMeta, overwrite: boolean): string[] => {
    const filled: string[] = [];
    const take = (label: string, has: unknown, empty: boolean, set: () => void) => {
      if (!has || !(overwrite || empty)) return;
      set();
      filled.push(label);
    };
    const fileTitle = fileName.replace(/\.[^.]+$/, "").slice(0, 80);
    take("title", m.title, !title.trim() || (!existingGame && title === fileTitle), () => setTitle(m.title!));
    take("one line", m.tagline, !desc.trim(), () => setDesc(m.tagline!));
    const known = (m.categories ?? []).filter((s) => categories.some((c) => c.slug === s)).slice(0, 3);
    take("categories", known.length, !existingGame && !catsTouched.current, () => setCats(known));
    take("orientation", m.orientation, !existingGame && !orientTouched.current, () => setOrient(m.orientation!));
    const ex: Partial<ExtraDetails> = {};
    take("about", m.description, !extra.description.trim(), () => {
      ex.description = m.description;
    });
    take("how to play", m.controls?.keys.length, !extra.keys.some((k) => k.key.trim() && k.action.trim()), () => {
      ex.keys = m.controls!.keys.map((k) => ({ ...k }));
    });
    take("touch hint", m.controls?.touch, !extra.touch.trim(), () => {
      ex.touch = m.controls!.touch!;
    });
    take("tags", m.tags?.length, !extra.tags.trim(), () => {
      ex.tags = m.tags!.join(", ");
    });
    take("run length", m.durationSec, extra.durationSec == null, () => {
      ex.durationSec = m.durationSec!;
    });
    if (Object.keys(ex).length) setExtra((e) => ({ ...e, ...ex }));
    take("model", m.model, !model.trim(), () => setModel(normalizeModel(m.model) ?? m.model!));
    take("tool", m.agent, !agent.trim(), () => setAgent(normalizeAgent(m.agent) ?? m.agent!));
    take("prompt", m.prompt, !prompt.trim(), () => setPrompt(m.prompt!));
    if (existingGame) take("changelog", m.changelog, !changelog.trim(), () => setChangelog(m.changelog!));
    return filled;
  };

  useEffect(() => {
    if (!buildMeta || !versionId || metaDoneFor.current === versionId) return;
    metaDoneFor.current = versionId;
    setMetaFilled(applyBuildMeta(buildMeta, false));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per version, against the form as it is then
  }, [buildMeta, versionId]);

  /** The build says something the form doesn't (a new version's habiv.json, or a field the creator changed). */
  const buildDiffers = (() => {
    const m = buildMeta;
    if (!m) return false;
    const texts: [string | null | undefined, string][] = [
      [m.title, title],
      [m.tagline, desc],
      [m.description, extra.description],
      [m.controls?.touch, extra.touch],
      [m.tags?.join(", "), extra.tags],
      [m.prompt, prompt],
    ];
    if (texts.some(([a, b]) => !!a && a !== b.trim())) return true;
    const keys = extra.keys.map((k) => ({ key: k.key.trim(), action: k.action.trim() })).filter((k) => k.key && k.action);
    if (m.controls?.keys.length && JSON.stringify(m.controls.keys) !== JSON.stringify(keys)) return true;
    return !!m.durationSec && m.durationSec !== extra.durationSec;
  })();

  /* ---------- publish ---------- */

  const publish = async (vis: Visibility) => {
    if (!session) return;
    setPublishing(true);
    setPublishError(null);
    setVisibility(vis);
    try {
      const meta = await updateGameMeta(session.gameId, {
        title: title.trim(),
        tagline: desc.trim() || null,
        category: cats[0] as Parameters<typeof updateGameMeta>[1]["category"],
        categories: cats,
        orientation: orient,
        remixLicence: licence,
        ...toDetailsPatch(extra),
      });
      if (!meta.ok) throw new Error(meta.error);
      const vmeta = await setVersionMeta(session.versionId, {
        model: model.trim() || null,
        agent: agent.trim() || null,
        prompt: prompt.trim() || null,
        changelog: existingGame ? changelog.trim() || null : undefined,
      });
      if (!vmeta.ok) throw new Error(vmeta.error);
      if (lbEnabled) {
        const lb = await updateLeaderboardConfig(session.gameId, { enabled: true, sort: lbSort, minDurationMs: 1000 });
        if (!lb.ok) throw new Error(lb.error);
      }
      if (vis === "public") {
        const pub = await publishVersion({ gameId: session.gameId, versionId: session.versionId });
        if (!pub.ok) throw new Error(pub.error);
        setResult({ url: pub.url, shortUrl: pub.shortUrl });
        showToast("Published to habiv");
      } else {
        setResult(null);
        showToast("Saved as draft");
      }
      clearDraft(draftStorageKey);
      setStep(5);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setPublishError(e instanceof Error ? e.message : "Could not publish.");
    } finally {
      setPublishing(false);
    }
  };

  /* ---------- derived ---------- */

  const slug = slugify(title);
  const descOut = desc || "Add a one line description.";
  const categoryLabel = cats.map((s) => categories.find((c) => c.slug === s)?.name ?? s).join(", ");
  const orientLabel = orientations.find((o) => o.value === orient)?.label ?? orient;
  const licenceLabel = licences.find((l) => l.value === licence)?.label ?? licence;
  const rows = checkRows(status);
  const ready = status?.status === "ready";
  const rejected = status?.status === "rejected";
  const warningCount = (status?.warnings.length ?? 0) + (status?.usesNetwork ? 1 : 0);
  const titleOk = title.trim().length > 0;

  const details = toDetailsPatch(extra);
  const reviewRows = [
    { k: "Title", v: title || "—" },
    { k: "One line", v: desc || "—" },
    { k: "About", v: details.description ? `${details.description.length.toLocaleString()} characters` : "—" },
    { k: "How to play", v: details.controls.keys.map((c) => `${c.key} · ${c.action}`).join(", ") || "category defaults" },
    { k: "Tags", v: details.tags.join(", ") || "—" },
    { k: "Run length", v: details.durationSec ? durationLabel(details.durationSec) : "—" },
    { k: cats.length > 1 ? "Categories" : "Category", v: categoryLabel },
    { k: "Orientation", v: orientLabel },
    { k: "Licence", v: licenceLabel },
    { k: "Art", v: [art.coverUrl ? "your cover" : "automatic cover", art.cardUrl ? "your card" : "automatic card"].join(" · ") },
    { k: "Bundle", v: `${formatBytes(status?.sizeBytes ?? fileSize)} · v${session?.version ?? 1}` },
    { k: "Built with", v: [model, agent].filter(Boolean).join(" · ") || "—" },
    { k: "Leaderboard", v: lbEnabled ? `On · ${lbSort === "desc" ? "highest wins" : "lowest wins"}` : "Off" },
    { k: "Game features", v: status?.sdk ? status.sdk.features.map(sdkFeatureLabel).join(", ") || "no SDK calls" : "—" },
    { k: "Visibility", v: visLabel[visibility] },
    { k: "Checks", v: ready ? `${warningCount} warning${warningCount === 1 ? "" : "s"}` : rejected ? "rejected" : "incomplete" },
  ];

  const phaseLabel: Record<UploadPhase, string> = {
    idle: "",
    hashing: "Fingerprinting…",
    creating: "Opening upload…",
    uploading: session?.mode === "dedupe" ? "Already on file" : `Uploading ${Math.round(progress * 100)}% · ${formatBytes(Math.round(progress * fileSize))} sent`,
    paused: `Paused at ${Math.round(progress * 100)}%`,
    completing: "Finishing…",
    done: "Uploaded",
    error: "Failed",
  };
  const busy = !!packing || phase === "hashing" || phase === "creating" || phase === "uploading" || phase === "completing";

  // Leaving mid-upload loses nothing (the wizard resumes), but ask so nobody closes the tab by accident.
  useEffect(() => {
    if (!busy) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [busy]);

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    if (busy) return;
    // Read synchronously: the browser empties dataTransfer once this handler returns.
    void pickMany(filesFromDrop(e.dataTransfer));
  };

  const publicUrl = result ? `${siteUrl}${result.url}` : null;
  const doneTitle = visibility === "draft" ? "Draft saved" : "Live on habiv";
  const doneNote = visibility === "draft" ? "Only you can see this. Publish it any time from My games." : "Now in the feed, search and your profile.";

  const previewBox = (
    <div style={{ position: "relative", width: "100%", aspectRatio: "16 / 9", borderRadius: "14px", overflow: "hidden", background: "var(--chip)" }}>
      {status?.previewUrl ? (
        <iframe
          src={status.previewUrl}
          title={`${title || "Game"} preview`}
          sandbox="allow-scripts allow-same-origin"
          allow="autoplay"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0, background: "#000" }}
        />
      ) : (
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontFamily: mono, fontSize: "11px", color: "var(--ink-5)", padding: "16px", textAlign: "center" }}>
          {ready ? "Preview is not available on this environment." : "Preview appears once checks finish."}
        </div>
      )}
    </div>
  );

  return (
    <BentoAutoGrid>
      <PageHead
        title={existingGame ? `New version · ${existingGame.game.title}` : "Publish a game"}
        sub="Five steps. Nothing goes public until the last one."
        auto
      >
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {stepNames.map((l, i) => (
            <button
              key={l}
              onClick={() => {
                if (i <= step && step < 5) goto(i);
              }}
              style={{ ...stepStyle(step === i, i <= step, i < step), padding: "8px 13px" }}
            >
              <span style={{ fontFamily: mono, fontSize: "10.5px" }}>0{i + 1}</span>
              <span>{l}</span>
            </button>
          ))}
        </div>
      </PageHead>

      {step === 0 ? (
        <>
          <div style={cell.main}>
            <div style={{ fontSize: "17px", fontWeight: 600 }}>Where is your build?</div>
            <div style={{ marginTop: "6px", fontSize: "13.5px", color: "var(--ink-4)" }}>
              One HTML file, a ZIP, or the game&apos;s whole folder, with an index.html at the root. Assets must be local.{" "}
              <Link href="/docs" style={{ color: "var(--ink)", textDecoration: "underline", textUnderlineOffset: "3px" }}>
                Read the build guide
              </Link>
            </div>
            {pending ? (
              <div
                style={{
                  marginTop: "18px",
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  flexWrap: "wrap",
                  padding: "14px 16px",
                  borderRadius: "12px",
                  background: "var(--chip)",
                }}
              >
                <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                  <div style={{ fontSize: "14px", fontWeight: 600 }}>Continue where you left off?</div>
                  <div style={{ marginTop: "4px", fontSize: "12.5px", color: "var(--ink-4)", wordBreak: "break-all" }}>
                    {pending.form.title || pending.file.name} ·{" "}
                    {pending.uploaded
                      ? `uploaded, you were on ${stepNames[resumeStep(pending)]}`
                      : `${Math.round(savedProgress(pending) * 100)}% uploaded · pick the same file to finish`}
                  </div>
                </div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <button onClick={() => restoreDraft(pending)} style={primaryBtn}>
                    Continue
                  </button>
                  <button onClick={() => discardDraft(pending)} style={chipBtn}>
                    Discard
                  </button>
                </div>
              </div>
            ) : null}
            <input ref={inputRef} type="file" multiple hidden onChange={(e) => onPickInput(e.target)} />
            <input
              ref={(el) => {
                folderRef.current = el;
                // Not in React's input props; every current browser supports it.
                el?.setAttribute("webkitdirectory", "");
              }}
              type="file"
              hidden
              onChange={(e) => onPickInput(e.target)}
            />
            <div
              onDragOver={(e) => {
                e.preventDefault();
                if (!busy) setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              style={{
                marginTop: "18px",
                padding: "34px 24px",
                borderRadius: "14px",
                background: dragging ? "var(--chip-2)" : "var(--chip)",
                outline: dragging ? "2px dashed var(--ink-4)" : "2px dashed transparent",
                outlineOffset: "-8px",
                textAlign: "center",
                transition: "background 120ms ease",
              }}
            >
              {packing ? (
                <>
                  <div style={{ fontSize: "15px", fontWeight: 600 }}>{packing}</div>
                  <div style={{ marginTop: "6px", fontSize: "13px", color: "var(--ink-5)" }}>Packing them into one zip before the upload</div>
                </>
              ) : phase === "idle" ? (
                <>
                  <div style={{ fontSize: "15px", fontWeight: 600 }}>Drop your game here</div>
                  <div style={{ marginTop: "6px", fontSize: "13px", color: "var(--ink-5)" }}>An HTML file, a zip, or the whole folder</div>
                  <div style={{ display: "flex", gap: "8px", marginTop: "16px", flexWrap: "wrap", justifyContent: "center" }}>
                    <button onClick={() => inputRef.current?.click()} style={primaryBtn}>
                      Choose files
                    </button>
                    <button onClick={() => folderRef.current?.click()} style={chipBtn}>
                      Choose a folder
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: "15px", fontWeight: 600, wordBreak: "break-all" }}>{fileName}</div>
                  <div style={{ marginTop: "6px", fontFamily: mono, fontSize: "11px", color: "var(--ink-5)" }}>
                    {formatBytes(fileSize)}
                    {session ? ` · v${session.version}` : ""}
                    {phase !== "error" ? ` · ${phaseLabel[phase]}` : ""}
                  </div>
                  <div style={{ margin: "16px auto 0", maxWidth: "360px", height: "6px", borderRadius: "3px", background: "var(--panel-2)", overflow: "hidden" }}>
                    <div
                      style={{
                        height: "100%",
                        width: `${Math.round((phase === "hashing" || phase === "creating" ? 0 : progress) * 100)}%`,
                        background: phase === "error" ? "var(--danger-ink)" : "var(--ink)",
                        transition: "width 160ms ease",
                        animation: phase === "hashing" || phase === "creating" || phase === "completing" ? "hbBlink 1s ease-in-out infinite" : "none",
                        minWidth: phase === "hashing" || phase === "creating" || phase === "completing" ? "18%" : undefined,
                      }}
                    />
                  </div>
                  {phase === "paused" ? (
                    <>
                      <div style={{ margin: "14px auto 0", maxWidth: "46ch", fontSize: "13px", lineHeight: 1.5, color: "var(--ink-4)" }}>
                        Select {fileName} again to finish.{" "}
                        {progress > 0 ? "Only the part that has not arrived yet gets uploaded." : "It uploads from the start."}
                      </div>
                      <div style={{ display: "flex", gap: "8px", marginTop: "14px", flexWrap: "wrap", justifyContent: "center" }}>
                        <button onClick={() => inputRef.current?.click()} style={primaryBtn}>
                          Select file
                        </button>
                        <button onClick={startOver} style={chipBtn}>
                          Start over
                        </button>
                      </div>
                    </>
                  ) : null}
                  {phase === "done" ? (
                    <div style={{ display: "flex", gap: "8px", marginTop: "16px", flexWrap: "wrap", justifyContent: "center" }}>
                      <button onClick={() => goto(1)} style={primaryBtn}>
                        Continue to checks
                      </button>
                      <button onClick={() => inputRef.current?.click()} style={chipBtn}>
                        Choose a different file
                      </button>
                    </div>
                  ) : null}
                </>
              )}
              {uploadError ? (
                <div style={{ marginTop: "14px", fontSize: "13px", color: "var(--danger-ink)" }}>
                  {uploadError}
                  <div style={{ display: "flex", gap: "8px", marginTop: "10px", flexWrap: "wrap", justifyContent: "center" }}>
                    {phase === "error" && fileRef.current ? (
                      <button onClick={retryUpload} style={primaryBtn}>
                        Retry
                      </button>
                    ) : null}
                    <button onClick={() => inputRef.current?.click()} style={chipBtn}>
                      Choose another file
                    </button>
                  </div>
                </div>
              ) : null}
              <div style={{ marginTop: "14px", fontFamily: mono, fontSize: "10.5px", color: "var(--ink-6)" }}>
                MAX 50 MB ZIPPED · SANDBOXED IFRAME · NETWORK OFF BY DEFAULT
              </div>
            </div>
          </div>
          <div style={cell.side}>
            <div style={{ fontSize: "15px", fontWeight: 600, alignSelf: "flex-start" }}>Or publish from your agent</div>
            <div style={{ fontSize: "13px", lineHeight: 1.55, color: "var(--ink-4)", alignSelf: "flex-start" }}>
              Connect Claude or Codex once, then just ask it to publish. Each publish becomes a new version.
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignSelf: "flex-start" }}>
              <Link href="/settings?tab=api" style={chipBtn}>
                Connect your AI
              </Link>
              <Link href="/docs/mcp" style={{ ...chipBtn, background: "transparent", color: "var(--ink-3)" }}>
                How it works
              </Link>
            </div>
            <div
              style={{
                alignSelf: "stretch",
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                gap: "9px",
                padding: "18px",
                borderRadius: "12px",
                background: "var(--panel-2)",
                color: "var(--ink-5)",
                cursor: "not-allowed",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--ink-5)" }}>Create with a prompt</span>
                <span
                  style={{
                    padding: "3px 8px",
                    borderRadius: "6px",
                    background: "var(--chip)",
                    fontFamily: mono,
                    fontSize: "9.5px",
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: "var(--ink-5)",
                  }}
                >
                  Soon
                </span>
              </div>
              <div style={{ fontSize: "12.5px", lineHeight: 1.5 }}>Describe the game, pick a model, edit the build before it goes live.</div>
            </div>
          </div>
        </>
      ) : null}

      {step === 1 ? (
        <div style={cell.main}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: "17px", fontWeight: 600 }}>{ready ? "Checks passed" : rejected ? "Build rejected" : "Running checks"}</div>
              <div style={{ marginTop: "6px", fontSize: "13.5px", color: "var(--ink-4)", wordBreak: "break-all" }}>{fileName || "your build"}</div>
            </div>
            <span style={{ fontFamily: mono, fontSize: "10.5px", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-5)" }}>
              Automatic review
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "18px" }}>
            {rows.map((r, i) => {
              const pending = r.state === "pending";
              return (
                <div
                  key={`${r.label}-${i}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    padding: "12px 14px",
                    borderRadius: "10px",
                    background: r.state === "bad" ? "var(--danger-bg)" : "var(--chip)",
                    opacity: pending ? 0.55 : 1,
                    transition: "opacity 200ms ease",
                  }}
                >
                  <span
                    style={{
                      width: "8px",
                      height: "8px",
                      flex: "0 0 auto",
                      borderRadius: "50%",
                      background: dotColor[r.state],
                      animation: pending ? "hbBlink 1s ease-in-out infinite" : "none",
                    }}
                  />
                  <span style={{ flex: 1, fontSize: "13.5px", color: r.state === "bad" ? "var(--danger-ink)" : undefined }}>{r.label}</span>
                  <span
                    style={{
                      fontFamily: mono,
                      fontSize: "10.5px",
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: valueColor[r.state],
                    }}
                  >
                    {r.value}
                  </span>
                </div>
              );
            })}
          </div>
          {statusError ? <div style={{ marginTop: "12px", fontSize: "12.5px", color: "var(--danger-ink)" }}>{statusError}</div> : null}
          {ready ? (
            <SdkUpgradePrompt
                sdk={status?.sdk ?? null}
                hasDetails={!!status?.meta?.sources.some((s) => s !== "html")}
                title={title}
                sort={lbSort}
                open={sdkPromptOpen}
                onOpenChange={setSdkPromptOpen}
                onReupload={reupload}
              />
          ) : null}
          <div style={{ display: "flex", gap: "8px", marginTop: "22px", flexWrap: "wrap" }}>
            {rejected ? (
              <button onClick={() => goto(0)} style={primaryBtn}>
                Upload another file
              </button>
            ) : (
              <button onClick={() => goto(2)} disabled={!ready} style={{ ...primaryBtn, opacity: ready ? 1 : 0.45, cursor: ready ? "pointer" : "default" }}>
                {ready ? "Continue to details" : "Checking…"}
              </button>
            )}
            <button onClick={() => goto(0)} style={chipBtn}>
              Back
            </button>
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <>
          <div style={cell.main}>
            <div style={{ fontSize: "17px", fontWeight: 600 }}>Game details</div>
            {buildMeta ? (
              <div
                style={{
                  marginTop: "12px",
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  flexWrap: "wrap",
                  padding: "12px 14px",
                  borderRadius: "10px",
                  background: "var(--chip)",
                  fontSize: "13px",
                  lineHeight: 1.5,
                  color: "var(--ink-3)",
                }}
              >
                <span style={{ flex: "1 1 240px" }}>
                  {metaFilled.length
                    ? `Filled in from ${buildDetailsSourceLabel(buildMeta)}: ${metaFilled.join(", ")}. Check them before you publish.`
                    : `Your build has details in ${buildDetailsSourceLabel(buildMeta)}. Fields you had already filled were kept.`}
                </span>
                {buildDiffers ? (
                  <button type="button" onClick={() => setMetaFilled(applyBuildMeta(buildMeta, true))} style={chipBtn}>
                    Use the build&apos;s details
                  </button>
                ) : null}
              </div>
            ) : ready ? (
              <div style={{ marginTop: "8px", fontSize: "12.5px", lineHeight: 1.5, color: "var(--ink-5)" }}>
                Tip: put a habiv.json in your build and this form fills itself in.{" "}
                <Link href="/docs/details" style={{ color: "var(--ink)", textDecoration: "underline", textUnderlineOffset: "3px" }}>
                  How it works
                </Link>
              </div>
            ) : null}
            <div style={fieldLabelStyle}>Title</div>
            <input className="hb-input" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Name your game" style={fieldStyle} />
            <div style={fieldLabelStyle}>One line description · shown on cards</div>
            <input
              className="hb-input"
              value={desc}
              maxLength={140}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="What does the player do?"
              style={fieldStyle}
            />
            <div style={fieldLabelStyle}>Categories</div>
            <CategoryChips
              categories={categories}
              value={cats}
              onChange={(c) => {
                catsTouched.current = true;
                setCats(c);
              }}
            />
            <div style={fieldLabelStyle}>Orientation</div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {orientations.map((o) => (
                <button
                  key={o.value}
                  onClick={() => {
                    orientTouched.current = true;
                    setOrient(o.value);
                  }}
                  style={chipStyle(orient === o.value)}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <div style={fieldLabelStyle}>Remix licence</div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {licences.map((l) => (
                <button key={l.value} onClick={() => setLicence(l.value)} style={chipStyle(licence === l.value)}>
                  {l.label}
                </button>
              ))}
            </div>
            <GameExtraFields value={extra} onChange={(patch) => setExtra((e) => ({ ...e, ...patch }))} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0 12px" }}>
              <div>
                <div style={fieldLabelStyle}>Model</div>
                <CatalogField options={MODEL_OPTIONS} value={model} onChange={setModel} normalize={normalizeModel} placeholder="Search models, e.g. Sonnet" ariaLabel="Model" />
              </div>
              <div>
                <div style={fieldLabelStyle}>Tool or agent</div>
                <CatalogField options={AGENT_OPTIONS} value={agent} onChange={setAgent} normalize={normalizeAgent} placeholder="Search tools, e.g. Claude Code" ariaLabel="Tool or agent" />
              </div>
            </div>
            <div style={fieldLabelStyle}>Prompt · shown on the game page</div>
            <textarea
              className="hb-input"
              value={prompt}
              maxLength={8000}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="The prompt or brief that produced this build."
              style={{ ...fieldStyle, height: 120, padding: "10px 14px", resize: "vertical", lineHeight: 1.5 }}
            />
            {existingGame ? (
              <>
                <div style={fieldLabelStyle}>What changed in this version</div>
                <input className="hb-input" value={changelog} maxLength={500} onChange={(e) => setChangelog(e.target.value)} placeholder="Fixed the jump, new level 3" style={fieldStyle} />
              </>
            ) : null}
            <div style={fieldLabelStyle}>Game features · found in the build</div>
            <SdkFeatureTags sdk={status?.sdk ?? null} checking={!ready && !rejected} />
            {ready ? (
              <SdkUpgradePrompt
                sdk={status?.sdk ?? null}
                hasDetails={!!status?.meta?.sources.some((s) => s !== "html")}
                title={title}
                sort={lbSort}
                open={sdkPromptOpen}
                onOpenChange={setSdkPromptOpen}
                onReupload={reupload}
              />
            ) : null}
            <LeaderboardSettings
              onAddScores={() => setSdkPromptOpen(true)}
              sdk={status?.sdk ?? null}
              checking={!ready && !rejected}
              enabled={lbEnabled}
              sort={lbSort}
              onEnabled={(on) => {
                lbTouched.current = true;
                setLbEnabled(on);
              }}
              onSort={setLbSort}
            />
            <div style={{ display: "flex", gap: "8px", marginTop: "22px", flexWrap: "wrap" }}>
              <button onClick={() => goto(3)} disabled={!titleOk} style={{ ...primaryBtn, opacity: titleOk ? 1 : 0.45, cursor: titleOk ? "pointer" : "default" }}>
                Continue to art
              </button>
              <button onClick={() => goto(1)} style={chipBtn}>
                Back
              </button>
            </div>
          </div>
          <div style={cell.side}>
            <div style={{ fontFamily: mono, fontSize: "10px", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ink-5)", alignSelf: "flex-start" }}>
              Link preview
            </div>
            <div style={{ alignSelf: "stretch", padding: "14px", borderRadius: "12px", background: "var(--chip)" }}>
              <div style={{ fontSize: "15px", fontWeight: 600 }}>{title || "Untitled game"}</div>
              <div style={{ marginTop: "6px", fontSize: "13px", color: "var(--ink-4)" }}>{descOut}</div>
              <div style={{ marginTop: "10px", fontFamily: mono, fontSize: "11px", color: "var(--ink-5)", wordBreak: "break-all" }}>
                {siteHost}/@{handle}/{slug}
              </div>
            </div>
            <div style={{ alignSelf: "stretch", fontFamily: mono, fontSize: "10.5px", color: "var(--ink-6)" }}>
              The final address may get a short suffix if you already use this title.
            </div>
          </div>
        </>
      ) : null}

      {step === 3 ? (
        <>
          <div style={cell.main}>
            <div style={{ fontSize: "17px", fontWeight: 600 }}>Store art</div>
            <div style={{ marginTop: "6px", fontSize: "13.5px", color: "var(--ink-4)" }}>
              Upload your own cover and card, pick a ready-made design made from your title, or leave a slot empty and we take a screenshot of
              your game after publishing. Art saves as soon as you pick it. You can change it any time in My games.
            </div>
            <div style={{ marginTop: "16px" }}>
              {session?.gameId ? (
                <GameArtFields
                  gameId={session.gameId}
                  value={art}
                  onChange={(patch) => setArt((a) => ({ ...a, ...patch }))}
                  meta={{
                    title,
                    tagline: desc,
                    category: categories.find((c) => c.slug === cats[0])?.name ?? cats[0] ?? null,
                    engine: status?.engine ?? null,
                    creator: handle,
                    // A new game's hue is set server-side; a stable hash of its id stands in until then.
                    hue: eg?.accentHue ?? [...session.gameId].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 0),
                  }}
                />
              ) : (
                <div style={{ fontFamily: mono, fontSize: "10.5px", color: "var(--ink-5)" }}>Upload a build first to add art.</div>
              )}
            </div>
            <div style={fieldLabelStyle}>Live preview · 16:9 · no runs or scores are recorded</div>
            {previewBox}
            <div style={{ display: "flex", gap: "8px", marginTop: "22px", flexWrap: "wrap" }}>
              <button onClick={() => goto(4)} style={primaryBtn}>
                Continue to review
              </button>
              <button onClick={() => goto(2)} style={chipBtn}>
                Back
              </button>
            </div>
          </div>
          <div style={cell.side}>
            <div style={{ alignSelf: "stretch" }}>
              <div style={{ fontFamily: mono, fontSize: "10px", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ink-5)", marginBottom: "10px" }}>
                Feed preview
              </div>
              <div style={{ padding: "8px", borderRadius: "14px", background: "var(--chip)" }}>
                {art.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- art URLs come from the storage CDN
                  <img src={art.coverUrl} alt="" style={{ display: "block", width: "100%", aspectRatio: "16 / 9", objectFit: "cover", borderRadius: "14px" }} />
                ) : (
                  <div style={{ height: "190px", borderRadius: "14px", background: "var(--panel-2)", display: "grid", placeItems: "center", fontFamily: mono, fontSize: "10.5px", color: "var(--ink-5)", textAlign: "center", padding: "12px" }}>
                    Cover generated after publish
                  </div>
                )}
                <div style={{ padding: "10px 4px 4px" }}>
                  <div style={{ fontSize: "14px", fontWeight: 600 }}>{title || "Untitled game"}</div>
                  <div style={{ marginTop: "5px", fontFamily: mono, fontSize: "10px", textTransform: "uppercase", color: "var(--ink-5)" }}>
                    @{handle} · {orientLabel}
                  </div>
                  <div style={{ marginTop: "5px", fontFamily: mono, fontSize: "10.5px", color: "var(--ink-4)" }}>0 runs / no scores yet</div>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : null}

      {step === 4 ? (
        <>
          <div style={cell.main}>
            <div style={{ fontSize: "17px", fontWeight: 600 }}>Review and publish</div>
            <div style={{ marginTop: "14px" }}>
              {reviewRows.map((r) => (
                <div key={r.k} style={{ display: "flex", alignItems: "baseline", gap: "14px", padding: "10px 0", borderBottom: "1px solid var(--divider)" }}>
                  <span
                    style={{
                      width: "120px",
                      flex: "0 0 auto",
                      fontFamily: mono,
                      fontSize: "10.5px",
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      color: "var(--ink-5)",
                    }}
                  >
                    {r.k}
                  </span>
                  <span style={{ flex: 1, fontSize: "13.5px" }}>{r.v}</span>
                </div>
              ))}
            </div>
            <div style={fieldLabelStyle}>Visibility</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px" }}>
              {visibilities.map((v) => (
                <button
                  key={v.k}
                  onClick={() => setVisibility(v.k)}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    gap: "6px",
                    padding: "14px",
                    borderRadius: "12px",
                    cursor: "pointer",
                    textAlign: "left",
                    background: visibility === v.k ? "var(--chip-2)" : "var(--chip)",
                    outline: visibility === v.k ? "2px solid var(--ink)" : "2px solid transparent",
                    outlineOffset: "-1px",
                  }}
                >
                  <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--ink)" }}>{v.t}</span>
                  <span style={{ fontSize: "12.5px", lineHeight: 1.5, color: "var(--ink-5)" }}>{v.d}</span>
                </button>
              ))}
            </div>
            {publishError ? <div style={{ marginTop: "14px", fontSize: "13px", color: "var(--danger-ink)" }}>{publishError}</div> : null}
            <div style={{ display: "flex", gap: "8px", marginTop: "22px", flexWrap: "wrap" }}>
              <button
                onClick={() => void publish(visibility)}
                disabled={publishing || !ready || !titleOk}
                style={{ ...primaryBtn, opacity: publishing || !ready || !titleOk ? 0.55 : 1, cursor: publishing ? "wait" : "pointer" }}
              >
                {publishing ? (visibility === "draft" ? "Saving…" : "Publishing…") : visibility === "draft" ? "Save draft" : "Publish now"}
              </button>
              <button onClick={() => void publish("draft")} disabled={publishing || !titleOk} style={{ ...chipBtn, opacity: publishing ? 0.55 : 1 }}>
                Save as draft
              </button>
              <button onClick={() => goto(3)} disabled={publishing} style={chipBtn}>
                Back
              </button>
            </div>
            <div style={{ marginTop: "14px", fontFamily: mono, fontSize: "10.5px", color: "var(--ink-6)" }}>
              Visibility can change any time. Published games can be hidden or rolled back to any earlier version.
            </div>
          </div>
          <div style={cell.side}>
            <div style={{ alignSelf: "stretch" }}>{previewBox}</div>
          </div>
        </>
      ) : null}

      {step === 5 ? (
        <EmptyCell auto>
          <div style={{ fontFamily: mono, fontSize: "10.5px", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ink-5)" }}>
            {visLabel[visibility]}
          </div>
          <div style={{ marginTop: "10px", fontSize: "19px", fontWeight: 600 }}>
            {title} · {doneTitle}
          </div>
          <div style={{ marginTop: "8px", fontSize: "14px", color: "var(--ink-4)", maxWidth: "46ch" }}>{doneNote}</div>
          {publicUrl && result ? (
            <Link href={result.url} style={{ marginTop: "12px", fontFamily: mono, fontSize: "12.5px", color: "var(--ink-3)", wordBreak: "break-all" }}>
              {publicUrl}
            </Link>
          ) : (
            <div style={{ marginTop: "14px", fontFamily: mono, fontSize: "12px", color: "var(--ink-6)" }}>Saved as draft · no public link yet</div>
          )}
          <div style={{ display: "flex", gap: "8px", marginTop: "20px", flexWrap: "wrap", justifyContent: "center" }}>
            {result && session ? (
              <>
                <button
                  onClick={() => {
                    setModalGameId(session.gameId);
                    openModal("share");
                  }}
                  style={primaryBtn}
                >
                  Share link
                </button>
                <Link href={result.url} style={chipBtn}>
                  Open game
                </Link>
              </>
            ) : null}
            <Link href="/my-games" style={chipBtn}>
              Go to My games
            </Link>
            <button onClick={resetAll} style={chipBtn}>
              Publish another
            </button>
          </div>
        </EmptyCell>
      ) : null}
    </BentoAutoGrid>
  );
}
