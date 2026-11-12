// Data access for chat.
//
// Threads are started by businesses and read only by the two people in
// them (row level security). Sending goes through send_message(), which
// refuses contact details and records a strike instead (see the
// create_chat and create_moderation migrations).

import { createSessionClient } from "@/lib/supabase/server";
import { profilePhotoUrl } from "@/lib/storage";

import { bool, isObject, list, num, obj, str } from "./json";
import { refused, type Refused } from "./refusal";

type Result<T> = { ok: true; value: T } | Refused;

/** A business opens (or reopens) its thread with a creator. */
export async function startConversation(
  creatorId: string,
  applicationId: string | null,
): Promise<Result<string>> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("start_conversation", {
    creator: creatorId,
    // The generated types don't model SQL nulls for function arguments.
    application: applicationId as string,
  });
  if (error) return refused(error, "start conversation");
  return { ok: true, value: data };
}

export type SendOutcome =
  | { delivered: true }
  | {
      delivered: false;
      flag: string;
      strikes: number;
      restrictedUntil: string | null;
      suspended: boolean;
    };

export async function sendMessage(
  conversationId: string,
  body: string,
  dedupeKey: string,
): Promise<Result<SendOutcome>> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("send_message", {
    conversation: conversationId,
    body,
    dedupe: dedupeKey,
  });
  if (error) return refused(error, "send");
  const outcome = obj(data);
  if (bool(outcome.delivered)) return { ok: true, value: { delivered: true } };
  return {
    ok: true,
    value: {
      delivered: false,
      flag: str(outcome.flag) ?? "contact detail",
      strikes: num(outcome.strikes) ?? 1,
      restrictedUntil: str(outcome.restricted_until),
      suspended: bool(outcome.suspended),
    },
  };
}

export async function markConversationRead(
  conversationId: string,
): Promise<void> {
  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("mark_conversation_read", {
    conversation: conversationId,
  });
  if (error && error.message !== "not_allowed") {
    throw new Error(`mark read failed (${error.code})`);
  }
}

export async function unreadMessageCount(): Promise<number> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("unread_message_count");
  if (error) throw new Error(`unread count failed (${error.code})`);
  return data;
}

export type ConversationSummary = {
  id: string;
  applicationId: string | null;
  createdAt: string;
  lastMessageAt: string | null;
  unread: number;
  lastMessage: { body: string; mine: boolean; createdAt: string } | null;
  other: {
    id: string;
    role: "business" | "influencer";
    name: string;
    slug: string | null;
    photoUrl: string | null;
  };
  blockedByMe: boolean;
  blocked: boolean;
};

export async function listMyConversations(): Promise<ConversationSummary[]> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("my_conversations");
  if (error) throw new Error(`conversations failed (${error.code})`);
  return list(data).flatMap((row) => {
    if (!isObject(row) || !str(row.id)) return [];
    const other = obj(row.other);
    const last = isObject(row.last_message) ? row.last_message : null;
    const otherId = str(other.id) ?? "";
    const role = str(other.role) === "business" ? "business" : "influencer";
    return [
      {
        id: str(row.id) ?? "",
        applicationId: str(row.application_id),
        createdAt: str(row.created_at) ?? "",
        lastMessageAt: str(row.last_message_at),
        unread: num(row.unread) ?? 0,
        lastMessage: last
          ? {
              body: str(last.body) ?? "",
              mine: bool(last.mine),
              createdAt: str(last.created_at) ?? "",
            }
          : null,
        other: {
          id: otherId,
          role,
          name: str(other.name) ?? "",
          slug: str(other.slug),
          photoUrl:
            role === "influencer"
              ? profilePhotoUrl(otherId, num(other.photo_version))
              : null,
        },
        blockedByMe: bool(row.blocked_by_me),
        blocked: bool(row.blocked),
      },
    ];
  });
}

export type Message = {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
};

const MESSAGES_SHOWN = 200;

/** The latest messages in a thread, oldest first (RLS: participants only). */
export async function listMessages(conversationId: string): Promise<Message[]> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("messages")
    .select("id, sender_id, body, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(MESSAGES_SHOWN);
  if (error) throw new Error(`messages failed (${error.code})`);
  return data.reverse().map((m) => ({
    id: m.id,
    senderId: m.sender_id,
    body: m.body,
    createdAt: m.created_at,
  }));
}
