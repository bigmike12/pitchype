"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Rendered only when the thread had unread messages: the page has just
 * marked them read, but the Inbox badge and the bell live in the layout,
 * which client navigation doesn't redraw. One refresh brings them up to date
 * (the refreshed page then has nothing unread, so this doesn't render again).
 */
export function ReadRefresh() {
  const router = useRouter();
  useEffect(() => {
    router.refresh();
  }, [router]);
  return null;
}
