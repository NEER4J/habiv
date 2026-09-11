import { normalizeHandle } from "@/lib/handles";
import type { CSSProperties } from "react";

/**
 * Deterministic player avatars: a seed string picks the shape, palette, eyes and
 * accessory, so the same handle always renders the same face.
 */

const kinds = ["visor", "bot", "mask", "blob"] as const;

const palettes: [string, string][] = [
  ["oklch(0.72 0.17 28)", "oklch(0.48 0.14 12)"],
  ["oklch(0.78 0.16 85)", "oklch(0.5 0.13 62)"],
  ["oklch(0.74 0.16 150)", "oklch(0.46 0.12 168)"],
  ["oklch(0.72 0.15 205)", "oklch(0.44 0.13 232)"],
  ["oklch(0.7 0.17 275)", "oklch(0.42 0.14 292)"],
  ["oklch(0.76 0.15 330)", "oklch(0.48 0.14 348)"],
  ["oklch(0.8 0.05 250)", "oklch(0.34 0.03 260)"],
];

function hash(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export type AvatarLayers = {
  seed: string;
  wrapStyle: CSSProperties;
  faceStyle: CSSProperties;
  eyeStyle: CSSProperties;
  mouthStyle: CSSProperties;
  accessoryStyle: CSSProperties;
  accessory2Style: CSSProperties;
};

export function avatarLayers(seed: string, size = 72): AvatarLayers {
  const h = hash(String(seed));
  const kind = kinds[h % kinds.length];
  const [c1, c2] = palettes[(h >> 3) % palettes.length];
  const eyes = (h >> 6) % 4;
  const accessory = (h >> 9) % 4;
  const tilt = ((h >> 12) % 9) - 4;

  const u = (n: number) => `${size * n}px`;
  const ink = "#0d0d10";
  const eyeW = eyes === 1 ? 0.1 : eyes === 2 ? 0.16 : 0.13;
  const eyeH = eyes === 3 ? 0.06 : 0.16;
  const visor = kind === "visor" || kind === "bot";

  const accessoryStyle: CSSProperties =
    accessory === 0
      ? { position: "absolute", left: "50%", top: u(-0.04), width: u(0.08), height: u(0.16), marginLeft: u(-0.04), borderRadius: u(0.04), background: ink }
      : accessory === 1
        ? { position: "absolute", left: u(-0.06), top: u(0.3), width: u(0.14), height: u(0.3), borderRadius: u(0.07), background: "rgba(13,13,16,0.7)" }
        : accessory === 2
          ? { position: "absolute", right: u(0.1), top: u(0.1), width: u(0.14), height: u(0.14), borderRadius: "50%", background: "rgba(255,255,255,0.75)" }
          : { position: "absolute", left: 0, right: 0, bottom: 0, height: u(0.12), background: "rgba(13,13,16,0.55)" };

  return {
    seed: String(seed),
    wrapStyle: {
      position: "relative",
      width: u(1),
      height: u(1),
      flex: "0 0 auto",
      overflow: "hidden",
      borderRadius: kind === "blob" ? "50%" : u(0.3),
      background: `linear-gradient(150deg, ${c1}, ${c2})`,
      transform: `rotate(${tilt * 0.4}deg)`,
    },
    faceStyle: {
      position: "absolute",
      left: u(0.16),
      right: u(0.16),
      top: u(kind === "mask" ? 0.26 : 0.3),
      height: u(visor ? 0.2 : 0.24),
      borderRadius: visor ? u(0.1) : u(0.06),
      background: visor ? "rgba(13,13,16,0.82)" : "transparent",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: u(0.1),
    },
    eyeStyle: { width: u(eyeW), height: u(eyeH), borderRadius: u(0.05), background: visor ? "#f4f4f7" : ink },
    mouthStyle:
      kind === "mask"
        ? { position: "absolute", left: u(0.28), right: u(0.28), bottom: u(0.22), height: u(0.14), borderRadius: u(0.07), background: "rgba(13,13,16,0.78)" }
        : { position: "absolute", left: u(0.34), right: u(0.34), bottom: u(0.24), height: u(0.05), borderRadius: u(0.03), background: ink, opacity: 0.75 },
    accessoryStyle,
    accessory2Style:
      accessory === 1
        ? { position: "absolute", right: u(-0.06), top: u(0.3), width: u(0.14), height: u(0.3), borderRadius: u(0.07), background: "rgba(13,13,16,0.7)" }
        : { display: "none" },
  };
}

/** Handles the design treats as unavailable. */
export const takenHandles = ["nullpath", "atlas.club", "mishafx", "kelp", "admin", "habiv"];


/** Handle sanitiser (shared with the server rules in lib/handles.ts). */
export const sanitizeHandle = normalizeHandle;
