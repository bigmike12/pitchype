"use client";

import { ErrorStatus } from "@/components/ui/error-status";

// Pages outside the marketing site and the portal (sign-in, onboarding). The
// groups below have their own, so their header and sidebar stay on screen.
export default function RootError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorStatus {...props} />;
}
