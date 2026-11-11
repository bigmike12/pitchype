"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { createBrowserClient } from "@/lib/supabase/browser";

/**
 * Refreshes the thread when a new message arrives (Supabase Realtime, under
 * the person's own session, so row level security decides what arrives).
 * If Realtime isn't available, nothing breaks: new messages show on reload.
 */
export function LiveUpdates({ conversationId }: { conversationId: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createBrowserClient();
    const channel = supabase
      .channel(`conversation:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => router.refresh(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversationId, router]);

  return null;
}
