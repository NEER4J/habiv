"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { mono } from "@/lib/habiv/ui";

const items = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/uploads", label: "Uploads" },
  { href: "/admin/games", label: "Games" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/categories", label: "Categories" },
  { href: "/admin/settings", label: "Settings" },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin" className="adm-nav hb-no-scrollbar">
      <div className="adm-brand" style={{ fontFamily: mono, fontSize: "10.5px", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ink-5)" }}>
        Habiv admin
      </div>
      {items.map((it) => {
        const active = it.href === "/admin" ? pathname === "/admin" : pathname.startsWith(it.href);
        return (
          <Link key={it.href} href={it.href} className="adm-link" aria-current={active ? "page" : undefined} style={{ background: active ? "var(--chip)" : "transparent", color: active ? "var(--ink)" : "var(--ink-3)", fontWeight: active ? 500 : 400 }}>
            {it.label}
          </Link>
        );
      })}
      <Link href="/" className="adm-link adm-back" style={{ color: "var(--ink-5)" }}>
        ← Back to Habiv
      </Link>
    </nav>
  );
}
