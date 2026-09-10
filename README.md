# Habiv — YouTube for AI games.

A one-screen, glass-themed coming-soon page for a browser-first marketplace of tiny AI-made games.

Habiv is being shaped as a place to discover, play, remix, and share 10–45 second games. Creators can upload finished games or publish them directly from Codex, Claude Code, and other MCP-ready coding agents.

## Run

- `npm run dev` — local server at http://127.0.0.1:5173.
- `npm test` — checks the single-hero structure, marketplace positioning, MCP copy, and hero asset reference.
- `npm run build` — copies the static site into `dist/`.

The page has no backend, game feed, upload flow, or form behavior yet. This iteration is only the marketplace coming-soon surface.

## Hosting

The project uses `.openai/hosting.json` and the static `dist/` output for deployment. No credentials or external services are required.

## Asset

`assets/tiny-game-hero.png` is an original stylized concept image for the featured-game glass card.
