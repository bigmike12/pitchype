import { readFile } from "node:fs/promises";

import { ImageResponse } from "next/og";
import sharp from "sharp";

import { PitchypeMark } from "@/components/brand/wordmark";
import {
  FOLLOWER_RANGE_LABELS,
  PLATFORM_RULES,
  type PlatformListing,
} from "@/lib/creator-profile";
import { getListedCreator, listNiches } from "@/lib/db/creators";

// The card a link to /creators/<slug> unfurls into (WhatsApp, X, LinkedIn,
// Slack). Public facts only, whoever asks: name, place, niches, platforms
// with their follower labels, the verified mark, the photo and cover. X falls
// back to og:image, so there's no separate twitter-image.
export const alt = "A creator’s profile on Pitchype";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK = "#0e0e10";
const MUTED = "#63636b";
const CANVAS = "#f8f8f6";
// The pastel tones CreatorPhoto picks from a name (creator-photo.tsx).
const TONES = ["#c2ecd9", "#ddd2ff", "#ffe27f", "#ffd6bf", "#ff6b57"];

function toneFor(name: string) {
  let sum = 0;
  for (const char of name) sum = (sum + char.codePointAt(0)!) % 997;
  return TONES[sum % TONES.length];
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => [...word][0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Our images are WebP, which the renderer can't decode: fetch one and hand it
 * over as a PNG data URL, or null if it can't be had (the card still renders).
 */
async function asPngDataUrl(url: string | null, width: number, height: number) {
  if (!url) return null;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return null;
    const png = await sharp(Buffer.from(await response.arrayBuffer()))
      .resize(width, height, { fit: "cover" })
      .png()
      .toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return null;
  }
}

function followers(p: PlatformListing) {
  if (p.verified && p.verifiedFollowerCount !== null) {
    return new Intl.NumberFormat("en-NG", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(p.verifiedFollowerCount);
  }
  return p.followerRange ? FOLLOWER_RANGE_LABELS[p.followerRange] : "";
}

async function fonts() {
  const [display, text] = await Promise.all([
    readFile(
      new URL("./og-fonts/bricolage-grotesque-600.ttf", import.meta.url),
    ),
    readFile(new URL("./og-fonts/inter-500.ttf", import.meta.url)),
  ]);
  return [
    {
      name: "Bricolage Grotesque",
      data: display,
      weight: 600 as const,
      style: "normal" as const,
    },
    {
      name: "Inter",
      data: text,
      weight: 500 as const,
      style: "normal" as const,
    },
  ];
}

export default async function CreatorOpengraphImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [creator, loadedFonts] = await Promise.all([
    getListedCreator(slug),
    fonts(),
  ]);

  // Unlisted or hidden: a plain Pitchype card rather than an error.
  if (!creator) {
    return new ImageResponse(
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: CANVAS,
          color: INK,
          fontFamily: "Inter",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 18,
            fontSize: 44,
            fontFamily: "Bricolage Grotesque",
          }}
        >
          <PitchypeMark size={52} />
          pitchype
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 84,
            lineHeight: 1,
            letterSpacing: -3,
            fontFamily: "Bricolage Grotesque",
            maxWidth: 900,
          }}
        >
          Find Nigerian creators for your brand
        </div>
      </div>,
      { ...size, fonts: loadedFonts },
    );
  }

  const [niches, photo, cover] = await Promise.all([
    listNiches(),
    asPngDataUrl(creator.photoUrl, 320, 320),
    asPngDataUrl(creator.coverUrl, 520, 630),
  ]);
  const nicheName = new Map(niches.map((n) => [n.slug, n.name]));
  const nicheLine = creator.niches
    .flatMap((s) => nicheName.get(s) ?? [])
    .join(" · ");
  const verified = creator.platforms.some((p) => p.verified);
  const tone = toneFor(creator.displayName);
  const nameSize = creator.displayName.length > 22 ? 64 : 80;

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        background: CANVAS,
        color: INK,
        fontFamily: "Inter",
        position: "relative",
      }}
    >
      {/* The right-hand panel: their cover, or their colour. */}
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          width: 520,
          height: 630,
          display: "flex",
          background: tone,
        }}
      >
        {cover && (
          <img
            src={cover}
            width={520}
            height={630}
            style={{ objectFit: "cover" }}
            alt=""
          />
        )}
      </div>

      <div
        style={{
          position: "absolute",
          left: 600,
          top: 155,
          width: 320,
          height: 320,
          display: "flex",
          borderRadius: 44,
          border: `8px solid ${CANVAS}`,
          background: tone,
          overflow: "hidden",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {photo ? (
          <img
            src={photo}
            width={304}
            height={304}
            style={{ objectFit: "cover" }}
            alt=""
          />
        ) : (
          <div
            style={{
              display: "flex",
              fontFamily: "Bricolage Grotesque",
              fontSize: 120,
              letterSpacing: -4,
            }}
          >
            {initials(creator.displayName)}
          </div>
        )}
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 0 64px 72px",
          width: 560,
          height: "100%",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            fontSize: 32,
            fontFamily: "Bricolage Grotesque",
          }}
        >
          <PitchypeMark size={40} />
          pitchype
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          {verified && (
            <div
              style={{
                display: "flex",
                alignSelf: "flex-start",
                alignItems: "center",
                gap: 8,
                padding: "8px 16px",
                borderRadius: 999,
                background: "#ffffff",
                border: "2px solid #e6e6e1",
                fontSize: 22,
                marginBottom: 20,
              }}
            >
              <div
                style={{
                  display: "flex",
                  width: 14,
                  height: 14,
                  borderRadius: 999,
                  background: "#ff6b57",
                }}
              />
              Verified
            </div>
          )}
          <div
            style={{
              display: "flex",
              fontFamily: "Bricolage Grotesque",
              fontSize: nameSize,
              lineHeight: 1,
              letterSpacing: -2.5,
            }}
          >
            {creator.displayName}
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 20,
              fontSize: 28,
              color: MUTED,
            }}
          >
            {nicheLine ? `${nicheLine} · ${creator.city}` : creator.city}
          </div>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          {creator.platforms.map((p) => (
            <div
              key={p.platform}
              style={{
                display: "flex",
                gap: 10,
                padding: "10px 18px",
                borderRadius: 16,
                background: "#ffffff",
                border: "2px solid #e6e6e1",
                fontSize: 24,
              }}
            >
              <span style={{ color: MUTED }}>
                {PLATFORM_RULES[p.platform].label}
              </span>
              <span>{followers(p)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>,
    { ...size, fonts: loadedFonts },
  );
}
