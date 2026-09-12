import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolvePostSignInPath } from "@/lib/auth/post-sign-in";

/**
 * Password sign-in headed to another page lands here (the browser already holds the session
 * cookies). getClaims checks the token locally, so this hop adds no auth round trip.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) {
    return NextResponse.redirect(new URL("/?auth=signin", origin));
  }
  const path = await resolvePostSignInPath(supabase, searchParams.get("next"));
  return NextResponse.redirect(new URL(path, origin));
}
