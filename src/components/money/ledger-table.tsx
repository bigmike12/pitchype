import { formatDateTime } from "@/lib/creator-profile";
import { describeLedgerRow } from "@/lib/ledger-words";
import { formatNaira } from "@/lib/money";
import { cn } from "@/lib/utils";

export type WalletLine = {
  id: string;
  createdAt: string;
  eventType: string;
  account: string;
  amountKobo: number;
};

const th = "px-5 py-3 text-[0.8125rem] font-medium text-muted";

function Amount({ line }: { line: ReturnType<typeof describeLedgerRow> }) {
  const into = line.direction === "in";
  return (
    <span
      className={cn(
        "font-semibold tabular-nums",
        into ? "text-brand-green" : "text-ink",
      )}
    >
      <span aria-hidden="true">{into ? "+" : "−"}</span>
      <span className="sr-only">{into ? "Money in: " : "Money out: "}</span>
      {formatNaira(line.walletAmountKobo)}
    </span>
  );
}

/**
 * A person's wallet history: a table from 640px, a stacked list on phones
 * (same pattern as `CampaignTable`). Takes ledger rows as stored and turns
 * them into words and signs with `describeLedgerRow`.
 */
export function LedgerTable({ rows }: { rows: WalletLine[] }) {
  const lines = rows.map((row) => ({ row, words: describeLedgerRow(row) }));

  return (
    <>
      <div className="overflow-hidden rounded-card panel sm:hidden">
        <ul className="divide-y divide-hairline">
          {lines.map(({ row, words }) => (
            <li key={row.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 font-semibold text-ink">{words.label}</p>
                <Amount line={words} />
              </div>
              <p className="mt-1 text-sm text-muted">
                {formatDateTime(row.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      </div>

      <div className="hidden overflow-hidden rounded-card panel sm:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-hairline bg-surface-soft/60">
            <tr>
              <th scope="col" className={th}>
                Date
              </th>
              <th scope="col" className={th}>
                What happened
              </th>
              <th scope="col" className={`${th} text-right`}>
                Amount
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline text-ink">
            {lines.map(({ row, words }) => (
              <tr
                key={row.id}
                className="hover:bg-surface-soft/60 motion-safe:transition-colors"
              >
                <td className="px-5 py-4 whitespace-nowrap text-muted">
                  {formatDateTime(row.createdAt)}
                </td>
                <th scope="row" className="px-5 py-4 font-semibold">
                  {words.label}
                </th>
                <td className="px-5 py-4 text-right whitespace-nowrap">
                  <Amount line={words} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
