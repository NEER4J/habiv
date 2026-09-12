"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type CSSProperties } from "react";
import { publishVersion, setVersionMeta } from "@/lib/actions/games";
import { deleteVersion } from "@/lib/actions/uploads";
import { AGENT_OPTIONS, MODEL_OPTIONS, normalizeAgent, normalizeModel } from "@/lib/ai/catalog";
import { formatBytes, relativeTime } from "@/lib/habiv/games";
import type { EditVersion } from "@/lib/habiv/page-data";
import { rejectLabel } from "@/lib/habiv/upload-status";
import { gameOrigin } from "@/lib/site";
import { bpanel, chipBtn, dangerBtn, fieldLabelStyle, fieldStyle, mono, primaryBtn } from "@/lib/habiv/ui";
import { CatalogField } from "./catalog-picker";
import { useShell } from "./shell-context";

/**
 * Every version of a game on its edit page: notes, which one players get, play any of them,
 * delete the ones not needed. The live version's model, tool and prompt stay in Game details
 * above so the two forms never overwrite each other.
 */

const NOTES_MAX = 500;

type Tone = "pos" | "bad" | "plain";

function statusOf(v: EditVersion, current: boolean, published: boolean): { label: string; tone: Tone } {
  if (current) return published ? { label: "Live", tone: "pos" } : { label: "Current", tone: "plain" };
  if (v.status === "ready") return { label: "Ready", tone: "plain" };
  if (v.status === "processing") return { label: "Checking", tone: "plain" };
  if (v.status === "uploaded") return { label: "Uploading", tone: "plain" };
  if (v.status === "archived") return { label: "Files removed", tone: "plain" };
  return { label: v.rejectReason === "aborted" ? "Stopped" : `Failed · ${rejectLabel(v.rejectReason)}`, tone: "bad" };
}

const pill = (tone: Tone): CSSProperties => ({
  padding: "3px 9px",
  borderRadius: "6px",
  fontFamily: mono,
  fontSize: "10px",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  whiteSpace: "nowrap",
  background: tone === "pos" ? "var(--pos-bg)" : tone === "bad" ? "var(--danger-bg)" : "var(--panel-2)",
  color: tone === "pos" ? "var(--pos-ink)" : tone === "bad" ? "var(--danger-ink)" : "var(--ink-4)",
});

const linkBtn: CSSProperties = { ...chipBtn, height: "30px", padding: "0 12px", fontSize: "12.5px" };

type Draft = { changelog: string; model: string; agent: string; prompt: string };

export function VersionManager({
  gameId,
  gameUrl,
  published,
  currentVersionId,
  versions,
  storage,
}: {
  gameId: string;
  /** Game page path while published. */
  gameUrl: string | null;
  published: boolean;
  currentVersionId: string | null;
  versions: EditVersion[];
  storage: { usedBytes: number; quotaBytes: number };
}) {
  const router = useRouter();
  const { showToast } = useShell();
  const [rows, setRows] = useState(versions);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({ changelog: "", model: "", agent: "", prompt: "" });
  const [busy, setBusy] = useState<string | null>(null);

  // router.refresh() hands down fresh rows; they replace any optimistic edits.
  useEffect(() => setRows(versions), [versions]);

  const startEdit = (v: EditVersion) => {
    setEditing(v.id);
    setDraft({ changelog: v.changelog, model: v.model, agent: v.agent, prompt: v.prompt });
  };

  const save = async (v: EditVersion, current: boolean) => {
    setBusy(v.id);
    const changelog = draft.changelog.trim();
    const res = await setVersionMeta(
      v.id,
      current
        ? { changelog: changelog || null }
        : { changelog: changelog || null, model: draft.model.trim() || null, agent: draft.agent.trim() || null, prompt: draft.prompt.trim() || null },
    );
    setBusy(null);
    if (!res.ok) {
      showToast(res.error);
      return;
    }
    setRows((list) =>
      list.map((x) => (x.id === v.id ? { ...x, changelog, ...(current ? {} : { model: draft.model.trim(), agent: draft.agent.trim(), prompt: draft.prompt.trim() }) } : x)),
    );
    setEditing(null);
    showToast(`v${v.version} saved`);
    router.refresh();
  };

  const makeLive = async (v: EditVersion) => {
    const note = published ? "It replaces the live one for everyone; you can switch back any time." : "This also publishes the game.";
    if (!window.confirm(`Make v${v.version} the version players get? ${note}`)) return;
    setBusy(v.id);
    const res = await publishVersion({ gameId, versionId: v.id });
    setBusy(null);
    if (!res.ok) {
      showToast(res.error);
      return;
    }
    showToast(`v${v.version} is live`);
    router.refresh();
  };

  const remove = async (v: EditVersion) => {
    if (!window.confirm(`Delete v${v.version}? Its files are removed for good and players can no longer open it.`)) return;
    setBusy(v.id);
    const res = await deleteVersion(v.id);
    setBusy(null);
    if (!res.ok) {
      showToast(res.error);
      return;
    }
    setRows((list) => list.filter((x) => x.id !== v.id));
    showToast(`v${v.version} deleted`);
    router.refresh();
  };

  const usedPct = Math.min(100, Math.round((storage.usedBytes / Math.max(storage.quotaBytes, 1)) * 100));

  return (
    <div style={{ ...bpanel, gridColumn: "1 / -1", padding: "22px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: "17px", fontWeight: 600 }}>Versions</div>
          <div style={{ marginTop: "6px", fontSize: "13px", lineHeight: 1.5, color: "var(--ink-4)", maxWidth: "70ch" }}>
            Every upload is a version. Players get the live one and can open any other ready version from the game page; only the live version ranks
            on the leaderboard.
          </div>
        </div>
        <Link href={`/publish?game=${gameId}`} style={primaryBtn}>
          Upload a new version
        </Link>
      </div>

      <div style={{ marginTop: "14px", maxWidth: "360px" }}>
        <div style={{ fontFamily: mono, fontSize: "10.5px", color: "var(--ink-5)" }}>
          Storage · {formatBytes(storage.usedBytes)} of {formatBytes(storage.quotaBytes)} across your games. Deleting old versions frees space.
        </div>
        <div style={{ marginTop: "6px", height: "4px", borderRadius: "2px", background: "var(--chip)", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${usedPct}%`, background: usedPct > 90 ? "var(--danger-ink)" : "var(--ink)" }} />
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "16px" }}>
        {rows.length === 0 ? <div style={{ fontSize: "13px", color: "var(--ink-5)" }}>No versions yet. Upload a build to create v1.</div> : null}
        {rows.map((v) => {
          const current = v.id === currentVersionId;
          const st = statusOf(v, current, published);
          const ready = v.status === "ready";
          const working = busy === v.id;
          // Published games play on their page (?v=N for older ones); otherwise the raw build previews in a new tab.
          const playHref = ready && published && gameUrl ? (current ? gameUrl : `${gameUrl}?v=${v.version}`) : null;
          const previewHref = ready && !playHref && gameOrigin ? `${gameOrigin}/v/${v.id}/?mode=preview` : null;
          return (
            <div key={v.id} style={{ padding: "12px 14px", borderRadius: "10px", background: "var(--chip)", opacity: working ? 0.6 : 1, transition: "opacity 120ms ease" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                <span style={{ fontFamily: mono, fontSize: "13px", fontWeight: 600 }}>v{v.version}</span>
                <span style={pill(st.tone)}>{st.label}</span>
                <span style={{ fontFamily: mono, fontSize: "10.5px", color: "var(--ink-5)" }}>
                  {relativeTime(v.createdAt)} · {formatBytes(v.sizeBytes)}
                  {v.model ? ` · ${v.model}` : ""}
                </span>
                <span style={{ flex: "1 1 auto" }} />
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  {playHref ? (
                    <Link href={playHref} style={linkBtn}>
                      Play
                    </Link>
                  ) : previewHref ? (
                    <a href={previewHref} target="_blank" rel="noreferrer" style={linkBtn}>
                      Preview
                    </a>
                  ) : null}
                  {ready && !current ? (
                    <button type="button" onClick={() => void makeLive(v)} disabled={working} style={linkBtn}>
                      Make live
                    </button>
                  ) : null}
                  {editing !== v.id ? (
                    <button type="button" onClick={() => startEdit(v)} disabled={working} style={linkBtn}>
                      {v.changelog ? "Edit notes" : "Add notes"}
                    </button>
                  ) : null}
                  {!current ? (
                    <button type="button" onClick={() => void remove(v)} disabled={working} style={{ ...dangerBtn, height: "30px", padding: "0 12px", fontSize: "12.5px" }}>
                      Delete
                    </button>
                  ) : null}
                </div>
              </div>

              {editing === v.id ? (
                <div style={{ marginTop: "4px" }}>
                  <div style={fieldLabelStyle}>Notes · what changed in v{v.version}</div>
                  <textarea
                    className="hb-input"
                    value={draft.changelog}
                    maxLength={NOTES_MAX}
                    onChange={(e) => setDraft((d) => ({ ...d, changelog: e.target.value }))}
                    placeholder="Fixed the jump, new level 3"
                    style={{ ...fieldStyle, height: 76, padding: "10px 14px", resize: "vertical", lineHeight: 1.5 }}
                  />
                  <div style={{ marginTop: "4px", fontFamily: mono, fontSize: "10px", color: "var(--ink-6)" }}>
                    {draft.changelog.length}/{NOTES_MAX} · shown in the game page&apos;s version list
                  </div>
                  {current ? (
                    <div style={{ marginTop: "8px", fontFamily: mono, fontSize: "10.5px", color: "var(--ink-5)" }}>
                      Model, tool and prompt of this version are edited in Game details above.
                    </div>
                  ) : (
                    <>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0 12px" }}>
                        <div>
                          <div style={fieldLabelStyle}>Model</div>
                          <CatalogField
                            options={MODEL_OPTIONS}
                            value={draft.model}
                            onChange={(model) => setDraft((d) => ({ ...d, model }))}
                            normalize={normalizeModel}
                            placeholder="Search models, e.g. Sonnet"
                            ariaLabel="Model"
                          />
                        </div>
                        <div>
                          <div style={fieldLabelStyle}>Tool or agent</div>
                          <CatalogField
                            options={AGENT_OPTIONS}
                            value={draft.agent}
                            onChange={(agent) => setDraft((d) => ({ ...d, agent }))}
                            normalize={normalizeAgent}
                            placeholder="Search tools, e.g. Claude Code"
                            ariaLabel="Tool or agent"
                          />
                        </div>
                      </div>
                      <div style={fieldLabelStyle}>Prompt</div>
                      <textarea
                        className="hb-input"
                        value={draft.prompt}
                        maxLength={8000}
                        onChange={(e) => setDraft((d) => ({ ...d, prompt: e.target.value }))}
                        placeholder="The prompt or brief that produced this build."
                        style={{ ...fieldStyle, height: 96, padding: "10px 14px", resize: "vertical", lineHeight: 1.5 }}
                      />
                    </>
                  )}
                  <div style={{ display: "flex", gap: "8px", marginTop: "12px", flexWrap: "wrap" }}>
                    <button type="button" onClick={() => void save(v, current)} disabled={working} style={primaryBtn}>
                      {working ? "Saving…" : "Save"}
                    </button>
                    <button type="button" onClick={() => setEditing(null)} disabled={working} style={chipBtn}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: "8px", fontSize: "13px", lineHeight: 1.5, color: v.changelog ? "var(--ink-2)" : "var(--ink-5)", whiteSpace: "pre-line" }}>
                  {v.changelog || "No notes yet."}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
