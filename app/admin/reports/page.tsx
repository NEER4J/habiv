import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminContext, listReports } from "@/lib/db/admin";
import { relativeTime } from "@/lib/habiv/games";
import { mono } from "@/lib/habiv/ui";
import { FilterChips, PageHeader, cellMuted, first } from "@/components/admin/chrome";
import { StatusPill } from "@/components/admin/status-pill";
import { Table, Td, Th, Empty } from "@/components/admin/table";
import { ReportActions } from "@/components/admin/report-actions";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const STATUSES = ["open", "resolved", "dismissed"];

export default function ReportsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<PageHeader title="Reports" />}>
      <Reports searchParams={searchParams} />
    </Suspense>
  );
}

async function Reports({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const status = first(sp.status);
  const statusFilter = status === "all" ? null : status && STATUSES.includes(status) ? status : "open";
  const ctx = await getAdminContext();
  if (!ctx) redirect("/");
  const items = await listReports(ctx, { status: statusFilter, limit: 100 });
  return (
    <>
      <PageHeader title="Reports" count={items.length}>
        <FilterChips base="/admin/reports" param="status" current={statusFilter ?? "all"} options={[...STATUSES.map((s) => ({ value: s, label: s })), { value: "all", label: "All" }]} />
      </PageHeader>
      {items.length === 0 ? (
        <Empty>No {statusFilter ?? ""} reports.</Empty>
      ) : (
        <Table minWidth={960}>
          <thead>
            <tr>
              <Th>Reason</Th><Th>Details</Th><Th>Reporter</Th><Th>Target</Th><Th>Status</Th><Th>Created</Th><Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.id} className="hb-row">
                <Td style={{ color: "var(--ink)", fontWeight: 500, whiteSpace: "nowrap" }}>{r.reason}</Td>
                <Td style={{ maxWidth: "280px", color: "var(--ink-3)", fontSize: "12.5px", wordBreak: "break-word" }}>{r.details ?? <span style={cellMuted}>—</span>}</Td>
                <Td><Link href={`/@${r.reporter.handle}`} style={{ fontFamily: mono, fontSize: "12px" }}>@{r.reporter.handle}</Link></Td>
                <Td style={{ maxWidth: "260px" }}>
                  <span style={{ ...cellMuted, fontFamily: mono, fontSize: "10.5px", textTransform: "uppercase", letterSpacing: "0.08em", marginRight: "6px" }}>{r.target.kind}</span>
                  {r.target.url ? <Link href={r.target.url} style={{ color: "var(--link)" }}>{r.target.label}</Link> : <span style={{ color: "var(--ink-2)" }}>{r.target.label}</span>}
                </Td>
                <Td><StatusPill status={r.status} /></Td>
                <Td style={{ ...cellMuted, whiteSpace: "nowrap" }} title={r.createdAt}>{relativeTime(r.createdAt)}</Td>
                <Td><ReportActions report={r} /></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
