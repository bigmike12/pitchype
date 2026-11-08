import { Check, Lock } from "lucide-react";

import { formatNaira } from "@/lib/money";

import { Avatar, Chip, SampleTag } from "./fragments";

// Self-contained so it can be swapped for commissioned or generated art later
// without touching the hero layout. Sample data only; the brand is fictional.
const PRICE_PER_CREATOR_KOBO = 4_000_000;

// Soft "clay" highlight: a light spot top-left over a flat fill.
const clay = (colour: string) =>
  `radial-gradient(circle at 32% 28%, rgb(255 255 255 / 0.55), transparent 42%), ${colour}`;

export function HeroIllustration() {
  return (
    <div
      role="img"
      aria-label={`Illustration: a phone showing a sample campaign from a fictional juice brand paying ${formatNaira(PRICE_PER_CREATOR_KOBO)} per creator, with the money held in escrow.`}
      className="relative mx-auto aspect-[1/1.1] w-full max-w-[30rem] overflow-hidden rounded-3xl bg-surface-soft sm:aspect-[1/1.02]"
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

      {/* Phone */}
      <div className="absolute top-[7%] left-1/2 w-[68%] -translate-x-1/2 rounded-[2.2rem] bg-ink p-2 sm:w-[62%]">
        <div className="rounded-[1.75rem] bg-canvas px-3 pt-3 pb-4">
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

          <div className="mt-2 rounded-2xl border border-hairline bg-white p-3 text-ink">
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
        </div>
      </div>

      {/* Escrow sticker */}
      <div
        className="absolute top-[79%] left-[3%] flex items-center gap-2.5 rounded-2xl bg-brand-green px-3.5 py-3 on-dark [--tilt:-4deg] motion-safe:animate-float sm:top-[76%] sm:left-[4%]"
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

      {/* Approved badge: the last step of the story. Left out on phones, where
          it would cover the campaign card. */}
      <div
        className="absolute right-[3%] bottom-[11%] hidden items-center gap-1.5 rounded-full bg-brand-sun px-3 py-2 text-sm font-semibold text-ink sm:flex"
        style={{ transform: "rotate(5deg)" }}
      >
        <Check className="size-4" aria-hidden="true" />
        Work approved
      </div>
    </div>
  );
}
