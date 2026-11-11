"use client";

import { Bell } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { buttonVariants } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { createBrowserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

import {
  markAllNotificationsReadAction,
  openNotificationAction,
} from "./notification-actions";

export type BellItem = {
  id: string;
  title: string;
  body: string | null;
  /** Already formatted on the server, so it can't differ after hydration. */
  at: string;
  unread: boolean;
};

/**
 * The top bar's bell: the unread count, and the latest notifications in a
 * popover. Opening one marks it read and goes where it points. New
 * notifications refresh the shell live (Supabase Realtime, under the
 * person's own session, so row level security decides what arrives); without
 * Realtime they show on the next page load.
 */
export function NotificationBell({
  userId,
  items,
  unread,
}: {
  userId: string;
  items: BellItem[];
  unread: number;
}) {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const supabase = createBrowserClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let stopped = false;

    // Hand Realtime the session first, or it joins as anon and is refused.
    void supabase.realtime.setAuth().then(() => {
      if (stopped) return;
      channel = supabase
        .channel(`notifications:${userId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${userId}`,
          },
          (change) => {
            // New, or a grouped entry made unread again by a new message.
            // Rows being marked read come from this person's own actions,
            // which refresh the page themselves.
            const row = change.new as { read_at?: string | null };
            if (change.eventType === "INSERT" || row.read_at === null) {
              router.refresh();
            }
          },
        )
        .subscribe();
    });

    return () => {
      stopped = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [userId, router]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={
          unread > 0 ? `Notifications, ${unread} unread` : "Notifications"
        }
        title="Notifications"
        className={cn(
          buttonVariants({ variant: "ghost", size: "icon" }),
          "relative",
        )}
      >
        <Bell aria-hidden="true" />
        {unread > 0 && (
          <span
            aria-hidden="true"
            className="absolute top-1 right-1 grid h-4 min-w-4 place-items-center rounded-full bg-brand-coral px-1 text-[0.625rem] leading-none font-semibold text-white"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent
        ref={panel}
        tabIndex={-1}
        // Focus the panel, not its first button, so a click doesn't draw a
        // focus ring on "Mark all as read"; Tab still moves straight in.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          panel.current?.focus();
        }}
        aria-label="Notifications"
        className="w-[min(24rem,calc(100vw-2rem))]"
      >
        <div className="flex min-h-14 items-center justify-between gap-4 border-b border-hairline px-4">
          <h2 className="font-semibold">Notifications</h2>
          {unread > 0 && (
            <form action={markAllNotificationsReadAction}>
              <button
                type="submit"
                className="min-h-11 text-sm font-semibold text-ink underline-offset-4 hover:underline"
              >
                Mark all as read
              </button>
            </form>
          )}
        </div>
        {items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted">
            Nothing yet. Updates on applications, hires and messages show here.
          </p>
        ) : (
          <ul className="max-h-[min(28rem,70vh)] overflow-y-auto py-1">
            {items.map((n) => (
              <li key={n.id}>
                <form
                  action={openNotificationAction}
                  onSubmit={() => setOpen(false)}
                >
                  <input type="hidden" name="id" value={n.id} />
                  <button
                    type="submit"
                    className="flex w-full gap-3 px-4 py-3 text-left hover:bg-surface-soft focus-visible:bg-surface-soft"
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "mt-1.5 size-2 shrink-0 rounded-full",
                        n.unread ? "bg-brand-violet" : "bg-transparent",
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block text-sm break-words text-ink",
                          n.unread && "font-semibold",
                        )}
                      >
                        {n.title}
                        {n.unread && <span className="sr-only"> (unread)</span>}
                      </span>
                      {n.body && (
                        <span className="mt-0.5 line-clamp-2 block text-sm break-words text-muted">
                          {n.body}
                        </span>
                      )}
                      <span className="mt-1 block text-xs text-muted">
                        {n.at}
                      </span>
                    </span>
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
