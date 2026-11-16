// The one look for tables in the portal: a white card, a quiet header row of
// small capitals, compact rows with a hover wash. Class names only, so each
// table keeps its own plain markup (and its stacked list for phones).
// A table's pager goes inside the frame as `<Pagination framed />`.

export const TABLE = {
  frame: "overflow-hidden rounded-card panel",
  table: "w-full text-left text-sm",
  head: "border-b border-hairline bg-surface-soft/60",
  th: "h-10 px-4 text-[0.6875rem] font-semibold tracking-[0.06em] whitespace-nowrap text-muted uppercase first:pl-5 last:pr-5",
  body: "divide-y divide-hairline text-ink",
  row: "hover:bg-surface-soft/60 motion-safe:transition-colors",
  td: "px-4 py-3 first:pl-5 last:pr-5",
  /** The stacked list a table becomes below 640px. */
  list: "divide-y divide-hairline",
  listRow: "p-4",
} as const;
