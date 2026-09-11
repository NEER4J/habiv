import { NextResponse, type NextRequest } from "next/server";

/** Old page URL kept for links in emails and bookmarks; auth now lives in the modal. */
export function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const url = new URL("/", origin);
  url.searchParams.set("auth", "signup");
  const next = searchParams.get("next");
  if (next && next.startsWith("/")) url.searchParams.set("next", next);
  const error = searchParams.get("error");
  if (error) url.searchParams.set("error", error.slice(0, 200));
  return NextResponse.redirect(url, 307);
}
