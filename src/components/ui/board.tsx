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
        // `relative` so the screen-reader-only text (absolutely positioned)
        // in far-right columns is scrolled with the board, not left to
        // stretch the whole page sideways.
        className="relative grid gap-3 lg:auto-cols-[minmax(15rem,1fr)] lg:grid-flow-col lg:items-start lg:overflow-x-auto lg:pb-2"
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
        // From 1024px a column is as tall as its cards up to a cap, then its
        // card list scrolls inside it, so a long column never lengthens the page.
        "rounded-card bg-canvas p-2.5 ring-1 ring-hairline ring-inset motion-safe:transition-[box-shadow,background-color] lg:flex lg:max-h-[max(24rem,calc(100dvh-20rem))] lg:flex-col",
        !shownOnPhone && "max-lg:hidden",
        accepts && "ring-2 ring-brand-violet/50",
        accepts && over && "bg-brand-lilac/40 ring-brand-violet",
      )}
    >
      <header className="shrink-0 px-1.5 pt-0.5 pb-2.5">
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
        // `relative`: the cards' screen-reader text is absolutely positioned
        // and must scroll with this list, not stretch the board.
        // The small side padding keeps the cards' shadows from being cut off.
        <ul className="relative space-y-2 lg:-mx-1 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain lg:px-1 lg:pb-1">
          {children}
        </ul>
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

/**
 * The top of every card, like the landing page's: an avatar, a bold name or
 * title, and one muted line about it. The right padding leaves room for the
 * drag grip.
 */
export function BoardCardHeader({
  avatar,
  title,
  mark,
  detail,
}: {
  avatar: ReactNode;
  title: ReactNode;
  /** A small mark after the title, e.g. the verified seal. */
  mark?: ReactNode;
  detail?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5 pr-5">
      {avatar}
      <div className="min-w-0">
        <h3 className="flex items-center gap-1 font-semibold text-ink">
          <span className="line-clamp-2 break-words">{title}</span>
          {mark}
        </h3>
        {detail && <p className="line-clamp-2 text-xs text-muted">{detail}</p>}
      </div>
    </div>
  );
}

const PILL_TONES = {
  neutral: "bg-surface-card",
  lilac: "bg-brand-lilac",
  mint: "bg-brand-mint",
  sun: "bg-brand-sun",
  coral: "bg-brand-coral",
} as const;

export type PillTone = keyof typeof PILL_TONES;

/** What the card is worth, and a pill saying where it stands. Ink text on the pastel. */
export function BoardCardAmount({
  amount,
  note,
  pill,
  tone = "neutral",
}: {
  amount: string;
  /** Small words after the amount, e.g. "plus our fee". */
  note?: string;
  pill: string;
  tone?: PillTone;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
      <p className="text-ink">
        <span className="font-semibold tabular-nums">{amount}</span>
        {note && <span className="text-xs text-muted"> {note}</span>}
      </p>
      <span
        className={cn(
          "rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-ink",
          PILL_TONES[tone],
        )}
      >
        {pill}
      </span>
    </div>
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
