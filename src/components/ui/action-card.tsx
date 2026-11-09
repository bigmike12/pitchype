import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { ClayTile, type Tone } from "@/components/brand/stickers";

/** A quick action: a white card that is one link, with a clay tile. */
export function ActionCard({
  href,
  icon,
  tone,
  title,
  children,
}: {
  href: string;
  icon: LucideIcon;
  tone: Tone;
  title: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group flex h-full flex-col rounded-card bg-white p-4 ring-1 ring-hairline hover:ring-field sm:p-5"
    >
      <ClayTile icon={icon} tone={tone} />
      <span className="mt-3 font-semibold text-ink group-hover:underline group-hover:underline-offset-4">
        {title}
      </span>
      <span className="mt-1 text-sm">{children}</span>
    </Link>
  );
}
