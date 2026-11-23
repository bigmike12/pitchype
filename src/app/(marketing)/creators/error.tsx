"use client";

import { ErrorStatus } from "@/components/ui/error-status";

/** When the directory or a profile can't load: say so plainly and offer a retry. */
export default function CreatorsError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorStatus {...props} title="We couldn’t load creators just now" />;
}
