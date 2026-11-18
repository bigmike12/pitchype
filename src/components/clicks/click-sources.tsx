// Where visits came from, biggest first: a name, a count and a thin share bar.
// "Unknown or direct" is mostly WhatsApp and Telegram apps, which don't say.

import { sourceRows } from "@/lib/click-chart";

export function ClickSources({ sources }: { sources: Record<string, number> }) {
  const rows = sourceRows(sources);
  if (rows.length === 0) return null;
  return (
    <div>
      <p className="mb-2 text-sm text-muted">Where visits came from</p>
      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={row.source} className="text-sm">
            <div className="flex justify-between gap-4 text-ink">
              <span>{row.label}</span>
              <span className="tabular-nums">
                {row.count.toLocaleString("en-NG")}
                <span className="text-muted"> · {row.share}%</span>
              </span>
            </div>
            <div
              aria-hidden="true"
              className="mt-1 h-1.5 rounded-full bg-surface-soft"
            >
              <div
                className="h-1.5 rounded-full bg-brand-violet"
                style={{ width: `${row.share}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
