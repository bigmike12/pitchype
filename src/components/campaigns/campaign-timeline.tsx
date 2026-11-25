import { formatDay } from "@/lib/campaign";
import { timelineView } from "@/lib/checkpoints";
import { cn } from "@/lib/utils";

/**
 * A campaign's start, final delivery cutoff and end, with a progress bar from
 * start to end: today's position and a marker for the cutoff and each
 * checkpoint. CSS only, and complete without motion: the dates are written out
 * under the bar. Campaigns that went live without a start or end date draw
 * the bar from the day they went live and to final delivery.
 */
export function CampaignTimeline({
  start,
  liveFrom,
  deliverBy,
  endsOn,
  checkpoints = [],
  today,
  className,
}: {
  start: string | null;
  /** The day the campaign went live (or today for a draft): the bar's start without a start date. */
  liveFrom: string;
  deliverBy: string;
  endsOn: string | null;
  checkpoints?: string[];
  /** Lagos today, "YYYY-MM-DD". */
  today: string;
  className?: string;
}) {
  const view = timelineView({
    start,
    liveFrom,
    deliverBy,
    endsOn,
    checkpoints,
    today,
  });
  const summary = [
    start ? `Starts ${formatDay(start)}` : null,
    `Final delivery by ${formatDay(deliverBy)}`,
    endsOn ? `Ends ${formatDay(endsOn)}` : null,
  ].flatMap((part) => (part ? [part] : []));

  return (
    <div className={cn("space-y-3", className)}>
      <p className="text-sm text-body">{summary.join(" · ")}</p>
      <div
        role="img"
        aria-label={`${summary.join(", ")}. Today is ${view.todayPercent}% of the way from ${formatDay(view.from)} to ${formatDay(view.to)}.${
          checkpoints.length > 0
            ? ` ${checkpoints.length} checkpoint${checkpoints.length === 1 ? "" : "s"} on the way.`
            : ""
        }`}
        className="relative h-6"
      >
        {/* The track, and how far today is along it. */}
        <div className="absolute inset-x-0 top-2.5 h-1.5 rounded-full bg-surface-soft ring-1 ring-hairline" />
        <div
          className="absolute top-2.5 left-0 h-1.5 rounded-full bg-brand-violet"
          style={{ width: `${view.todayPercent}%` }}
        />
        {view.markers.map((marker) => (
          <span
            key={`${marker.kind}-${marker.date}`}
            title={`${marker.kind === "cutoff" ? "Final delivery" : "Checkpoint"}: ${formatDay(marker.date)}`}
            className={cn(
              "absolute top-1 size-4 -translate-x-1/2 rounded-full ring-2 ring-white",
              marker.kind === "cutoff" ? "bg-ink" : "bg-brand-lilac",
            )}
            style={{ left: `${marker.percent}%` }}
          />
        ))}
        <span
          className="absolute top-0 h-6 w-0.5 -translate-x-1/2 bg-ink"
          style={{ left: `${view.todayPercent}%` }}
        />
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-3 w-0.5 bg-ink" /> Today
        </li>
        {checkpoints.length > 0 && (
          <li className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="size-3 rounded-full bg-brand-lilac"
            />{" "}
            Checkpoint
          </li>
        )}
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-3 rounded-full bg-ink" />{" "}
          Final delivery
        </li>
      </ul>
    </div>
  );
}
