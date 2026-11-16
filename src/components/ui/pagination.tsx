import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { pageRange, pageWindow } from "@/lib/paging";
import { cn } from "@/lib/utils";

const step =
  "inline-flex h-11 items-center gap-1 rounded-control px-3 text-sm font-medium text-ink hover:bg-surface-soft lg:h-9 motion-safe:transition-colors";
const number =
  "grid size-11 place-items-center rounded-control text-sm font-medium tabular-nums lg:size-9 motion-safe:transition-colors";

/**
 * The pager under a list: "1–24 of 222 campaigns" and links to the other
 * pages (every page is a URL). Renders the count alone when there is one
 * page, and nothing when the list is empty. `framed` is for the foot of a
 * table or card; without it the pager stands alone under a grid.
 */
export function Pagination({
  page,
  pages,
  total,
  pageSize,
  noun,
  hrefFor,
  framed = false,
  className,
}: {
  page: number;
  pages: number;
  total: number;
  pageSize: number;
  /** What is being counted: [singular, plural], e.g. ["campaign", "campaigns"]. */
  noun: [string, string];
  hrefFor: (page: number) => string;
  framed?: boolean;
  className?: string;
}) {
  if (total === 0) return null;
  const { from, to } = pageRange({ page, pageSize, total });
  const count = `${total.toLocaleString("en-NG")} ${total === 1 ? noun[0] : noun[1]}`;

  return (
    <div
      className={cn(
        "flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between",
        framed
          ? "border-t border-hairline bg-surface-soft/60 px-4 py-2 sm:px-5"
          : "mt-6",
        pages === 1 && framed && "py-3",
        className,
      )}
    >
      <p className="text-[0.8125rem] text-muted tabular-nums">
        {pages === 1 ? count : `${from}–${to} of ${count}`}
      </p>
      {pages > 1 && (
        <nav aria-label="Pages" className="-mx-1 flex items-center gap-0.5">
          {page > 1 ? (
            <Link href={hrefFor(page - 1)} rel="prev" className={step}>
              <ChevronLeft aria-hidden="true" className="size-4" />
              <span className="max-sm:sr-only">Previous</span>
            </Link>
          ) : (
            <span aria-hidden="true" className={cn(step, "opacity-35")}>
              <ChevronLeft className="size-4" />
              <span className="max-sm:hidden">Previous</span>
            </span>
          )}
          <ol className="flex items-center gap-0.5">
            {pageWindow(page, pages).map((n, i) =>
              n === "gap" ? (
                <li
                  key={`gap-${i}`}
                  aria-hidden="true"
                  className="px-1 text-muted"
                >
                  …
                </li>
              ) : (
                <li key={n}>
                  <Link
                    href={hrefFor(n)}
                    aria-label={`Page ${n}`}
                    aria-current={n === page ? "page" : undefined}
                    className={cn(
                      number,
                      n === page
                        ? "bg-ink text-white"
                        : "text-ink hover:bg-surface-soft",
                    )}
                  >
                    {n}
                  </Link>
                </li>
              ),
            )}
          </ol>
          {page < pages ? (
            <Link href={hrefFor(page + 1)} rel="next" className={step}>
              <span className="max-sm:sr-only">Next</span>
              <ChevronRight aria-hidden="true" className="size-4" />
            </Link>
          ) : (
            <span aria-hidden="true" className={cn(step, "opacity-35")}>
              <span className="max-sm:hidden">Next</span>
              <ChevronRight className="size-4" />
            </span>
          )}
        </nav>
      )}
    </div>
  );
}
