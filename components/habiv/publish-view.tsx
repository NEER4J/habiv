"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type DragEvent } from "react";
import { createSHA256 } from "hash-wasm";
import { ACCEPTED_UPLOAD_EXT, extensionOf, MAX_UPLOAD_BYTES, type CreateUploadResponse, type VersionStatusResponse } from "@/lib/contracts/upload";
import { publishVersion, setVersionMeta, updateGameMeta, updateLeaderboardConfig } from "@/lib/actions/games";
import { formatBytes, type CategoryInfo } from "@/lib/habiv/games";
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

type Orientation = "portrait" | "landscape" | "any";
type Licence = "open" | "no_remix";

const orientations: { label: string; value: Orientation }[] = [
  { label: "Vertical", value: "portrait" },
  { label: "Landscape", value: "landscape" },
  { label: "Any", value: "any" },
];

const licences: { label: string; value: Licence }[] = [
  { label: "Open to remix", value: "open" },
  { label: "No remixes", value: "no_remix" },
];

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

type UploadSession = Extract<CreateUploadResponse, { ok: true }>;
type VersionStatus = Extract<VersionStatusResponse, { ok: true }>;
type UploadPhase = "idle" | "hashing" | "creating" | "uploading" | "completing" | "done" | "error";

const HASH_CHUNK = 4 * 1024 * 1024;
const PART_CONCURRENCY = 4;

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
  existingGame: { id: string; title: string } | null;
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

  // Checks
  const [status, setStatus] = useState<VersionStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  // Details
  const [title, setTitle] = useState(existingGame?.title ?? "");
  const [desc, setDesc] = useState("");
  const [category, setCategory] = useState(categories[0]?.slug ?? "arcade");
  const [orient, setOrient] = useState<Orientation>("portrait");
  const [licence, setLicence] = useState<Licence>("open");
  const [model, setModel] = useState("");
  const [agent, setAgent] = useState("");
  const [prompt, setPrompt] = useState("");
  const [changelog, setChangelog] = useState("");
  const [lbEnabled, setLbEnabled] = useState(false);
  const [lbSort, setLbSort] = useState<"desc" | "asc">("desc");

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
  const runIdRef = useRef(0);

  const abortInFlight = useCallback(() => {
    runIdRef.current += 1;
    for (const x of xhrsRef.current) x.abort();
    xhrsRef.current.clear();
  }, []);

  useEffect(() => () => abortInFlight(), [abortInFlight]);

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
  }, []);

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
            title: existingGame?.title ?? file.name.replace(/\.[^.]+$/, "").slice(0, 80),
            gameId: existingGame?.id,
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
    // A replacement file abandons any half-finished session.
    if (sessionRef.current && phase !== "done") abortSession(sessionRef.current);
    fileRef.current = file;
    shaRef.current = null;
    sessionRef.current = null;
    partsRef.current = new Map();
    setSession(null);
    setFileName(file.name);
    setFileSize(file.size);
    void startUpload(file);
  };

  const retryUpload = () => {
    const f = fileRef.current;
    if (!f) {
      inputRef.current?.click();
      return;
    }
    void startUpload(f);
  };

  const resetAll = () => {
    abortInFlight();
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
    setTitle(existingGame?.title ?? "");
    setDesc("");
    setCategory(categories[0]?.slug ?? "arcade");
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
    goto(0);
  };

  /* ---------- status polling ---------- */

  const versionId = session?.versionId ?? null;
  const settled = status?.status === "ready" || status?.status === "rejected";

  useEffect(() => {
    if (step !== 1 || !versionId || settled) return;
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
        category: category as Parameters<typeof updateGameMeta>[1]["category"],
        orientation: orient,
        remixLicence: licence,
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
  const categoryLabel = categories.find((c) => c.slug === category)?.name ?? category;
  const orientLabel = orientations.find((o) => o.value === orient)?.label ?? orient;
  const licenceLabel = licences.find((l) => l.value === licence)?.label ?? licence;
  const rows = checkRows(status);
  const ready = status?.status === "ready";
  const rejected = status?.status === "rejected";
  const warningCount = (status?.warnings.length ?? 0) + (status?.usesNetwork ? 1 : 0);
  const titleOk = title.trim().length > 0;

  const reviewRows = [
    { k: "Title", v: title || "—" },
    { k: "Description", v: desc || "—" },
    { k: "Category", v: categoryLabel },
    { k: "Orientation", v: orientLabel },
    { k: "Licence", v: licenceLabel },
    { k: "Bundle", v: `${formatBytes(status?.sizeBytes ?? fileSize)} · v${session?.version ?? 1}` },
    { k: "Built with", v: [model, agent].filter(Boolean).join(" · ") || "—" },
    { k: "Leaderboard", v: lbEnabled ? `On · ${lbSort === "desc" ? "highest wins" : "lowest wins"}` : "Off" },
    { k: "Visibility", v: visLabel[visibility] },
    { k: "Checks", v: ready ? `${warningCount} warning${warningCount === 1 ? "" : "s"}` : rejected ? "rejected" : "incomplete" },
  ];

  const phaseLabel: Record<UploadPhase, string> = {
    idle: "",
    hashing: "Fingerprinting…",
    creating: "Opening upload…",
    uploading: session?.mode === "dedupe" ? "Already on file" : `Uploading ${Math.round(progress * 100)}%`,
    completing: "Finishing…",
    done: "Uploaded",
    error: "Failed",
  };
  const busy = phase === "hashing" || phase === "creating" || phase === "uploading" || phase === "completing";

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    if (busy) return;
    pickFile(e.dataTransfer.files?.[0]);
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
        title={existingGame ? `New version · ${existingGame.title}` : "Publish a game"}
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
              One HTML file, or a ZIP with an index.html at the root. Assets must be local.
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".zip,.html,.htm"
              hidden
              onChange={(e) => {
                pickFile(e.target.files?.[0]);
                e.target.value = "";
              }}
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
              {phase === "idle" ? (
                <>
                  <div style={{ fontSize: "15px", fontWeight: 600 }}>Drop your file here</div>
                  <div style={{ marginTop: "6px", fontSize: "13px", color: "var(--ink-5)" }}>or</div>
                  <button onClick={() => inputRef.current?.click()} style={{ ...primaryBtn, marginTop: "16px" }}>
                    Choose a file
                  </button>
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
                MAX 100 MB · SANDBOXED IFRAME · NETWORK OFF BY DEFAULT
              </div>
            </div>
          </div>
          <div style={cell.side}>
            <div style={{ fontSize: "15px", fontWeight: 600, alignSelf: "flex-start" }}>Or publish from your agent</div>
            <div style={{ fontSize: "13px", lineHeight: 1.55, color: "var(--ink-4)", alignSelf: "flex-start" }}>
              Codex and Claude Code push straight to your profile over MCP. Each push becomes a new version.
            </div>
            <Link href="/settings?tab=api" style={{ ...chipBtn, alignSelf: "flex-start" }}>
              Set up MCP
            </Link>
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
            <div style={fieldLabelStyle}>Title</div>
            <input className="hb-input" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Name your game" style={fieldStyle} />
            <div style={fieldLabelStyle}>One line description</div>
            <input
              className="hb-input"
              value={desc}
              maxLength={140}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="What does the player do?"
              style={fieldStyle}
            />
            <div style={fieldLabelStyle}>Category</div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {categories.map((c) => (
                <button key={c.slug} onClick={() => setCategory(c.slug)} style={chipStyle(category === c.slug)}>
                  {c.name}
                </button>
              ))}
            </div>
            <div style={fieldLabelStyle}>Orientation</div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {orientations.map((o) => (
                <button key={o.value} onClick={() => setOrient(o.value)} style={chipStyle(orient === o.value)}>
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
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0 12px" }}>
              <div>
                <div style={fieldLabelStyle}>Model</div>
                <input className="hb-input" value={model} maxLength={80} onChange={(e) => setModel(e.target.value)} placeholder="Claude Sonnet 4.5" style={fieldStyle} />
              </div>
              <div>
                <div style={fieldLabelStyle}>Tool or agent</div>
                <input className="hb-input" value={agent} maxLength={80} onChange={(e) => setAgent(e.target.value)} placeholder="Claude Code" style={fieldStyle} />
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
            <div style={fieldLabelStyle}>Leaderboard</div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
              <button onClick={() => setLbEnabled(false)} style={chipStyle(!lbEnabled)}>
                Off
              </button>
              <button onClick={() => setLbEnabled(true)} style={chipStyle(lbEnabled)}>
                On
              </button>
              {lbEnabled ? (
                <>
                  <span style={{ fontFamily: mono, fontSize: "10.5px", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-5)", margin: "0 4px" }}>sort</span>
                  <button onClick={() => setLbSort("desc")} style={chipStyle(lbSort === "desc")}>
                    Highest wins
                  </button>
                  <button onClick={() => setLbSort("asc")} style={chipStyle(lbSort === "asc")}>
                    Lowest wins
                  </button>
                </>
              ) : null}
            </div>
            <div style={{ marginTop: "8px", fontFamily: mono, fontSize: "10.5px", color: "var(--ink-6)" }}>
              Your game submits scores through the Habiv bridge. Turn this on only if it reports a score.
            </div>
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
              This is your build running in the same sandbox players get. Covers and thumbnails are generated automatically after publishing; you can
              upload your own later in My games.
            </div>
            <div style={fieldLabelStyle}>Live preview · 16:9 · no runs or scores are recorded</div>
            {previewBox}
            <div style={{ marginTop: "12px", fontFamily: mono, fontSize: "10.5px", color: "var(--ink-6)" }}>
              Accent colour is picked from the cover once it exists.
            </div>
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
                <div style={{ height: "190px", borderRadius: "14px", background: "var(--panel-2)", display: "grid", placeItems: "center", fontFamily: mono, fontSize: "10.5px", color: "var(--ink-5)", textAlign: "center", padding: "12px" }}>
                  Cover generated after publish
                </div>
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
