import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Home-screen icon: the Habiv mark in white on the app's near-black. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#050505" }}>
        <svg width="112" height="111" viewBox="0 0 773 764" fill="#f1f1f1">
          <path d="M0.769531 600L266.27 0.5H589.77L447.27 326H771.77L578.27 763H253.77L447.27 326H286.27L166.77 600H0.769531Z" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
