import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { adminStats, getAdminContext, listVersions } from "@/lib/db/admin";
import { formatBytes, fmt, relativeTime } from "@/lib/habiv/games";
import { bpanel, chipStyle, monoLabel } from "@/lib/habiv/ui";
import { PageHeader, cellMuted } from "@/components/admin/chrome";
import { StatusPill } from "@/components/admin/status-pill";
import { Table, Td, Th, Empty } from "@/components/admin/table";

export default function AdminOverviewPage() {
  return (
    <Suspense fallback={<PageHeader title="Overview" />}>
      <Overview />
    </Suspense>
  );
}

function Tile({ label, value, sub, href }: { label: string; value: string; sub?: string; href?: string }) {
  const body = (
    <div style={{ ...bpanel, padding: "16px 18px", display: "flex", flexDirection: "column", gap: "6px", height: "100%", boxSizing: "border-box" }}>
      <span style={monoLabel}>{label}</span>
      <span style={{ fontSize: "26px", fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1.1 }}>{value}</span>
      {sub && <span style={cellMuted}>{sub}</span>}
    </div>
  );
  return href ? <Link href={href} className="hb-lift-sm" style={{ display: "block" }}>{body}</Link> : body;
}

async function Overview() {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/");
  const [stats, latest] = await Promise.all([adminStats(ctx), listVersions(ctx, { limit: 8 })]);
  return (
    <>
      <PageHeader title="Overview" />
      {stats ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "10px", marginBottom: "28px" }}>
          <Tile label="Users" value={fmt(stats.users)} href="/admin/users" />
          <Tile label="Creators" value={fmt(stats.creators)} />
          <Tile label="Games" value={fmt(stats.games_published)} sub={`${fmt(stats.games_total)} total`} href="/admin/games?status=published" />
          <Tile label="Processing" value={fmt(stats.versions_processing)} sub="versions" href="/admin/uploads?status=processing" />
          <Tile label="Rejected" value={fmt(stats.versions_rejected)} sub="versions" href="/admin/uploads?status=rejected" />
          <Tile label="Storage" value={formatBytes(stats.storage_bytes)} />
          <Tile label="Plays today" value={fmt(stats.plays_today)} />
          <Tile label="Plays 7d" value={fmt(stats.plays_7d)} />
          <Tile label="Open reports" value={fmt(stats.reports_open)} href="/admin/reports?status=open" />
          <Tile label="Comments" value={fmt(stats.comments)} />
        </div>
      ) : (
        <Empty>Stats are unavailable (admin_stats returned nothing).</Empty>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: "12px", margin: "0 0 12px" }}>
        <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 600 }}>Latest uploads</h2>
        <div style={{ flex: 1 }} />
        <Link href="/admin/uploads" style={{ ...chipStyle(false), display: "inline-flex", alignItems: "center" }}>All uploads →</Link>
      </div>
      {latest.items.length === 0 ? (
        <Empty>No uploads yet.</Empty>
      ) : (
        <Table minWidth={640}>
          <thead>
            <tr>
              <Th>Game</Th><Th>Creator</Th><Th>Version</Th><Th>Status</Th><Th>Engine</Th><Th>Size</Th><Th>Uploaded</Th>
            </tr>
          </thead>
          <tbody>
            {latest.items.map((v) => (
              <tr key={v.id} className="hb-row">
                <Td style={{ color: "var(--ink)", fontWeight: 500 }}>{v.game.status === "published" && v.creator.handle ? <Link href={`/@${v.creator.handle}/${v.game.slug}`}>{v.game.title}</Link> : v.game.title}</Td>
                <Td>{v.creator.handle ? <Link href={`/@${v.creator.handle}`}>@{v.creator.handle}</Link> : <span style={cellMuted}>—</span>}</Td>
                <Td>v{v.version}</Td>
                <Td><StatusPill status={v.status} title={v.rejectReason ?? undefined} /></Td>
                <Td style={cellMuted}>{v.engine ?? "—"}</Td>
                <Td style={cellMuted}>{formatBytes(v.sizeBytes)}</Td>
                <Td style={cellMuted}>{relativeTime(v.createdAt)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {stats && stats.reports_open > 0 && (
        <p style={{ marginTop: "18px", fontSize: "13px", color: "var(--ink-3)" }}>
          <Link href="/admin/reports?status=open" style={{ color: "var(--link)" }}>{stats.reports_open} open report{stats.reports_open === 1 ? "" : "s"} need attention →</Link>
        </p>
      )}
    </>
  );
}
