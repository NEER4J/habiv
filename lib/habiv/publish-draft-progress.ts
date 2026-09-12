/**
 * Reads the upload progress the publish wizard saves in this browser (components/habiv/publish-view.tsx
 * writes `habiv:publish-draft:<gameId|new>`), so My games can show how far an upload got and link back to it.
 */

const PREFIX = "habiv:publish-draft:";

export type LocalUpload = { progress: number; href: string };

type Saved = {
  file?: { size?: number };
  session?: { versionId?: string; mode?: string; partSize?: number } | null;
  parts?: [number, string][];
  uploaded?: boolean;
};

export function localUploadFor(versionId: string): LocalUpload | null {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(PREFIX)) continue;
      const d = JSON.parse(localStorage.getItem(key) ?? "null") as Saved | null;
      if (d?.session?.versionId !== versionId) continue;
      const suffix = key.slice(PREFIX.length);
      return { progress: progressOf(d), href: suffix === "new" ? "/publish" : `/publish?game=${suffix}` };
    }
  } catch {
    // Storage blocked: My games just shows no percentage.
  }
  return null;
}

function progressOf(d: Saved): number {
  if (d.uploaded) return 1;
  const size = d.file?.size ?? 0;
  const partSize = d.session?.partSize ?? 0;
  if (d.session?.mode !== "multipart" || !size || !partSize) return 0;
  let sent = 0;
  for (const [n] of d.parts ?? []) sent += Math.min(partSize, size - (n - 1) * partSize);
  return Math.min(1, sent / size);
}
