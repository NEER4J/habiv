import type { ThumbSize } from "./styles";

/**
 * Turns a thumbnail document from lib/thumbs/styles.ts into an image in the browser: the Google
 * Fonts it links are inlined as data URIs, the document goes into an SVG <foreignObject>, and that
 * SVG is drawn onto a canvas. The blob then goes through the normal art upload, so a generated
 * thumbnail is stored and protected exactly like uploaded art.
 */

const fontCss = new Map<string, Promise<string>>();

function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error("Could not read font."));
    r.readAsDataURL(blob);
  });
}

/** The stylesheet at `cssUrl` with every font file swapped for a data URI. Cached per URL. */
function inlinedFonts(cssUrl: string): Promise<string> {
  let p = fontCss.get(cssUrl);
  if (!p) {
    p = (async () => {
      const res = await fetch(cssUrl);
      if (!res.ok) throw new Error("Could not load fonts.");
      const css = await res.text();
      const urls = Array.from(new Set(Array.from(css.matchAll(/url\((https:[^)]+)\)/g), (m) => m[1])));
      const data = await Promise.all(
        urls.map(async (u) => {
          const f = await fetch(u);
          if (!f.ok) throw new Error("Could not load fonts.");
          return blobToDataUri(await f.blob());
        }),
      );
      return urls.reduce((acc, u, i) => acc.split(u).join(data[i]), css);
    })();
    p.catch(() => fontCss.delete(cssUrl));
    fontCss.set(cssUrl, p);
  }
  return p;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not render the thumbnail."));
    img.src = src;
  });
}

/** Renders a thumbnail document to a WebP (or JPEG where WebP encoding is unsupported). */
export async function rasterizeThumb(html: string, size: ThumbSize): Promise<Blob> {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const links = Array.from(doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'));
  const css = await Promise.all(links.map((l) => inlinedFonts(l.href)));
  for (const l of links) l.remove();
  const style = doc.createElement("style");
  style.textContent = css.join("\n");
  doc.head.prepend(style);

  const xhtml = new XMLSerializer().serializeToString(doc.documentElement);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size.w}" height="${size.h}"><foreignObject x="0" y="0" width="100%" height="100%">${xhtml}</foreignObject></svg>`;
  const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  // The first decode can finish before the inlined fonts are applied; a second load of the same
  // (now cached) SVG draws with them.
  await loadImage(src);
  const img = await loadImage(src);

  const canvas = document.createElement("canvas");
  canvas.width = size.w;
  canvas.height = size.h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not render the thumbnail.");
  ctx.drawImage(img, 0, 0, size.w, size.h);
  const toBlob = (type: string) => new Promise<Blob | null>((r) => canvas.toBlob(r, type, 0.92));
  let blob = await toBlob("image/webp");
  if (!blob || blob.type !== "image/webp") blob = await toBlob("image/jpeg");
  if (!blob) throw new Error("Could not render the thumbnail.");
  return blob;
}
