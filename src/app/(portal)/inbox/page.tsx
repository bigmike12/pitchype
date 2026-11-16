import { CircleAlert, MessagesSquare } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { CreatorPhoto } from "@/components/creators/creator-photo";
import { Callout } from "@/components/ui/callout";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import {
  HeaderSkeleton,
  PageLoading,
  TableSkeleton,
} from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/creator-profile";
import { listMyConversations } from "@/lib/db/chat";
import { pageOf, pagedHref, parsePage } from "@/lib/paging";
import { isRefusal, refusalText } from "@/lib/refusals";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Inbox" };

const PAGE_SIZE = 20;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function InboxPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <div className="max-w-3xl">
      <Suspense
        fallback={
          <PageLoading label="Loading your inbox…">
            <HeaderSkeleton />
            <TableSkeleton rows={5} />
          </PageLoading>
        }
      >
        <Inbox searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Inbox({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const [conversations, query] = await Promise.all([
    listMyConversations(),
    searchParams,
  ]);
  const notice = Array.isArray(query.notice) ? query.notice[0] : query.notice;
  const paged = pageOf(conversations, parsePage(query.page), PAGE_SIZE);

  return (
    <>
      <PageHeader
        title="Inbox"
        lead={
          user.role === "business"
            ? "Your conversations with creators."
            : "Businesses that want to work with you. They start conversations; you reply here."
        }
      />

      {notice && isRefusal(notice) && (
        <Callout
          tone="info"
          icon={CircleAlert}
          title="That conversation couldn’t start"
          className="mb-6"
        >
          {refusalText(notice)}
        </Callout>
      )}

      {conversations.length === 0 ? (
        <EmptyState
          icon={MessagesSquare}
          tone="mint"
          title="No conversations yet"
        >
          {user.role === "business"
            ? "Message a creator from their application or their profile in Find creators."
            : "When a business messages you about a campaign or your profile, it shows here."}
        </EmptyState>
      ) : (
        <div className="overflow-hidden rounded-card panel">
          <ul className="divide-y divide-hairline">
            {paged.items.map((c) => (
              <li key={c.id} className="relative flex gap-3 p-4 sm:p-5">
                <CreatorPhoto
                  name={c.other.name}
                  url={c.other.photoUrl}
                  sizes="44px"
                  className="size-11 shrink-0 rounded-full"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <h2
                      className={cn(
                        "truncate text-ink",
                        c.unread > 0 ? "font-bold" : "font-semibold",
                      )}
                    >
                      <Link
                        href={`/inbox/${c.id}`}
                        className="after:absolute after:inset-0"
                      >
                        {c.other.name}
                      </Link>
                    </h2>
                    {c.lastMessage && (
                      <time
                        dateTime={c.lastMessage.createdAt}
                        className="shrink-0 text-xs text-muted"
                      >
                        {formatDateTime(c.lastMessage.createdAt)}
                      </time>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-sm">
                    {c.blocked
                      ? "Messaging isn’t available."
                      : c.lastMessage
                        ? `${c.lastMessage.mine ? "You: " : ""}${c.lastMessage.body}`
                        : "No messages yet."}
                  </p>
                </div>
                {c.unread > 0 && (
                  <span className="self-center rounded-full bg-ink px-2 py-0.5 text-xs font-semibold text-white">
                    {c.unread}
                    <span className="sr-only"> unread</span>
                  </span>
                )}
              </li>
            ))}
          </ul>
          <Pagination
            framed
            {...paged}
            noun={["conversation", "conversations"]}
            hrefFor={(page) => pagedHref("/inbox", {}, page)}
          />
        </div>
      )}
    </>
  );
}
