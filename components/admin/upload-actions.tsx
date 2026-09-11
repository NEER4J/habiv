"use client";

import { reprocessVersion, setFeatured, setGameStatus } from "@/lib/actions/admin";
import { ActionButton, smallBtn } from "@/components/admin/action-button";

type Props = { versionId: string; status: string; previewUrl: string | null; game: { id: string; status: string } };

export function UploadActions({ versionId, status, previewUrl, game }: Props) {
  const gameLive = game.status === "published";
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" }}>
      {previewUrl && status === "ready" && (
        <a id={`preview-${versionId}`} href={previewUrl} target="_blank" rel="noopener noreferrer" style={{ ...smallBtn, textDecoration: "none" }}>
          Preview ↗
        </a>
      )}
      <ActionButton id={`reprocess-${versionId}`} label="Reprocess" okText="Queued" run={() => reprocessVersion(versionId)} confirm="Re-run ingest for this version?" />
      {status === "ready" && !gameLive && (
        <ActionButton id={`publish-${versionId}`} label="Publish" variant="primary" okText="Published" run={() => setGameStatus(game.id, "published")} />
      )}
      {game.status !== "hidden" && game.status !== "removed" && (
        <ActionButton id={`hide-${versionId}`} label="Hide" okText="Hidden" prompt="Reason for hiding (shown to creator):" run={(reason) => setGameStatus(game.id, "hidden", reason)} />
      )}
      {game.status !== "removed" && (
        <ActionButton id={`remove-${versionId}`} label="Remove" variant="danger" okText="Removed" prompt="Reason for removal:" run={(reason) => setGameStatus(game.id, "removed", reason)} />
      )}
      <ActionButton id={`feature-${versionId}`} label="★ Feature" okText="Featured" run={() => setFeatured(game.id, true)} />
      <ActionButton id={`unfeature-${versionId}`} label="Unfeature" okText="Unfeatured" run={() => setFeatured(game.id, false)} />
    </div>
  );
}
