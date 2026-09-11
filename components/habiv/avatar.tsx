import { avatarLayers } from "@/lib/habiv/avatar";

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
