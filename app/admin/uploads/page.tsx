import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminContext, listVersions } from "@/lib/db/admin";
import { formatBytes, relativeTime } from "@/lib/habiv/games";
import { mono } from "@/lib/habiv/ui";
import { FilterChips, LoadMore, PageHeader, cellMuted, first, offsetOf } from "@/components/admin/chrome";
import { StatusPill } from "@/components/admin/status-pill";
import { Table, Td, Th, Empty } from "@/components/admin/table";
import { UploadActions } from "@/components/admin/upload-actions";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const STATUSES = ["uploaded", "processing", "ready", "rejected", "archived"];

export default function UploadsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<PageHeader title="Uploads" />}>
      <Uploads searchParams={searchParams} />
    </Suspense>
  );
}

async function Uploads({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const status = first(sp.status);
  const statusFilter = status && STATUSES.includes(status) ? status : null;
  const offset = offsetOf(first(sp.offset));
  const ctx = await getAdminContext();
  if (!ctx) redirect("/");
  const { items, nextOffset } = await listVersions(ctx, { status: statusFilter, offset, limit: 40 });
  return (
    <>
      <PageHeader title="Uploads">
        <FilterChips base="/admin/uploads" param="status" current={statusFilter} options={[{ value: null, label: "All" }, ...STATUSES.map((s) => ({ value: s, label: s }))]} />
      </PageHeader>
      {offset > 0 && <p style={{ ...cellMuted, margin: "0 0 10px" }}>Showing from #{offset + 1}. <Link href={statusFilter ? `/admin/uploads?status=${statusFilter}` : "/admin/uploads"} style={{ color: "var(--link)" }}>Back to start</Link></p>}
      {items.length === 0 ? (
        <Empty>No uploads{statusFilter ? ` with status “${statusFilter}”` : ""}.</Empty>
      ) : (
        <Table minWidth={1100}>
          <thead>
            <tr>
              <Th>Game</Th><Th>Creator</Th><Th>Ver</Th><Th>Status</Th><Th>Engine</Th><Th>Size</Th><Th>Files</Th><Th>Uploaded</Th><Th>Warnings</Th><Th>Reject reason</Th><Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {items.map((v) => (
              <tr key={v.id} className="hb-row">
                <Td style={{ color: "var(--ink)", fontWeight: 500, maxWidth: "220px" }}>
                  {v.game.status === "published" && v.creator.handle ? <Link href={`/@${v.creator.handle}/${v.game.slug}`}>{v.game.title}</Link> : v.game.title}
                  <div style={{ ...cellMuted, fontFamily: mono, fontSize: "10.5px" }}>{v.game.status}{v.game.currentVersionId === v.id ? " · current" : ""}{v.source ? ` · ${v.source}` : ""}</div>
                </Td>
                <Td>{v.creator.handle ? <Link href={`/@${v.creator.handle}`}>@{v.creator.handle}</Link> : <span style={cellMuted}>—</span>}</Td>
                <Td style={{ whiteSpace: "nowrap" }}>v{v.version}</Td>
                <Td><StatusPill status={v.status} /></Td>
                <Td style={cellMuted}>{v.engine ?? "—"}</Td>
                <Td style={{ ...cellMuted, whiteSpace: "nowrap" }}>{formatBytes(v.sizeBytes)}</Td>
                <Td style={cellMuted}>{v.fileCount ?? "—"}</Td>
                <Td style={{ ...cellMuted, whiteSpace: "nowrap" }} title={v.createdAt}>{relativeTime(v.createdAt)}</Td>
                <Td>
                  {v.warnings.length === 0 ? (
                    <span style={cellMuted}>0</span>
                  ) : (
                    <details>
                      <summary style={{ cursor: "pointer", color: "var(--ink)" }}>{v.warnings.length}</summary>
                      <ul style={{ margin: "6px 0 0", paddingLeft: "16px", fontSize: "12px", color: "var(--ink-3)", maxWidth: "280px" }}>
                        {v.warnings.map((w, i) => <li key={i}>{w}</li>)}
                      </ul>
                    </details>
                  )}
                </Td>
                <Td style={{ ...cellMuted, maxWidth: "200px", fontFamily: mono, fontSize: "11px", wordBreak: "break-word" }}>{v.rejectReason ?? "—"}</Td>
                <Td><UploadActions versionId={v.id} status={v.status} previewUrl={v.previewUrl} game={{ id: v.game.id, status: v.game.status }} /></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <LoadMore base="/admin/uploads" params={{ status: statusFilter ?? undefined }} nextOffset={nextOffset} />
    </>
  );
}
