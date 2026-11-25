"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// A check Dojah is still deciding: look again every few seconds for a while,
// so the page changes by itself when the webhook lands.
export function RefreshWhileWaiting() {
  const router = useRouter();
  useEffect(() => {
    let count = 0;
    const timer = setInterval(() => {
      count += 1;
      router.refresh();
      if (count >= 45) clearInterval(timer);
    }, 5_000);
    return () => clearInterval(timer);
  }, [router]);
  return null;
}
