// Clicks per Lagos day as simple bars: counted clicks in violet over a light
// track for every visit. Plain HTML and CSS (no chart library, no client JS);
// more than 31 days scroll sideways inside their own box, never the page. A
// hidden table gives the same numbers to screen readers.

import { barHeights, type ClickDay } from "@/lib/click-chart";

const HEIGHT_PX = 96;

function shortDay(day: string): string {
  return new Intl.DateTimeFormat("en-NG", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${day}T00:00:00Z`));
}

export function ClickDayChart({ days }: { days: ClickDay[] }) {
  if (days.length === 0) return null;
  const counted = barHeights(
    days.map((d) => d.billable),
    HEIGHT_PX,
  );
  const visits = barHeights(
    days.map((d) => d.hits),
    HEIGHT_PX,
  );
  const wide = days.length > 31;
  return (
    <figure>
      <figcaption className="mb-3 text-sm text-muted">
        Clicks per day (Lagos time)
        <span className="ml-3 inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-2.5 rounded-sm bg-brand-violet"
          />
          Counted
        </span>
        <span className="ml-3 inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-2.5 rounded-sm bg-surface-soft ring-1 ring-hairline"
          />
          All visits
        </span>
      </figcaption>
      <div className={wide ? "overflow-x-auto pb-2" : undefined}>
        <div
          aria-hidden="true"
          className="flex items-end gap-[3px]"
          style={{
            height: HEIGHT_PX,
            minWidth: wide ? days.length * 10 : undefined,
          }}
        >
          {days.map((d, i) => (
            <div
              key={d.day}
              className="relative flex-1 rounded-t-sm bg-surface-soft"
              style={{ height: visits[i] }}
              title={`${shortDay(d.day)}: ${d.billable} counted, ${d.hits} visits`}
            >
              <div
                className="absolute inset-x-0 bottom-0 rounded-t-sm bg-brand-violet"
                style={{ height: counted[i] }}
              />
            </div>
          ))}
        </div>
        <div
          aria-hidden="true"
          className="mt-1.5 flex gap-[3px] text-[0.6875rem] text-muted"
          style={{ minWidth: wide ? days.length * 10 : undefined }}
        >
          {days.map((d, i) => (
            <span
              key={d.day}
              className="flex-1 overflow-visible whitespace-nowrap"
            >
              {i % 7 === 0 ? shortDay(d.day) : ""}
            </span>
          ))}
        </div>
      </div>
      <table className="sr-only">
        <caption>Clicks per day</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Counted</th>
            <th scope="col">All visits</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.day}>
              <th scope="row">{shortDay(d.day)}</th>
              <td>{d.billable}</td>
              <td>{d.hits}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
