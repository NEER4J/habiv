# Habiv — A little closer to nature

An immersive, forest-inspired single-page generative-art toy. A name and mood seed an animated mathematical orbit. Visitors can download a 1600 × 1800 PNG or share a URL that reproduces the same design. No accounts, backend, tracking, or stored visitor data. Names appear in shared URL fragments only when the visitor uses Share.

## Run

- `npm run dev` — local server at http://127.0.0.1:5173 (Python 3 required).
- `npm test` — checks deterministic geometry, finite coordinates, input handling, sharing, export, and animation controls in a simulated DOM.
- `npm run build` — syntax-checks and copies the static site into `dist/`.

No npm dependencies. Google Fonts supplies DM Sans and Manrope; local fallback fonts remain available.

## Concept research

Three candidates: a daily microchallenge, an interactive art toy, and a shareable personal vibe fingerprint. The chosen orbit combines an immediately understandable input, a personal result, and something worth passing along.

- [Neal.fun](https://neal.fun/) — focused interactive web experiments; inspiration for keeping the primary interaction immediate.
- [Silk](https://weavesilk.com/) — interactive generative art with save and sharing controls; inspiration for an expressive, low-friction creative toy.

These examples inform the concept; they do not establish that Habiv will go viral. Test generation-to-share conversion and repeat visits after launch before expanding scope.

## Hosting

Existing GitHub origin is preserved. Sites deployment uses `.openai/hosting.json` and the static `dist/` output. Custom-domain DNS is not configured by this source. Do not place credentials in this repository.

## Forest art direction

Full-screen emerald rainforest, translucent green controls, serif typography, and a slower fern-green generative orbit. Animation pause also stops the background drift; system reduced-motion preferences are respected.

Original background: `assets/forest.jpg`, generated with the built-in imagegen tool and converted to JPEG for delivery.

Generation prompt:

> Use case: photorealistic-natural. Asset type: immersive website hero backdrop, landscape 1536x1024. An immersive photorealistic emerald temperate rainforest, lush ferns and moss, old trees receding into soft green mist, delicate morning sun from the upper right, a tranquil small stream at the lower right. Cinematic, refined natural landscape photography with realistic botanical texture. Wide forest scene, deep layered perspective; dark shaded left third with quiet visual detail suitable for overlaid white website text. Forest and stream form the focal interest across the center and right. Tranquil, soft green mist, delicate morning sunlight from upper right, rich natural emerald greens and shaded moss. No people, no text, no lettering, no watermark, no fantasy objects. Generate one image.
