import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { ClayTile, type Tone } from "@/components/brand/stickers";

/** What a list shows when it has nothing in it yet, and the next step. */
export function EmptyState({
  icon,
  tone,
  title,
  children,
  action,
}: {
  icon: LucideIcon;
  tone: Tone;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-card panel p-6 sm:p-8">
      <ClayTile icon={icon} tone={tone} size="lg" />
      <h2 className="mt-4 text-display-md">{title}</h2>
      <div className="mt-2 max-w-xl">{children}</div>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
