import { Check, X } from "lucide-react";

import { PitchypeMark } from "@/components/brand/wordmark";

// "The usual way" against Pitchype, for both sides. Only claims about how
// Pitchype works as decided in CLAUDE.md (escrow, locked prices, 7-day
// auto-release, reasons for denials, admin-reviewed disputes); the usual way
// describes common practice, never a named platform's fees.
const ROWS = [
  {
    topic: "Getting paid before you’re famous",
    usual:
      "Platform payouts come after you hit their numbers. TikTok’s needs 10,000 followers and isn’t open in Nigeria.",
    pitchype:
      "No follower minimum to join. Businesses pay for the work, not the follower count.",
  },
  {
    topic: "Finding each other",
    usual: "Cold DMs, agencies and friends of friends.",
    pitchype:
      "A directory you can filter by niche, platform, state, followers and rate, and campaigns creators apply to.",
  },
  {
    topic: "Agreeing the price",
    usual: "Back and forth in DMs, and the price can move after work starts.",
    pitchype:
      "The price is on the campaign or in the application, and it’s locked once the job is paid for.",
  },
  {
    topic: "Paying and getting paid",
    usual: "Pay upfront and hope, or post first and chase the money.",
    pitchype:
      "The business pays into escrow before work starts. The creator is paid on approval, or automatically after 7 days of silence.",
  },
  {
    topic: "Approving the work",
    usual: "Screenshots lost in chats and no clear yes or no.",
    pitchype:
      "Proof goes in one place. Businesses approve it, or say exactly what to fix.",
  },
  {
    topic: "When something goes wrong",
    usual: "You’re on your own.",
    pitchype:
      "The money stays held while Pitchype reviews the dispute and decides who gets it.",
  },
];

export function WhyPitchype() {
  return (
    <section
      id="why"
      aria-labelledby="why-title"
      className="container-page section-y"
    >
      <div className="max-w-3xl">
        <h2 id="why-title" className="text-display-lg reveal">
          Followers aren’t a paycheck.{" "}
          <span className="text-gradient">Budgets aren’t a bet.</span>
        </h2>
        <p className="mt-4 max-w-[40rem] text-lg reveal">
          Social platforms are great at building audiences, but they don’t
          promise anyone gets paid. Pitchype is the missing piece: businesses
          that want to pay, creators who fit, and money that’s safe on both
          sides.
        </p>
      </div>

      <div className="mt-10 overflow-hidden rounded-frame panel reveal">
        {/* Column heads, for sighted users from 768px; each cell also
            carries its own label for phones and screen readers. */}
        <div
          aria-hidden="true"
          className="hidden grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1.15fr)] border-b border-hairline md:grid"
        >
          <span className="px-6 py-4" />
          <span className="px-6 py-4 text-sm font-semibold text-muted">
            The usual way
          </span>
          <span className="flex items-center gap-2 bg-[linear-gradient(135deg,rgb(221_210_255/0.45),rgb(250_211_230/0.35))] px-6 py-4 text-sm font-semibold text-ink">
            <PitchypeMark className="size-5" />
            With Pitchype
          </span>
        </div>

        <ul className="divide-y divide-hairline">
          {ROWS.map((row) => (
            <li
              key={row.topic}
              className="grid gap-3 p-5 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1.15fr)] md:gap-0 md:p-0"
            >
              <h3 className="text-base font-semibold text-ink md:px-6 md:py-5">
                {row.topic}
              </h3>
              <p className="flex gap-2.5 text-[0.9375rem] text-muted md:px-6 md:py-5">
                <X
                  className="mt-1 size-4 shrink-0 text-muted"
                  aria-hidden="true"
                />
                <span>
                  <span className="font-semibold md:sr-only">
                    The usual way:{" "}
                  </span>
                  {row.usual}
                </span>
              </p>
              <p className="flex gap-2.5 rounded-xl bg-[linear-gradient(135deg,rgb(221_210_255/0.3),rgb(250_211_230/0.22))] p-3 text-[0.9375rem] text-ink md:rounded-none md:px-6 md:py-5">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-ink text-white">
                  <Check className="size-3" aria-hidden="true" />
                </span>
                <span>
                  <span className="font-semibold md:sr-only">
                    With Pitchype:{" "}
                  </span>
                  {row.pitchype}
                </span>
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
