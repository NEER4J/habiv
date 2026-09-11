"use client";

import { adminDeleteComment, adminResolveReport } from "@/lib/actions/admin";
import { ActionButton } from "@/components/admin/action-button";
import type { AdminReport } from "@/lib/db/admin";

export function ReportActions({ report }: { report: AdminReport }) {
  const open = report.status === "open";
  const { id, target } = report;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
      {open && <ActionButton id={`resolve-${id}`} label="Resolve" variant="primary" okText="Resolved" run={() => adminResolveReport(id, "resolved")} />}
      {open && <ActionButton id={`dismiss-${id}`} label="Dismiss" okText="Dismissed" run={() => adminResolveReport(id, "dismissed")} />}
      {target.kind === "game" && (
        <>
          <ActionButton id={`remove-${id}`} label="Resolve & remove game" variant="danger" okText="Removed" confirm={`Remove “${target.label}” and resolve this report?`} run={() => adminResolveReport(id, "resolved", "remove")} />
          <ActionButton id={`restore-${id}`} label="Resolve & restore game" okText="Restored" confirm={`Restore “${target.label}” and resolve this report?`} run={() => adminResolveReport(id, "resolved", "restore")} />
        </>
      )}
      {target.kind === "comment" && (
        <ActionButton id={`delcomment-${id}`} label="Delete comment" variant="danger" okText="Deleted" confirm="Delete this comment?" run={() => adminDeleteComment(target.id)} />
      )}
    </div>
  );
}
