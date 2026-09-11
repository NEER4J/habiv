import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolvePostSignInPath } from "@/lib/auth/post-sign-in";

/** Email confirmation / magic link / recovery leg. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next");

  if (!token_hash || !type) {
    return NextResponse.redirect(new URL("/?auth=signin&error=No%20token%20hash%20or%20type", origin));
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ type, token_hash });
  if (error) {
    return NextResponse.redirect(new URL(`/?auth=signin&error=${encodeURIComponent(error.message)}`, origin));
  }
  if (type === "recovery") {
    return NextResponse.redirect(new URL(`/?auth=newpassword&next=${encodeURIComponent(next && next.startsWith("/") ? next : "/")}`, origin));
  }
  const path = await resolvePostSignInPath(supabase, next, data.user);
  return NextResponse.redirect(new URL(path, origin));
}
