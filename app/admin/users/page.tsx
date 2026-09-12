import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminContext, listUsersAdmin } from "@/lib/db/admin";
import { fmt, relativeTime } from "@/lib/habiv/games";
import { mono } from "@/lib/habiv/ui";
import { FilterChips, LoadMore, PageHeader, SearchForm, cellMuted, first, offsetOf } from "@/components/admin/chrome";
import { StatusPill } from "@/components/admin/status-pill";
import { Table, Td, Th, Empty } from "@/components/admin/table";
import { UserBadges, UserBan, UserFlags } from "@/components/admin/user-row-controls";
import { UserAvatar } from "@/components/habiv/avatar";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function UsersPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<PageHeader title="Users" />}>
      <Users searchParams={searchParams} />
    </Suspense>
  );
}

async function Users({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const q = first(sp.q)?.trim() || undefined;
  const banned = first(sp.banned) === "1";
  const offset = offsetOf(first(sp.offset));
  const ctx = await getAdminContext();
  if (!ctx) redirect("/");
  const { items, nextOffset } = await listUsersAdmin(ctx, { q, banned, offset, limit: 40 });
  return (
    <>
      <PageHeader title="Users">
        <FilterChips base="/admin/users" param="banned" current={banned ? "1" : null} keep={{ q }} options={[{ value: null, label: "All" }, { value: "1", label: "Banned" }]} />
        <SearchForm action="/admin/users" id="users-search" placeholder="Search @handle or name…" defaultValue={q} hidden={{ banned: banned ? "1" : undefined }} />
      </PageHeader>
      {items.length === 0 ? (
        <Empty>No users match.</Empty>
      ) : (
        <Table minWidth={1240}>
          <thead>
            <tr>
              <Th></Th><Th>User</Th><Th>Email</Th><Th>Provider</Th><Th>Joined</Th><Th>Last sign-in</Th><Th>Games</Th><Th>Followers</Th><Th>Flags</Th><Th>Badges</Th><Th>Ban</Th>
            </tr>
          </thead>
          <tbody>
            {items.map((u) => (
              <tr key={u.id} className="hb-row">
                <Td style={{ width: "44px", paddingRight: 0 }}>
                  <UserAvatar url={u.avatarUrl} seed={u.handle} size={36} />
                </Td>
                <Td style={{ maxWidth: "200px" }}>
                  <div style={{ color: "var(--ink)", fontWeight: 500 }}>{u.displayName}</div>
                  <Link href={`/@${u.handle}`} style={{ ...cellMuted, fontFamily: mono }}>@{u.handle}</Link>
                  {u.bannedAt && <div style={{ marginTop: "4px" }}><StatusPill status="banned" title={u.banReason ?? undefined} /></div>}
                </Td>
                <Td style={{ ...cellMuted, fontFamily: mono, fontSize: "11.5px", wordBreak: "break-all", maxWidth: "220px" }}>{u.email ?? "—"}</Td>
                <Td style={cellMuted}>{u.provider ?? "—"}</Td>
                <Td style={{ ...cellMuted, whiteSpace: "nowrap" }} title={u.createdAt}>{relativeTime(u.createdAt)}</Td>
                <Td style={{ ...cellMuted, whiteSpace: "nowrap" }} title={u.lastSignInAt ?? undefined}>{u.lastSignInAt ? relativeTime(u.lastSignInAt) : "never"}</Td>
                <Td style={{ fontFamily: mono }}>{fmt(u.games)}</Td>
                <Td style={{ fontFamily: mono }}>{fmt(u.followersCount)}</Td>
                <Td><UserFlags user={u} selfId={ctx.uid} /></Td>
                <Td><UserBadges user={u} /></Td>
                <Td><UserBan user={u} selfId={ctx.uid} /></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <LoadMore base="/admin/users" params={{ q, banned: banned ? "1" : undefined }} nextOffset={nextOffset} />
    </>
  );
}
