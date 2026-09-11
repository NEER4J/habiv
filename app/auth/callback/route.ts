import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolvePostSignInPath } from "@/lib/auth/post-sign-in";

/** OAuth / PKCE return leg: exchanges the code for a session, then routes to onboarding or `next`. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");
  const providerError = searchParams.get("error_description") ?? searchParams.get("error");

  if (providerError) {
    return NextResponse.redirect(new URL(`/?auth=signin&error=${encodeURIComponent(providerError)}`, origin));
  }
  if (!code) {
    return NextResponse.redirect(new URL("/?auth=signin&error=Missing%20authorization%20code", origin));
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL(`/?auth=signin&error=${encodeURIComponent(error.message)}`, origin));
  }
  const path = await resolvePostSignInPath(supabase, next, data.user);
  return NextResponse.redirect(new URL(path, origin));
}
