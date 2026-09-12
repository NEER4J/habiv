import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminContext, listCategoriesAdmin, listGamesAdmin } from "@/lib/db/admin";
import { fmt, relativeTime } from "@/lib/habiv/games";
import { mono } from "@/lib/habiv/ui";
import { FilterChips, LoadMore, PageHeader, SearchForm, cellMuted, first, offsetOf } from "@/components/admin/chrome";
import { StatusPill } from "@/components/admin/status-pill";
import { Table, Td, Th, Empty } from "@/components/admin/table";
import { CategorySelect, FeaturedControl, GameActions } from "@/components/admin/game-row-controls";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const STATUSES = ["published", "draft", "hidden", "removed"];

export default function GamesPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<PageHeader title="Games" />}>
      <Games searchParams={searchParams} />
    </Suspense>
  );
}

function hueFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return h;
}

async function Games({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const q = first(sp.q)?.trim() || undefined;
  const status = first(sp.status);
  const statusFilter = status && STATUSES.includes(status) ? status : null;
  const featured = first(sp.featured) === "1";
  const offset = offsetOf(first(sp.offset));
  const ctx = await getAdminContext();
  if (!ctx) redirect("/");
  const [{ items, nextOffset }, categories] = await Promise.all([
    listGamesAdmin(ctx, { q, status: statusFilter, featured, offset, limit: 40 }),
    listCategoriesAdmin(ctx),
  ]);
  const keep = { q, featured: featured ? "1" : undefined };
  return (
    <>
      <PageHeader title="Games">
        <SearchForm action="/admin/games" id="games-search" placeholder="Search titles…" defaultValue={q} hidden={{ status: statusFilter ?? undefined, featured: featured ? "1" : undefined }} />
      </PageHeader>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", marginBottom: "14px" }}>
        <FilterChips base="/admin/games" param="status" current={statusFilter} keep={keep} options={[{ value: null, label: "All" }, ...STATUSES.map((s) => ({ value: s, label: s }))]} />
        <FilterChips base="/admin/games" param="featured" current={featured ? "1" : null} keep={{ q, status: statusFilter ?? undefined }} options={[{ value: "1", label: "★ Featured only" }]} />
      </div>
      {items.length === 0 ? (
        <Empty>No games match.</Empty>
      ) : (
        <Table minWidth={1180}>
          <thead>
            <tr>
              <Th></Th><Th>Title</Th><Th>Creator</Th><Th>Status</Th><Th>Category</Th><Th>Plays</Th><Th>Likes</Th><Th>Dislikes</Th><Th>Remixes</Th><Th>Comments</Th><Th>Featured</Th><Th>Published</Th><Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {items.map((g) => (
              <tr key={g.id} className="hb-row">
                <Td style={{ width: "52px", paddingRight: 0 }}>
                  <span style={{ display: "block", width: "44px", height: "44px", borderRadius: "10px", overflow: "hidden", background: `linear-gradient(135deg, hsl(${hueFor(g.id)} 40% 30%), hsl(${(hueFor(g.id) + 50) % 360} 45% 18%))` }}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- cover URLs come from the CDN */}
                    {g.coverUrl && <img src={g.coverUrl} alt="" width={44} height={44} style={{ width: "44px", height: "44px", objectFit: "cover", display: "block" }} />}
                  </span>
                </Td>
                <Td style={{ color: "var(--ink)", fontWeight: 500, maxWidth: "240px" }}>
                  {g.status === "published" && g.creator.handle ? <Link href={g.url}>{g.title}</Link> : g.title}
                  <div style={{ ...cellMuted, fontFamily: mono, fontSize: "10.5px" }}>{g.shortId}{g.currentVersion !== null ? ` · v${g.currentVersion}` : " · no version"}</div>
                </Td>
                <Td>{g.creator.handle ? <Link href={`/@${g.creator.handle}`}>@{g.creator.handle}</Link> : <span style={cellMuted}>—</span>}</Td>
                <Td>
                  <StatusPill status={g.status} />
                  {g.hiddenReason && <div style={{ ...cellMuted, fontFamily: mono, fontSize: "10.5px", marginTop: "4px", maxWidth: "160px", wordBreak: "break-word" }}>{g.hiddenReason}</div>}
                </Td>
                <Td><CategorySelect gameId={g.id} value={g.category} categories={categories} /></Td>
                <Td style={{ fontFamily: mono }}>{fmt(g.plays)}</Td>
                <Td style={{ fontFamily: mono }}>{fmt(g.likes)}</Td>
                <Td style={{ fontFamily: mono }}>{fmt(g.dislikes)}</Td>
                <Td style={{ fontFamily: mono }}>{fmt(g.remixes)}</Td>
                <Td style={{ fontFamily: mono }}>{fmt(g.comments)}</Td>
                <Td><FeaturedControl gameId={g.id} featured={g.featuredAt !== null} rank={g.featuredRank} /></Td>
                <Td style={{ ...cellMuted, whiteSpace: "nowrap" }} title={g.publishedAt ?? undefined}>{g.publishedAt ? relativeTime(g.publishedAt) : "—"}</Td>
                <Td><GameActions gameId={g.id} status={g.status} /></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <LoadMore base="/admin/games" params={{ q, status: statusFilter ?? undefined, featured: featured ? "1" : undefined }} nextOffset={nextOffset} />
    </>
  );
}
