import { NextResponse } from "next/server";
import { loadCardGame, scoreCard } from "@/lib/og/cards";
import { readScoreShare } from "@/lib/share/score";

/** Social card for a shared score (?s= on a game link); also the image the Share modal saves. */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const share = readScoreShare(decodeURIComponent(token));
  if (!share) return new NextResponse("Not found", { status: 404 });
  return scoreCard(await loadCardGame(share.gameId), share);
}
