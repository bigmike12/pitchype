import { ImageResponse } from "next/og";

import { PitchypeMark } from "@/components/brand/wordmark";

// iOS home-screen icon: the mark on a cream tile.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#fff9ee",
      }}
    >
      <PitchypeMark size={132} />
    </div>,
    size,
  );
}
