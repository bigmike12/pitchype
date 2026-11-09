import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const TONES = {
  info: "bg-surface-soft",
  attention: "bg-brand-sun",
  success: "bg-brand-mint",
  danger: "bg-white ring-1 ring-danger",
} as const;

/**
 * A status message on a page: what's going on and, optionally, what to do
 * about it. One style for every notice in the portal (in review, sent back,
 * published, hidden…). Ink text on every tone; danger stays white so the
 * red reads as a warning, not a fill.
 */
export function Callout({
  tone,
  icon: Icon,
  title,
  children,
  action,
  className,
}: {
  tone: keyof typeof TONES;
  icon: LucideIcon;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex gap-3 rounded-card p-4 text-ink sm:p-5",
        TONES[tone],
        className,
      )}
    >
      <Icon
        className={cn(
          "mt-0.5 size-5 shrink-0",
          tone === "danger" && "text-danger",
        )}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        {children && <div className="mt-1">{children}</div>}
        {action && (
          <div className="mt-3 flex flex-wrap items-center gap-3">{action}</div>
        )}
      </div>
    </div>
  );
}
