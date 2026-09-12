import { avatarLayers } from "@/lib/habiv/avatar";
import { avatarSeedOf, isAvatarPhoto } from "@/lib/site";

/**
 * A user's avatar wherever it appears: their uploaded photo, the generated face they
 * picked, or (with neither) the face generated from `seed`, usually their handle.
 */
export function UserAvatar({ url, seed, size, radius = "50%" }: { url: string | null | undefined; seed: string; size: number; radius?: string }) {
  if (isAvatarPhoto(url)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- avatar URLs come from Supabase storage
      <img src={url} alt="" width={size} height={size} style={{ display: "block", width: `${size}px`, height: `${size}px`, flex: "0 0 auto", borderRadius: radius, objectFit: "cover", background: "var(--chip)" }} />
    );
  }
  return (
    <div style={{ width: `${size}px`, height: `${size}px`, flex: "0 0 auto", borderRadius: radius, overflow: "hidden" }}>
      <Avatar seed={avatarSeedOf(url) ?? (seed || "hv-start")} size={size} />
    </div>
  );
}

/** A generated player avatar. The same seed always renders the same face. */
export function Avatar({ seed, size = 72 }: { seed: string; size?: number }) {
  const a = avatarLayers(seed, size);
  return (
    <div style={a.wrapStyle} aria-hidden="true">
      <div style={a.faceStyle}>
        <span style={a.eyeStyle} />
        <span style={a.eyeStyle} />
      </div>
      <div style={a.mouthStyle} />
      <div style={a.accessoryStyle} />
      <div style={a.accessory2Style} />
    </div>
  );
}
