// The illustration beside the sign-in forms (wide screens only). Built from
// the same brand kit as the landing hero: fictional sample data, the escrow
// sticker and approved badge, on the aurora. Purely decorative; the shell
// hides it from assistive tech.

import { EXAMPLE_PRICE_KOBO, feeExample } from "@/lib/fees";
import { formatNaira } from "@/lib/money";
import { cn } from "@/lib/utils";

import { Avatar, SampleTag } from "./fragments";
import { ApprovedBadge, EscrowSticker } from "./stickers";

const job = feeExample(EXAMPLE_PRICE_KOBO);

const APPLICANTS = [
  {
    initials: "ZB",
    colour: "coral",
    name: "Zainab B.",
    detail: "Food, 18k followers",
    status: "Hired",
    pill: "bg-brand-mint",
  },
  {
    initials: "TA",
    colour: "lilac",
    name: "Tunde A.",
    detail: "Lifestyle, 9k followers",
    status: "Shortlisted",
    pill: "bg-brand-lilac",
  },
  {
    initials: "AO",
    colour: "sun",
    name: "Amaka O.",
    detail: "Food, 31k followers",
    status: "New",
    pill: "bg-surface-card",
  },
] as const;

export function AuthScene() {
  return (
    <div className="relative grid h-full grid-rows-[1fr_auto] overflow-hidden rounded-frame p-8 ring-1 ring-hairline aurora motion-safe:animate-aurora xl:p-12">
      <div className="absolute inset-0 dot-grid" />

      <div className="relative flex items-center justify-center">
        <div className="relative w-full max-w-md enter">
          {/* Applications for a sample campaign. Bottom padding leaves room
              for the escrow sticker, so it never covers a row. */}
          <div className="rounded-panel bg-white/90 p-5 pb-14 text-ink shadow-pop ring-1 ring-ink/[0.06] glass">
            <div className="flex items-center gap-2">
              <Avatar initials="BJ" colour="peach" />
              <span className="text-sm font-semibold">Brightside Juice</span>
            </div>
            <p className="mt-3 font-display text-xl leading-tight">
              Launch our new zobo flavour
            </p>
            <p className="mt-1 flex items-center gap-2 text-sm text-muted">
              Applications <SampleTag />
            </p>
            <ul className="mt-4 divide-y divide-hairline">
              {APPLICANTS.map((applicant) => (
                <li
                  key={applicant.name}
                  className="flex items-center gap-3 py-2.5"
                >
                  <Avatar
                    initials={applicant.initials}
                    colour={applicant.colour}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">
                      {applicant.name}
                    </span>
                    <span className="block text-xs text-muted">
                      {applicant.detail}
                    </span>
                  </span>
                  <span className="text-sm font-semibold tabular-nums">
                    {formatNaira(job.agreedPriceKobo)}
                  </span>
                  <span
                    className={cn(
                      "w-24 rounded-full py-1 text-center text-xs font-semibold",
                      applicant.pill,
                    )}
                  >
                    {applicant.status}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <ApprovedBadge className="absolute -top-4 right-6" />
          <EscrowSticker
            amountKobo={job.agreedPriceKobo}
            className="absolute -bottom-7 -left-6"
          />
        </div>
      </div>

      <p className="relative mt-10 max-w-sm text-display-md">
        Money is held until the{" "}
        <span className="text-gradient">work is approved.</span>
      </p>
    </div>
  );
}
