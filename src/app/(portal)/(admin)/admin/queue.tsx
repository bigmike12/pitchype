import type { ReactNode } from "react";

import { Pagination } from "@/components/ui/pagination";
import { SectionCard } from "@/components/ui/section-card";
import type { Paged } from "@/lib/paging";

/** How many items one page of an admin queue shows. */
export const QUEUE_PAGE_SIZE = 10;

/**
 * One admin queue: a titled card with how many items wait, an optional line
 * saying what to do, the items as hairline-divided rows (each child is an
 * `<li>` with no frame of its own), and the pager. Empty, it is one line.
 */
export function QueueCard<T>({
  id,
  title,
  note,
  empty,
  paged,
  count,
  noun,
  hrefFor,
  children,
}: {
  id: string;
  title: string;
  note?: ReactNode;
  /** What to say when nothing waits. */
  empty: string;
  paged: Paged<T>;
  /** The exact number waiting, when the list is capped and `paged.total` is not it. */
  count?: number;
  noun: [string, string];
  hrefFor: (page: number) => string;
  children: (item: T) => ReactNode;
}) {
  return (
    <SectionCard
      id={id}
      title={title}
      aside={
        <span className="rounded-full bg-surface-card px-2 py-0.5 text-xs font-semibold text-ink tabular-nums">
          {count ?? paged.total}
          <span className="sr-only"> waiting</span>
        </span>
      }
    >
      {note && (
        <p className="border-b border-hairline px-4 py-3 text-[0.8125rem] text-muted sm:px-5">
          {note}
        </p>
      )}
      {paged.total === 0 ? (
        <p className="px-4 py-4 text-sm text-muted sm:px-5">{empty}</p>
      ) : (
        <ul className="divide-y divide-hairline">
          {paged.items.map(children)}
        </ul>
      )}
      {paged.pages > 1 && (
        <Pagination framed {...paged} noun={noun} hrefFor={hrefFor} />
      )}
    </SectionCard>
  );
}
