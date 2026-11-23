"use client";

import { ErrorStatus } from "@/components/ui/error-status";

// Inside the portal shell, so the sidebar and top bar stay.
export default function PortalError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorStatus {...props} inPortal />;
}
