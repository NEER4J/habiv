import { NextResponse, type NextRequest } from "next/server";
import { getGameByShortId } from "@/lib/db/games";

/** Permanent short link: /g/{shortId} -> /@handle/slug. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await getGameByShortId(id);
  if (!g) return NextResponse.redirect(new URL(`/explore?missing=${encodeURIComponent(id)}`, request.url), 302);
  return NextResponse.redirect(new URL(`/@${g.handle}/${g.slug}`, request.url), 308);
}
