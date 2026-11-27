import { statusLabel } from "@/lib/feedback";
import { cn } from "@/lib/utils";

const TONES: Record<string, string> = {
  received: "bg-surface-card text-ink",
  planned: "bg-brand-lilac text-ink",
  shipped: "bg-brand-mint text-ink",
  not_planned: "bg-surface-card text-muted",
};

/** Where a feedback request stands, for the sender and for admins. */
export function FeedbackStatusPill({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap",
        TONES[status] ?? TONES.received,
      )}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {statusLabel(status)}
    </span>
  );
}
