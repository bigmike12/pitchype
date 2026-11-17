// Paging for lists: which page a URL asks for, the slice of a list that page
// shows, and which page numbers the pager offers. No framework imports, so
// it can be unit-tested.

export type Paged<T> = {
  items: T[];
  /** The page shown, 1-based, already clamped to the pages that exist. */
  page: number;
  pages: number;
  total: number;
  pageSize: number;
};

/** The `page` search param as a whole number from 1, or 1 for anything else. */
export function parsePage(value: string | string[] | undefined): number {
  const text = Array.isArray(value) ? value[0] : value;
  const page = Number(text);
  return Number.isInteger(page) && page >= 1 && page <= 10_000 ? page : 1;
}

export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/** One page of a list we already hold in full. A page past the end shows the last one. */
export function pageOf<T>(
  all: readonly T[],
  page: number,
  pageSize: number,
): Paged<T> {
  const pages = pageCount(all.length, pageSize);
  const shown = Math.min(Math.max(1, page), pages);
  const start = (shown - 1) * pageSize;
  return {
    items: all.slice(start, start + pageSize),
    page: shown,
    pages,
    total: all.length,
    pageSize,
  };
}

/**
 * The page numbers a pager offers: the first, the last, and the current one
 * with a neighbour each side; "gap" where numbers are skipped.
 */
export function pageWindow(page: number, pages: number): (number | "gap")[] {
  const wanted = new Set([1, pages, page - 1, page, page + 1]);
  const numbers = [...wanted]
    .filter((n) => n >= 1 && n <= pages)
    .sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  for (const n of numbers) {
    const last = out.at(-1);
    if (typeof last === "number" && n - last === 2) out.push(last + 1);
    else if (typeof last === "number" && n - last > 2) out.push("gap");
    out.push(n);
  }
  return out;
}

/** "1–24 of 222": the rows a page shows. */
export function pageRange(paged: {
  page: number;
  pageSize: number;
  total: number;
}): { from: number; to: number } {
  const from = paged.total === 0 ? 0 : (paged.page - 1) * paged.pageSize + 1;
  return { from, to: Math.min(paged.page * paged.pageSize, paged.total) };
}

/** `path` with `params` as its query, leaving out empty values and page 1. */
export function pagedHref(
  path: string,
  params: Record<string, string | undefined>,
  page: number,
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  if (page > 1) query.set("page", String(page));
  const text = query.toString();
  return text ? `${path}?${text}` : path;
}
