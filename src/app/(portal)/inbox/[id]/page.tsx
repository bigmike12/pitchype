import { CircleSlash, PauseCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Callout } from "@/components/ui/callout";
import { PageHeader } from "@/components/ui/page-header";
import {
  HeaderSkeleton,
  PageLoading,
  PanelSkeleton,
} from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/creator-profile";
import {
  listMessages,
  listMyConversations,
  markConversationRead,
} from "@/lib/db/chat";
import { getMyStanding } from "@/lib/db/moderation";
import { standingView } from "@/lib/moderation";
import { cn } from "@/lib/utils";

import { BlockControl } from "@/app/(portal)/account/block-control";
import { Composer } from "./composer";
import { LiveUpdates } from "./live-updates";

export const metadata: Metadata = { title: "Conversation" };

type Params = Promise<{ id: string }>;

export default function ConversationPage({ params }: { params: Params }) {
  return (
    <div className="max-w-3xl">
      <Suspense
        fallback={
          <PageLoading label="Loading the conversation…">
            <HeaderSkeleton crumbs />
            <PanelSkeleton lines={6} />
          </PageLoading>
        }
      >
        <Conversation params={params} />
      </Suspense>
    </div>
  );
}

async function Conversation({ params }: { params: Params }) {
  const user = await requireUser();
  const { id } = await params;
  const [conversations, standing] = await Promise.all([
    listMyConversations(),
    getMyStanding(user.id),
  ]);
  const conversation = conversations.find((c) => c.id === id);
  if (!conversation) notFound();

  const messages = await listMessages(conversation.id);
  await markConversationRead(conversation.id);
  const { other } = conversation;
  const view = standingView(standing, new Date());
  const profileHref =
    other.role === "influencer" && other.slug && user.role === "business"
      ? `/business/creators/${other.slug}`
      : null;

  return (
    <>
      <PageHeader
        title={other.name}
        crumbs={[{ href: "/inbox", label: "Inbox" }]}
        lead={
          profileHref ? (
            <Link href={profileHref} className="link text-base">
              View their profile
            </Link>
          ) : undefined
        }
        actions={
          <BlockControl
            otherId={other.id}
            otherName={other.name}
            blockedByMe={conversation.blockedByMe}
          />
        }
      />

      <ol aria-label="Messages" className="space-y-3">
        {messages.length === 0 && (
          <li className="text-muted">No messages yet. Say hello.</li>
        )}
        {messages.map((m) => {
          const mine = m.senderId === user.id;
          return (
            <li
              key={m.id}
              className={cn("flex", mine ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "max-w-[85%] rounded-card px-4 py-3",
                  mine ? "bg-ink text-white" : "panel text-ink",
                )}
              >
                <p className="sr-only">{mine ? "You:" : `${other.name}:`}</p>
                <p className="break-words whitespace-pre-line">{m.body}</p>
                <time
                  dateTime={m.createdAt}
                  className={cn(
                    "mt-1 block text-xs",
                    mine ? "text-white/80" : "text-muted",
                  )}
                >
                  {formatDateTime(m.createdAt)}
                </time>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="mt-8 border-t border-hairline pt-6">
        {conversation.blocked ? (
          <Callout
            tone="info"
            icon={CircleSlash}
            title="Messaging isn’t available"
          >
            {conversation.blockedByMe
              ? `You blocked ${other.name}. Unblock them to message each other again.`
              : "You can’t message each other in this conversation any more."}
          </Callout>
        ) : view.state === "paused" || view.state === "suspended" ? (
          <Callout
            tone="danger"
            icon={PauseCircle}
            title={
              view.state === "paused"
                ? "Messaging is paused on your account"
                : "Your account is suspended"
            }
            action={
              <Link href="/account/standing" className="link">
                See your account standing
              </Link>
            }
          >
            {view.state === "paused" && view.until
              ? `You can send messages again after ${formatDateTime(view.until)}. You can still read this conversation.`
              : "You can still read this conversation while we review your account."}
          </Callout>
        ) : (
          <Composer conversationId={conversation.id} />
        )}
      </div>

      <LiveUpdates conversationId={conversation.id} />
    </>
  );
}
