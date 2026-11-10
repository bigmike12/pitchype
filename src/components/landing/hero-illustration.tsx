import {
  Bell,
  Briefcase,
  House,
  Inbox,
  Search,
  Sparkles,
  Wallet,
} from "lucide-react";

import { Avatar, SampleTag } from "@/components/brand/fragments";
import { ApprovedBadge, EscrowSticker } from "@/components/brand/stickers";
import { PitchypeMark } from "@/components/brand/wordmark";
import { EXAMPLE_PRICE_KOBO, feeExample } from "@/lib/fees";
import { formatNaira } from "@/lib/money";
import { cn } from "@/lib/utils";

// The product, drawn in HTML/CSS with fictional sample data: a business's
// campaign with its applicants, money held in escrow, and a new application
// arriving. Self-contained so it can be swapped for a real screenshot later.
// One labelled image for assistive tech; everything inside is decorative.
const job = feeExample(EXAMPLE_PRICE_KOBO);
const price = formatNaira(job.agreedPriceKobo);
const HIRED = 3;

const NAV = [
  { icon: House, label: "Home" },
  { icon: Briefcase, label: "Campaigns", active: true },
  { icon: Search, label: "Find creators" },
  { icon: Wallet, label: "Payments" },
  { icon: Inbox, label: "Inbox" },
];

const APPLICANTS = [
  {
    initials: "ZB",
    colour: "coral",
    name: "Zainab B.",
    detail: "Food · Instagram · 18k",
    status: "Hired",
    pill: "bg-brand-mint",
  },
  {
    initials: "TA",
    colour: "lilac",
    name: "Tunde A.",
    detail: "Lifestyle · TikTok · 9k",
    status: "Shortlisted",
    pill: "bg-brand-lilac",
  },
  {
    initials: "AO",
    colour: "sun",
    name: "Amaka O.",
    detail: "Food · Instagram · 31k",
    status: "New",
    pill: "bg-surface-card",
  },
] as const;

export function HeroIllustration() {
  return (
    <div
      role="img"
      aria-label={`Illustration: a business's campaign on Pitchype for a fictional juice brand, paying ${price} per creator. Three applicants are listed, ${HIRED} creators are hired, and ${formatNaira(job.agreedPriceKobo * HIRED)} is held in escrow until the work is approved.`}
      className="relative mx-auto max-w-[68rem]"
    >
      {/* Soft glow behind the window. */}
      <div
        aria-hidden="true"
        className="absolute inset-x-[8%] -top-6 bottom-6 -z-10 rounded-[3rem] bg-[radial-gradient(60%_60%_at_50%_40%,rgb(91_61_245/0.18),transparent_70%)] blur-2xl"
      />

      {/* The app window */}
      <div className="rounded-[1.25rem] bg-white/60 p-1.5 shadow-pop ring-1 ring-ink/[0.08] beam sm:rounded-[1.5rem] sm:p-2">
        <div className="overflow-hidden rounded-[0.9rem] bg-canvas ring-1 ring-hairline sm:rounded-[1.1rem]">
          {/* Title bar */}
          <div className="flex h-10 items-center gap-3 border-b border-hairline bg-white px-3.5">
            <span className="flex gap-1.5">
              <span className="size-2.5 rounded-full bg-[#ff5f57]" />
              <span className="size-2.5 rounded-full bg-[#febc2e]" />
              <span className="size-2.5 rounded-full bg-[#28c840]" />
            </span>
            <SampleTag />
            <span className="mx-auto hidden -translate-x-6 rounded-md bg-surface-soft px-12 py-1 text-[0.7rem] text-muted sm:block">
              pitchype.com/business/campaigns
            </span>
          </div>

          <div className="flex text-left text-ink">
            {/* Sidebar */}
            <div className="hidden w-48 shrink-0 flex-col gap-0.5 border-r border-hairline p-3 md:flex">
              <div className="mb-3 flex items-center gap-2 px-2 pt-1">
                <PitchypeMark className="size-5" />
                <span className="font-display text-sm">pitchype</span>
              </div>
              {NAV.map(({ icon: Icon, label, active }) => (
                <span
                  key={label}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs",
                    active
                      ? "bg-white font-semibold shadow-card ring-1 ring-hairline"
                      : "text-body",
                  )}
                >
                  <Icon className="size-3.5" />
                  {label}
                </span>
              ))}
            </div>

            {/* Work area */}
            {/* Extra room at the bottom on phones for the escrow sticker. */}
            <div className="min-w-0 flex-1 p-4 pb-16 sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[0.7rem] text-muted">
                    Campaigns / Brightside Juice
                  </p>
                  <p className="mt-1 font-display text-lg leading-tight sm:text-2xl">
                    Launch our new zobo flavour
                  </p>
                </div>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="hidden size-8 place-items-center rounded-lg bg-white ring-1 ring-hairline sm:grid">
                    <Bell className="size-3.5" />
                  </span>
                  <span className="rounded-full bg-brand-mint px-2.5 py-1 text-[0.7rem] font-semibold">
                    Open
                  </span>
                </span>
              </div>

              {/* Figures */}
              <div className="mt-4 grid grid-cols-3 gap-2 sm:mt-5 sm:gap-3">
                {[
                  { label: "Per creator", value: price },
                  { label: "Hired", value: `${HIRED} of 5` },
                  {
                    label: "In escrow",
                    value: formatNaira(job.agreedPriceKobo * HIRED),
                  },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-xl bg-white p-2.5 shadow-card ring-1 ring-hairline sm:p-3.5"
                  >
                    <p className="text-[0.65rem] text-muted sm:text-xs">
                      {stat.label}
                    </p>
                    <p className="mt-0.5 text-sm font-semibold tabular-nums sm:text-lg">
                      {stat.value}
                    </p>
                  </div>
                ))}
              </div>

              {/* Applicants */}
              <div className="mt-4 rounded-xl bg-white shadow-card ring-1 ring-hairline sm:mt-5">
                <div className="flex items-center justify-between border-b border-hairline px-3 py-2.5 sm:px-4">
                  <p className="text-xs font-semibold">Applications</p>
                  <p className="text-[0.7rem] text-muted">12 received</p>
                </div>
                <ul className="divide-y divide-hairline">
                  {APPLICANTS.map((person) => (
                    <li
                      key={person.name}
                      className="flex items-center gap-3 px-3 py-2.5 sm:px-4"
                    >
                      <Avatar
                        initials={person.initials}
                        colour={person.colour}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold sm:text-sm">
                          {person.name}
                        </span>
                        <span className="block truncate text-[0.65rem] text-muted sm:text-xs">
                          {person.detail}
                        </span>
                      </span>
                      <span className="hidden text-sm font-semibold tabular-nums sm:block">
                        {price}
                      </span>
                      <span
                        className={cn(
                          "w-[5.5rem] shrink-0 rounded-full py-1 text-center text-[0.65rem] font-semibold sm:text-xs",
                          person.pill,
                        )}
                      >
                        {person.status}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stickers, over the window's edges where they hide nothing. */}
      <ApprovedBadge className="absolute -top-4 left-[30%] sm:left-auto sm:-right-4 lg:-right-8" />
      <EscrowSticker
        amountKobo={job.agreedPriceKobo}
        className="absolute -bottom-6 left-2 sm:-left-4 lg:-left-10"
      />

      {/* A new application arriving (wide screens). */}
      <div className="absolute top-[38%] -right-6 hidden w-64 rounded-card bg-white/85 p-3 text-left text-ink shadow-pop ring-1 ring-ink/[0.07] glass lg:block xl:-right-14 motion-safe:animate-[fade-up_0.8s_var(--ease-out-expo)_1.2s_both]">
        <p className="flex items-center gap-1.5 text-[0.7rem] font-semibold text-brand-violet">
          <Sparkles className="size-3.5" /> New application
        </p>
        <div className="mt-2 flex items-center gap-2.5">
          <Avatar initials="KE" colour="sky" />
          <span className="min-w-0">
            <span className="block text-sm font-semibold">Kemi E.</span>
            <span className="block text-xs text-muted">
              Proposed {formatNaira(4_500_000)}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
