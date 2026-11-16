"use client";

import { GripVertical } from "lucide-react";
import Link from "next/link";
import {
  createContext,
  useContext,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";

import { cn } from "@/lib/utils";

/*
 * A Kanban board: columns side by side from 1024px (the row scrolls sideways
 * if it must), one column at a time on smaller screens, picked with
 * `BoardTabs`.
 *
 * Dragging never has rules of its own. A card may hold elements marked
 * `data-drop-action="<column key>"` (a button, a submit button or a link);
 * the card can be dropped on exactly those columns, and dropping clicks that
 * element. So a drag does what the visible button does, with the same
 * confirmation and the same server checks, and the card only changes column
 * when the page comes back with the new state. Buttons stay for keyboards
 * and touch screens, where native drag and drop doesn't run.
 */

type Drag = { card: HTMLElement; targets: string[] } | null;

const DragContext = createContext<{
  drag: Drag;
  setDrag: (drag: Drag) => void;
}>({ drag: null, setDrag: () => {} });

export function Board({
  label,
  children,
}: {
  /** Names the board for screen readers. */
  label: string;
  children: ReactNode;
}) {
  const [drag, setDrag] = useState<Drag>(null);
  return (
    <DragContext value={{ drag, setDrag }}>
      <div
        role="group"
        aria-label={label}
        className="grid gap-3 lg:auto-cols-[minmax(11rem,1fr)] lg:grid-flow-col lg:items-start lg:overflow-x-auto lg:pb-2"
      >
        {children}
      </div>
    </DragContext>
  );
}

export function BoardColumn({
  columnKey,
  label,
  hint,
  count,
  dot,
  shownOnPhone,
  children,
}: {
  columnKey: string;
  label: string;
  /** One short line under the title: what being here means. */
  hint: string;
  count: number;
  /** A background class for the column's dot, e.g. `bg-brand-violet`. */
  dot: string;
  /** Below 1024px only one column shows. */
  shownOnPhone: boolean;
  children: ReactNode;
}) {
  const { drag, setDrag } = useContext(DragContext);
  const accepts = drag?.targets.includes(columnKey) ?? false;
  const [over, setOver] = useState(false);

  function onDrop(event: DragEvent) {
    if (!drag || !accepts) return;
    event.preventDefault();
    setOver(false);
    setDrag(null);
    drag.card
      .querySelector<HTMLElement>(`[data-drop-action="${columnKey}"]`)
      ?.click();
  }

  return (
    <section
      aria-labelledby={`column-${columnKey}`}
      onDragOver={(event) => {
        if (!accepts) return;
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      className={cn(
        "rounded-card bg-canvas p-2.5 ring-1 ring-hairline ring-inset motion-safe:transition-[box-shadow,background-color]",
        !shownOnPhone && "max-lg:hidden",
        accepts && "ring-2 ring-brand-violet/50",
        accepts && over && "bg-brand-lilac/40 ring-brand-violet",
      )}
    >
      <header className="px-1.5 pt-0.5 pb-2.5">
        <h2
          id={`column-${columnKey}`}
          className="flex items-center gap-2 text-[0.8125rem] font-semibold text-ink"
        >
          <span
            aria-hidden="true"
            className={cn("size-2 shrink-0 rounded-full", dot)}
          />
          {label}
          <span className="ml-auto rounded-full bg-surface px-2 py-0.5 text-xs font-semibold text-muted ring-1 ring-hairline">
            {count}
            <span className="sr-only"> {count === 1 ? "card" : "cards"}</span>
          </span>
        </h2>
        <p className="mt-0.5 text-xs text-muted">
          {accepts ? "Drop here" : hint}
        </p>
      </header>
      {count > 0 ? (
        <ul className="space-y-2">{children}</ul>
      ) : (
        <p className="rounded-xl border border-dashed border-hairline-strong px-3 py-4 text-center text-[0.8125rem] text-muted">
          Nothing here
        </p>
      )}
    </section>
  );
}

export function BoardCard({
  draggable = false,
  children,
}: {
  /** True when the card holds at least one `data-drop-action` element. */
  draggable?: boolean;
  children: ReactNode;
}) {
  const { setDrag } = useContext(DragContext);
  return (
    <li
      draggable={draggable}
      onDragStart={(event) => {
        const card = event.currentTarget;
        const targets = [
          ...card.querySelectorAll<HTMLElement>("[data-drop-action]"),
        ].flatMap((element) => element.dataset.dropAction ?? []);
        if (targets.length === 0) {
          event.preventDefault();
          return;
        }
        event.dataTransfer.effectAllowed = "move";
        // Firefox starts a drag only when some data is set.
        event.dataTransfer.setData("text/plain", "");
        setDrag({ card, targets });
      }}
      onDragEnd={() => setDrag(null)}
      className={cn(
        "relative space-y-2 rounded-xl p-3 text-sm panel",
        draggable && "lg:cursor-grab lg:active:cursor-grabbing",
      )}
    >
      {draggable && (
        <GripVertical
          aria-hidden="true"
          className="absolute top-3 right-2 hidden size-4 text-field lg:block"
        />
      )}
      {children}
    </li>
  );
}

/** Below 1024px: one link per column, choosing which column shows. */
export function BoardTabs({
  columns,
  counts,
  shown,
  hrefs,
}: {
  columns: readonly { key: string; label: string }[];
  counts: ReadonlyMap<string, number>;
  shown: string;
  /** The link for each column key (plain data: this is a client component). */
  hrefs: Readonly<Record<string, string>>;
}) {
  return (
    <nav
      aria-label="Columns"
      className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:hidden"
    >
      {columns.map((column) => (
        <Link
          key={column.key}
          href={hrefs[column.key]}
          scroll={false}
          aria-current={column.key === shown ? "true" : undefined}
          className={cn(
            "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-control px-3.5 text-sm",
            column.key === shown
              ? "bg-ink font-semibold text-white"
              : "bg-surface-soft font-medium text-body",
          )}
        >
          {column.label}
          <span className="tabular-nums">· {counts.get(column.key) ?? 0}</span>
        </Link>
      ))}
    </nav>
  );
}
