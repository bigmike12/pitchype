import { ImageResponse } from "next/og";

import { PitchypeMark } from "@/components/brand/wordmark";

// Generated at build time and served as the Open Graph image. X/Twitter falls
// back to og:image, so there's no separate twitter-image.
export const alt = "Pitchype: brands meet creators, everybody gets paid";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 72,
        background: "#f8f8f6",
        color: "#0e0e10",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: -120,
          right: -100,
          width: 460,
          height: 460,
          borderRadius: 9999,
          background: "#fad3e6",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: -150,
          right: 140,
          width: 320,
          height: 320,
          borderRadius: 9999,
          background: "#ddd2ff",
        }}
      />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 18,
          fontSize: 48,
        }}
      >
        <PitchypeMark size={56} />
        pitchype
      </div>

      <div
        style={{
          display: "flex",
          maxWidth: 820,
          fontSize: 84,
          lineHeight: 1,
          letterSpacing: -3,
        }}
      >
        Brands meet creators. Everybody gets paid.
      </div>

      {/* No ₦ here: the image renderer's built-in font has no naira glyph. */}
      <div
        style={{
          display: "flex",
          alignSelf: "flex-start",
          padding: "18px 28px",
          borderRadius: 24,
          background: "#0f3d2e",
          color: "#ffffff",
          fontSize: 32,
        }}
      >
        Paid when the work is approved
      </div>
    </div>,
    size,
  );
}
