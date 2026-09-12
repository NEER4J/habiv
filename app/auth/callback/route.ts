import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolvePostSignInPath } from "@/lib/auth/post-sign-in";
import { OAUTH_POPUP_CHANNEL, POPUP_ID_RE, type OAuthPopupResult } from "@/lib/auth/popup";

/**
 * Where a sign-in popup ends: hands the result to the tab that opened it and closes. If the window
 * can't close (it wasn't a popup after all), it links on instead.
 */
function popupPage(result: OAuthPopupResult): NextResponse {
  // Escaped so nothing in the result (provider error text) can end the script tag.
  const data = JSON.stringify(result).replace(/</g, "\\u003c");
  const channel = JSON.stringify(OAUTH_POPUP_CHANNEL);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Signing in · habiv</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;box-sizing:border-box;background:#050505;color:#ededed;font:15px/1.6 system-ui,sans-serif;text-align:center}a{color:inherit}</style></head><body><p id="m">Signing you in…</p><script>(function(){var d=${data};try{var c=new BroadcastChannel(${channel});c.postMessage(d);c.close()}catch(e){}window.close();var m=document.getElementById("m");if(d.error){m.textContent="Sign-in failed: "+d.error+". Close this window and try again."}else{m.textContent="You're signed in. ";var a=document.createElement("a");a.href=d.to;a.textContent="Continue to habiv";m.appendChild(a)}})();</script></body></html>`;
  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

/**
 * OAuth / PKCE return leg: exchanges the code for a session, then goes to `next` (with profile
 * setup open when there is no handle yet). With ?popup=<id> it ran in a sign-in popup and reports
 * back to the opening tab instead (lib/auth/popup.ts), which updates in place.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");
  const providerError = searchParams.get("error_description") ?? searchParams.get("error");
  const popupParam = searchParams.get("popup");
  const popupId = popupParam && POPUP_ID_RE.test(popupParam) ? popupParam : null;

  const fail = (message: string) =>
    popupId
      ? popupPage({ id: popupId, error: message })
      : NextResponse.redirect(new URL(`/?auth=signin&error=${encodeURIComponent(message)}`, origin));

  if (providerError) return fail(providerError);
  if (!code) return fail("Missing authorization code");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return fail(error.message);
  const path = await resolvePostSignInPath(supabase, next, data.user);
  return popupId ? popupPage({ id: popupId, to: path }) : NextResponse.redirect(new URL(path, origin));
}
