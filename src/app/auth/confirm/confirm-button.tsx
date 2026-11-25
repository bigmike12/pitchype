"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

// Disabled while the link is being used, so a double press can't send it
// twice and land the second press on "expired".
export function ConfirmButton({ children }: { children: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending} className="w-full">
      {pending ? "One moment…" : children}
    </Button>
  );
}
