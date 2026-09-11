import type { EngineId } from "../contracts/ingest";
import { SERVICE_WORKER_FILES } from "./limits";
import { RejectError } from "./validate";

export type Plan = {
  /** old path -> new path */
  renames: Map<string, string>;
  drops: Set<string>;
  entry: string;
};

/** Decides renames/drops from the file list. The entry html always becomes index.html. */
export function planNormalization(paths: string[], entry: string, engine: EngineId): Plan {
  const renames = new Map<string, string>();
  const drops = new Set<string>();
  if (entry !== "index.html") {
    if (paths.includes("index.html")) drops.add("index.html");
    renames.set(entry, "index.html");
  }
  for (const p of paths) {
    const base = p.slice(p.lastIndexOf("/") + 1);
    // Service workers on a shared origin are a hazard; Godot/Construct/GDevelop ship them for PWA installs.
    if (SERVICE_WORKER_FILES.has(base) || /\.service\.worker\.js$/.test(base) || /(^|\/)offline\.html$/.test(p)) drops.add(p);
    if (engine === "godot4" || engine === "godot3") {
      if (/\.apple-touch-icon\.png$|\.icon\.png$/.test(base)) continue;
    }
  }
  return { renames, drops, entry: "index.html" };
}

/** Third-party portal SDKs are swapped for local shims that speak the Habiv bridge. */
const SDK_REWRITES: Array<[RegExp, string]> = [
  [/https?:\/\/game-cdn\.poki\.com\/scripts\/v2\/poki-sdk\.js/gi, "/sdk/poki-sdk.js"],
  [/https?:\/\/game-cdn\.poki\.com\/scripts\/poki-sdk\.js/gi, "/sdk/poki-sdk.js"],
  [/https?:\/\/sdk\.crazygames\.com\/crazygames-sdk-v3\.js/gi, "/sdk/crazygames-sdk-v3.js"],
  [/https?:\/\/sdk\.crazygames\.com\/crazygames-sdk-v2\.js/gi, "/sdk/crazygames-sdk-v3.js"],
  [/https?:\/\/(www\.)?newgrounds\.com\/[^"']*newgrounds\.io(\.min)?\.js/gi, "/sdk/newgrounds.io.js"],
  [/https?:\/\/[^"']*\/newgroundsio\.min\.js/gi, "/sdk/newgrounds.io.js"],
];

/** Hosts that appear in code as documentation/licence links, not network calls. */
const BENIGN_HOSTS = /(^|\.)(w3\.org|opensource\.org|mozilla\.org|creativecommons\.org|khronos\.org|unity3d\.com|unity\.com|godotengine\.org|phaser\.io|pixijs\.com|threejs\.org|apache\.org|mit-license\.org|github\.com|githubusercontent\.com|npmjs\.com|developer\.mozilla\.org|schema\.org|whatwg\.org|ietf\.org|iana\.org|google\.com\/fonts|fonts\.googleapis\.com|fonts\.gstatic\.com|example\.com|localhost)$/i;

const SW_STUB = `<script>(function(){try{var sw={register:function(){return Promise.reject(new Error("Service workers are disabled on Habiv"))},getRegistration:function(){return Promise.resolve(undefined)},getRegistrations:function(){return Promise.resolve([])},ready:new Promise(function(){}),controller:null,addEventListener:function(){},removeEventListener:function(){}};Object.defineProperty(navigator,"serviceWorker",{value:sw,configurable:true});}catch(e){}})();</script>`;
const BRIDGE_TAG = `<script src="/sdk/habiv-bridge.js"></script>`;

export type HtmlResult = {
  html: string;
  usesNetwork: boolean;
  externalHosts: string[];
  warnings: string[];
};

/** Rewrites the entry html: SDK shims, absolute paths, bridge injection, network detection. */
export function normalizeHtml(input: string, opts: { paths: string[] }): HtmlResult {
  let html = input;
  const warnings: string[] = [];
  const hosts = new Set<string>();

  for (const [re, to] of SDK_REWRITES) html = html.replace(re, to);

  // Absolute root paths only work on a dedicated origin; make them relative to the bundle root.
  html = html.replace(/((?:src|href|poster|data)\s*=\s*["'])\/(?!\/|sdk\/)/gi, "$1./");
  html = html.replace(/url\(\s*(["']?)\/(?!\/)/gi, "url($1./");

  // http:// resources cannot load inside an https page and are a mixed-content hazard.
  const httpRefs = [...html.matchAll(/(?:src|href)\s*=\s*["'](http:\/\/[^"']+)["']/gi)]
    .map((m) => m[1])
    .filter((u) => !/^http:\/\/(www\.)?w3\.org/i.test(u));
  const httpFetch = [...html.matchAll(/["'](http:\/\/[^"'\s]+)["']/gi)].map((m) => m[1]).filter((u) => !/^http:\/\/(www\.)?w3\.org/i.test(u));
  const anchorsOnly = httpRefs.every((u) => new RegExp(`<a[^>]+href\\s*=\\s*["']${escapeRe(u)}`, "i").test(html));
  if (httpRefs.length && !anchorsOnly) {
    throw new RejectError("http_reference", `Insecure http:// resource: ${httpRefs[0].slice(0, 120)}. Use https or bundle the file.`);
  }
  if (httpFetch.length && anchorsOnly && httpRefs.length === 0) warnings.push(`Contains http:// URLs in code: ${httpFetch[0].slice(0, 80)}`);

  for (const m of html.matchAll(/https:\/\/([a-z0-9.-]+)(?::\d+)?(?:\/|["'\s)])/gi)) {
    const host = m[1].toLowerCase();
    if (!BENIGN_HOSTS.test(host)) hosts.add(host);
  }

  // Case-mismatched references break on object storage (case-sensitive keys) even if they worked on Windows.
  const known = new Set(opts.paths);
  const lowerToReal = new Map(opts.paths.map((p) => [p.toLowerCase(), p]));
  for (const m of html.matchAll(/(?:src|href)\s*=\s*["'](?!https?:|data:|blob:|#|\/\/|mailto:)\.?\/?([^"'?#]+)["']/gi)) {
    const ref = m[1];
    if (known.has(ref)) continue;
    const real = lowerToReal.get(ref.toLowerCase());
    if (real && real !== ref) warnings.push(`Reference "${ref}" does not match the file name "${real}" (case)`);
  }

  const inject = `${SW_STUB}\n${BRIDGE_TAG}\n`;
  if (!/habiv-bridge\.js/.test(html)) {
    if (/<script[\s>]/i.test(html)) html = html.replace(/<script[\s>]/i, (m) => inject + m);
    else if (/<\/head>/i.test(html)) html = html.replace(/<\/head>/i, inject + "</head>");
    else if (/<body[^>]*>/i.test(html)) html = html.replace(/<body[^>]*>/i, (m) => m + inject);
    else html = inject + html;
  }

  return { html, usesNetwork: hosts.size > 0, externalHosts: [...hosts].sort(), warnings };
}

/** Light scan of a JS file for outbound network use (flags only; never rejects). */
export function scanJsForNetwork(js: string): string[] {
  const hosts = new Set<string>();
  for (const m of js.matchAll(/https:\/\/([a-z0-9.-]+\.[a-z]{2,})(?::\d+)?[/"'\s)]/gi)) {
    const host = m[1].toLowerCase();
    if (!BENIGN_HOSTS.test(host)) hosts.add(host);
  }
  return [...hosts];
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
