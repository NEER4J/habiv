/** Regex-only user agent parsing: enough for device/os/browser breakdowns, no dependency. */
export type ParsedUA = { device_type: "mobile" | "tablet" | "desktop" | "bot"; os: string; browser: string };

export function parseUA(ua: string | null): ParsedUA {
  const s = ua ?? "";
  if (/bot|crawl|spider|slurp|facebookexternalhit|preview|headless/i.test(s)) return { device_type: "bot", os: "other", browser: "other" };
  const tablet = /iPad|Tablet|PlayBook|Silk|Android(?!.*Mobile)/i.test(s);
  const mobile = !tablet && /Mobi|iPhone|iPod|Android.*Mobile|Windows Phone|webOS|BlackBerry/i.test(s);
  const device_type = tablet ? "tablet" : mobile ? "mobile" : "desktop";
  const os = /iPhone|iPad|iPod/i.test(s) ? "ios"
    : /Android/i.test(s) ? "android"
    : /Windows/i.test(s) ? "windows"
    : /Mac OS X|Macintosh/i.test(s) ? "macos"
    : /CrOS/i.test(s) ? "chromeos"
    : /Linux/i.test(s) ? "linux"
    : "other";
  const browser = /Edg\//i.test(s) ? "edge"
    : /OPR\/|Opera/i.test(s) ? "opera"
    : /SamsungBrowser/i.test(s) ? "samsung"
    : /Firefox|FxiOS/i.test(s) ? "firefox"
    : /CriOS|Chrome\//i.test(s) ? "chrome"
    : /Safari\//i.test(s) ? "safari"
    : "other";
  return { device_type, os, browser };
}
