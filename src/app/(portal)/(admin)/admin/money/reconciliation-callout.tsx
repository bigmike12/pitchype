import { CircleCheck, TriangleAlert } from "lucide-react";

import { Callout } from "@/components/ui/callout";
import { formatDateTime } from "@/lib/creator-profile";
import type { PaymentProvider, ReconciliationRun } from "@/lib/db/money";
import { formatNaira } from "@/lib/money";
import { providerName } from "@/lib/provider-words";

/** The latest check of the ledger against one provider's balance, on the money pages. */
export function Reconciliation({
  run,
  provider,
}: {
  run: ReconciliationRun | null;
  provider: PaymentProvider;
}) {
  const name = providerName(provider);
  if (!run) {
    return (
      <section
        aria-label={`${name} reconciliation`}
        className="rounded-card panel p-4 sm:p-5"
      >
        <p className="text-ink">
          Pitchype hasn’t compared the ledger with {name} yet.
        </p>
      </section>
    );
  }
  const when = formatDateTime(run.ranAt);
  // The note is only written when the ledger doesn't balance, the figures
  // differ, or the provider reported its balance in parts, so a difference or
  // an unbalanced ledger is the reason to look.
  if (run.differenceKobo !== 0 || run.note?.includes("not 0")) {
    return (
      <Callout
        tone="attention"
        icon={TriangleAlert}
        title={
          run.differenceKobo !== 0
            ? `Pitchype’s ledger and ${name} differ by ${formatNaira(Math.abs(run.differenceKobo))}`
            : "Pitchype’s ledger needs a look"
        }
      >
        <p>
          Checked {when}. {name} holds {formatNaira(run.paystackBalanceKobo)};
          the ledger expects {formatNaira(run.expectedCashKobo)}.
        </p>
        {run.note && <p className="mt-1">{run.note}</p>}
      </Callout>
    );
  }
  return (
    <Callout
      tone="success"
      icon={CircleCheck}
      title={`Ledger and ${name} agree as of ${when}`}
    >
      {run.note && <p className="text-sm">{run.note}</p>}
    </Callout>
  );
}
