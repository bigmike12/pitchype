"use client";

import { ErrorStatus } from "@/components/ui/error-status";

// Inside the marketing layout, so the header and footer stay.
export default function MarketingError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorStatus {...props} />;
}
