import { gameCard, loadCardGame } from "@/lib/og/cards";

/** Social card for a game link; the game page sets it as og:image. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return gameCard(await loadCardGame(id));
}
