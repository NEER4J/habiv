"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { art } from "@/lib/habiv/games";
import { bpanel, mono, navStyleFor } from "@/lib/habiv/ui";
import { legalPages } from "@/lib/legal";
import { createClient } from "@/lib/supabase/client";
import { Overlays } from "./overlays";
import { isWatchPath, useShell } from "./shell-context";

const HabivMark = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 773 764" fill="currentColor" style={{ display: "block" }}>
    <path d="M0.769531 600L266.27 0.5H589.77L447.27 326H771.77L578.27 763H253.77L447.27 326H286.27L166.77 600H0.769531Z" />
  </svg>
);

const MenuIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" stroke="currentColor" strokeWidth="1.6">
    <line x1="2" y1="4" x2="16" y2="4" />
    <line x1="2" y1="9" x2="16" y2="9" />
    <line x1="2" y1="14" x2="16" y2="14" />
  </svg>
);

const iconBtn: CSSProperties = {
  width: "40px",
  height: "40px",
  borderRadius: "50%",
  background: "transparent",
  color: "var(--ink)",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flex: "0 0 auto",
};

const navItems = [
  {
    href: "/",
    label: "Home",
    icon: <path d="M3 7.5 9 3l6 4.5V15H3z" />,
  },
  {
    href: "/explore",
    label: "Explore",
    icon: (
      <>
        <circle cx="9" cy="9" r="6" />
        <line x1="9" y1="6" x2="9" y2="12" />
        <line x1="6" y1="9" x2="12" y2="9" />
      </>
    ),
  },
  { href: "/saved", label: "Saved", icon: <path d="M5 3h8v12l-4-3.2L5 15z" /> },
  {
    href: "/history",
    label: "History",
    icon: (
      <>
        <circle cx="9" cy="9" r="6" />
        <path d="M9 5.8V9l2.3 1.5" />
      </>
    ),
  },
  {
    href: "/my-games",
    label: "My Games",
    icon: (
      <>
        <rect x="2.5" y="5" width="13" height="8" rx="3" />
        <circle cx="12" cy="9" r="1" />
      </>
    ),
  },
  {
    href: "/profile",
    label: "Profile",
    icon: (
      <>
        <circle cx="9" cy="6.5" r="2.8" />
        <path d="M3.5 15c0-3 2.5-4.6 5.5-4.6s5.5 1.6 5.5 4.6" />
      </>
    ),
  },
];

const secondaryItems = [
  {
    href: "/publish",
    label: "Publish Game",
    icon: (
      <>
        <line x1="9" y1="3" x2="9" y2="11" />
        <polyline points="6,6 9,3 12,6" />
        <line x1="3.5" y1="14.5" x2="14.5" y2="14.5" />
      </>
    ),
  },
  {
    href: "/settings?tab=api",
    label: "Connect AI",
    icon: (
      <>
        <circle cx="5" cy="9" r="2.5" />
        <circle cx="13" cy="9" r="2.5" />
        <line x1="7.5" y1="9" x2="10.5" y2="9" />
      </>
    ),
  },
  {
    href: "/settings",
    label: "Settings",
    icon: (
      <>
        <circle cx="9" cy="9" r="2.6" />
        <path d="M9 2.4v1.7M9 13.9v1.7M15.6 9h-1.7M4.1 9H2.4M13.7 4.3l-1.2 1.2M5.5 12.5l-1.2 1.2M13.7 13.7l-1.2-1.2M5.5 5.5 4.3 4.3" />
      </>
    ),
  },
  {
    href: "/docs",
    label: "Docs",
    icon: (
      <>
        <path d="M2.8 3.8h4.4A1.8 1.8 0 0 1 9 5.6v9a1.5 1.5 0 0 0-1.5-1.5H2.8z" />
        <path d="M15.2 3.8h-4.4A1.8 1.8 0 0 0 9 5.6v9a1.5 1.5 0 0 1 1.5-1.5h4.7z" />
      </>
    ),
  },
];

const adminItem = {
  href: "/admin",
  label: "Admin",
  icon: (
    <>
      <path d="M9 2.5 14.5 5v4c0 3.2-2.3 5.6-5.5 6.5C5.8 14.6 3.5 12.2 3.5 9V5z" />
      <path d="M6.8 9l1.6 1.6L11.4 7.4" />
    </>
  ),
};

/**
 * Whether a sidebar link matches the current route. Sections own their sub-pages (/docs/mcp lights
 * Docs), /profile redirects to /@handle so the own-handle page lights Profile, and the two
 * /settings links split on ?tab=api.
 */
function isNavActive(href: string, pathname: string, tab: string | null, ownHandle: string | null): boolean {
  const [path, query] = href.split("?");
  if (path === "/settings") {
    if (pathname !== "/settings") return false;
    const wantTab = new URLSearchParams(query ?? "").get("tab");
    return wantTab ? tab === wantTab : tab !== "api";
  }
  if (path === "/") return pathname === "/";
  if (path === "/profile" && ownHandle && decodeURIComponent(pathname) === `/@${ownHandle}`) return true;
  return pathname === path || pathname.startsWith(`${path}/`);
}

const NavIcon = ({ children, size = 19 }: { children: ReactNode; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ flex: "0 0 auto" }}>
    {children}
  </svg>
);

const menuItemStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  width: "100%",
  height: "38px",
  padding: "0 12px",
  borderRadius: "9px",
  background: "transparent",
  color: "var(--ink)",
  fontSize: "13.5px",
  fontWeight: 500,
  textAlign: "left",
  cursor: "pointer",
};

function AccountMenu() {
  const { profile, signedIn, sessionReady, openAuth, showToast } = useShell();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // The menu navigates with router.push, which does not prefetch the way <Link> does.
  const profileHref = profile.handleSet ? `/@${profile.handle}` : "/profile";
  useEffect(() => {
    if (!signedIn) return;
    for (const href of [profileHref, "/my-games", "/settings"]) router.prefetch(href);
  }, [signedIn, profileHref, router]);

  const initials = profile.name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const circle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "36px",
    height: "36px",
    flex: "0 0 auto",
    borderRadius: "50%",
    overflow: "hidden",
    background: "#3d3d46",
    color: "#f1f1f1",
    fontSize: "12.5px",
    fontWeight: 600,
    cursor: "pointer",
  };

  if (!sessionReady) return <span aria-hidden="true" style={{ ...circle, background: "var(--chip)", cursor: "default" }} />;

  if (!signedIn) {
    return (
      <button
        onClick={() => openAuth("signin")}
        style={{
          display: "flex",
          alignItems: "center",
          height: "36px",
          padding: "0 14px",
          flex: "0 0 auto",
          borderRadius: "18px",
          background: "var(--ink)",
          color: "var(--ink-invert)",
          fontSize: "13.5px",
          fontWeight: 600,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        Sign in
      </button>
    );
  }

  const signOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await createClient().auth.signOut();
      // Full page load so no page cached while signed in survives; other tabs follow via auth-sync.tsx.
      window.location.assign("/");
    } catch {
      showToast("Could not sign out. Try again.");
      setSigningOut(false);
    }
  };

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <div ref={wrapRef} style={{ position: "relative", flex: "0 0 auto" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        style={circle}
      >
        {profile.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- avatar URLs come from Supabase storage
          <img src={profile.avatarUrl} alt="" width={36} height={36} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        ) : (
          initials || "?"
        )}
      </button>
      {open ? (
        <div
          role="menu"
          style={{
            ...bpanel,
            position: "absolute",
            right: 0,
            top: "44px",
            zIndex: 60,
            width: "200px",
            padding: "6px",
            background: "var(--panel-2)",
            boxShadow: "0 20px 60px rgba(0,0,0,0.45)",
            animation: "hbRise 160ms ease-out both",
          }}
        >
          <div style={{ padding: "8px 12px 10px" }}>
            <div style={{ fontSize: "13.5px", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{profile.name}</div>
            {profile.handle ? (
              <div style={{ marginTop: "2px", fontFamily: mono, fontSize: "10.5px", color: "var(--ink-5)" }}>@{profile.handle}</div>
            ) : null}
          </div>
          <div style={{ height: "1px", margin: "0 6px 6px", background: "var(--chip)" }} />
          <button role="menuitem" className="hb-row" onClick={() => go(profileHref)} style={menuItemStyle}>
            Profile
          </button>
          <button role="menuitem" className="hb-row" onClick={() => go("/my-games")} style={menuItemStyle}>
            My games
          </button>
          <button role="menuitem" className="hb-row" onClick={() => go("/settings")} style={menuItemStyle}>
            Settings
          </button>
          {profile.isAdmin ? (
            <button role="menuitem" className="hb-row" onClick={() => go("/admin")} style={menuItemStyle}>
              Admin panel
            </button>
          ) : null}
          <div style={{ height: "1px", margin: "6px", background: "var(--chip)" }} />
          <button role="menuitem" className="hb-row" onClick={signOut} disabled={signingOut} style={{ ...menuItemStyle, color: "var(--ink-3)" }}>
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

const bellIcon = (
  <>
    <path d="M4.5 7.5a4.5 4.5 0 0 1 9 0c0 3 1 4.5 1 4.5h-11s1-1.5 1-4.5z" />
    <path d="M7.5 14.5a1.6 1.6 0 0 0 3 0" />
  </>
);
const moonIcon = <path d="M14.5 11.2A6 6 0 0 1 6.8 3.5a6 6 0 1 0 7.7 7.7z" />;
const sunIcon = (
  <>
    <circle cx="9" cy="9" r="3.2" />
    <path d="M9 2v1.6M9 14.4V16M16 9h-1.6M3.6 9H2M13.9 4.1l-1.1 1.1M5.2 12.8l-1.1 1.1M13.9 13.9l-1.1-1.1M5.2 5.2 4.1 4.1" />
  </>
);

const unreadBadge: CSSProperties = {
  minWidth: "16px",
  height: "16px",
  padding: "0 4px",
  borderRadius: "8px",
  background: "var(--pos)",
  color: "#fff",
  fontFamily: mono,
  fontSize: "9.5px",
  fontWeight: 600,
  lineHeight: "16px",
  textAlign: "center",
};

/**
 * Responsive bits are classes (hb-hdr, hb-search, hb-desk-only in globals.css), not `mobile` branches,
 * so phones get the compact header straight from the server HTML. On phones the theme toggle and
 * notifications move into the drawer.
 */
function Header() {
  const { toggleSidebar, openSearch, openModal, light, toggleTheme, unread } = useShell();

  return (
    <header
      className="hb-hdr"
      style={{
        ...bpanel,
        position: "sticky",
        top: "12px",
        zIndex: 40,
        display: "flex",
        alignItems: "center",
        margin: "12px 12px 0",
        color: "var(--ink)",
      }}
    >
      <button onClick={toggleSidebar} aria-label="Toggle sidebar" style={{ ...iconBtn, position: "relative" }}>
        <MenuIcon />
        {unread > 0 ? (
          <span
            className="hb-mobile-only"
            aria-hidden="true"
            style={{ position: "absolute", right: "7px", top: "7px", width: "8px", height: "8px", borderRadius: "50%", background: "var(--pos)" }}
          />
        ) : null}
      </button>
      <Link href="/" style={{ display: "flex", alignItems: "center", gap: "9px", color: "var(--ink)" }}>
        <HabivMark />
        <span style={{ fontSize: "19px", fontWeight: 600, letterSpacing: "-0.03em" }}>habiv</span>
        <span
          style={{
            fontFamily: mono,
            fontSize: "9.5px",
            letterSpacing: "0.1em",
            color: "var(--ink-5)",
            alignSelf: "flex-start",
            marginTop: "2px",
          }}
        >
          BETA
        </span>
      </Link>
      <div style={{ flex: 1, display: "flex", justifyContent: "flex-end", minWidth: 0 }}>
        <button onClick={openSearch} aria-label="Search" className="hb-search">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" style={{ flex: "0 0 auto" }}>
            <circle cx="7" cy="7" r="4.5" />
            <line x1="10.5" y1="10.5" x2="14" y2="14" />
          </svg>
          <span className="hb-desk-only" style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            Search games, creators, models
          </span>
        </button>
      </div>
      <Link
        href="/publish"
        className="hb-desk-only"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          height: "38px",
          padding: "0 16px",
          borderRadius: "19px",
          background: "var(--chip)",
          color: "var(--ink)",
          fontSize: "14px",
          fontWeight: 500,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" stroke="currentColor" strokeWidth="1.8">
          <line x1="7" y1="2" x2="7" y2="12" />
          <line x1="2" y1="7" x2="12" y2="7" />
        </svg>
        Create
      </Link>
      <button
        onClick={toggleTheme}
        aria-label={light ? "Switch to dark theme" : "Switch to light theme"}
        className="hb-desk-only"
        style={{ ...iconBtn, width: "38px", height: "38px" }}
      >
        <NavIcon size={17}>{light ? moonIcon : sunIcon}</NavIcon>
      </button>
      <button
        onClick={() => openModal("notif")}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        className="hb-desk-only"
        style={{ ...iconBtn, position: "relative", width: "38px", height: "38px" }}
      >
        <NavIcon size={18}>{bellIcon}</NavIcon>
        {unread > 0 ? (
          <span style={{ ...unreadBadge, position: "absolute", right: "4px", top: "4px" }}>{unread > 99 ? "99+" : unread}</span>
        ) : null}
      </button>
      <AccountMenu />
    </header>
  );
}

function Sidebar() {
  const { drawerMode, collapsed, sidebarOpen, toggleSidebar, closeSidebar, theatre, mobile, light, toggleTheme, openModal, unread, pinned, builtThisWeek, totalPlays, profile } =
    useShell();
  const pathname = usePathname() ?? "";
  const tab = useSearchParams().get("tab");
  const active = (href: string) => isNavActive(href, pathname, tab, profile.handleSet ? profile.handle : null);
  const secondary = profile.isAdmin ? [...secondaryItems, adminItem] : secondaryItems;

  const sidebarStyle: CSSProperties = drawerMode
    ? {
        position: "fixed",
        top: "12px",
        left: "12px",
        bottom: "12px",
        zIndex: 70,
        display: "flex",
        flexDirection: "column",
        width: mobile ? "82vw" : "250px",
        maxWidth: "300px",
        overflowY: "auto",
        borderRadius: "18px",
        padding: "0 10px 16px",
        background: light ? "rgba(252,252,254,0.98)" : "rgba(26,27,32,0.98)",
        backdropFilter: "blur(44px) saturate(175%)",
        WebkitBackdropFilter: "blur(44px) saturate(175%)",
        boxShadow: sidebarOpen ? "18px 0 50px rgba(0,0,0,0.4)" : "none",
        transform: sidebarOpen ? "translateX(0)" : "translateX(calc(-100% - 20px))",
        transition: "transform 220ms cubic-bezier(.22,.8,.3,1)",
        color: "var(--ink)",
      }
    : {
        ...bpanel,
        position: "sticky",
        top: "84px",
        display: "flex",
        flexDirection: "column",
        width: theatre ? "0px" : collapsed ? "72px" : "228px",
        flex: "0 0 auto",
        height: "calc(100vh - 96px)",
        overflowY: "auto",
        overflowX: "hidden",
        opacity: theatre ? 0 : 1,
        padding: theatre ? 0 : "10px",
        transition: "width 300ms cubic-bezier(.22,.8,.3,1), opacity 200ms ease, padding 300ms ease",
        color: "var(--ink)",
      };

  const showLabels = drawerMode || !collapsed;
  const onNavigate = () => {
    if (drawerMode) closeSidebar();
  };

  return (
    <>
      {drawerMode && sidebarOpen ? (
        <div onClick={toggleSidebar} style={{ position: "fixed", inset: 0, zIndex: 65, background: "var(--scrim)" }} />
      ) : null}
      {/* The rail is hidden on phones by CSS too, since the server renders it before `mobile` is known. */}
      <aside className={drawerMode ? undefined : "hb-desk-only"} style={sidebarStyle}>
        {drawerMode ? (
          <div style={{ display: "flex", alignItems: "center", gap: "12px", height: "60px", marginBottom: "6px" }}>
            <button onClick={toggleSidebar} aria-label="Close sidebar" style={iconBtn}>
              <MenuIcon />
            </button>
            <Link href="/" onClick={onNavigate} style={{ display: "flex", alignItems: "center", gap: "9px", color: "var(--ink)" }}>
              <HabivMark size={20} />
              <span style={{ fontSize: "18px", fontWeight: 600, letterSpacing: "-0.03em" }}>habiv</span>
            </Link>
          </div>
        ) : null}

        <nav style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              title={item.label}
              aria-current={active(item.href) ? "page" : undefined}
              style={navStyleFor(active(item.href), !showLabels)}
            >
              <NavIcon>{item.icon}</NavIcon>
              {showLabels ? <span>{item.label}</span> : null}
            </Link>
          ))}
          {/* Phones drop the header bell, so notifications live here. */}
          {mobile ? (
            <button
              onClick={() => {
                closeSidebar();
                openModal("notif");
              }}
              style={navStyleFor(false, false)}
            >
              <NavIcon>{bellIcon}</NavIcon>
              <span style={{ flex: 1 }}>Notifications</span>
              {unread > 0 ? <span style={unreadBadge}>{unread > 99 ? "99+" : unread}</span> : null}
            </button>
          ) : null}
        </nav>

        {showLabels ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <div style={{ height: "1px", margin: "14px 8px", background: "var(--chip)" }} />
            {pinned.length ? (
              <>
              <div style={{ padding: "6px 12px 8px", fontSize: "15px", fontWeight: 600 }}>Featured</div>
              {pinned.map((g) => {
                return (
                  <Link
                    key={g.id}
                    href={g.url}
                    onClick={onNavigate}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      height: "42px",
                      padding: "0 12px",
                      borderRadius: "10px",
                      color: "var(--ink)",
                      fontSize: "13.5px",
                      width: "100%",
                    }}
                  >
                    <div
                      style={{
                        width: "30px",
                        height: "22px",
                        flex: "0 0 auto",
                        borderRadius: "4px",
                        backgroundImage: `url("${art(g, 160)}")`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                        backgroundColor: "var(--panel)",
                      }}
                    />
                    <span style={{ flex: 1, textAlign: "left", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {g.title}
                    </span>
                  </Link>
                );
              })}
                <div style={{ height: "1px", margin: "14px 8px", background: "var(--chip)" }} />
              </>
            ) : null}
            {secondary.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                onClick={onNavigate}
                aria-current={active(item.href) ? "page" : undefined}
                style={navStyleFor(active(item.href), false)}
              >
                <NavIcon>{item.icon}</NavIcon>
                <span>{item.label}</span>
              </Link>
            ))}
            {mobile ? (
              <button onClick={toggleTheme} style={navStyleFor(false, false)}>
                <NavIcon>{light ? moonIcon : sunIcon}</NavIcon>
                <span>{light ? "Dark theme" : "Light theme"}</span>
              </button>
            ) : null}
            {/* Pinned to the bottom of the full-height sidebar; flows after the links when they overflow. */}
            <div style={{ marginTop: "auto" }}>
              <div style={{ display: "flex", margin: "14px 2px 2px", padding: "10px 0", borderRadius: "12px", background: "var(--chip)" }}>
                {[
                  { value: builtThisWeek, label: "Games" },
                  { value: totalPlays, label: "Total runs" },
                ].map((s, i) => (
                  <div key={s.label} style={{ flex: 1, minWidth: 0, padding: "0 12px", borderLeft: i ? "1px solid var(--chip-2)" : "none" }}>
                    <div style={{ fontSize: "16px", fontWeight: 600, lineHeight: 1.2, letterSpacing: "-0.02em", color: "var(--ink)" }}>
                      {s.value.toLocaleString()}
                    </div>
                    <div style={{ marginTop: "2px", fontFamily: mono, fontSize: "9.5px", letterSpacing: "0.08em", textTransform: "uppercase", whiteSpace: "nowrap", color: "var(--ink-5)" }}>
                      {s.label}
                    </div>
                  </div>
                ))}
              </div>
              {/* Native <details>: no state, and the links stay in the HTML for crawlers while collapsed. */}
              <style>{`.hb-legal-menu>summary{list-style:none}.hb-legal-menu>summary::-webkit-details-marker{display:none}.hb-legal-menu[open] .hb-legal-chev{transform:rotate(180deg)}`}</style>
              <details className="hb-legal-menu" style={{ margin: "8px 2px 0" }}>
                <summary
                  className="hb-row"
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: "36px", padding: "0 12px", borderRadius: "9px", cursor: "pointer", fontSize: "13px", color: "var(--ink-4)" }}
                >
                  About &amp; legal
                  <svg className="hb-legal-chev" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ transition: "transform 160ms ease" }}>
                    <polyline points="3,4.5 6,7.5 9,4.5" />
                  </svg>
                </summary>
                <div style={{ display: "flex", flexDirection: "column", padding: "2px 0 4px" }}>
                  {legalPages.map((p) => (
                    <Link
                      key={p.href}
                      href={p.href}
                      onClick={onNavigate}
                      className="hb-row"
                      style={{ display: "block", padding: "7px 12px", borderRadius: "8px", fontSize: "13px", color: pathname === p.href ? "var(--ink)" : "var(--ink-5)" }}
                    >
                      {p.label}
                    </Link>
                  ))}
                </div>
              </details>
              <div style={{ height: "1px", margin: "10px 8px", background: "var(--chip)" }} />
              <div style={{ padding: "2px 12px 6px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12.5px", fontWeight: 600, letterSpacing: "-0.02em", color: "var(--ink-4)" }}>
                  <HabivMark size={12} />
                  habiv
                  <span style={{ fontFamily: mono, fontSize: "9px", fontWeight: 400, letterSpacing: "0.1em", color: "var(--ink-6)" }}>BETA</span>
                </div>
                <div style={{ marginTop: "6px", fontSize: "11.5px", color: "var(--ink-6)" }}>© 2026 Habiv</div>
              </div>
            </div>
          </div>
        ) : null}
      </aside>
    </>
  );
}

/** Background: a home gradient, or on a watch page a neutral top wash, plus slow blooms. */
function Ambient() {
  const { light } = useShell();
  const pathname = usePathname();
  const isWatch = isWatchPath(pathname);

  const base = isWatch
    ? `radial-gradient(110% 62% at 50% -8%, ${light ? "oklch(0.82 0.01 260 / 0.5)" : "oklch(0.58 0.02 260 / 0.55)"} 0%, rgba(15,15,15,0) 60%), radial-gradient(80% 50% at 88% 18%, ${light ? "oklch(0.86 0.01 260 / 0.38)" : "oklch(0.52 0.02 260 / 0.3)"} 0%, rgba(15,15,15,0) 62%), var(--amb-base)`
    : "var(--amb-home)";

  const bloom = (style: CSSProperties): CSSProperties => ({ position: "absolute", borderRadius: "50%", ...style });

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, background: base, transition: "background 240ms ease" }} />
      <div
        className="hb-bloom"
        style={bloom({
          left: "-12%",
          top: "-14%",
          width: "58%",
          height: "62%",
          background: light ? "oklch(0.98 0 0 / 0.85)" : "oklch(0.26 0 0 / 0.75)",
          filter: "blur(120px)",
          animation: "hbFloatA 26s ease-in-out infinite",
        })}
      />
      <div
        className="hb-bloom"
        style={bloom({
          right: "-14%",
          top: "22%",
          width: "54%",
          height: "58%",
          background: light ? "oklch(0.93 0 0 / 0.8)" : "oklch(0.2 0 0 / 0.8)",
          filter: "blur(130px)",
          animation: "hbFloatB 34s ease-in-out infinite",
        })}
      />
      <div
        className="hb-bloom"
        style={bloom({
          left: "26%",
          bottom: "-22%",
          width: "62%",
          height: "60%",
          background: light ? "oklch(1 0 0 / 0.75)" : "oklch(0.22 0 0 / 0.7)",
          filter: "blur(150px)",
          animation: "hbFloatC 44s ease-in-out infinite",
        })}
      />
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { theme, drawerMode } = useShell();

  return (
    <div
      className="hb-theme"
      data-theme={theme}
      style={{ position: "relative", minHeight: "100vh", background: "var(--bg)", color: "var(--ink)" }}
    >
      <Ambient />
      <Header />
      {/* The drawer lives outside the zIndex:1 content layer so it can stack above the sticky header. */}
      {drawerMode ? <Sidebar /> : null}
      <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "flex-start", gap: "12px", padding: "12px" }}>
        {drawerMode ? null : <Sidebar />}
        <main style={{ flex: 1, minWidth: 0, paddingBottom: "12px" }}>{children}</main>
      </div>
      <Overlays />
    </div>
  );
}
