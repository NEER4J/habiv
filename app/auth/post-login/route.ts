import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolvePostSignInPath } from "@/lib/auth/post-sign-in";

/** Password sign-in lands here (the browser already holds the session cookies). */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.redirect(new URL("/?auth=signin", origin));
  }
  const path = await resolvePostSignInPath(supabase, searchParams.get("next"), data.user);
  return NextResponse.redirect(new URL(path, origin));
}
