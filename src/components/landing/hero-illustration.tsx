import { Check, Lock } from "lucide-react";

import { formatNaira } from "@/lib/money";

import { Avatar, Chip, SampleTag } from "./fragments";

// Self-contained so it can be swapped for commissioned or generated art later
// without touching the hero layout. Sample data only; the brand is fictional.
const PRICE_PER_CREATOR_KOBO = 4_000_000;

// Soft "clay" highlight: a light spot top-left over a flat fill.
const clay = (colour: string) =>
  `radial-gradient(circle at 32% 28%, rgb(255 255 255 / 0.55), transparent 42%), ${colour}`;

// The stickers are pinned to the phone, not to the card, so they stay put
// whatever the screen width. Each one sits over a part of the phone that holds
// no information: the badge over the top bezel, the escrow sticker over an
// empty strip kept at the bottom of the screen for it.
export function HeroIllustration() {
  return (
    <div
      role="img"
      aria-label={`Illustration: a phone showing a sample campaign from a fictional juice brand paying ${formatNaira(PRICE_PER_CREATOR_KOBO)} per creator, with the money held in escrow until the work is approved.`}
      className="relative mx-auto w-full max-w-[30rem] overflow-hidden rounded-3xl bg-surface-soft px-6 pt-12 pb-14 sm:pt-14 sm:pb-16"
    >
      {/* Background shapes */}
      <div
        className="absolute -top-16 -right-14 size-64 rounded-full"
        style={{ background: clay("var(--color-brand-coral)") }}
      />
      <div
        className="absolute -bottom-20 -left-16 size-72 rounded-[45%_55%_60%_40%]"
        style={{ background: clay("var(--color-brand-lilac)") }}
      />
      <div
        className="absolute top-[9%] left-[7%] size-12 rounded-full motion-safe:animate-float-slow sm:size-16"
        style={{ background: clay("var(--color-brand-mint)") }}
      />

      <div className="relative mx-auto w-60 sm:w-68">
        {/* Phone */}
        <div className="rounded-[2.2rem] bg-ink p-2">
          <div className="rounded-[1.75rem] bg-canvas px-3 pt-3">
            <div className="mx-auto mb-3 h-1.5 w-14 rounded-full bg-ink/15" />
            <div className="flex items-center justify-between px-1">
              <span className="font-display text-base text-ink">Campaigns</span>
              <SampleTag />
            </div>

            <div className="mt-3 rounded-2xl border border-hairline bg-white p-3 text-ink">
              <div className="flex items-center gap-2">
                <Avatar
                  initials="BJ"
                  colour="peach"
                  className="size-7 text-[0.65rem]"
                />
                <span className="text-xs font-semibold">Brightside Juice</span>
              </div>
              <p className="mt-2 font-display text-[1.05rem] leading-tight">
                Launch our new zobo flavour
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                <Chip className="px-2 py-0.5 text-[0.65rem]">Instagram</Chip>
                <Chip className="px-2 py-0.5 text-[0.65rem]">Lagos</Chip>
                <Chip className="px-2 py-0.5 text-[0.65rem]">
                  Food &amp; drink
                </Chip>
              </div>
              <p className="mt-3 flex items-baseline gap-1.5">
                <span className="text-base leading-none font-bold">
                  {formatNaira(PRICE_PER_CREATOR_KOBO)}
                </span>
                <span className="text-[0.65rem] text-muted">per creator</span>
              </p>
              <div className="mt-3 rounded-lg bg-ink py-2 text-center text-xs font-semibold text-white">
                Apply
              </div>
            </div>

            {/* A second campaign on wider screens, where there's room for it. */}
            <div className="mt-2 hidden rounded-2xl border border-hairline bg-white p-3 text-ink sm:block">
              <div className="flex items-center gap-2">
                <Avatar
                  initials="KS"
                  colour="mint"
                  className="size-7 text-[0.65rem]"
                />
                <span className="text-xs font-semibold">Kola Skincare</span>
              </div>
              <p className="mt-2 font-display text-[1.05rem] leading-tight">
                Unboxing video
              </p>
            </div>

            {/* Empty strip the escrow sticker rests on (room for its tilt and float). */}
            <div className="flex h-16 items-end justify-center pb-2">
              <div className="h-1 w-20 rounded-full bg-ink/20" />
            </div>
          </div>
        </div>

        {/* Approved badge, over the top bezel */}
        <div
          className="absolute -top-5 -right-4 flex items-center gap-1.5 rounded-full bg-brand-sun px-3 py-2 text-sm font-semibold whitespace-nowrap text-ink sm:-right-10"
          style={{ transform: "rotate(5deg)" }}
        >
          <Check className="size-4" aria-hidden="true" />
          Work approved
        </div>

        {/* Escrow sticker, over the empty strip at the bottom */}
        <div
          className="absolute -bottom-6 -left-4 flex items-center gap-2.5 rounded-2xl bg-brand-green px-3.5 py-3 whitespace-nowrap on-dark [--tilt:-4deg] motion-safe:animate-float sm:-left-10"
          style={{ transform: "rotate(-4deg)" }}
        >
          <span className="grid size-9 place-items-center rounded-full bg-brand-mint text-ink">
            <Lock className="size-4" aria-hidden="true" />
          </span>
          <span>
            <span className="block text-lg leading-none font-bold">
              {formatNaira(PRICE_PER_CREATOR_KOBO)}
            </span>
            <span className="mt-1 block text-xs text-brand-mint">
              held in escrow
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
