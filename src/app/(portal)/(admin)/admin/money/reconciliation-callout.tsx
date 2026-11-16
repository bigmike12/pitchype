import { CircleCheck, TriangleAlert } from "lucide-react";

import { Callout } from "@/components/ui/callout";
import { formatDateTime } from "@/lib/creator-profile";
import type { ReconciliationRun } from "@/lib/db/money";
import { formatNaira } from "@/lib/money";

/** The latest check of the ledger against Paystack, on the money pages. */
export function Reconciliation({ run }: { run: ReconciliationRun | null }) {
  if (!run) {
    return (
      <section
        aria-label="Reconciliation"
        className="rounded-card panel p-4 sm:p-5"
      >
        <p className="text-ink">
          Pitchype hasn’t compared the ledger with Paystack yet.
        </p>
      </section>
    );
  }
  const when = formatDateTime(run.ranAt);
  // The note is only written when the ledger doesn't balance or the figures
  // differ, so either one is a reason to look.
  if (run.differenceKobo !== 0 || run.note !== null) {
    return (
      <Callout
        tone="attention"
        icon={TriangleAlert}
        title={
          run.differenceKobo !== 0
            ? `Pitchype’s ledger and Paystack differ by ${formatNaira(Math.abs(run.differenceKobo))}`
            : "Pitchype’s ledger needs a look"
        }
      >
        <p>
          Checked {when}. Paystack holds {formatNaira(run.paystackBalanceKobo)};
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
      title={`Ledger and Paystack agree as of ${when}`}
    />
  );
}
