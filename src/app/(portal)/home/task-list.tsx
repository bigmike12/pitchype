import { CircleCheck, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import type { Tone } from "@/components/brand/stickers";
import { buttonVariants } from "@/components/ui/button";
import { SectionCard } from "@/components/ui/section-card";
import { TILE_TONES } from "@/components/ui/stat-card";

export type Task = {
  key: string;
  icon: LucideIcon;
  tone: Tone;
  title: string;
  detail: string;
  href: string;
  /** The button's words, e.g. "Pay". */
  action: string;
  /** The one thing to do first gets the ink button. */
  primary?: boolean;
};

/**
 * "Needs you": the specific next steps waiting on this person, most urgent
 * first, each with one button. Built from real records only; when there is
 * nothing, it says so instead of inventing work.
 */
export function TaskList({ tasks }: { tasks: Task[] }) {
  return (
    <SectionCard
      id="tasks-title"
      title="Needs you"
      aside={
        tasks.length > 0 && (
          <span className="rounded-full bg-brand-lilac px-2 py-0.5 text-xs font-semibold text-ink">
            {tasks.length}
            <span className="sr-only">
              {tasks.length === 1 ? " thing" : " things"}
            </span>
          </span>
        )
      }
    >
      {tasks.length > 0 ? (
        <ul className="divide-y divide-hairline">
          {tasks.map((task) => (
            <li
              key={task.key}
              className="flex items-center gap-3 px-4 py-3 sm:px-5"
            >
              <span
                aria-hidden="true"
                className={`grid size-8 shrink-0 place-items-center rounded-lg text-ink ${TILE_TONES[task.tone]}`}
              >
                <task.icon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">{task.title}</p>
                <p className="text-[0.8125rem] text-muted">{task.detail}</p>
              </div>
              <Link
                href={task.href}
                className={buttonVariants({
                  size: "sm",
                  variant: task.primary ? "default" : "secondary",
                })}
              >
                {task.action}
                <span className="sr-only">: {task.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="flex items-center gap-2.5 px-4 py-5 text-sm sm:px-5">
          <CircleCheck
            className="size-[1.125rem] shrink-0 text-muted"
            aria-hidden="true"
          />
          Nothing is waiting on you right now.
        </p>
      )}
    </SectionCard>
  );
}

/** The top of a home page: the greeting, one line, and the page's buttons. */
export function HomeGreeting({
  title,
  lead,
  actions,
}: {
  title: string;
  lead: string;
  actions: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-display-page">{title}</h1>
        <p className="mt-1.5 text-[0.9375rem] text-muted">{lead}</p>
      </div>
      <div className="flex shrink-0 flex-col gap-2 sm:flex-row">{actions}</div>
    </header>
  );
}
