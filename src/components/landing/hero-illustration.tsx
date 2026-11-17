import {
  Bell,
  GripVertical,
  House,
  Inbox,
  Megaphone,
  Search,
  Sparkles,
  SquareKanban,
  Wallet,
} from "lucide-react";

import { Avatar, SampleTag } from "@/components/brand/fragments";
import { ApprovedBadge, EscrowSticker } from "@/components/brand/stickers";
import { PitchypeMark } from "@/components/brand/wordmark";
import { EXAMPLE_PRICE_KOBO, feeExample } from "@/lib/fees";
import { formatNaira } from "@/lib/money";
import { cn } from "@/lib/utils";

// The product, drawn in HTML/CSS with fictional sample data: a business's
// hiring board, with creators moving from applied to paid work, money held
// in escrow, and a new application arriving. It mirrors the real portal
// (grouped sidebar, figures, board columns), so update it when that changes.
// Self-contained so it can be swapped for a real screenshot later. One
// labelled image for assistive tech; everything inside is decorative.
const job = feeExample(EXAMPLE_PRICE_KOBO);
const price = formatNaira(job.agreedPriceKobo);
const IN_PROGRESS = 3;

const NAV = [
  {
    group: "Hiring",
    items: [
      { icon: House, label: "Home" },
      { icon: SquareKanban, label: "Hiring board", active: true },
      { icon: Megaphone, label: "Campaigns" },
      { icon: Search, label: "Find creators" },
      { icon: Inbox, label: "Inbox" },
    ],
  },
  { group: "Money", items: [{ icon: Wallet, label: "Wallet" }] },
];

type Person = {
  initials: string;
  colour: "coral" | "lilac" | "sun" | "sky" | "mint" | "peach";
  name: string;
  detail: string;
};

// The last two columns only show from 640px: four don't fit a phone.
const COLUMNS: {
  label: string;
  dot: string;
  wide?: boolean;
  people: Person[];
}[] = [
  {
    label: "Applied",
    dot: "bg-brand-sky",
    people: [
      {
        initials: "AO",
        colour: "sun",
        name: "Amaka O.",
        detail: "Food · Instagram · 31k",
      },
      {
        initials: "DE",
        colour: "peach",
        name: "Dayo E.",
        detail: "Lifestyle · TikTok · 9k",
      },
    ],
  },
  {
    label: "Shortlisted",
    dot: "bg-brand-lilac",
    people: [
      {
        initials: "TA",
        colour: "lilac",
        name: "Tunde A.",
        detail: "Lifestyle · TikTok · 12k",
      },
    ],
  },
  {
    label: "To pay",
    dot: "bg-brand-sun",
    wide: true,
    people: [
      {
        initials: "NU",
        colour: "sky",
        name: "Ngozi U.",
        detail: "Food · Instagram · 6k",
      },
    ],
  },
  {
    label: "In progress",
    dot: "bg-brand-mint",
    wide: true,
    people: [
      {
        initials: "ZB",
        colour: "coral",
        name: "Zainab B.",
        detail: "Food · Instagram · 18k",
      },
      {
        initials: "IK",
        colour: "mint",
        name: "Ife K.",
        detail: "Food · TikTok · 22k",
      },
    ],
  },
];

export function HeroIllustration() {
  return (
    <div
      role="img"
      aria-label={`Illustration: a business's hiring board on Pitchype for a fictional juice brand, paying ${price} per creator. Creators sit in columns from applied and shortlisted to waiting for payment and in progress, and ${formatNaira(job.agreedPriceKobo * IN_PROGRESS)} is held in escrow until the work is approved.`}
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
              pitchype.com/business/board
            </span>
          </div>

          <div className="flex text-left text-ink">
            {/* Sidebar */}
            <div className="hidden w-44 shrink-0 flex-col border-r border-hairline p-3 md:flex">
              <div className="mb-2 flex items-center gap-2 px-2 pt-1">
                <PitchypeMark className="size-5" />
                <span className="font-display text-sm">pitchype</span>
              </div>
              {NAV.map(({ group, items }) => (
                <div key={group} className="mt-2.5 flex flex-col gap-0.5">
                  <span className="px-2.5 pb-1 text-[0.65rem] font-semibold tracking-[0.08em] text-muted uppercase">
                    {group}
                  </span>
                  {items.map(({ icon: Icon, label, ...item }) => {
                    const active = "active" in item;
                    return (
                      <span
                        key={label}
                        className={cn(
                          "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs",
                          active
                            ? "bg-white font-semibold shadow-card ring-1 ring-hairline"
                            : "text-body",
                        )}
                      >
                        <Icon
                          className={cn(
                            "size-3.5",
                            active && "text-brand-violet",
                          )}
                        />
                        {label}
                      </span>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Work area: the white panel inset beside the sidebar. */}
            {/* Extra room at the bottom on phones for the escrow sticker. */}
            <div className="min-w-0 flex-1 bg-white p-4 pb-16 sm:p-5 md:my-2 md:mr-2 md:rounded-xl md:ring-1 md:ring-hairline">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-display text-lg leading-tight sm:text-2xl">
                    Hiring board
                  </p>
                  <p className="mt-1 truncate text-[0.7rem] text-muted sm:text-xs">
                    Launch our new zobo flavour · {price} per creator
                  </p>
                </div>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="hidden size-8 place-items-center rounded-lg bg-white ring-1 ring-hairline sm:grid">
                    <Bell className="size-3.5" />
                  </span>
                  <span className="rounded-lg bg-ink px-2.5 py-1.5 text-[0.7rem] font-semibold text-white">
                    New campaign
                  </span>
                </span>
              </div>

              {/* Figures */}
              <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
                {[
                  { label: "To review", value: "3", tone: "bg-brand-lilac" },
                  { label: "To pay", value: "1", tone: "bg-brand-sun" },
                  {
                    label: "In escrow",
                    value: formatNaira(job.agreedPriceKobo * IN_PROGRESS),
                    tone: "bg-brand-mint",
                  },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-xl bg-white p-2.5 shadow-card ring-1 ring-hairline sm:p-3"
                  >
                    <p className="flex items-center gap-1.5 text-[0.65rem] text-muted sm:text-xs">
                      <span className={cn("size-2 rounded-[3px]", stat.tone)} />
                      {stat.label}
                    </p>
                    <p className="mt-1 font-display text-sm tabular-nums sm:text-xl">
                      {stat.value}
                    </p>
                  </div>
                ))}
              </div>

              {/* The board */}
              <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-4 sm:grid-cols-4 sm:gap-2.5">
                {COLUMNS.map((column) => (
                  <div
                    key={column.label}
                    className={cn(
                      "rounded-xl bg-canvas p-1.5 ring-1 ring-hairline sm:p-2",
                      column.wide && "hidden sm:block",
                    )}
                  >
                    <p className="flex items-center gap-1.5 px-1 py-1 text-[0.65rem] font-semibold sm:text-xs">
                      <span className={cn("size-2 rounded-full", column.dot)} />
                      {column.label}
                      <span className="ml-auto font-normal text-muted tabular-nums">
                        {column.people.length}
                      </span>
                    </p>
                    <div className="mt-1 space-y-1.5">
                      {column.people.map((person) => (
                        <div
                          key={person.name}
                          className="rounded-lg bg-white p-2 shadow-card ring-1 ring-hairline"
                        >
                          <div className="flex items-center gap-1.5">
                            <Avatar
                              initials={person.initials}
                              colour={person.colour}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[0.7rem] font-semibold sm:text-xs">
                                {person.name}
                              </span>
                              <span className="block truncate text-[0.65rem] text-muted sm:text-[0.65rem]">
                                {person.detail}
                              </span>
                            </span>
                            <GripVertical className="hidden size-3 shrink-0 text-muted lg:block" />
                          </div>
                          <p className="mt-1.5 text-[0.65rem] font-semibold tabular-nums sm:text-xs">
                            {price}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
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
      <div className="absolute -right-6 -bottom-11 hidden w-64 rounded-card bg-white/85 p-3 text-left text-ink shadow-pop ring-1 ring-ink/[0.07] glass lg:block xl:-right-14 motion-safe:animate-[fade-up_0.8s_var(--ease-out-expo)_1.2s_both]">
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
