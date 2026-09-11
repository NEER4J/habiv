"use client";

import { grantBadge, setUserBan, setUserFlags } from "@/lib/actions/admin";
import { ActionButton } from "@/components/admin/action-button";
import type { AdminUser } from "@/lib/db/admin";

const BADGES = ["founder", "top_creator", "staff"] as const;

export function UserFlags({ user, selfId }: { user: AdminUser; selfId: string }) {
  const isSelf = user.id === selfId;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
      <ActionButton
        id={`admin-${user.id}`}
        label={user.isAdmin ? "Admin ✓" : "Admin"}
        variant={user.isAdmin ? "primary" : "chip"}
        okText="Saved"
        disabled={isSelf && user.isAdmin}
        title={isSelf && user.isAdmin ? "You cannot remove your own admin access" : undefined}
        confirm={user.isAdmin ? `Remove admin from @${user.handle}?` : `Make @${user.handle} an admin?`}
        run={() => setUserFlags(user.id, { isAdmin: !user.isAdmin })}
      />
      <ActionButton
        id={`verified-${user.id}`}
        label={user.isVerified ? "Verified ✓" : "Verified"}
        variant={user.isVerified ? "primary" : "chip"}
        okText="Saved"
        run={() => setUserFlags(user.id, { isVerified: !user.isVerified })}
      />
    </div>
  );
}

export function UserBadges({ user }: { user: AdminUser }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
      {BADGES.map((b) => {
        const on = user.badges.includes(b);
        return <ActionButton key={b} id={`badge-${b}-${user.id}`} label={on ? `${b} ✓` : b} variant={on ? "primary" : "chip"} okText="Saved" run={() => grantBadge(user.id, b, !on)} />;
      })}
    </div>
  );
}

export function UserBan({ user, selfId }: { user: AdminUser; selfId: string }) {
  const banned = user.bannedAt !== null;
  return banned ? (
    <ActionButton id={`unban-${user.id}`} label="Unban" okText="Unbanned" confirm={`Unban @${user.handle} and restore their games?`} run={() => setUserBan(user.id, false)} />
  ) : (
    <ActionButton id={`ban-${user.id}`} label="Ban" variant="danger" okText="Banned" disabled={user.id === selfId} prompt={`Ban @${user.handle}. Reason:`} run={(reason) => setUserBan(user.id, true, reason)} />
  );
}
