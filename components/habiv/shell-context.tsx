"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { bentoCols } from "@/lib/habiv/bento";
import { applyTheme, LIGHT_CLASS, type Theme } from "@/lib/habiv/theme";
import { toggleSave } from "@/lib/actions/social";
import { avatarSeedOf } from "@/lib/site";
import type { Game } from "@/lib/habiv/games";

/** "shareScore" is the share modal opened on the viewer's own result instead of the game. */
export type ModalKind = "signin" | "share" | "shareScore" | "remix" | "report" | "notif" | null;
export type AuthMode = "signin" | "signup" | "reset" | "newpassword";
export type AuthIntent = { mode: AuthMode; next: string | null; error: string | null };
export type { Theme };

/** The signed-in user as the shell sees them. `id` is null for guests. */
export type Profile = {
  id: string | null;
  name: string;
  handle: string;
  bio: string;
  avatarUrl: string | null;
  isAdmin: boolean;
  isCreator: boolean;
  handleSet: boolean;
};

export const guestProfile: Profile = {
  id: null,
  name: "Guest",
  handle: "",
  bio: "",
  avatarUrl: null,
  isAdmin: false,
  isCreator: false,
  handleSet: false,
};

/** Kept for older imports; guests render as this. */
export const defaultProfile = guestProfile;

/** What the server hands the shell after reading the session (see session-bridge.tsx). */
export type ShellSession = {
  profile: Profile | null;
  savedIds: string[];
  unread: number;
  /** Featured games for the sidebar rail (same for everyone). */
  pinned: Game[];
  /** Games published in the last 7 days. */
  builtThisWeek: number;
  /** Lifetime plays across all live games. */
  totalPlays: number;
};

type ShellValue = {
  vw: number;
  cols: number;
  mobile: boolean;
  tablet: boolean;
  /** Watch pages and small screens turn the sidebar into an overlay drawer. */
  drawerMode: boolean;
  collapsed: boolean;
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  closeSidebar: () => void;
  theme: Theme;
  light: boolean;
  toggleTheme: () => void;
  theatre: boolean;
  setTheatre: (v: boolean) => void;
  searchOpen: boolean;
  openSearch: () => void;
  closeSearch: () => void;
  query: string;
  setQuery: (v: string) => void;
  modal: ModalKind;
  openModal: (m: Exclude<ModalKind, null>) => void;
  closeModal: () => void;
  /** Game the share / remix / report modals talk about. */
  modalGameId: string | null;
  setModalGameId: (id: string | null) => void;
  toast: string | null;
  showToast: (msg: string) => void;
  savedIds: string[];
  isSaved: (id: string) => boolean;
  /** Optimistic save toggle backed by the saves table. Opens sign-in for guests. */
  toggleSaved: (id: string) => void;
  /** Guest-safe profile (guestProfile when signed out). */
  profile: Profile;
  setProfile: (p: Profile) => void;
  signedIn: boolean;
  /** True once the server session has been applied (before that, treat auth state as unknown). */
  sessionReady: boolean;
  setSession: (s: ShellSession) => void;
  /** Returns true when signed in; otherwise opens the sign-in modal and returns false. */
  requireAuth: () => boolean;
  /** Opens the auth modal in a given mode; `next` is where to go after signing in. */
  openAuth: (mode?: AuthMode, next?: string | null) => void;
  authIntent: AuthIntent;
  unread: number;
  setUnread: (n: number) => void;
  /** Seed for the generated avatar when the user has no image. */
  avatarSeed: string;
  setAvatarSeed: (seed: string) => void;
  pinned: Game[];
  builtThisWeek: number;
  totalPlays: number;
};

const ShellContext = createContext<ShellValue | null>(null);

export function useShell() {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error("useShell must be used inside <ShellProvider>");
  return ctx;
}

const WATCH_RE = /^\/(g\/[^/]+|@[^/]+\/[^/]+)/;

/**
 * Whether a path is a game page. The server can hand the path over percent-encoded
 * (/%40handle/slug), so match the decoded form or the first paint shows the docked sidebar.
 */
export function isWatchPath(pathname: string | null): boolean {
  let path = pathname ?? "";
  try {
    path = decodeURIComponent(path);
  } catch {
    // Malformed escapes: match the raw path.
  }
  return WATCH_RE.test(path);
}

export function ShellProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [vw, setVw] = useState(1440);
  const [authIntent, setAuthIntent] = useState<AuthIntent>({ mode: "signin", next: null, error: null });
  // Separate flags so the drawer always starts shut (no open-then-slide-away flash after hydration).
  const [railOpen, setRailOpen] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>("dark");
  const [theatre, setTheatre] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState<ModalKind>(null);
  const [modalGameId, setModalGameId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [profile, setProfileState] = useState<Profile>(guestProfile);
  const [sessionReady, setSessionReady] = useState(false);
  const [unread, setUnread] = useState(0);
  const [avatarSeed, setAvatarSeed] = useState("hv-start");
  const [pinned, setPinned] = useState<Game[]>([]);
  const [builtThisWeek, setBuiltThisWeek] = useState(0);
  const [totalPlays, setTotalPlays] = useState(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // The inline script in app/layout.tsx applies the stored theme before first paint.
  useEffect(() => {
    setTheme(document.documentElement.classList.contains(LIGHT_CLASS) ? "light" : "dark");
  }, []);

  const isWatch = isWatchPath(pathname);
  const mobile = vw < 760;
  const tablet = vw >= 760 && vw < 1100;
  const drawerMode = mobile || isWatch;
  const collapsed = !drawerMode && (tablet || !railOpen);

  useEffect(() => {
    setDrawerOpen(false);
    setRailOpen(true);
    setTheatre(false);
  }, [isWatch, mobile]);

  useEffect(() => {
    setSearchOpen(false);
    setQuery("");
    setModal(null);
  }, [pathname]);

  // ?auth=signin|signup|reset|newpassword&next=/path&error=... opens the modal (used by redirects and email links).
  useEffect(() => {
    const auth = searchParams?.get("auth");
    if (!auth) return;
    const mode: AuthMode = auth === "signup" || auth === "reset" || auth === "newpassword" ? auth : "signin";
    const next = searchParams.get("next");
    const error = searchParams.get("error");
    setAuthIntent({ mode, next: next && next.startsWith("/") ? next : null, error });
    setModal("signin");
    const rest = new URLSearchParams(searchParams.toString());
    rest.delete("auth");
    rest.delete("next");
    rest.delete("error");
    const qs = rest.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [searchParams, pathname, router]);

  const showToast = useCallback((msg: string) => {
    clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }, []);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setQuery("");
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (searchOpen) closeSearch();
        else if (modal) setModal(null);
        else if (theatre) setTheatre(false);
      } else if (e.key === "/" && !searchOpen) {
        const el = document.activeElement;
        const typing = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
        if (typing) return;
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [searchOpen, modal, theatre, closeSearch]);

  const setSession = useCallback((s: ShellSession) => {
    setProfileState(s.profile ?? guestProfile);
    setSavedIds(s.savedIds);
    setUnread(s.unread);
    setPinned(s.pinned);
    setBuiltThisWeek(s.builtThisWeek);
    setTotalPlays(s.totalPlays);
    if (s.profile?.handle) setAvatarSeed(avatarSeedOf(s.profile.avatarUrl) ?? s.profile.handle);
    setSessionReady(true);
  }, []);

  const signedIn = profile.id !== null;

  const openAuth = useCallback((mode: AuthMode = "signin", next: string | null = null) => {
    setAuthIntent({ mode, next, error: null });
    setModal("signin");
  }, []);

  const requireAuth = useCallback(() => {
    if (profile.id) return true;
    setAuthIntent({ mode: "signin", next: null, error: null });
    setModal("signin");
    return false;
  }, [profile.id]);

  const toggleSaved = useCallback(
    (id: string) => {
      if (!profile.id) {
        setModal("signin");
        return;
      }
      const on = !savedIds.includes(id);
      setSavedIds((prev) => (on ? Array.from(new Set([...prev, id])) : prev.filter((x) => x !== id)));
      showToast(on ? "Saved to your list" : "Removed from saved");
      void toggleSave(id).then((res) => {
        if (!res.ok) {
          setSavedIds((prev) => (on ? prev.filter((x) => x !== id) : Array.from(new Set([...prev, id]))));
          showToast(res.error);
        } else if (pathname === "/saved") {
          router.refresh();
        }
      });
    },
    [profile.id, savedIds, showToast, pathname, router],
  );

  const value = useMemo<ShellValue>(
    () => ({
      vw,
      cols: bentoCols(vw),
      mobile,
      tablet,
      drawerMode,
      collapsed,
      sidebarOpen: drawerMode ? drawerOpen : !collapsed,
      toggleSidebar: () => (drawerMode ? setDrawerOpen : setRailOpen)((v) => !v),
      closeSidebar: () => setDrawerOpen(false),
      theme,
      light: theme === "light",
      toggleTheme: () => {
        const next: Theme = theme === "light" ? "dark" : "light";
        applyTheme(next);
        setTheme(next);
      },
      theatre,
      setTheatre,
      searchOpen,
      openSearch: () => setSearchOpen(true),
      closeSearch,
      query,
      setQuery,
      modal,
      openModal: (m) => setModal(m),
      closeModal: () => setModal(null),
      modalGameId,
      setModalGameId,
      toast,
      showToast,
      savedIds,
      isSaved: (id: string) => savedIds.includes(id),
      toggleSaved,
      profile,
      setProfile: setProfileState,
      signedIn,
      sessionReady,
      setSession,
      requireAuth,
      openAuth,
      authIntent,
      unread,
      setUnread,
      avatarSeed,
      setAvatarSeed,
      pinned,
      builtThisWeek,
      totalPlays,
    }),
    [vw, mobile, tablet, drawerMode, collapsed, drawerOpen, theme, theatre, searchOpen, closeSearch, query, modal, modalGameId, toast, showToast, savedIds, toggleSaved, profile, signedIn, sessionReady, setSession, requireAuth, openAuth, authIntent, unread, avatarSeed, pinned, builtThisWeek, totalPlays],
  );

  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}
