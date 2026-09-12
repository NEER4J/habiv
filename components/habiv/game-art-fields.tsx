"use client";

import { useRef, useState } from "react";
import type { ThumbInput } from "@/lib/thumbs/styles";
import { chipBtn, fieldLabelStyle, mono } from "@/lib/habiv/ui";
import { ThumbPicker } from "./thumb-picker";

export type GameArt = { coverUrl: string | null; cardUrl: string | null };

type Kind = "cover" | "card";

const slots: { kind: Kind; label: string; where: string; w: number; h: number }[] = [
  { kind: "cover", label: "Cover · 16:9", where: "Feed tiles, the player and link previews", w: 1280, h: 720 },
  { kind: "card", label: "Card · 3:4", where: "Tall poster tiles", w: 600, h: 800 },
];

/** Centre-crops to the slot's aspect ratio and scales to its size, like the avatar upload. */
async function cropTo(file: File, w: number, h: number): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Could not read that image."));
      i.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not process the image.");
    const scale = Math.min(img.naturalWidth / w, img.naturalHeight / h);
    const sw = w * scale;
    const sh = h * scale;
    ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, 0, 0, w, h);
    const toBlob = (type: string, quality?: number) => new Promise<Blob | null>((r) => canvas.toBlob(r, type, quality));
    // High quality here: the server re-encodes to its final WebP, so this avoids compressing twice.
    let blob = await toBlob("image/webp", 0.92);
    if (!blob || blob.type !== "image/webp") blob = await toBlob("image/jpeg", 0.92);
    if (!blob) throw new Error("Could not process the image.");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Read-only cover and card, e.g. on the publish review; empty slots say the screenshot fills them. */
export function ArtPreview({ value, onEdit }: { value: GameArt; onEdit?: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: "10px", flexWrap: "wrap" }}>
      {slots.map((s) => {
        const url = s.kind === "cover" ? value.coverUrl : value.cardUrl;
        return (
          <div key={s.kind} style={{ width: s.kind === "cover" ? "200px" : "84px", maxWidth: "100%" }}>
            <div style={{ position: "relative", aspectRatio: `${s.w} / ${s.h}`, borderRadius: "8px", overflow: "hidden", background: "var(--chip)", display: "grid", placeItems: "center" }}>
              {url ? (
                // eslint-disable-next-line @next/next/no-img-element -- art URLs come from the storage CDN
                <img src={url} alt={s.kind === "cover" ? "Cover" : "Card"} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <span style={{ fontFamily: mono, fontSize: "9.5px", color: "var(--ink-5)", textAlign: "center", padding: "4px" }}>Automatic</span>
              )}
            </div>
            <div style={{ marginTop: "4px", fontFamily: mono, fontSize: "10px", color: "var(--ink-5)" }}>
              {s.kind === "cover" ? "Cover" : "Card"}
              {url ? "" : " · screenshot"}
            </div>
          </div>
        );
      })}
      {onEdit ? (
        <button type="button" onClick={onEdit} style={{ ...chipBtn, marginBottom: "18px" }}>
          Change
        </button>
      ) : null}
    </div>
  );
}

/** Sends one image to the art endpoint and returns its public URL. */
async function sendArt(gameId: string, kind: Kind, blob: Blob): Promise<string> {
  const form = new FormData();
  form.append("kind", kind);
  form.append("file", blob, blob.type === "image/webp" ? `${kind}.webp` : `${kind}.jpg`);
  const res = await fetch(`/api/games/${gameId}/art`, { method: "POST", body: form });
  const json = (await res.json().catch(() => null)) as { ok?: boolean; url?: string; error?: string } | null;
  if (!res.ok || !json?.ok || !json.url) throw new Error(json?.error ?? "Could not upload the image.");
  return json.url;
}

/**
 * Cover and card for a game: upload an image per slot, or pick a ready-made design (needs `meta`,
 * the game's title and details) that fills both. Every pick saves immediately; `onChange` gets only
 * the fields that changed so the parent can merge them into its latest state. Empty slots get the
 * automatic screenshot.
 */
export function GameArtFields({
  gameId,
  value,
  onChange,
  meta,
}: {
  gameId: string;
  value: GameArt;
  onChange: (patch: Partial<GameArt>) => void;
  meta?: ThumbInput | null;
}) {
  const inputs = useRef<Record<Kind, HTMLInputElement | null>>({ cover: null, card: null });
  const [busy, setBusy] = useState<Record<Kind, boolean>>({ cover: false, card: false });
  const [errors, setErrors] = useState<Record<Kind, string | null>>({ cover: null, card: null });
  const [picking, setPicking] = useState(false);

  const upload = async (kind: Kind, file: File | undefined) => {
    if (!file) return;
    const slot = slots.find((s) => s.kind === kind)!;
    setBusy((b) => ({ ...b, [kind]: true }));
    setErrors((e) => ({ ...e, [kind]: null }));
    try {
      const url = await sendArt(gameId, kind, await cropTo(file, slot.w, slot.h));
      onChange(kind === "cover" ? { coverUrl: url } : { cardUrl: url });
    } catch (e) {
      setErrors((prev) => ({ ...prev, [kind]: e instanceof Error ? e.message : "Could not upload the image." }));
    } finally {
      setBusy((b) => ({ ...b, [kind]: false }));
      const input = inputs.current[kind];
      if (input) input.value = "";
    }
  };

  const useDesign = async ({ cover, card }: { cover: Blob; card: Blob }) => {
    const [coverUrl, cardUrl] = await Promise.all([sendArt(gameId, "cover", cover), sendArt(gameId, "card", card)]);
    onChange({ coverUrl, cardUrl });
    setErrors({ cover: null, card: null });
    setPicking(false);
  };

  const canDesign = !!meta?.title.trim();

  return (
    <div>
      <div style={{ display: "flex", gap: "14px", flexWrap: "wrap", alignItems: "flex-start" }}>
        {slots.map((s) => {
          const url = s.kind === "cover" ? value.coverUrl : value.cardUrl;
          const uploading = busy[s.kind];
          const error = errors[s.kind];
          return (
            <div key={s.kind} style={{ flex: s.kind === "cover" ? "2 1 240px" : "1 1 120px", minWidth: 0, maxWidth: s.kind === "card" ? "200px" : undefined }}>
              <div style={{ ...fieldLabelStyle, marginTop: 0 }}>{s.label}</div>
              <div
                style={{
                  position: "relative",
                  width: "100%",
                  aspectRatio: `${s.w} / ${s.h}`,
                  borderRadius: "12px",
                  overflow: "hidden",
                  background: "var(--chip)",
                  display: "grid",
                  placeItems: "center",
                }}
              >
                {url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- art URLs come from the storage CDN
                  <img src={url} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <span style={{ fontFamily: mono, fontSize: "10.5px", color: "var(--ink-5)", textAlign: "center", padding: "8px" }}>Automatic screenshot</span>
                )}
              </div>
              <div style={{ marginTop: "6px", fontFamily: mono, fontSize: "10px", color: "var(--ink-5)" }}>{s.where}</div>
              <input
                ref={(el) => {
                  inputs.current[s.kind] = el;
                }}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                hidden
                onChange={(e) => void upload(s.kind, e.target.files?.[0])}
              />
              <button
                type="button"
                disabled={uploading}
                onClick={() => inputs.current[s.kind]?.click()}
                style={{ ...chipBtn, marginTop: "8px", opacity: uploading ? 0.5 : 1 }}
              >
                {uploading ? "Uploading…" : url ? "Replace" : "Upload image"}
              </button>
              {error ? (
                <div role="alert" style={{ marginTop: "8px", fontSize: "12.5px", color: "var(--danger-ink)" }}>
                  {error}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {meta ? (
        picking && canDesign ? (
          <ThumbPicker input={meta} replacing={!!(value.coverUrl || value.cardUrl)} onUse={useDesign} onCancel={() => setPicking(false)} />
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginTop: "14px" }}>
            <button type="button" disabled={!canDesign} onClick={() => setPicking(true)} style={{ ...chipBtn, opacity: canDesign ? 1 : 0.5 }}>
              ✦ Use a ready-made design
            </button>
            <span style={{ fontFamily: mono, fontSize: "10.5px", color: "var(--ink-5)" }}>
              {canDesign ? "No image? Pick a style and colours; we make the cover and card from your title." : "Add a title first to use a ready-made design."}
            </span>
          </div>
        )
      ) : null}
    </div>
  );
}
