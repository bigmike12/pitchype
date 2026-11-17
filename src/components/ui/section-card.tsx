import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * A titled card: a header strip (title, then anything for its right-hand
 * side) over content that runs edge to edge, so lists and tables inside it
 * need no frame of their own. Don't put another card inside one.
 */
export function SectionCard({
  title,
  id,
  aside,
  anchor,
  padded = false,
  children,
  className,
}: {
  title: string;
  /** For the heading, so the section is labelled by it. */
  id: string;
  aside?: ReactNode;
  /** An id on the section itself, for links that jump to it. */
  anchor?: string;
  /** Pad the content, for forms and prose (lists and tables go unpadded). */
  padded?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={anchor}
      aria-labelledby={id}
      className={cn("overflow-hidden rounded-card panel", className)}
    >
      <header className="flex min-h-12 items-center gap-3 border-b border-hairline px-4 sm:px-5">
        <h2 id={id} className="text-[0.9375rem] font-semibold text-ink">
          {title}
        </h2>
        {aside && (
          <div className="ml-auto flex items-center gap-2 text-sm">{aside}</div>
        )}
      </header>
      {padded ? <div className="p-4 sm:p-5">{children}</div> : children}
    </section>
  );
}
