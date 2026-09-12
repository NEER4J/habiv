import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasEnvVars } from "../utils";

/** Creator surfaces need a session. Browsing and playing never do. */
const PROTECTED_PREFIXES = ["/publish", "/my-games", "/settings", "/onboarding", "/admin", "/experiment", "/profile", "/saved", "/mcp/"];

/** First-party anonymous player id; read by the player and stamped server-side on events. */
export const PLAYER_COOKIE = "hv_pid";
const PLAYER_COOKIE_MAX_AGE = 400 * 24 * 60 * 60;
/** Holds the user id whose handle is known to be set (see the onboarding check below). */
const HANDLE_SET_COOKIE = "hv_hs";
const UUID_RE =/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function ensurePlayerCookie(request: NextRequest, response: NextResponse) {
  const existing = request.cookies.get(PLAYER_COOKIE)?.value;
  if (existing && UUID_RE.test(existing)) return;
  response.cookies.set(PLAYER_COOKIE, crypto.randomUUID(), {
    maxAge: PLAYER_COOKIE_MAX_AGE,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    httpOnly: false,
  });
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  // Without env vars nothing can be protected; make that loud in production.
  if (!hasEnvVars) {
    if (process.env.NODE_ENV === "production") {
      console.error("Supabase env vars missing: auth gating is disabled");
    }
    ensurePlayerCookie(request, supabaseResponse);
    return supabaseResponse;
  }

  // With Fluid compute, don't put this client in a global environment
  // variable. Always create a new one on each request.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not run code between createServerClient and
  // supabase.auth.getClaims(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  // IMPORTANT: If you remove getClaims() and you use server-side rendering
  // with the Supabase client, your users may be randomly logged out.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;

  const pathname = request.nextUrl.pathname;
  const needsAuth = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));

  if (needsAuth && !user) {
    // No login page: send them home with the auth modal open and a `next` to come back to.
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = `?auth=signin&next=${encodeURIComponent(pathname + request.nextUrl.search)}`;
    const redirect = NextResponse.redirect(url);
    ensurePlayerCookie(request, redirect);
    return redirect;
  }

  // Force handle onboarding on creator routes only. handle_set never goes back to false, so once
  // it is true we remember that per user in a cookie and skip the query on every later request.
  if (needsAuth && user && !pathname.startsWith("/onboarding") && request.cookies.get(HANDLE_SET_COOKIE)?.value !== user.sub) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("handle_set")
      .eq("id", user.sub)
      .maybeSingle();
    if (profile?.handle_set) {
      supabaseResponse.cookies.set(HANDLE_SET_COOKIE, user.sub, {
        maxAge: PLAYER_COOKIE_MAX_AGE,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
      });
    }
    if (profile && !profile.handle_set) {
      const url = request.nextUrl.clone();
      url.pathname = "/onboarding";
      url.search = `?next=${encodeURIComponent(pathname + request.nextUrl.search)}`;
      const redirect = NextResponse.redirect(url);
      for (const c of supabaseResponse.cookies.getAll()) redirect.cookies.set(c);
      ensurePlayerCookie(request, redirect);
      return redirect;
    }
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is (cookies intact).
  // Adding our own cookie to it is fine; replacing the object is not.
  ensurePlayerCookie(request, supabaseResponse);
  return supabaseResponse;
}
